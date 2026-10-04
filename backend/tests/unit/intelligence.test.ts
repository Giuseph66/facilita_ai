import { randomBytes } from 'node:crypto';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiException } from '../../src/core/errors';
import { DatabaseService } from '../../src/core/database.service';
import { QuotaService } from '../../src/core/quota.service';
import { AIService } from '../../src/features/ai/ai.service';
import { CredentialsVaultService } from '../../src/features/ai/credentials-vault.service';
import { FakeAIProvider } from '../../src/features/ai/fake-ai.provider';
import { DocumentParserEngine } from '../../src/features/documents/document-parser.engine';
import { AssessmentQuestionInput, assessmentGenerationInputSchema, assessmentQuestionsInputSchema, blueprintInputSchema } from '../../src/features/assessments/assessments.dto';
import { EmbeddingService } from '../../src/features/rag/embedding.service';
import { pdfFixture, pptxFixture } from '../support/fixtures';

const changedEnvironment = new Map<string, string | undefined>();
function setEnvironment(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!changedEnvironment.has(key)) changedEnvironment.set(key, process.env[key]);
    process.env[key] = value;
  }
}
afterEach(() => {
  for (const [key, value] of changedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  changedEnvironment.clear();
});

describe('parser de documentos', () => {
  it('detecta PDF e extrai texto de PPTX reais sem consultar serviços externos', async () => {
    const parser = new DocumentParserEngine();
    expect(parser.detectFormat(pdfFixture('Glicólise converte glicose em piruvato.'))).toBe('PDF');
    const pptx = await parser.parse(pptxFixture('Fotossíntese produz glicose pela energia luminosa.'));
    expect(pptx.format).toBe('PPTX');
    expect(pptx.pages[0].text).toContain('Fotossíntese');
  });

  it('recusa DOCTYPE no XML de slide e preserva a validação do pacote', async () => {
    const archive = unzipSync(pptxFixture());
    archive['ppt/slides/slide1.xml'] = strToU8('<!DOCTYPE slide [<!ENTITY x SYSTEM "file:///etc/passwd">]><p:sld>&x;</p:sld>');
    await expect(new DocumentParserEngine().parse(Buffer.from(zipSync(archive)))).rejects.toMatchObject({ code: 'PPTX_XML_UNSAFE' });
  });

  it('rejeita ZIP cujo tamanho anunciado diverge dos bytes descompactados', async () => {
    const forged = Buffer.from(pptxFixture('Texto íntegro do slide.'));
    let found = false;
    for (let offset = 0; offset + 46 <= forged.length; offset += 1) {
      if (forged.readUInt32LE(offset) !== 0x02014b50) continue;
      const nameLength = forged.readUInt16LE(offset + 28);
      const name = forged.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      if (name !== 'ppt/slides/slide1.xml') continue;
      const advertisedBytes = forged.readUInt32LE(offset + 24) + 1;
      const localOffset = forged.readUInt32LE(offset + 42);
      forged.writeUInt32LE(advertisedBytes, offset + 24);
      forged.writeUInt32LE(advertisedBytes, localOffset + 22);
      found = true;
      break;
    }
    expect(found).toBe(true);
    await expect(new DocumentParserEngine().parse(forged)).rejects.toMatchObject({ code: 'PPTX_ZIP_UNSAFE' });
  });
});

describe('embeddings de teste e RAG', () => {
  it('mantém vetores fake determinísticos, normalizados e separados por prefixo', async () => {
    setEnvironment({ NODE_ENV: 'test', EMBEDDING_PROVIDER: 'fake' });
    const embeddings = new EmbeddingService();
    const first = await embeddings.embedPassage('glicólise produz piruvato');
    const repeated = await embeddings.embedPassage('glicólise produz piruvato');
    const query = await embeddings.embedQuery('glicólise produz piruvato');
    const norm = Math.sqrt(first.vector.reduce((sum, value) => sum + value * value, 0));
    expect(embeddings.fingerprint).toContain('fake:deterministic-hash-vector384');
    expect(first.vector).toHaveLength(384);
    expect(norm).toBeCloseTo(1, 8);
    expect(first.vector).toEqual(repeated.vector);
    expect(query.vector).not.toEqual(first.vector);
    expect(first.tokenCount).toBeGreaterThan(0);
  });

  it('bloqueia embeddings fake fora de development/test', () => {
    setEnvironment({ NODE_ENV: 'production', EMBEDDING_PROVIDER: 'fake' });
    expect(() => new EmbeddingService().fingerprint).toThrow(ApiException);
  });
});

describe('credenciais e provedor de IA', () => {
  it('cifra com AES-GCM e autentica usuário, conexão e provedor no AAD', () => {
    const key = randomBytes(32).toString('base64');
    setEnvironment({ VAULT_ACTIVE_KEY_ID: 'unit-v1', VAULT_KEYS_JSON: JSON.stringify({ 'unit-v1': key }) });
    const vault = new CredentialsVaultService();
    const encrypted = vault.encrypt('user-1', 'connection-1', 'ollama', 'fake-secret-key-value');
    expect(encrypted.maskedSuffix).toBe('••••alue');
    expect(vault.decrypt('user-1', 'connection-1', 'ollama', {
      ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    })).toBe('fake-secret-key-value');
    expect(() => vault.decrypt('user-2', 'connection-1', 'ollama', {
      ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    })).toThrow(ApiException);
  });

  it('exige opt-in de fake e grava prompt apenas no adaptador local de teste', async () => {
    setEnvironment({ NODE_ENV: 'test', AI_PROVIDER: 'fake' });
    const fake = new FakeAIProvider();
    const context = { actorId: 'actor', payerScope: 'BYOK' as const, provider: 'ollama' as const, apiKey: '', credentialRevision: 0 };
    const response = await fake.chat({ model: 'fake-e5-chat', system: 'system', prompt: 'conteúdo local', developmentFakeResponse: { ok: true } }, context);
    expect(JSON.parse(response.text)).toEqual({ ok: true });
    expect(fake.calls()[0]).toMatchObject({ actorId: 'actor', prompt: 'conteúdo local' });
    setEnvironment({ NODE_ENV: 'production' });
    await expect(fake.getModels(context)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('expõe dois modelos de teste estáveis para validar salvar e restaurar uma escolha diferente', async () => {
    setEnvironment({ NODE_ENV: 'test', AI_PROVIDER: 'fake' });
    const fake = new FakeAIProvider();
    const context = { actorId: 'actor', payerScope: 'BYOK' as const, provider: 'ollama' as const, apiKey: '', credentialRevision: 0 };
    const models = await fake.getModels(context);
    const health = await fake.healthCheck(context);
    expect(models.map(model => model.id)).toEqual(['fake-e5-chat', 'fake-e5-chat-alt']);
    expect(health.models).toEqual(models);
  });

  it('escolhe modelo de teste estável em jobs fake sem credencial ou preferência', async () => {
    setEnvironment({ NODE_ENV: 'test', AI_PROVIDER: 'fake' });
    const fake = new FakeAIProvider();
    const quota = {
      require: vi.fn(async () => undefined), reserve: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined), release: vi.fn(async () => undefined),
    } as unknown as QuotaService;
    const db = {
      asActor: async (_actorId: string, work: (connection: { query<T>(sql: string): Promise<T[]> }) => Promise<unknown>) => {
        const connection = { query: async <T>(sql: string): Promise<T[]> => {
          if (sql.includes('COALESCE(MAX(attempt)')) return [{ attempt: 1 } as T];
          return [];
        } };
        return work(connection);
      },
    } as unknown as DatabaseService;
    const service = new AIService(db, quota, {} as CredentialsVaultService, {} as never, fake, {} as never, {} as never);
    const result = await service.generate('actor', 'job-1', 'STUDY_ARTIFACT', {
      model: '', system: 'Siga somente as instruções locais.', prompt: 'Contexto controlado',
    }, 0);
    expect(result.model).toBe('fake-e5-chat');
    expect(fake.calls()[0].model).toBe('fake-e5-chat');
    expect(quota.commit).toHaveBeenCalledWith('actor', 'DAILY_GENERATIONS', 'job-1');
  });

  it('falha sem fornecedor configurado, não cai no fake e libera as reservas', async () => {
    setEnvironment({ NODE_ENV: 'test', AI_PROVIDER: 'disabled' });
    const fake = new FakeAIProvider();
    const quota = {
      require: vi.fn(async () => undefined), reserve: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined), release: vi.fn(async () => undefined),
    } as unknown as QuotaService;
    const db = {
      asActor: async (_actorId: string, work: (connection: { query<T>(sql: string): Promise<T[]> }) => Promise<unknown>) =>
        work({ query: async <T>() => [] as T[] }),
    } as unknown as DatabaseService;
    const service = new AIService(db, quota, {} as CredentialsVaultService, {} as never, fake, {} as never, {} as never);

    await expect(service.generate('actor', 'job-offline', 'STUDY_ARTIFACT', {
      model: '', system: 'Instrução', prompt: 'Conteúdo local',
    }, 0)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    expect(fake.calls()).toHaveLength(0);
    expect(quota.commit).not.toHaveBeenCalled();
    expect(quota.release).toHaveBeenNthCalledWith(1, 'actor', 'DAILY_GENERATIONS', 'job-offline');
    expect(quota.release).toHaveBeenNthCalledWith(2, 'actor', 'MAX_CONCURRENT_AI_JOBS', 'job-offline');
  });
});

describe('DTOs de avaliação e blueprint', () => {
  it('aceita exatamente a distribuição 6 objetivas e 4 abertas solicitada', () => {
    const valid = assessmentGenerationInputSchema.safeParse({
      revision: 2, totalQuestions: 10, difficulty: 'MIXED',
      distribution: { MULTIPLE_CHOICE: 6, SHORT_ANSWER: 2, ESSAY: 2 },
      documentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(valid.success).toBe(true);
    const partial = assessmentGenerationInputSchema.safeParse({
      revision: 2, totalQuestions: 10, difficulty: 'MIXED',
      distribution: { MULTIPLE_CHOICE: 6, SHORT_ANSWER: 2, ESSAY: 1 },
      documentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(partial.success).toBe(false);
  });

  it('não aceita gabarito objetivo fora das opções nem assunto duplicado em blueprint', () => {
    const question: AssessmentQuestionInput = {
      type: 'MULTIPLE_CHOICE', statement: 'Escolha a resposta.',
      options: [{ id: 'A', text: 'Uma opção' }, { id: 'B', text: 'Outra opção' }],
      difficulty: 'MEDIUM', points: 1, answer: { correctOptionId: 'C' },
    };
    expect(assessmentQuestionsInputSchema.safeParse({ revision: 1, questions: [question] }).success).toBe(false);
    expect(blueprintInputSchema.safeParse({ difficulty: 'MEDIUM', topics: [
      { courseTopicId: '11111111-1111-4111-8111-111111111111' },
      { courseTopicId: '11111111-1111-4111-8111-111111111111' },
    ] }).success).toBe(false);
  });
});
