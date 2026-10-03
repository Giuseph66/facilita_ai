import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail } from '../../src/core/errors';
import type { DatabaseService } from '../../src/core/database.service';
import type { QuotaService } from '../../src/core/quota.service';
import { AIService } from '../../src/features/ai/ai.service';
import type { CredentialsVaultService } from '../../src/features/ai/credentials-vault.service';
import type { GenerationInput, ProviderContext } from '../../src/features/ai/ai.provider';
import type { OllamaCloudProvider } from '../../src/features/ai/ollama-cloud.provider';

const previousProvider = process.env.AI_PROVIDER;
afterEach(() => { process.env.AI_PROVIDER = previousProvider; });

type Row = { id: string; status: string; exhausted_at: Date | null; usage_snapshot: unknown; usage_checked_at: Date | null };

function key(id: string, overrides: Partial<Row> = {}): Row & Record<string, unknown> {
  return {
    id, user_id: 'actor', provider: 'ollama', ciphertext: Buffer.alloc(0), nonce: Buffer.alloc(0), auth_tag: Buffer.alloc(0),
    key_version: 'v1', masked_suffix: `••••${id}`, status: 'CONNECTED', checked_at: null, credential_revision: 1, label: null,
    position: 0, usage_snapshot: null, usage_checked_at: null, last_used_at: null, exhausted_at: null, created_at: new Date(), ...overrides,
  };
}

function setup(rows: Array<ReturnType<typeof key>>, chat: (context: ProviderContext) => Promise<unknown>) {
  process.env.AI_PROVIDER = 'ollama';
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    asActor: async (_actor: string, work: (connection: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) =>
      work({ query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM ai_preferences')) return [{ mode: 'BYOK', preferred_model: 'gpt-oss:20b' }];
        if (sql.includes('FROM ai_connections WHERE user_id = $1 AND provider')) return rows;
        if (sql.includes('COALESCE(MAX(attempt)')) return [{ attempt: 1 }];
        if (sql.startsWith('UPDATE ai_connections')) updates.push({ sql, params });
        return [];
      } }),
  } as unknown as DatabaseService;
  const quota = { require: vi.fn(async () => undefined), reserve: vi.fn(async () => undefined), commit: vi.fn(async () => undefined), release: vi.fn(async () => undefined) } as unknown as QuotaService;
  const vault = { decrypt: (_user: string, id: string) => `secret-${id}` } as unknown as CredentialsVaultService;
  const cloud = {
    chat: vi.fn(async (_input: GenerationInput, context: ProviderContext) => chat(context)),
    getUsage: vi.fn(async () => ({ windows: [{ name: 'weekly', used: 0.4 }], checkedAt: new Date().toISOString() })),
  } as unknown as OllamaCloudProvider;
  const service = new AIService(db, quota, vault, cloud, {} as never, {} as never, {} as never);
  const generate = () => service.generate('actor', 'job-1', 'CHAT_REPLY', { model: '', system: 's', prompt: 'p' });
  return { generate, cloud, quota, updates };
}

const ok = (context: ProviderContext) => Promise.resolve({ text: `ok:${context.apiKey}`, model: 'gpt-oss:20b', latencyMs: 1 });

describe('troca automática entre chaves de IA', () => {
  it('passa para a próxima chave quando a primeira atinge o limite e marca a primeira como esgotada', async () => {
    const { generate, updates, cloud } = setup([key('a'), key('b')], (context) =>
      context.apiKey === 'secret-a' ? Promise.reject(Object.assign(new Error('limit'), { code: 'PROVIDER_RATE_LIMITED' })) : ok(context));
    const result = await generate();
    expect(result.text).toBe('ok:secret-b');
    expect(updates.some((update) => update.sql.includes('exhausted_at = now()') && update.params[0] === 'a')).toBe(true);
    expect(updates.some((update) => update.sql.includes('last_used_at = now()') && update.params[0] === 'b')).toBe(true);
    expect(cloud.getUsage).toHaveBeenCalled();
  });

  it('marca como recusada a chave rejeitada e usa a próxima', async () => {
    const { generate, updates } = setup([key('a'), key('b')], (context) =>
      context.apiKey === 'secret-a' ? (() => { fail(502, 'PROVIDER_AUTH_FAILED', 'recusada'); })() : ok(context));
    expect((await generate()).text).toBe('ok:secret-b');
    expect(updates.some((update) => update.sql.includes("status = 'INVALID'") && update.params[0] === 'a')).toBe(true);
  });

  it('pula chaves recusadas e chaves que esgotaram há pouco', async () => {
    const { generate, cloud } = setup([key('a', { status: 'INVALID' }), key('b', { exhausted_at: new Date() }), key('c')], ok);
    expect((await generate()).text).toBe('ok:secret-c');
    expect(cloud.chat).toHaveBeenCalledTimes(1);
  });

  it('avisa quando todas as chaves estão no limite e libera a reserva de cota', async () => {
    const { generate, cloud, quota } = setup([key('a', { exhausted_at: new Date() })], ok);
    await expect(generate()).rejects.toMatchObject({ code: 'AI_KEYS_EXHAUSTED' });
    expect(cloud.chat).not.toHaveBeenCalled();
    expect(quota.release).toHaveBeenCalledWith('actor', 'DAILY_GENERATIONS', 'job-1');
  });

  it('não troca de chave em erros que não são da chave', async () => {
    const { generate, cloud } = setup([key('a'), key('b')], () => Promise.reject(Object.assign(new Error('bad'), { code: 'MODEL_UNSUPPORTED' })));
    await expect(generate()).rejects.toMatchObject({ code: 'MODEL_UNSUPPORTED' });
    expect(cloud.chat).toHaveBeenCalledTimes(1);
  });
});
