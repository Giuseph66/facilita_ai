import { parentPort, workerData } from 'node:worker_threads';
import { ApiException } from '../../core/errors';
import { DocumentParserEngine, DocumentFormat } from './document-parser.engine';

async function run(): Promise<void> {
  try {
    const buffer = Buffer.from(workerData.buffer as Uint8Array);
    const parsed = await new DocumentParserEngine().parse(buffer, workerData.format as DocumentFormat);
    parentPort?.postMessage({ ok: true, result: parsed });
  } catch (error) {
    const status = error instanceof ApiException ? error.getStatus() : 422;
    const code = error instanceof ApiException ? error.code : 'DOCUMENT_PARSE_FAILED';
    const message = error instanceof ApiException ? error.message : 'Não foi possível ler o documento. O arquivo original foi preservado.';
    parentPort?.postMessage({ ok: false, status, code, error: message });
  }
}

void run();
