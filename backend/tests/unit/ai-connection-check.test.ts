import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../src/core/database.service';
import type { QuotaService } from '../../src/core/quota.service';
import { AIService } from '../../src/features/ai/ai.service';
import type { CredentialsVaultService } from '../../src/features/ai/credentials-vault.service';
import type { IntelligenceJob, IntelligenceJobHandler } from '../../src/features/ai/job.types';
import type { JobHandlerRegistry } from '../../src/features/ai/job-handler.registry';
import type { OllamaCloudProvider } from '../../src/features/ai/ollama-cloud.provider';

const previousProvider = process.env.AI_PROVIDER;
afterEach(() => { process.env.AI_PROVIDER = previousProvider; });

function setup(health: { status: 'CONNECTED' | 'AUTH_FAILED' | 'UNAVAILABLE'; checkedAt: string; accountIdentityHash?: string | null; errorCode?: string }) {
  process.env.AI_PROVIDER = 'ollama';
  const row = {
    id: 'connection-1', user_id: 'actor', provider: 'ollama', ciphertext: Buffer.alloc(0), nonce: Buffer.alloc(0), auth_tag: Buffer.alloc(0),
    key_version: 'v1', masked_suffix: '••••1234', status: 'CONNECTED', checked_at: null, account_identity_hash: 'a'.repeat(64),
    credential_revision: 2, label: null, position: 0, usage_snapshot: null, usage_checked_at: null, last_used_at: null,
    exhausted_at: null, created_at: new Date(),
  };
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    asActor: async (_actorId: string, work: (connection: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) =>
      work({ query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM ai_connections WHERE user_id = $1 AND provider')) return [row];
        if (sql.startsWith('UPDATE ai_connections')) {
          updates.push({ sql, params });
          return [{ id: row.id }];
        }
        return [];
      } }),
  } as unknown as DatabaseService;
  let handler: IntelligenceJobHandler | undefined;
  const handlers = { register: vi.fn((_feature: string, value: IntelligenceJobHandler) => { handler = value; }) } as unknown as JobHandlerRegistry;
  const cloud = { healthCheck: vi.fn(async () => health) } as unknown as OllamaCloudProvider;
  const service = new AIService(
    db,
    {} as QuotaService,
    { decrypt: () => 'private-key' } as unknown as CredentialsVaultService,
    cloud,
    {} as never,
    handlers,
    {} as never,
  );
  service.onModuleInit();
  const job: IntelligenceJob = {
    id: 'job-1', workspace_id: 'workspace', actor_id: 'actor', feature: 'AI_CONNECTION_CHECK', state: 'RUNNING',
    stage: 'RUNNING', progress: null, resource_type: 'AI_CONNECTION', resource_id: row.id,
    payload: { resourceId: row.id, credentialRevision: row.credential_revision }, result: null, error_code: null,
  };
  return { run: () => handler!(job), updates, cloud };
}

describe('verificação de conexão de IA no serviço', () => {
  it('preserva estado não verificado e explica falhas de rede sem marcar a chave como inválida', async () => {
    const checkedAt = new Date().toISOString();
    const { run, updates } = setup({ status: 'UNAVAILABLE', checkedAt, errorCode: 'PROVIDER_TIMEOUT' });

    const result = await run();

    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain('account_identity_hash = $6');
    expect(updates[0].params).toMatchObject(['connection-1', 'actor', 'UNVERIFIED', checkedAt, 2, null]);
    expect(result).toMatchObject({
      connection: {
        status: 'UNVERIFIED',
        checkedAt,
        errorCode: 'PROVIDER_TIMEOUT',
        message: expect.stringContaining('Tente novamente'),
      },
    });
  });

  it('marca como inválida somente quando o provedor confirma rejeição de autenticação', async () => {
    const checkedAt = new Date().toISOString();
    const { run, updates } = setup({ status: 'AUTH_FAILED', checkedAt });

    const result = await run();

    expect(updates[0].params).toMatchObject(['connection-1', 'actor', 'INVALID', checkedAt, 2, null]);
    expect(result).toMatchObject({ connection: { status: 'INVALID', checkedAt } });
  });
});
