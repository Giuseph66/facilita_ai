import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { DocumentParserEngine, type ParsedDocument } from '../../src/features/documents/document-parser.engine';
import { DocumentsService } from '../../src/features/documents/documents.service';
import { pdfFixture, pptxFixture } from '../support/fixtures';

const parser = new DocumentParserEngine();
// The PDF engine uses a native ESM import, which Vitest's VM cannot execute.
function parsePdf(buffer: Buffer): ParsedDocument {
  const script = `const {DocumentParserEngine}=require('./src/features/documents/document-parser.engine');
    new DocumentParserEngine().parse(require('node:fs').readFileSync(0))
      .then(result=>process.stdout.write(JSON.stringify(result)))
      .catch(()=>process.exit(1));`;
  return JSON.parse(execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
    input: buffer, encoding: 'utf8', timeout: 10_000,
  })) as ParsedDocument;
}
const chunker = Object.assign(Object.create(DocumentsService.prototype), {
  embeddings: { countTokens: async (text: string) => text.split(/\s+/).length },
}) as { chunkPage(text: string): Promise<string[]> };

describe('contexto textual do PDF', () => {
  it('mantém as linhas de uma lista do PDF até o contexto dos trechos', async () => {
    const text = 'Papeis: fixos ou variaveis\nDefinicao: predefinida ou emergente\nPoder: hierarquico ou igualitario';
    const document = parsePdf(pdfFixture(text));
    expect(document.pages[0].text).toBe(text);
    expect(await chunker.chunkPage(document.pages[0].text)).toEqual([text]);
  });

  it('preserva o texto de um PDF simples e de PPTX', async () => {
    const text = 'Crencas podem estar erradas.';
    for (const document of [parsePdf(pdfFixture(text)), await parser.parse(pptxFixture(text))]) {
      expect(document.pages[0].text).toBe(text);
      expect(await chunker.chunkPage(document.pages[0].text)).toEqual([text]);
    }
  });

  it('preserva quebras entre parágrafos sem separar cada frase em uma linha', async () => {
    const text = 'Crenca nao e verdade. Pode ser falsa.\nDesejos podem ser incompativeis.';
    expect(await chunker.chunkPage(text)).toEqual([text]);
  });
});
