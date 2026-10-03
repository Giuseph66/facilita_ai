import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';
import { fail } from '../../core/errors';

export type ExportQuestion = {
  id: string; position: number; type: string; statement: string; points: string | number;
  options: { id: string; text: string }[];
  answer?: { correctOptionId: string | null; expectedAnswer: string | null; rubric: unknown };
};
export type ExportSnapshot = {
  title: string; courseTitle: string; revision: number; kind: string;
  variant: 'QUESTIONS' | 'ANSWER_KEY'; questions: ExportQuestion[];
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Controlled HTML only: no user HTML, links, images, scripts, or external stylesheets. */
export function renderExportHtml(snapshot: ExportSnapshot): string {
  const answers = snapshot.variant === 'ANSWER_KEY';
  const questionHtml = snapshot.questions.map(question => {
    const options = question.options.map((option, index) => `<li><span class="letter">${String.fromCharCode(65 + index)}.</span> ${escapeHtml(option.text)}</li>`).join('');
    let answerHtml = '';
    if (answers && question.answer) {
      const correctIndex = question.options.findIndex(option => option.id === question.answer?.correctOptionId);
      const expected = question.answer.expectedAnswer || (correctIndex >= 0 ? `${String.fromCharCode(65 + correctIndex)}. ${question.options[correctIndex].text}` : 'Resposta definida na rubrica.');
      const rubric = question.answer.rubric == null ? '' : `<p><strong>Critérios:</strong> ${escapeHtml(typeof question.answer.rubric === 'string' ? question.answer.rubric : JSON.stringify(question.answer.rubric))}</p>`;
      answerHtml = `<div class="answer"><strong>Resposta esperada:</strong><p>${escapeHtml(expected)}</p>${rubric}</div>`;
    }
    return `<section class="question"><h2>Questão ${question.position} <small>${escapeHtml(question.points)} ponto(s)</small></h2><p class="statement">${escapeHtml(question.statement)}</p>${options ? `<ol class="options">${options}</ol>` : answers ? '' : '<div class="answer-space" aria-label="Espaço para resposta"></div>'}${answerHtml}</section>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${escapeHtml(snapshot.title)}${answers ? ' — Gabarito' : ''}</title><style>
    @page{size:A4;margin:18mm 17mm 20mm}*{box-sizing:border-box}body{font:12pt/1.55 'DejaVu Sans',Arial,sans-serif;color:#171717;background:white;margin:0}h1{font-size:21pt;line-height:1.2;margin:0 0 5mm}h2{font-size:12pt;margin:0 0 2mm}small{font-weight:400;color:#555;margin-left:4mm}.meta{color:#555;font-size:10pt;margin:0 0 6mm}.header{border-bottom:1px solid #aaa;padding-bottom:4mm;margin-bottom:8mm}.student{font-size:11pt;line-height:2}.question{margin:0 0 8mm;break-inside:avoid}.statement,.answer p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 3mm}.options{list-style:none;padding:0;margin:0 0 3mm}.options li{white-space:pre-wrap;margin-bottom:2mm;overflow-wrap:anywhere}.letter{font-weight:bold}.answer{border-left:2px solid #888;padding:2mm 4mm;background:#f6f6f6}.answer-space{height:25mm;border-bottom:1px solid #bbb}.private{font-size:10pt;font-weight:700;letter-spacing:.03em;margin-bottom:3mm}@media screen{body{max-width:210mm;padding:18mm;margin:auto}.header{margin-top:5mm}}@media print{.answer{print-color-adjust:exact}}
  </style></head><body><header class="header">${answers ? '<div class="private">GABARITO — USO DO PROFESSOR</div>' : ''}<h1>${escapeHtml(snapshot.title)}</h1><p class="meta">${escapeHtml(snapshot.courseTitle)} · Revisão ${snapshot.revision}</p>${answers ? '' : '<div class="student">Nome: __________________________________________________<br>Turma: __________________ Data: ____ / ____ / ______</div>'}</header>${questionHtml}</body></html>`;
}

@Injectable()
export class ExportRenderer {
  private tail: Promise<void> = Promise.resolve();

  async pdf(html: string): Promise<Buffer> {
    if (Buffer.byteLength(html) > 1_000_000) fail(413, 'EXPORT_TOO_LARGE', 'A avaliação excede o tamanho permitido para exportação.');
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(accept => { release = accept; });
    await previous;
    try {
      const sandbox = process.env.EXPORT_CHROMIUM_SANDBOX !== 'false';
      if (!sandbox && process.env.NODE_ENV === 'production') fail(503, 'EXPORT_RENDERER_UNAVAILABLE', 'O renderizador de produção precisa de sandbox.');
      const browser = await chromium.launch({
        headless: true, chromiumSandbox: sandbox, timeout: 15000,
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      }).catch(() => fail(503, 'EXPORT_RENDERER_UNAVAILABLE', 'O navegador de exportação não está disponível.'));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
        await context.route('**/*', route => route.abort());
        const page = await context.newPage();
        const render = async () => {
          await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.emulateMedia({ media: 'print' });
          return page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
            headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font:8px Arial;text-align:center;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
        };
        return await Promise.race([render(), new Promise<never>((_accept, reject) => {
          timer = setTimeout(() => reject(new Error('EXPORT_TIMEOUT')), 45000);
        })]).catch(() => fail(503, 'EXPORT_RENDER_FAILED', 'Não foi possível gerar o PDF. Tente novamente.'));
      } finally {
        if (timer) clearTimeout(timer);
        await browser.close().catch(() => undefined);
      }
    } finally { release(); }
  }
}
