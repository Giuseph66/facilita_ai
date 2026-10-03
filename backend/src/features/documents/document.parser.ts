import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ApiException, fail } from '../../core/errors';
import { DocumentFormat, ParsedDocument } from './document-parser.engine';

export type { DocumentFormat, ParsedDocument, ParsedPage } from './document-parser.engine';

const MAX_FILE_BYTES = boundedInteger('UPLOAD_MAX_BYTES', 20_000_000, 1_000_000, 25_000_000);
const PARSER_TIMEOUT_MS = boundedInteger('PARSER_TIMEOUT_MS', 30_000, 1_000, 120_000);

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) ? Math.min(Math.max(value, minimum), maximum) : fallback;
}

@Injectable()
export class DocumentParser {
  detectFormat(buffer: Buffer): DocumentFormat {
    if (buffer.byteLength < 8 || buffer.byteLength > MAX_FILE_BYTES) fail(413, 'FILE_TOO_LARGE', 'O arquivo está vazio ou excede o limite de envio.');
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'PDF';
    if (buffer.readUInt32LE(0) !== 0x04034b50) fail(415, 'UNSUPPORTED_FILE', 'Envie um arquivo PDF ou PowerPoint PPTX válido.');
    return 'PPTX';
  }

  async parse(buffer: Buffer, expectedFormat?: DocumentFormat): Promise<ParsedDocument> {
    const format = this.detectFormat(buffer);
    if (expectedFormat && expectedFormat !== format) fail(415, 'UNSUPPORTED_FILE', 'O formato do arquivo não corresponde ao conteúdo.');
    const jsWorker = resolve(__dirname, 'document-parser.worker.js');
    const workerPath = existsSync(jsWorker) ? jsWorker : resolve(__dirname, 'document-parser.worker.ts');
    const worker = new Worker(workerPath, {
      workerData: { buffer, format },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 8 },
    });
    return new Promise<ParsedDocument>((resolveResult, reject) => {
      let settled = false;
      const finish = (error?: Error, value?: ParsedDocument) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (error) reject(error);
        else if (value) resolveResult(value);
        else reject(new ApiException('DOCUMENT_PARSE_FAILED', 'Não foi possível ler o documento.', 422));
      };
      const timer = setTimeout(() => {
        finish(new ApiException('PARSER_TIMEOUT', 'O processamento excedeu o tempo permitido.', 422));
      }, PARSER_TIMEOUT_MS);
      worker.once('message', (message: { ok?: boolean; result?: ParsedDocument; status?: number; code?: string; error?: string }) => {
        if (message?.ok && message.result && Array.isArray(message.result.pages)) {
          finish(undefined, message.result);
          return;
        }
        finish(new ApiException(message?.code || 'DOCUMENT_PARSE_FAILED', message?.error || 'Não foi possível ler o documento.', message?.status ?? 422));
      });
      worker.once('error', () => finish(new ApiException('DOCUMENT_PARSE_FAILED', 'Não foi possível ler o documento.', 422)));
      worker.once('exit', (code) => {
        if (code !== 0) finish(new ApiException('DOCUMENT_PARSE_FAILED', 'Não foi possível ler o documento.', 422));
      });
    });
  }
}
