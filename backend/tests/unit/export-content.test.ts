import { describe, expect, it } from 'vitest';
import { renderExportHtml, type ExportSnapshot } from '../../src/features/exports/export-renderer';

const snapshot: ExportSnapshot = {
  title: 'Avaliação — Bioquímica', courseTitle: 'Ciências', revision: 3, kind: 'EXAM', variant: 'QUESTIONS',
  questions: [{ id: 'private-question-id', position: 1, type: 'SHORT_ANSWER', points: 2,
    statement: 'Explique glicólise. <img src="https://evil.example" onerror="alert(1)">', options: [],
    answer: { correctOptionId: null, expectedAnswer: 'PRIVATE_ANSWER_MARKER', rubric: { detail: 'PRIVATE_RUBRIC_MARKER' } },
  }],
};

describe('arquivos de questões e gabarito', () => {
  it('o arquivo de questões nunca inclui resposta, rubrica ou IDs privados, mesmo quando recebidos no snapshot', () => {
    const html = renderExportHtml(snapshot);
    expect(html).not.toContain('PRIVATE_ANSWER_MARKER');
    expect(html).not.toContain('PRIVATE_RUBRIC_MARKER');
    expect(html).not.toContain('private-question-id');
    expect(html).toContain('Nome:');
    expect(html).toContain('glicólise');
  });

  it('escapa HTML recebido como texto e não cria objetos executáveis', () => {
    const html = renderExportHtml(snapshot);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain("default-src 'none'");
  });

  it('o arquivo de gabarito inclui respostas e critérios, separado da identificação do aluno', () => {
    const html = renderExportHtml({ ...snapshot, variant: 'ANSWER_KEY' });
    expect(html).toContain('PRIVATE_ANSWER_MARKER');
    expect(html).toContain('PRIVATE_RUBRIC_MARKER');
    expect(html).toContain('USO DO PROFESSOR');
    expect(html).not.toContain('Nome:');
  });
});
