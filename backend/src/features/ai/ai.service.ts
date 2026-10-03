import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../core/database.service';
import { QuotaService } from '../../core/quota.service';
import { fail } from '../../core/errors';
import { CredentialsVaultService } from './credentials-vault.service';
import { FakeAIProvider } from './fake-ai.provider';
import { AIProvider, GenerationInput, GenerationResult, ModelDescriptor, ProviderContext, ResolvedAIProvider } from './ai.provider';
import { OllamaCloudProvider } from './ollama-cloud.provider';
import { JobHandlerRegistry } from './job-handler.registry';
import { JobsService } from './jobs.service';
import { IntelligenceJob } from './job.types';

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: 'ollama';
  ciphertext: Buffer;
  nonce: Buffer;
  auth_tag: Buffer;
  key_version: string;
  masked_suffix: string;
  status: 'UNVERIFIED' | 'CONNECTED' | 'INVALID';
  checked_at: Date | null;
  credential_revision: number;
}

export interface ConnectionView {
  provider: 'ollama';
  status: 'UNVERIFIED' | 'CONNECTED' | 'INVALID';
  maskedKey: string;
  checkedAt: string | null;
}

@Injectable()
export class AIService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly quota: QuotaService,
    private readonly vault: CredentialsVaultService,
    private readonly cloud: OllamaCloudProvider,
    private readonly fake: FakeAIProvider,
    private readonly jobHandlers: JobHandlerRegistry,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobHandlers.register('AI_CONNECTION_CHECK', (job) => this.checkConnectionJob(job));
  }

  async getConnection(actorId: string): Promise<{ connection: ConnectionView | null }> {
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<ConnectionRow>(
        `SELECT id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at, credential_revision
         FROM ai_connections WHERE user_id = $1 AND provider = 'ollama'`,
        [actorId],
      ),
    );
    const row = rows[0];
    return { connection: row ? this.toConnectionView(row) : null };
  }

  async saveConnection(actorId: string, apiKey: string): Promise<{ connection: ConnectionView }> {
    if (typeof apiKey !== 'string' || apiKey.trim().length < 16 || apiKey.length > 1024 || /[\r\n]/.test(apiKey)) {
      fail(400, 'VALIDATION_FAILED', 'A chave informada é inválida.');
    }
    return this.db.asActor(actorId, async (connection) => {
      const current = await connection.query<ConnectionRow>(
        `SELECT id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at, credential_revision
         FROM ai_connections WHERE user_id = $1 AND provider = 'ollama' FOR UPDATE`,
        [actorId],
      );
      const existing = current[0];
      const connectionId = existing?.id ?? randomUUID();
      const encrypted = this.vault.encrypt(actorId, connectionId, 'ollama', apiKey);
      const rows = await connection.query<ConnectionRow>(
        `INSERT INTO ai_connections (id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at, credential_revision)
         VALUES ($1,$2,'ollama',$3,$4,$5,$6,$7,'UNVERIFIED',NULL,$8)
         ON CONFLICT (user_id, provider) DO UPDATE SET
           ciphertext = EXCLUDED.ciphertext, nonce = EXCLUDED.nonce, auth_tag = EXCLUDED.auth_tag,
           key_version = EXCLUDED.key_version, masked_suffix = EXCLUDED.masked_suffix, status = 'UNVERIFIED',
           checked_at = NULL, credential_revision = ai_connections.credential_revision + 1, updated_at = now()
         RETURNING id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at, credential_revision`,
        [connectionId, actorId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.keyVersion, encrypted.maskedSuffix, existing ? existing.credential_revision + 1 : 1],
      );
      return { connection: this.toConnectionView(rows[0]) };
    });
  }

  async removeConnection(actorId: string): Promise<void> {
    await this.db.asActor(actorId, async (connection) => {
      const removed = await connection.query<{ id: string }>(
        `DELETE FROM ai_connections WHERE user_id = $1 AND provider = 'ollama' RETURNING id`, [actorId],
      );
      if (!removed[0]) fail(404, 'RESOURCE_NOT_FOUND', 'A conexão solicitada não está disponível.');
    });
  }

  async queueConnectionCheck(actorId: string, workspaceId: string, idempotencyKey?: string): Promise<unknown> {
    const row = await this.connectionMetadata(actorId);
    if (!row) fail(404, 'RESOURCE_NOT_FOUND', 'Configure a conexão antes de verificá-la.');
    return this.jobs.create(actorId, workspaceId, 'AI_CONNECTION_CHECK', {
      resourceType: 'AI_CONNECTION', resourceId: row.id, credentialRevision: row.credential_revision,
    }, idempotencyKey);
  }

  async listModels(actorId: string): Promise<{ items: ModelDescriptor[] }> {
    const resolved = await this.resolve(actorId);
    return { items: await resolved.provider.getModels(resolved.context) };
  }

  async setPreference(actorId: string, mode: 'BYOK' | 'PLATFORM', preferredModel?: string): Promise<{ mode: 'BYOK' | 'PLATFORM'; preferredModel: string | null }> {
    if (mode === 'PLATFORM' && process.env.PLATFORM_AI_ENABLED !== 'true') {
      fail(403, 'CAPABILITY_REQUIRED', 'A IA da plataforma ainda não está habilitada.');
    }
    if (mode === 'PLATFORM') fail(503, 'PROVIDER_NOT_CONFIGURED', 'A IA da plataforma ainda não tem fornecedor configurado.');
    if (preferredModel && preferredModel.length > 160) fail(400, 'VALIDATION_FAILED', 'Modelo inválido.');
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<{ provider: string }>(`SELECT provider FROM ai_connections WHERE user_id = $1 AND provider = 'ollama'`, [actorId]),
    );
    if (!rows[0] && process.env.AI_PROVIDER !== 'fake') fail(403, 'PROVIDER_NOT_CONFIGURED', 'Configure uma conexão de IA para escolher o modelo.');
    if (preferredModel) {
      const available = await this.listModels(actorId);
      if (!available.items.some((model) => model.id === preferredModel)) fail(422, 'MODEL_UNSUPPORTED', 'O modelo não está disponível nesta conexão.');
    }
    await this.db.asActor(actorId, async (connection) => {
      await connection.query(
        `INSERT INTO ai_preferences (user_id, mode, preferred_model) VALUES ($1, 'BYOK', $2)
         ON CONFLICT (user_id) DO UPDATE SET mode = 'BYOK', preferred_model = EXCLUDED.preferred_model, updated_at = now()`,
        [actorId, preferredModel ?? null],
      );
    });
    return { mode: 'BYOK', preferredModel: preferredModel ?? null };
  }

  async resolve(actorId: string, expectedRevision?: number): Promise<ResolvedAIProvider> {
    const modeRows = await this.db.asActor(actorId, (connection) =>
      connection.query<{ mode: 'BYOK' | 'PLATFORM'; preferred_model: string | null }>(
        `SELECT mode, preferred_model FROM ai_preferences WHERE user_id = $1`, [actorId],
      ),
    );
    const mode = modeRows[0]?.mode ?? 'BYOK';
    if (mode !== 'BYOK') fail(503, 'PROVIDER_NOT_CONFIGURED', 'A IA da plataforma não está disponível.');
    const provider = this.selectProvider();
    if (provider === this.fake) {
      const row = expectedRevision === undefined ? undefined : await this.connectionMetadata(actorId);
      const credentialRevision = row?.credential_revision ?? 0;
      if (expectedRevision !== undefined && expectedRevision !== credentialRevision) {
        fail(409, 'CREDENTIAL_CHANGED', 'A configuração de IA foi alterada; envie novamente a operação.');
      }
      return {
        provider,
        context: { actorId, payerScope: 'BYOK', provider: 'ollama', apiKey: '', credentialRevision },
        model: modeRows[0]?.preferred_model ?? '',
      };
    }
    const row = await this.connectionMetadata(actorId);
    if (!row) fail(503, 'PROVIDER_NOT_CONFIGURED', 'Configure uma conexão de IA antes de continuar.');
    if (expectedRevision !== undefined && row.credential_revision !== expectedRevision) {
      fail(409, 'CREDENTIAL_CHANGED', 'A conexão de IA foi alterada; envie novamente a operação.');
    }
    const apiKey = provider === this.fake ? '' : this.vault.decrypt(actorId, row.id, row.provider, row);
    const context: ProviderContext = {
      actorId,
      payerScope: 'BYOK',
      provider: 'ollama',
      apiKey,
      credentialRevision: row.credential_revision,
    };
    return { provider, context, model: modeRows[0]?.preferred_model ?? '' };
  }

  async credentialRevision(actorId: string): Promise<number> {
    if (process.env.AI_PROVIDER === 'fake' && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) return 0;
    const row = await this.connectionMetadata(actorId);
    if (!row) fail(403, 'PROVIDER_NOT_CONFIGURED', 'Configure uma conexão de IA antes de continuar.');
    return row.credential_revision;
  }

  async generate(
    actorId: string,
    operationId: string,
    feature: string,
    input: GenerationInput,
    expectedCredentialRevision?: number,
  ): Promise<GenerationResult> {
    await this.quota.require(actorId, 'AI_BYOK_ACCESS');
    const generationMetric = 'DAILY_GENERATIONS';
    const concurrencyMetric = 'MAX_CONCURRENT_AI_JOBS';
    await this.quota.reserve(actorId, generationMetric, operationId);
    try {
      await this.quota.reserve(actorId, concurrencyMetric, operationId);
    } catch (error) {
      await this.quota.release(actorId, generationMetric, operationId).catch(() => undefined);
      throw error;
    }
    let model = input.model;
    try {
      const resolved = await this.resolve(actorId, expectedCredentialRevision);
      model = input.model || resolved.model || (resolved.provider === this.fake ? 'fake-e5-chat' : '');
      if (!model) fail(422, 'MODEL_UNSUPPORTED', 'Escolha um modelo de IA antes de continuar.');
      const result = await this.withTransportRetries(async () => {
        const started = Date.now();
        try {
          const response = await resolved.provider.chat({ ...input, model }, resolved.context);
          await this.recordUsage(actorId, operationId, feature, model, response, true, null, Date.now() - started).catch(() => undefined);
          return response;
        } catch (error) {
          await this.recordUsage(actorId, operationId, feature, model, null, false, this.publicErrorCode(error), Date.now() - started).catch(() => undefined);
          throw error;
        }
      });
      try {
        await this.quota.commit(actorId, generationMetric, operationId);
      } catch {
        fail(503, 'QUOTA_COMMIT_FAILED', 'Não foi possível registrar o consumo desta geração.');
      }
      return result;
    } catch (error) {
      const code = this.publicErrorCode(error);
      if (!['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMITED'].includes(code)) {
        await this.quota.release(actorId, generationMetric, operationId).catch(() => undefined);
      }
      throw error;
    } finally {
      await this.quota.release(actorId, concurrencyMetric, operationId).catch(() => undefined);
    }
  }

  private async checkConnectionJob(job: IntelligenceJob): Promise<Record<string, unknown>> {
    const expectedRevision = Number(job.payload.credentialRevision);
    const resolved = await this.resolve(job.actor_id, expectedRevision);
    const health = await resolved.provider.healthCheck(resolved.context);
    const status = health.status === 'CONNECTED' ? 'CONNECTED' : 'INVALID';
    await this.db.asActor(job.actor_id, async (connection) => {
      const changed = await connection.query<{ id: string }>(
        `UPDATE ai_connections SET status = $3, checked_at = $4, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND credential_revision = $5 RETURNING id`,
        [job.payload.resourceId, job.actor_id, status, health.checkedAt, expectedRevision],
      );
      if (!changed[0]) fail(409, 'CREDENTIAL_CHANGED', 'A conexão de IA foi alterada durante a verificação.');
    });
    return { connection: { provider: 'ollama', status, checkedAt: health.checkedAt } };
  }

  private async connectionMetadata(actorId: string): Promise<ConnectionRow | undefined> {
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<ConnectionRow>(
        `SELECT id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at, credential_revision
         FROM ai_connections WHERE user_id = $1 AND provider = 'ollama'`, [actorId],
      ),
    );
    return rows[0];
  }

  private selectProvider(): AIProvider {
    const configured = process.env.AI_PROVIDER;
    if (configured === 'fake') {
      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        fail(503, 'PROVIDER_NOT_CONFIGURED', 'Nenhum serviço de IA está configurado.');
      }
      return this.fake;
    }
    if (configured === 'ollama-cloud') return this.cloud;
    fail(503, 'PROVIDER_NOT_CONFIGURED', 'Nenhum serviço de IA está configurado.');
  }

  private async withTransportRetries<T>(operation: (attempt: number) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation(attempt);
      } catch (error) {
        const code = this.publicErrorCode(error);
        if (attempt >= 3 || !['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE'].includes(code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  private async recordUsage(
    actorId: string,
    operationId: string,
    feature: string,
    model: string,
    result: GenerationResult | null,
    success: boolean,
    errorCode: string | null,
    latencyMs: number,
  ): Promise<void> {
    await this.db.asActor(actorId, async (connection) => {
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [operationId]);
      const attempts = await connection.query<{ attempt: number }>(
        `SELECT COALESCE(MAX(attempt), 0)::int + 1 AS attempt FROM ai_usage_events WHERE operation_id = $1`, [operationId],
      );
      await connection.query(
        `INSERT INTO ai_usage_events (operation_id, attempt, actor_id, payer_scope, provider, model, feature,
           input_tokens, output_tokens, token_source, estimated_cost, currency, price_version, latency_ms, success, error_code)
         VALUES ($1, $2, $3, 'BYOK', 'ollama', $4, $5, $6, $7, $8, NULL, NULL, NULL, $9, $10, $11)`,
        [operationId, attempts[0].attempt, actorId, model || null, feature, result?.inputTokens ?? null, result?.outputTokens ?? null,
          result?.inputTokens === undefined && result?.outputTokens === undefined ? 'UNKNOWN' : 'MEASURED', latencyMs, success, errorCode],
      );
    });
  }

  private toConnectionView(row: ConnectionRow): ConnectionView {
    return {
      provider: 'ollama',
      status: row.status,
      maskedKey: row.masked_suffix,
      checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
    };
  }

  private publicErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return 'PROVIDER_UNAVAILABLE';
  }
}
