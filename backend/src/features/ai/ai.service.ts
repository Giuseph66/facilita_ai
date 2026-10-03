import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../core/database.service';
import { QuotaService } from '../../core/quota.service';
import { fail } from '../../core/errors';
import { CredentialsVaultService } from './credentials-vault.service';
import { FakeAIProvider } from './fake-ai.provider';
import { AIProvider, GenerationInput, GenerationResult, KeyUsage, ModelDescriptor, ProviderContext, ResolvedAIProvider, UsageWindow } from './ai.provider';
import { OllamaCloudProvider } from './ollama-cloud.provider';
import { JobHandlerRegistry } from './job-handler.registry';
import { JobsService } from './jobs.service';
import { IntelligenceJob } from './job.types';

const MAX_KEYS = 25;
/** A key the provider refused for quota is skipped for this long before it is tried again. */
const EXHAUSTED_RETRY_MS = 15 * 60_000;
const USAGE_REFRESH_TIMEOUT_MS = 4_000;
const CONNECTION_COLUMNS = `id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at,
  credential_revision, label, position, usage_snapshot, usage_checked_at, last_used_at, exhausted_at, created_at`;

type ConnectionStatus = 'UNVERIFIED' | 'CONNECTED' | 'INVALID';

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: 'ollama';
  ciphertext: Buffer;
  nonce: Buffer;
  auth_tag: Buffer;
  key_version: string;
  masked_suffix: string;
  status: ConnectionStatus;
  checked_at: Date | null;
  credential_revision: number;
  label: string | null;
  position: number;
  usage_snapshot: { windows?: UsageWindow[] } | null;
  usage_checked_at: Date | null;
  last_used_at: Date | null;
  exhausted_at: Date | null;
  created_at: Date;
}

export interface ConnectionView {
  id: string;
  provider: 'ollama';
  label: string | null;
  position: number;
  status: ConnectionStatus;
  maskedKey: string;
  checkedAt: string | null;
  /** Remaining share per provider window, as percentages, from the last /api/usage reading. */
  usage: { windows: Array<{ name: string; usedPercent: number; remainingPercent: number }>; checkedAt: string } | null;
  lastUsedAt: string | null;
  exhausted: boolean;
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

  async listConnections(actorId: string): Promise<{ items: ConnectionView[] }> {
    const rows = await this.connectionRows(actorId);
    return { items: rows.map((row) => this.toConnectionView(row)) };
  }

  /** First key in use order; kept for clients that only know about one key. */
  async getConnection(actorId: string): Promise<{ connection: ConnectionView | null }> {
    const rows = await this.connectionRows(actorId);
    return { connection: rows[0] ? this.toConnectionView(rows[0]) : null };
  }

  async addConnection(actorId: string, apiKey: string, label?: string): Promise<{ connection: ConnectionView }> {
    this.assertApiKey(apiKey);
    return this.db.asActor(actorId, async (connection) => {
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ai-keys:${actorId}`]);
      const counts = await connection.query<{ total: number; next: number }>(
        `SELECT count(*)::int AS total, COALESCE(MAX(position) + 1, 0)::int AS next FROM ai_connections WHERE user_id = $1`, [actorId],
      );
      if (counts[0].total >= MAX_KEYS) fail(409, 'AI_KEYS_LIMIT', `Você pode guardar até ${MAX_KEYS} chaves.`);
      const connectionId = randomUUID();
      const encrypted = this.vault.encrypt(actorId, connectionId, 'ollama', apiKey);
      const rows = await connection.query<ConnectionRow>(
        `INSERT INTO ai_connections (id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, label, position)
         VALUES ($1,$2,'ollama',$3,$4,$5,$6,$7,'UNVERIFIED',$8,$9)
         RETURNING ${CONNECTION_COLUMNS}`,
        [connectionId, actorId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.keyVersion, encrypted.maskedSuffix,
          this.cleanLabel(label), counts[0].next],
      );
      return { connection: this.toConnectionView(rows[0]) };
    });
  }

  /** Legacy single-key save: replaces the first key, or adds one when there is none. */
  async saveConnection(actorId: string, apiKey: string): Promise<{ connection: ConnectionView }> {
    this.assertApiKey(apiKey);
    const first = (await this.connectionRows(actorId))[0];
    if (!first) return this.addConnection(actorId, apiKey);
    return this.db.asActor(actorId, async (connection) => {
      const encrypted = this.vault.encrypt(actorId, first.id, 'ollama', apiKey);
      const rows = await connection.query<ConnectionRow>(
        `UPDATE ai_connections SET ciphertext = $3, nonce = $4, auth_tag = $5, key_version = $6, masked_suffix = $7,
           status = 'UNVERIFIED', checked_at = NULL, usage_snapshot = NULL, usage_checked_at = NULL, exhausted_at = NULL,
           credential_revision = credential_revision + 1, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING ${CONNECTION_COLUMNS}`,
        [first.id, actorId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.keyVersion, encrypted.maskedSuffix],
      );
      return { connection: this.toConnectionView(rows[0]) };
    });
  }

  async updateConnection(actorId: string, connectionId: string, input: { label?: string | null; position?: number }): Promise<{ items: ConnectionView[] }> {
    await this.db.asActor(actorId, async (connection) => {
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ai-keys:${actorId}`]);
      const rows = await connection.query<{ id: string }>(
        `SELECT id FROM ai_connections WHERE user_id = $1 ORDER BY position, created_at`, [actorId],
      );
      const index = rows.findIndex((row) => row.id === connectionId);
      if (index < 0) fail(404, 'RESOURCE_NOT_FOUND', 'A chave solicitada não está disponível.');
      if (input.label !== undefined) {
        await connection.query(`UPDATE ai_connections SET label = $3, updated_at = now() WHERE id = $1 AND user_id = $2`,
          [connectionId, actorId, input.label === null ? null : this.cleanLabel(input.label)]);
      }
      if (input.position !== undefined) {
        const ordered = rows.map((row) => row.id);
        ordered.splice(index, 1);
        ordered.splice(Math.min(Math.max(0, input.position), ordered.length), 0, connectionId);
        await connection.query(
          `UPDATE ai_connections c SET position = o.position - 1, updated_at = now()
           FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, position)
           WHERE c.id = o.id AND c.user_id = $1`,
          [actorId, ordered],
        );
      }
    });
    return this.listConnections(actorId);
  }

  async removeConnection(actorId: string, connectionId?: string): Promise<void> {
    const targetId = connectionId ?? (await this.connectionRows(actorId))[0]?.id;
    if (!targetId) fail(404, 'RESOURCE_NOT_FOUND', 'A conexão solicitada não está disponível.');
    await this.db.asActor(actorId, async (connection) => {
      const removed = await connection.query<{ id: string }>(
        `DELETE FROM ai_connections WHERE id = $1 AND user_id = $2 RETURNING id`, [targetId, actorId],
      );
      if (!removed[0]) fail(404, 'RESOURCE_NOT_FOUND', 'A conexão solicitada não está disponível.');
    });
  }

  async queueConnectionCheck(actorId: string, workspaceId: string, idempotencyKey?: string, connectionId?: string): Promise<unknown> {
    const rows = await this.connectionRows(actorId);
    const row = connectionId ? rows.find((candidate) => candidate.id === connectionId) : rows[0];
    if (!row) fail(404, 'RESOURCE_NOT_FOUND', 'Configure a conexão antes de verificá-la.');
    return this.jobs.create(actorId, workspaceId, 'AI_CONNECTION_CHECK', {
      resourceType: 'AI_CONNECTION', resourceId: row.id, credentialRevision: row.credential_revision,
    }, idempotencyKey);
  }

  /** Reads the key's current usage from the provider and stores it. */
  async refreshUsage(actorId: string, connectionId: string): Promise<{ connection: ConnectionView }> {
    const row = (await this.connectionRows(actorId)).find((candidate) => candidate.id === connectionId);
    if (!row) fail(404, 'RESOURCE_NOT_FOUND', 'A chave solicitada não está disponível.');
    const provider = this.selectProvider();
    try {
      await this.storeUsage(row, await provider.getUsage(this.contextFor(row, provider)));
    } catch (error) {
      if (this.publicErrorCode(error) === 'PROVIDER_AUTH_FAILED') await this.markInvalid(row);
      throw error;
    }
    const updated = (await this.connectionRows(actorId)).find((candidate) => candidate.id === connectionId)!;
    return { connection: this.toConnectionView(updated) };
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
      connection.query<{ provider: string }>(`SELECT provider FROM ai_connections WHERE user_id = $1 AND provider = 'ollama' LIMIT 1`, [actorId]),
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

  /** Provider and first usable key, for reads such as listing models. */
  async resolve(actorId: string): Promise<ResolvedAIProvider> {
    const { provider, model, candidates } = await this.candidates(actorId);
    return { provider, context: candidates[0], model };
  }

  /**
   * Kept for job creators that pin a credential revision. With several keys, any usable key may serve the job,
   * so this only confirms that one exists.
   */
  async credentialRevision(actorId: string): Promise<number> {
    if (process.env.AI_PROVIDER === 'fake' && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) return 0;
    const rows = await this.connectionRows(actorId);
    if (!rows.some((row) => row.status !== 'INVALID')) fail(403, 'PROVIDER_NOT_CONFIGURED', 'Configure uma conexão de IA antes de continuar.');
    return 1;
  }

  async generate(
    actorId: string,
    operationId: string,
    feature: string,
    input: GenerationInput,
    _expectedCredentialRevision?: number,
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
      const { provider, model: preferred, candidates, rows } = await this.candidates(actorId);
      model = input.model || preferred || (provider === this.fake ? 'fake-e5-chat' : '');
      if (!model) fail(422, 'MODEL_UNSUPPORTED', 'Escolha um modelo de IA antes de continuar.');
      let lastError: unknown;
      for (const [index, context] of candidates.entries()) {
        const row = rows[index];
        const isLast = index === candidates.length - 1;
        try {
          const result = await this.withTransportRetries(async () => {
            const started = Date.now();
            try {
              const response = await provider.chat({ ...input, model }, context);
              await this.recordUsage(actorId, operationId, feature, model, response, true, null, Date.now() - started).catch(() => undefined);
              return response;
            } catch (error) {
              await this.recordUsage(actorId, operationId, feature, model, null, false, this.publicErrorCode(error), Date.now() - started).catch(() => undefined);
              throw error;
            }
          }, isLast ? undefined : ['PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE']);
          if (row) await this.afterUse(row, provider);
          try {
            await this.quota.commit(actorId, generationMetric, operationId);
          } catch {
            fail(503, 'QUOTA_COMMIT_FAILED', 'Não foi possível registrar o consumo desta geração.');
          }
          return result;
        } catch (error) {
          lastError = error;
          const code = this.publicErrorCode(error);
          // Rotation: a refused or exhausted key hands over to the next one in the person's order.
          if (row && code === 'PROVIDER_AUTH_FAILED') { await this.markInvalid(row); continue; }
          if (row && code === 'PROVIDER_RATE_LIMITED') { await this.markExhausted(row, provider); continue; }
          throw error;
        }
      }
      if (lastError) throw lastError;
      fail(503, 'PROVIDER_NOT_CONFIGURED', 'Configure uma conexão de IA antes de continuar.');
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
    const row = (await this.connectionRows(job.actor_id)).find((candidate) => candidate.id === job.payload.resourceId);
    if (!row || row.credential_revision !== expectedRevision) fail(409, 'CREDENTIAL_CHANGED', 'A conexão de IA foi alterada durante a verificação.');
    const provider = this.selectProvider();
    const context = this.contextFor(row, provider);
    const health = await provider.healthCheck(context);
    const status = health.status === 'CONNECTED' ? 'CONNECTED' : 'INVALID';
    await this.db.asActor(job.actor_id, async (connection) => {
      const changed = await connection.query<{ id: string }>(
        `UPDATE ai_connections SET status = $3, checked_at = $4, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND credential_revision = $5 RETURNING id`,
        [row.id, job.actor_id, status, health.checkedAt, expectedRevision],
      );
      if (!changed[0]) fail(409, 'CREDENTIAL_CHANGED', 'A conexão de IA foi alterada durante a verificação.');
    });
    if (status === 'CONNECTED') await this.storeUsage(row, await this.readUsage(provider, context));
    return { connection: { id: row.id, provider: 'ollama', status, checkedAt: health.checkedAt } };
  }

  /** The person's keys in the order they are tried. */
  private async connectionRows(actorId: string): Promise<ConnectionRow[]> {
    return this.db.asActor(actorId, (connection) =>
      connection.query<ConnectionRow>(
        `SELECT ${CONNECTION_COLUMNS} FROM ai_connections WHERE user_id = $1 AND provider = 'ollama' ORDER BY position, created_at`, [actorId],
      ),
    );
  }

  /** Keys to try, in order, skipping refused keys and keys recently out of quota. */
  private async candidates(actorId: string): Promise<{ provider: AIProvider; model: string; candidates: ProviderContext[]; rows: ConnectionRow[] }> {
    const modeRows = await this.db.asActor(actorId, (connection) =>
      connection.query<{ mode: 'BYOK' | 'PLATFORM'; preferred_model: string | null }>(
        `SELECT mode, preferred_model FROM ai_preferences WHERE user_id = $1`, [actorId],
      ),
    );
    const mode = modeRows[0]?.mode ?? 'BYOK';
    if (mode !== 'BYOK') fail(503, 'PROVIDER_NOT_CONFIGURED', 'A IA da plataforma não está disponível.');
    const provider = this.selectProvider();
    const model = modeRows[0]?.preferred_model ?? '';
    if (provider === this.fake) {
      return { provider, model, rows: [], candidates: [{ actorId, payerScope: 'BYOK', provider: 'ollama', apiKey: '', credentialRevision: 0 }] };
    }
    const all = await this.connectionRows(actorId);
    if (!all.length) fail(503, 'PROVIDER_NOT_CONFIGURED', 'Configure uma conexão de IA antes de continuar.');
    const valid = all.filter((row) => row.status !== 'INVALID');
    if (!valid.length) fail(403, 'PROVIDER_AUTH_FAILED', 'Nenhuma das suas chaves de IA foi aceita. Confira as chaves em Configurações.');
    const rows = valid.filter((row) => !this.isExhausted(row));
    if (!rows.length) fail(429, 'AI_KEYS_EXHAUSTED', 'Todas as suas chaves de IA atingiram o limite de uso.');
    return { provider, model, rows, candidates: rows.map((row) => this.contextFor(row, provider)) };
  }

  private contextFor(row: ConnectionRow, provider: AIProvider): ProviderContext {
    return {
      actorId: row.user_id,
      payerScope: 'BYOK',
      provider: 'ollama',
      apiKey: provider === this.fake ? '' : this.vault.decrypt(row.user_id, row.id, row.provider, row),
      credentialRevision: row.credential_revision,
    };
  }

  private isExhausted(row: ConnectionRow): boolean {
    const recent = (date: Date | null) => date !== null && Date.now() - new Date(date).getTime() < EXHAUSTED_RETRY_MS;
    if (recent(row.exhausted_at)) return true;
    return recent(row.usage_checked_at) && (row.usage_snapshot?.windows ?? []).some((window) => window.used >= 1);
  }

  private async readUsage(provider: AIProvider, context: ProviderContext): Promise<KeyUsage | null> {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), USAGE_REFRESH_TIMEOUT_MS).unref());
    return Promise.race([provider.getUsage(context).catch(() => null), timeout]);
  }

  private async storeUsage(row: ConnectionRow, usage: KeyUsage | null): Promise<void> {
    if (!usage) return;
    const exhausted = usage.windows.some((window) => window.used >= 1);
    await this.db.asActor(row.user_id, (connection) => connection.query(
      `UPDATE ai_connections SET usage_snapshot = $3::jsonb, usage_checked_at = $4,
         exhausted_at = CASE WHEN $5 THEN COALESCE(exhausted_at, now()) ELSE NULL END
       WHERE id = $1 AND user_id = $2`,
      [row.id, row.user_id, JSON.stringify({ windows: usage.windows }), usage.checkedAt, exhausted],
    ));
  }

  /** Every use refreshes the key's usage so the remaining share stays current. */
  private async afterUse(row: ConnectionRow, provider: AIProvider): Promise<void> {
    await this.db.asActor(row.user_id, (connection) => connection.query(
      `UPDATE ai_connections SET last_used_at = now() WHERE id = $1 AND user_id = $2`, [row.id, row.user_id],
    )).catch(() => undefined);
    await this.storeUsage(row, await this.readUsage(provider, this.contextFor(row, provider))).catch(() => undefined);
  }

  private async markInvalid(row: ConnectionRow): Promise<void> {
    await this.db.asActor(row.user_id, (connection) => connection.query(
      `UPDATE ai_connections SET status = 'INVALID', checked_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`, [row.id, row.user_id],
    )).catch(() => undefined);
  }

  private async markExhausted(row: ConnectionRow, provider: AIProvider): Promise<void> {
    await this.db.asActor(row.user_id, (connection) => connection.query(
      `UPDATE ai_connections SET exhausted_at = now() WHERE id = $1 AND user_id = $2`, [row.id, row.user_id],
    )).catch(() => undefined);
    await this.storeUsage(row, await this.readUsage(provider, this.contextFor(row, provider))).catch(() => undefined);
  }

  private assertApiKey(apiKey: string): void {
    if (typeof apiKey !== 'string' || apiKey.trim().length < 16 || apiKey.length > 1024 || /[\r\n]/.test(apiKey)) {
      fail(400, 'VALIDATION_FAILED', 'A chave informada é inválida.');
    }
  }

  private cleanLabel(label?: string | null): string | null {
    const value = label?.trim().replace(/\s+/g, ' ');
    return value ? value.slice(0, 60) : null;
  }

  private selectProvider(): AIProvider {
    const configured = process.env.AI_PROVIDER;
    if (configured === 'fake') {
      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        fail(503, 'PROVIDER_NOT_CONFIGURED', 'Nenhum serviço de IA está configurado.');
      }
      return this.fake;
    }
    // `ollama` is the documented value (.env.example, OPERATIONS.md); `ollama-cloud` is kept for existing setups.
    if (configured === 'ollama' || configured === 'ollama-cloud') return this.cloud;
    fail(503, 'PROVIDER_NOT_CONFIGURED', 'Nenhum serviço de IA está configurado.');
  }

  private async withTransportRetries<T>(
    operation: (attempt: number) => Promise<T>,
    retryable: string[] = ['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE'],
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation(attempt);
      } catch (error) {
        const code = this.publicErrorCode(error);
        if (attempt >= 3 || !retryable.includes(code)) throw error;
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
    const windows = row.usage_snapshot?.windows ?? [];
    return {
      id: row.id,
      provider: 'ollama',
      label: row.label,
      position: row.position,
      status: row.status,
      maskedKey: row.masked_suffix,
      checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
      usage: windows.length && row.usage_checked_at ? {
        windows: windows.map((window) => {
          const usedPercent = Math.round(window.used * 1000) / 10;
          return { name: window.name, usedPercent, remainingPercent: Math.round((100 - usedPercent) * 10) / 10 };
        }),
        checkedAt: new Date(row.usage_checked_at).toISOString(),
      } : null,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      exhausted: this.isExhausted(row),
    };
  }

  private publicErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return 'PROVIDER_UNAVAILABLE';
  }
}
