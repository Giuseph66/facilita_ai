import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService, QueryConnection } from '../../core/database.service';
import { fail } from '../../core/errors';
import { JobView, IntelligenceJob, toJobView } from './job.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCKED_PAYLOAD_KEYS = new Set([
  'apikey', 'key', 'secret', 'ciphertext', 'authorization', 'documenttext', 'extractedtext',
  'answerkey', 'answers', 'prompttemplate', 'rawdocument', 'filebuffer', 'storagekey',
]);

@Injectable()
export class JobsService {
  constructor(private readonly db: DatabaseService) {}

  async create(
    actorId: string,
    workspaceId: string,
    feature: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<JobView> {
    return this.db.asActor(actorId, (connection) =>
      this.createInConnection(actorId, workspaceId, feature, payload, idempotencyKey, connection),
    );
  }

  async createInConnection(
    actorId: string,
    workspaceId: string,
    feature: string,
    payload: Record<string, unknown>,
    idempotencyKey: string | undefined,
    connection: QueryConnection,
  ): Promise<JobView> {
    this.assertUuid(actorId, 'actorId');
    this.assertUuid(workspaceId, 'workspaceId');
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(feature)) fail(400, 'VALIDATION_FAILED', 'Operação inválida.');
    if (idempotencyKey !== undefined && (!idempotencyKey.trim() || idempotencyKey.length > 160)) {
      fail(400, 'VALIDATION_FAILED', 'A chave de idempotência é inválida.');
    }
    this.assertPrivatePayload(payload);
    const serialized = this.stableJson(payload);
    if (Buffer.byteLength(serialized) > 8_192) fail(400, 'VALIDATION_FAILED', 'A configuração da operação excede o limite.');
    const payloadHash = createHash('sha256').update(serialized).digest('hex');
    const resourceType = typeof payload.resourceType === 'string' ? payload.resourceType : 'JOB';
    const resourceId = typeof payload.resourceId === 'string' && UUID.test(payload.resourceId) ? payload.resourceId : null;

    const membership = await connection.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM workspaces w
           LEFT JOIN workspace_memberships m ON m.workspace_id = w.id AND m.user_id = $1 AND m.status = 'ACTIVE'
           WHERE w.id = $2 AND (w.owner_user_id = $1 OR m.user_id = $1)
         ) AS allowed`,
        [actorId, workspaceId],
    );
    if (!membership[0]?.allowed) fail(404, 'RESOURCE_NOT_FOUND', 'O recurso solicitado não está disponível.');

    const inserted = await connection.query<IntelligenceJob>(
        `INSERT INTO jobs (workspace_id, actor_id, feature, resource_type, resource_id, payload, payload_hash, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (actor_id, feature, idempotency_key) DO NOTHING
         RETURNING id, workspace_id, actor_id, feature, state, stage, progress, resource_type, resource_id, payload, result, error_code, created_at`,
        [workspaceId, actorId, feature, resourceType, resourceId, serialized, payloadHash, idempotencyKey ?? null],
    );

    let job = inserted[0];
    if (!job && idempotencyKey) {
      const existing = await connection.query<IntelligenceJob & { payload_hash: string }>(
          `SELECT id, workspace_id, actor_id, feature, state, stage, progress, resource_type, resource_id, payload, result, error_code, created_at, payload_hash
           FROM jobs WHERE actor_id = $1 AND feature = $2 AND idempotency_key = $3`,
          [actorId, feature, idempotencyKey],
      );
      const row = existing[0];
      if (!row) fail(409, 'IDEMPOTENCY_CONFLICT', 'A operação concorrente precisa ser enviada novamente.');
      if (row.payload_hash !== payloadHash || row.workspace_id !== workspaceId) {
        fail(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada com outros dados.');
      }
      job = row;
    }

    if (!job) fail(500, 'JOB_CREATE_FAILED', 'Não foi possível iniciar o processamento.');
    if (inserted[0]) {
      await connection.query(
        `INSERT INTO outbox_events (workspace_id, actor_id, job_id, type, payload)
           VALUES ($3::uuid, $2::uuid, $1::uuid, 'INTELLIGENCE_JOB', jsonb_build_object('jobId', $1::text, 'actorId', $2::text, 'workspaceId', $3::text))`,
          [job.id, actorId, workspaceId],
      );
    }
    return toJobView(job);
  }

  async get(actorId: string, jobId: string): Promise<JobView> {
    this.assertUuid(jobId, 'jobId');
    return this.db.asActor(actorId, async (connection) => {
      const rows = await connection.query<IntelligenceJob>(
        `SELECT id, workspace_id, actor_id, feature, state, stage, progress, resource_type, resource_id, payload, result, error_code, created_at
         FROM jobs WHERE id = $1 AND actor_id = $2`,
        [jobId, actorId],
      );
      if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'O processamento solicitado não está disponível.');
      return toJobView(rows[0]);
    });
  }

  private assertPrivatePayload(value: unknown, depth = 0): void {
    if (depth > 8) fail(400, 'VALIDATION_FAILED', 'A configuração da operação é inválida.');
    if (Array.isArray(value)) {
      if (value.length > 200) fail(400, 'VALIDATION_FAILED', 'A configuração da operação excede o limite.');
      value.forEach((item) => this.assertPrivatePayload(item, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (BLOCKED_PAYLOAD_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())) {
        fail(400, 'VALIDATION_FAILED', 'A operação contém um campo privado inválido.');
      }
      this.assertPrivatePayload(child, depth + 1);
    }
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => `${JSON.stringify(key)}:${this.stableJson(child)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID.test(value)) fail(400, 'VALIDATION_FAILED', `Campo ${field} inválido.`);
  }
}
