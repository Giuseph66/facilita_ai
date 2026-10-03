import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail } from '../../core/errors';
import { DOCUMENT_CHUNKER_VERSION, DOCUMENT_PARSER_VERSION } from '../pipeline-versions';

export interface EmbeddedText {
  vector: number[];
  tokenCount: number;
}

interface FeaturePipeline {
  (input: string, options?: Record<string, unknown>): Promise<{ tolist(): unknown }>;
  tokenizer?: (input: string) => { input_ids?: { data?: ArrayLike<number>; length?: number } | number[] };
}

interface EmbeddingManifest {
  schemaVersion: 1;
  modelId: string;
  revision: string;
  dtype: 'q8';
  dimension: 384;
  files: Array<{ path: string; sha256: string }>;
}

@Injectable()
export class EmbeddingService {
  private pipelinePromise?: Promise<FeaturePipeline>;

  private readonly modelName = process.env.EMBEDDING_MODEL_ID ?? 'Xenova/multilingual-e5-small';

  get fingerprint(): string {
    if (process.env.EMBEDDING_PROVIDER === 'fake') {
      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O modelo de embeddings não está disponível.');
      }
      return `fake:deterministic-hash-vector384:v1|dim=384|pool=mean|normalize=l2|query=query: |passage=passage: |parser=${DOCUMENT_PARSER_VERSION}|chunker=${DOCUMENT_CHUNKER_VERSION}`;
    }
    const revision = process.env.EMBEDDING_MODEL_REVISION;
    if (!revision || !/^[a-f0-9]{40}$/i.test(revision)) {
      fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'Configure uma revisão imutável para o modelo local de embeddings.');
    }
    return `${this.modelName}@${revision.toLowerCase()}|tokenizer=${this.modelName}@${revision.toLowerCase()}|dtype=q8|dim=384|pool=mean|normalize=l2|query=query: |passage=passage: |parser=${DOCUMENT_PARSER_VERSION}|chunker=${DOCUMENT_CHUNKER_VERSION}`;
  }

  async embedPassage(text: string): Promise<EmbeddedText> {
    return this.embed(`passage: ${text}`, text);
  }

  async embedQuery(text: string): Promise<EmbeddedText> {
    return this.embed(`query: ${text}`, text);
  }

  async countTokens(text: string): Promise<number> {
    const prefixed = `passage: ${text}`;
    if (process.env.EMBEDDING_PROVIDER === 'fake') return Math.ceil(prefixed.length / 4);
    const model = await this.getPipeline();
    const encoded = model.tokenizer?.(prefixed).input_ids;
    if (!encoded) fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O tokenizer local de embeddings não está disponível.');
    return Array.isArray(encoded) ? encoded.length : encoded.length ?? encoded.data?.length ?? 0;
  }

  private async embed(input: string, sourceText: string): Promise<EmbeddedText> {
    if (process.env.EMBEDDING_PROVIDER === 'fake') {
      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O modelo local de embeddings não está disponível.');
      }
      return { vector: this.fakeVector(input), tokenCount: Math.ceil(input.length / 4) };
    }
    const model = await this.getPipeline();
    const output = await model(input, { pooling: 'mean', normalize: true });
    const values = output.tolist() as number[][] | number[][][];
    const first = Array.isArray(values[0]?.[0]) ? values[0][0] as number[] : values[0] as number[];
    if (!Array.isArray(first) || first.length !== 384 || first.some((value) => !Number.isFinite(value))) {
      fail(503, 'EMBEDDING_MODEL_INVALID', 'O modelo local de embeddings retornou um vetor inválido.');
    }
    const encoded = model.tokenizer?.(input).input_ids;
    const tokenCount = Array.isArray(encoded) ? encoded.length : encoded?.length ?? encoded?.data?.length ?? Math.ceil(sourceText.length / 4);
    if (tokenCount > 480) fail(413, 'EMBEDDING_INPUT_TOO_LARGE', 'O trecho excede o limite do modelo de embeddings.');
    return { vector: first, tokenCount };
  }

  private async getPipeline(): Promise<FeaturePipeline> {
    if (!this.pipelinePromise) {
      const cachePath = process.env.EMBEDDING_CACHE_PATH;
      const revision = process.env.EMBEDDING_MODEL_REVISION;
      if (!cachePath || !revision || !/^[a-f0-9]{40}$/i.test(revision)) {
        fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'Configure o cache local e a revisão imutável do modelo de embeddings.');
      }
      this.pipelinePromise = (async () => {
        const modelPath = path.resolve(cachePath, this.modelName, revision);
        await this.verifyManifest(modelPath, revision);
        const transformers = await import('@huggingface/transformers');
        transformers.env.allowRemoteModels = false;
        transformers.env.localModelPath = `${modelPath}${path.sep}`;
        const extractor = await transformers.pipeline('feature-extraction', modelPath, { dtype: 'q8', device: 'cpu' });
        return extractor as unknown as FeaturePipeline;
      })().catch((error: unknown) => {
        this.pipelinePromise = undefined;
        if (error instanceof Error && error.message.includes('Cannot find')) {
          fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O modelo local de embeddings não foi instalado.');
        }
        throw error;
      });
    }
    return this.pipelinePromise;
  }

  private async verifyManifest(modelPath: string, revision: string): Promise<void> {
    try {
      const manifestPath = path.join(modelPath, 'embedding-manifest.json');
      const manifestFile = await lstat(manifestPath);
      if (!manifestFile.isFile() || manifestFile.isSymbolicLink()) throw new Error('invalid manifest file');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as EmbeddingManifest;
      if (manifest.schemaVersion !== 1 || manifest.modelId !== this.modelName || manifest.revision !== revision ||
          manifest.dtype !== 'q8' || manifest.dimension !== 384 || !Array.isArray(manifest.files) || manifest.files.length < 1) {
        fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O manifesto do modelo local não corresponde à configuração ativa.');
      }
      for (const item of manifest.files) {
        if (typeof item.path !== 'string' || !item.path || item.path.includes('\\') || item.path.includes('\0') ||
            path.isAbsolute(item.path) || item.path.split('/').some((part) => !part || part === '.' || part === '..') ||
            !/^[a-f0-9]{64}$/i.test(item.sha256)) {
          fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O manifesto do modelo local contém um arquivo inválido.');
        }
        const filePath = path.resolve(modelPath, ...item.path.split('/'));
        if (!filePath.startsWith(`${modelPath}${path.sep}`)) fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O manifesto do modelo local contém um caminho inválido.');
        const info = await lstat(filePath);
        if (!info.isFile() || info.isSymbolicLink()) fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O manifesto do modelo local contém um arquivo inválido.');
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
        if (digest.digest('hex') !== item.sha256.toLowerCase()) fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'Um arquivo do modelo local não corresponde ao manifesto.');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'getResponse' in error) throw error;
      fail(503, 'EMBEDDINGS_NOT_CONFIGURED', 'O modelo local pinado não está instalado ou não pôde ser validado.');
    }
  }

  private fakeVector(text: string): number[] {
    const vector = Array<number>(384).fill(0);
    const tokens = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    tokens.forEach((token, index) => {
      const digest = createHash('sha256').update(token).digest();
      const bucket = digest.readUInt32LE(0) % 384;
      const sign = digest[4] & 1 ? 1 : -1;
      vector[bucket] += sign / Math.sqrt(index + 1);
    });
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
  }
}
