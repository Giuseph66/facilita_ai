import { inflateRawSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { fail } from '../../core/errors';

export type DocumentFormat = 'PDF' | 'PPTX';

export interface ParsedPage {
  pageNumber: number;
  text: string;
  metadata: Record<string, unknown>;
}

export interface ParsedDocument {
  format: DocumentFormat;
  pages: ParsedPage[];
}

const MAX_PAGES = boundedInteger('UPLOAD_MAX_PAGES', 300, 1, 500);
const MAX_FILE_BYTES = boundedInteger('UPLOAD_MAX_BYTES', 20_000_000, 1_000_000, 25_000_000);
const MAX_UNCOMPRESSED_BYTES = 80_000_000;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_EXTRACTED_TEXT_BYTES = 10_000_000;

type ZipEntry = { name: string; flags: number; method: number; crc: number; compressedBytes: number; entryBytes: number; localOffset: number; dataOffset: number; recordEnd: number };

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) ? Math.min(Math.max(value, minimum), maximum) : fallback;
}

export class DocumentParserEngine {
  detectFormat(buffer: Buffer): DocumentFormat {
    if (buffer.byteLength < 8 || buffer.byteLength > MAX_FILE_BYTES) fail(413, 'FILE_TOO_LARGE', 'O arquivo está vazio ou excede o limite de envio.');
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'PDF';
    if (buffer.readUInt32LE(0) === 0x04034b50) {
      const names = new Set(this.zipEntries(buffer).map((entry) => entry.name));
      if (!names.has('[Content_Types].xml') || !names.has('ppt/presentation.xml') || ![...names].some((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))) {
        fail(415, 'UNSUPPORTED_FILE', 'Envie um arquivo PDF ou PowerPoint PPTX válido.');
      }
      return 'PPTX';
    }
    fail(415, 'UNSUPPORTED_FILE', 'Envie um arquivo PDF ou PowerPoint PPTX válido.');
  }

  async parse(buffer: Buffer, expectedFormat?: DocumentFormat): Promise<ParsedDocument> {
    const format = this.detectFormat(buffer);
    if (expectedFormat && expectedFormat !== format) fail(415, 'UNSUPPORTED_FILE', 'O formato do arquivo não corresponde ao conteúdo.');
    const parsed = format === 'PDF' ? await this.parsePdf(buffer) : this.parsePptx(buffer);
    if (!parsed.pages.length) fail(422, 'DOCUMENT_PARSE_FAILED', 'O arquivo não contém páginas compatíveis.');
    if (!parsed.pages.some((page) => page.text.trim().length > 0)) {
      fail(422, format === 'PDF' ? 'PDF_NO_TEXT' : 'PPTX_NO_TEXT', 'Não foi possível extrair texto pesquisável deste arquivo. O original foi preservado.');
    }
    return parsed;
  }

  private async parsePdf(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
      const module = await nativeImport('pdfjs-dist/legacy/build/pdf.mjs') as {
        getDocument(options: Record<string, unknown>): { promise: Promise<{
          numPages: number;
          getPage(pageNumber: number): Promise<{
            getTextContent(options: Record<string, unknown>): Promise<{ items: Array<{ str?: unknown; hasEOL?: boolean }> }>;
            cleanup(): void;
          }>;
          destroy(): Promise<void>;
        }> };
      };
      const task = module.getDocument({
        data: Uint8Array.from(buffer),
        disableFontFace: true,
        isEvalSupported: false,
        disableAutoFetch: true,
        useSystemFonts: false,
        stopAtErrors: true,
        verbosity: 0,
      });
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGES) {
        await pdf.destroy();
        fail(413, 'DOCUMENT_PAGE_LIMIT', `O PDF excede o limite de ${MAX_PAGES} páginas.`);
      }
      const pages: ParsedPage[] = [];
      let totalTextBytes = 0;
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent({ includeMarkedContent: false });
          const text = content.items
            .flatMap((item) => 'str' in item && typeof item.str === 'string' ? [`${item.str}${item.hasEOL ? '\n' : ' '}`] : [])
            .join('')
            // eslint-disable-next-line no-control-regex -- Strip extracted PDF control bytes before indexing.
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .trim();
          totalTextBytes += Buffer.byteLength(text);
          if (totalTextBytes > MAX_EXTRACTED_TEXT_BYTES) fail(413, 'DOCUMENT_TEXT_LIMIT', 'O texto extraído excede o limite de leitura.');
          pages.push({ pageNumber, text, metadata: { source: 'pdf-text-layer' } });
          page.cleanup();
        }
      } finally {
        await pdf.destroy();
      }
      return { format: 'PDF', pages };
    } catch (error) {
      if (this.errorCode(error) || error instanceof Error && error.name === 'PasswordException') throw error;
      fail(422, 'DOCUMENT_PARSE_FAILED', 'Não foi possível ler o texto do PDF. O arquivo original foi preservado.');
    }
  }

  private parsePptx(buffer: Buffer): ParsedDocument {
    const entries = this.inflateZip(buffer);
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false, processEntities: false });
    const slideNames = [...entries.keys()]
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((left, right) => Number(left.match(/slide(\d+)/)?.[1]) - Number(right.match(/slide(\d+)/)?.[1]));
    if (!entries.has('[Content_Types].xml') || !entries.has('ppt/presentation.xml') || !slideNames.length) {
      fail(415, 'UNSUPPORTED_FILE', 'O arquivo não é uma apresentação PPTX válida.');
    }
    if ([...entries.keys()].some((name) => /(?:^|\/)vba(?:project|data)\.bin$/i.test(name))) {
      fail(415, 'PPTX_MACROS_UNSUPPORTED', 'Apresentações com macros não são aceitas.');
    }
    const contentTypes = entries.get('[Content_Types].xml');
    if (contentTypes) {
      const declarations = new TextDecoder('utf-8', { fatal: true }).decode(contentTypes);
      if (/macroEnabled|vbaProject/i.test(declarations)) fail(415, 'PPTX_MACROS_UNSUPPORTED', 'Apresentações com macros não são aceitas.');
    }
    if (slideNames.length > MAX_PAGES) fail(413, 'DOCUMENT_PAGE_LIMIT', `A apresentação excede o limite de ${MAX_PAGES} slides.`);
    let totalTextBytes = 0;
    const pages = slideNames.map((name, index) => {
      const xmlBytes = entries.get(name);
      if (!xmlBytes || xmlBytes.byteLength > 10_000_000) fail(413, 'DOCUMENT_UNCOMPRESSED_LIMIT', 'Um slide excede o limite de leitura.');
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(xmlBytes);
      if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml)) fail(415, 'PPTX_XML_UNSAFE', 'O arquivo contém XML incompatível.');
      const values: string[] = [];
      this.collectText(parser.parse(xml), values);
      // eslint-disable-next-line no-control-regex -- Strip XML control characters from untrusted slide text.
      const text = values.join(' ').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
      totalTextBytes += Buffer.byteLength(text);
      if (totalTextBytes > MAX_EXTRACTED_TEXT_BYTES) fail(413, 'DOCUMENT_TEXT_LIMIT', 'O texto extraído excede o limite de leitura.');
      const slideNumber = index + 1;
      return {
        pageNumber: slideNumber,
        text,
        metadata: {
          source: 'pptx-text',
          slideEntry: name,
          imagesNotExtracted: /<p:pic\b/i.test(xml),
        },
      };
    });
    return { format: 'PPTX', pages };
  }

  private zipEntries(buffer: Buffer): ZipEntry[] {
    const minimum = Math.max(0, buffer.length - 65_557);
    let end = -1;
    for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
      if (offset + 22 <= buffer.length && buffer.readUInt32LE(offset) === 0x06054b50) {
        const commentLength = buffer.readUInt16LE(offset + 20);
        if (offset + 22 + commentLength === buffer.length) { end = offset; break; }
      }
    }
    if (end < 0) fail(415, 'UNSUPPORTED_FILE', 'O arquivo PPTX não possui um diretório ZIP válido.');
    const disk = buffer.readUInt16LE(end + 4);
    const centralDisk = buffer.readUInt16LE(end + 6);
    const diskEntries = buffer.readUInt16LE(end + 8);
    const entries = buffer.readUInt16LE(end + 10);
    const directoryBytes = buffer.readUInt32LE(end + 12);
    let offset = buffer.readUInt32LE(end + 16);
    const directoryStart = offset;
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries || entries < 1 || entries > MAX_ZIP_ENTRIES ||
        entries === 0xffff || directoryBytes === 0xffffffff || offset === 0xffffffff || offset + directoryBytes !== end) {
      fail(413, 'PPTX_ZIP_LIMIT', 'A estrutura do PPTX excede o limite de leitura.');
    }
    const names = new Set<string>();
    const parsed: ZipEntry[] = [];
    for (let index = 0; index < entries; index += 1) {
      if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) fail(415, 'UNSUPPORTED_FILE', 'O diretório PPTX está inválido.');
      const startDisk = buffer.readUInt16LE(offset + 34);
      const flags = buffer.readUInt16LE(offset + 8);
      const method = buffer.readUInt16LE(offset + 10);
      const crc = buffer.readUInt32LE(offset + 16);
      const compressedBytes = buffer.readUInt32LE(offset + 20);
      const entryBytes = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localOffset = buffer.readUInt32LE(offset + 42);
      const nameEnd = offset + 46 + nameLength;
      if (nameEnd + extraLength + commentLength > end || startDisk !== 0 || localOffset === 0xffffffff ||
          compressedBytes === 0xffffffff || entryBytes === 0xffffffff || (flags & ~0x0808) !== 0 || ![0, 8].includes(method)) {
        fail(415, 'PPTX_ZIP_UNSAFE', 'O PPTX contém uma entrada incompatível.');
      }
      let name: string;
      try { name = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(offset + 46, nameEnd)); }
      catch { fail(415, 'PPTX_ZIP_UNSAFE', 'O PPTX contém um nome de arquivo inválido.'); }
      if (!name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some((part) => part === '..') || name.includes('\\')) {
        fail(415, 'PPTX_ZIP_UNSAFE', 'O PPTX contém uma entrada inválida.');
      }
      if (names.has(name)) fail(415, 'PPTX_ZIP_UNSAFE', 'O PPTX contém entradas duplicadas.');
      if (entryBytes > MAX_UNCOMPRESSED_BYTES || compressedBytes > buffer.length) fail(413, 'PPTX_ZIP_LIMIT', 'Uma entrada PPTX excede o limite de leitura.');
      const local = localOffset;
      if (local + 30 > directoryStart || buffer.readUInt32LE(local) !== 0x04034b50) fail(415, 'PPTX_ZIP_UNSAFE', 'Uma entrada PPTX está inválida.');
      const localFlags = buffer.readUInt16LE(local + 6);
      const localMethod = buffer.readUInt16LE(local + 8);
      const localCrc = buffer.readUInt32LE(local + 14);
      const localCompressedBytes = buffer.readUInt32LE(local + 18);
      const localEntryBytes = buffer.readUInt32LE(local + 22);
      const localNameLength = buffer.readUInt16LE(local + 26);
      const localExtraLength = buffer.readUInt16LE(local + 28);
      const dataOffset = local + 30 + localNameLength + localExtraLength;
      const localNameEnd = local + 30 + localNameLength;
      if (dataOffset > directoryStart || dataOffset + compressedBytes > directoryStart || localNameEnd > directoryStart ||
          localFlags !== flags || localMethod !== method || localNameLength !== nameLength ||
          !buffer.subarray(local + 30, localNameEnd).equals(buffer.subarray(offset + 46, nameEnd))) {
        fail(415, 'PPTX_ZIP_UNSAFE', 'Uma entrada PPTX está inconsistente.');
      }
      let recordEnd = dataOffset + compressedBytes;
      if (flags & 0x0008) {
        if (![0, crc].includes(localCrc) || ![0, compressedBytes].includes(localCompressedBytes) || ![0, entryBytes].includes(localEntryBytes)) {
          fail(415, 'PPTX_ZIP_UNSAFE', 'Uma entrada PPTX está inconsistente.');
        }
        let descriptor = recordEnd;
        if (descriptor + 4 <= directoryStart && buffer.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
        if (descriptor + 12 > directoryStart || buffer.readUInt32LE(descriptor) !== crc ||
            buffer.readUInt32LE(descriptor + 4) !== compressedBytes || buffer.readUInt32LE(descriptor + 8) !== entryBytes) {
          fail(415, 'PPTX_ZIP_UNSAFE', 'O descritor de uma entrada PPTX é inválido.');
        }
        recordEnd = descriptor + 12;
      } else if (localCrc !== crc || localCompressedBytes !== compressedBytes || localEntryBytes !== entryBytes) {
        fail(415, 'PPTX_ZIP_UNSAFE', 'Uma entrada PPTX está inconsistente.');
      }
      names.add(name);
      parsed.push({ name, flags, method, crc, compressedBytes, entryBytes, localOffset, dataOffset, recordEnd });
      offset = nameEnd + extraLength + commentLength;
    }
    if (offset !== end || offset - directoryStart !== directoryBytes) fail(415, 'PPTX_ZIP_UNSAFE', 'O diretório PPTX está inconsistente.');
    const localRecords = [...parsed].sort((left, right) => left.localOffset - right.localOffset);
    for (let index = 1; index < localRecords.length; index += 1) {
      if (localRecords[index].localOffset < localRecords[index - 1].recordEnd) fail(415, 'PPTX_ZIP_UNSAFE', 'As entradas PPTX se sobrepõem.');
    }
    return parsed;
  }

  private inflateZip(buffer: Buffer): Map<string, Buffer> {
    const entries = this.zipEntries(buffer);
    const files = new Map<string, Buffer>();
    let totalOutput = 0;
    for (const entry of entries) {
      const compressed = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedBytes);
      let output: Buffer;
      try {
        output = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_UNCOMPRESSED_BYTES - totalOutput, entry.entryBytes) + 1 });
      } catch {
        fail(415, 'PPTX_ZIP_UNSAFE', 'Uma entrada PPTX não pôde ser descompactada com segurança.');
      }
      if (output.byteLength !== entry.entryBytes || output.byteLength > MAX_UNCOMPRESSED_BYTES - totalOutput || this.crc32(output) !== entry.crc) {
        fail(415, 'PPTX_ZIP_UNSAFE', 'Uma entrada PPTX não corresponde ao diretório informado.');
      }
      totalOutput += output.byteLength;
      files.set(entry.name, output);
    }
    return files;
  }

  private crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private collectText(value: unknown, output: string[]): void {
    if (typeof value === 'string') { if (value.trim()) output.push(value); return; }
    if (Array.isArray(value)) { value.forEach((item) => this.collectText(item, output)); return; }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'a:t' || key === 't') this.collectText(child, output);
        else if (typeof child === 'object') this.collectText(child, output);
      }
    }
  }

  private errorCode(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;
  }
}
