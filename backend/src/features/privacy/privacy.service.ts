import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { DatabaseService, QueryConnection } from '../../core/database.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { StorageService } from '../../core/storage.service';
import { fail } from '../../core/errors';

export interface IntelligencePrivacyAccess {
  purgeUser(userId: string): Promise<void>;
  exportUser(userId: string): Promise<unknown>;
}

export const INTELLIGENCE_PRIVACY_SERVICE = 'INTELLIGENCE_PRIVACY_SERVICE';
const EXPORT_TTL_DAYS = 7;

type RequestRow = {
  id: string;
  type: 'EXPORT' | 'DELETE_ACCOUNT';
  state: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  requested_at: Date;
  completed_at: Date | null;
  error_code: string | null;
  expires_at: Date | null;
};

@Injectable()
export class PrivacyService {
  private processor?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    @Inject(INTELLIGENCE_PRIVACY_SERVICE) private readonly intelligence: IntelligencePrivacyAccess,
  ) {}

  async createRequest(userId: string, input: { type: 'EXPORT' | 'DELETE_ACCOUNT'; password: string; confirmation?: 'EXCLUIR' }, requestId?: string) {
    await this.rateLimit.enforce(`privacy.${input.type.toLowerCase()}`, userId, input.type === 'EXPORT' ? 5 : 2, 3600);
    const users = await this.db.query<{ id: string; password_hash: string; status: string }>(
      `SELECT id, password_hash, status FROM users WHERE id = $1`, [userId],
    );
    const user = users[0];
    if (!user || user.status !== 'ACTIVE' || !await argon2.verify(user.password_hash, input.password).catch(() => false)) {
      fail(403, 'REAUTHENTICATION_REQUIRED', 'Confirme sua senha para continuar.');
    }

    if (input.type === 'DELETE_ACCOUNT') {
      return this.requestDeletion(userId, requestId);
    }
    return this.requestExport(userId, requestId);
  }

  async list(userId: string) {
    return this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<RequestRow>(
        `SELECT id, type, state, requested_at, completed_at, error_code, expires_at
         FROM privacy_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 50`, [userId],
      );
      return { items: rows.map((row) => this.requestView(row)), nextCursor: null };
    });
  }

  async getExport(userId: string, requestId: string): Promise<Buffer> {
    this.assertUuid(requestId);
    const rows = await this.db.asActor(userId, (connection) => connection.query<{ result_storage_key: string | null }>(
      `SELECT result_storage_key FROM privacy_requests WHERE id = $1 AND user_id = $2
         AND type = 'EXPORT' AND state = 'COMPLETED' AND expires_at > now()`, [requestId, userId],
    ));
    const key = rows[0]?.result_storage_key;
    if (!key) fail(404, 'RESOURCE_NOT_FOUND', 'O arquivo de exportação não está disponível.');
    try {
      return await this.storage.get(key);
    } catch {
      fail(404, 'RESOURCE_NOT_FOUND', 'O arquivo de exportação não está disponível.');
    }
  }

  startProcessor(): void {
    if (this.processor) return;
    this.processor = setInterval(() => void this.runProcessor(), 2_000);
    this.processor.unref();
    void this.runProcessor();
  }

  stopProcessor(): void {
    if (this.processor) clearInterval(this.processor);
    this.processor = undefined;
  }

  private async requestDeletion(userId: string, requestId?: string) {
    const result = await this.db.asActor(userId, async (connection) => {
      const users = await connection.query<{ id: string; status: string }>(
        `SELECT id, status FROM users WHERE id = $1 FOR UPDATE`, [userId],
      );
      if (!users[0] || users[0].status !== 'ACTIVE') fail(409, 'ACCOUNT_DELETION_PENDING', 'A exclusão desta conta já foi solicitada.');
      const workspaces = await connection.query<{ id: string }>(
        `SELECT id FROM workspaces WHERE type = 'PERSONAL' AND owner_user_id = $1 LIMIT 1`, [userId],
      );
      const rows = await connection.query<{ id: string; requested_at: Date }>(
        `INSERT INTO privacy_requests (user_id, type, state)
         VALUES ($1, 'DELETE_ACCOUNT', 'PENDING') RETURNING id, requested_at`, [userId],
      );
      await connection.query(
        `INSERT INTO privacy_outbox (request_id, actor_id, workspace_id) VALUES ($1, $2, $3)`,
        [rows[0].id, userId, workspaces[0]?.id ?? null],
      );
      await connection.query(`UPDATE users SET status = 'DELETION_REQUESTED', updated_at = now() WHERE id = $1`, [userId]);
      await connection.query(`UPDATE sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1`, [userId]);
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id)
         VALUES ($1, 'ACCOUNT_DELETION_REQUESTED', 'privacy_request', $2, $3, $4)`,
        [userId, rows[0].id, workspaces[0]?.id ?? null, requestId ?? null],
      );
      return rows[0];
    });
    return {
      id: result.id,
      type: 'DELETE_ACCOUNT' as const,
      state: 'PENDING' as const,
      requestedAt: new Date(result.requested_at).toISOString(),
      accepted: true,
    };
  }

  private async requestExport(userId: string, requestId?: string) {
    const created = await this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<{ id: string; requested_at: Date; expires_at: Date }>(
        `INSERT INTO privacy_requests (user_id, type, state, expires_at)
         VALUES ($1, 'EXPORT', 'PROCESSING', now() + ($2 * interval '1 day')) RETURNING id, requested_at, expires_at`,
        [userId, EXPORT_TTL_DAYS],
      );
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, request_id)
         VALUES ($1, 'ACCOUNT_EXPORT_REQUESTED', 'privacy_request', $2, $3)`, [userId, rows[0].id, requestId ?? null],
      );
      return rows[0];
    });
    const storageKey = `private/privacy/${userId}/${created.id}/export.json`;
    try {
      const [account, intelligence] = await Promise.all([this.exportCore(userId), this.intelligence.exportUser(userId)]);
      const exportData = { schemaVersion: 1, generatedAt: new Date().toISOString(), account, intelligence };
      await this.storage.put(storageKey, Buffer.from(JSON.stringify(exportData, null, 2), 'utf8'));
      await this.db.asActor(userId, async (connection) => {
        const updated = await connection.query<{ expires_at: Date }>(
          `UPDATE privacy_requests SET state = 'COMPLETED', completed_at = now(), result_storage_key = $3
           WHERE id = $1 AND user_id = $2 RETURNING expires_at`, [created.id, userId, storageKey],
        );
        if (!updated[0]) throw new Error('Privacy export request disappeared');
        await connection.query(
          `INSERT INTO privacy_export_cleanup (request_id, actor_id, storage_key, expires_at)
           VALUES ($1, $2, $3, $4)`, [created.id, userId, storageKey, updated[0].expires_at],
        );
      });
    } catch {
      await this.storage.remove(storageKey).catch(() => undefined);
      await this.db.asActor(userId, (connection) => connection.query(
        `UPDATE privacy_requests SET state = 'FAILED', completed_at = now(), error_code = 'EXPORT_FAILED'
         WHERE id = $1 AND user_id = $2`, [created.id, userId],
      )).catch(() => undefined);
      fail(503, 'PRIVACY_EXPORT_FAILED', 'Não foi possível preparar a exportação agora. Tente novamente mais tarde.');
    }
    return {
      id: created.id,
      type: 'EXPORT' as const,
      state: 'COMPLETED' as const,
      requestedAt: new Date(created.requested_at).toISOString(),
      downloadUrl: `/api/v1/me/privacy-requests/${created.id}/export`,
      expiresAt: new Date(created.expires_at).toISOString(),
    };
  }

  private async exportCore(userId: string) {
    return this.db.asActor(userId, async (connection) => {
      const user = await connection.query<{ id: string; email_normalized: string; name: string; default_persona: string; created_at: Date }>(
        `SELECT id, email_normalized, name, default_persona, created_at FROM users WHERE id = $1`, [userId],
      );
      const workspaces = await connection.query<{ id: string; type: string; name: string; created_at: Date; roles: string[] }>(
        `SELECT w.id, w.type, w.name, w.created_at,
                COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
         FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN workspace_roles r ON r.workspace_id = w.id AND r.user_id = m.user_id
         WHERE m.user_id = $1 AND m.status = 'ACTIVE' GROUP BY w.id ORDER BY w.created_at`, [userId],
      );
      const courses = await connection.query<{ id: string; workspace_id: string; title: string; description: string; objectives: string[]; revision: number; created_at: Date; updated_at: Date }>(
        `SELECT id, workspace_id, title, description, objectives, revision, created_at, updated_at
         FROM courses WHERE owner_user_id = $1 OR EXISTS (
           SELECT 1 FROM classes c WHERE c.workspace_id = courses.workspace_id AND c.course_id = courses.id
             AND (c.teacher_user_id = $1 OR EXISTS (
               SELECT 1 FROM enrollments e WHERE e.class_id = c.id AND e.user_id = $1 AND e.status = 'ACTIVE'
             ))
         ) ORDER BY created_at`, [userId],
      );
      const courseIds = courses.map((row) => row.id);
      const topics = courseIds.length ? await connection.query<{ course_id: string; id: string; title: string; position: number }>(
        `SELECT course_id, id, title, position FROM course_topics WHERE course_id = ANY($1::uuid[]) AND publication_status = 'PUBLISHED' ORDER BY course_id, position`, [courseIds],
      ) : [];
      const classes = await connection.query<{
        id: string; workspace_id: string; course_id: string; name: string; period: string; created_at: Date; myrole: string; mystatus: string;
      }>(
        `SELECT c.id, c.workspace_id, c.course_id, c.name, c.period, c.created_at,
                CASE WHEN c.teacher_user_id = $1 THEN 'TEACHER' ELSE e.role END AS myRole,
                CASE WHEN c.teacher_user_id = $1 THEN 'ACTIVE' ELSE e.status END AS myStatus
         FROM classes c LEFT JOIN enrollments e ON e.class_id = c.id AND e.user_id = $1
         WHERE c.teacher_user_id = $1 OR (e.user_id = $1 AND e.status IN ('ACTIVE','LEFT','REVOKED'))
         ORDER BY c.created_at`, [userId],
      );
      const materials = await connection.query<{
        id: string; workspace_id: string; course_id: string; owner_user_id: string; title: string; kind: string; classification: string;
        revision: number; created_at: Date; updated_at: Date;
      }>(
        `SELECT id, workspace_id, course_id, owner_user_id, title, kind, classification, revision, created_at, updated_at
         FROM materials WHERE owner_user_id = $1 OR (classification = 'ACADEMIC' AND EXISTS (
           SELECT 1 FROM material_class_releases r JOIN enrollments e ON e.class_id = r.class_id
           WHERE r.material_id = materials.id AND r.released_at IS NOT NULL AND r.revoked_at IS NULL
             AND e.user_id = $1 AND e.status = 'ACTIVE'
         )) ORDER BY created_at`, [userId],
      );
      const subscription = await connection.query<{
        plan_code: string; plan_name: string; state: string; period_start: Date; period_end: Date;
      }>(
        `SELECT p.code AS plan_code, p.name AS plan_name, s.state, s.period_start, s.period_end
         FROM billing_accounts b JOIN subscriptions s ON s.account_id = b.id JOIN plans p ON p.id = s.plan_id
         WHERE b.owner_user_id = $1 ORDER BY s.period_start DESC LIMIT 1`, [userId],
      );
      const courseExports = courses.map((course) => ({
        id: course.id,
        workspaceId: course.workspace_id,
        title: course.title,
        description: course.description,
        objectives: Array.isArray(course.objectives) ? course.objectives : [],
        revision: Number(course.revision),
        createdAt: new Date(course.created_at).toISOString(),
        updatedAt: new Date(course.updated_at).toISOString(),
        topics: topics.filter((topic) => topic.course_id === course.id)
          .map(({ id, title, position }) => ({ id, title, position: Number(position) })),
      }));
      return {
        profile: user[0] ? {
          id: user[0].id,
          email: user[0].email_normalized,
          name: user[0].name,
          defaultPersona: user[0].default_persona,
          createdAt: new Date(user[0].created_at).toISOString(),
        } : null,
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id, type: workspace.type, name: workspace.name,
          createdAt: new Date(workspace.created_at).toISOString(), roles: workspace.roles,
        })),
        courses: courseExports,
        classes: classes.map((item) => ({
          id: item.id, workspaceId: item.workspace_id, courseId: item.course_id, name: item.name,
          period: item.period, createdAt: new Date(item.created_at).toISOString(), role: item.myrole, status: item.mystatus,
        })),
        materials: materials.map((item) => ({
          id: item.id, workspaceId: item.workspace_id, courseId: item.course_id, ownerUserId: item.owner_user_id,
          title: item.title, kind: item.kind, classification: item.classification, revision: Number(item.revision),
          createdAt: new Date(item.created_at).toISOString(), updatedAt: new Date(item.updated_at).toISOString(),
        })),
        subscription: subscription[0] ? {
          planCode: subscription[0].plan_code, planName: subscription[0].plan_name, state: subscription[0].state,
          periodStart: new Date(subscription[0].period_start).toISOString(), periodEnd: new Date(subscription[0].period_end).toISOString(),
        } : null,
        usage: await this.quotaUsage(connection, userId),
      };
    });
  }

  private async quotaUsage(connection: QueryConnection, userId: string) {
    const account = await connection.query<{ id: string }>(`SELECT id FROM billing_accounts WHERE owner_user_id = $1`, [userId]);
    if (!account[0]) return [];
    const rows = await connection.query<{ metric: string; period_start: Date; used: string; reserved: string }>(
      `SELECT metric, period_start, used::text AS used, reserved::text AS reserved
       FROM usage_counters WHERE account_id = $1 ORDER BY period_start, metric`, [account[0].id],
    );
    return rows.map((row) => ({ metric: row.metric, periodStart: new Date(row.period_start).toISOString(), used: row.used, reserved: row.reserved }));
  }

  private async runProcessor(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processOneDeletion();
      await this.processOneExpiredExport();
    } catch {
      // The outbox row remains retryable; raw database or storage errors are not logged.
    } finally {
      this.processing = false;
    }
  }

  private async processOneDeletion(): Promise<void> {
    const item = await this.db.transaction(async (connection) => {
      const rows = await connection.query<{ request_id: string; actor_id: string; attempts: number }>(
        `SELECT request_id, actor_id, attempts FROM privacy_outbox
         WHERE claimed_at IS NULL OR claimed_at < now() - make_interval(secs => LEAST(attempts::bigint * 30, 3600)::integer)
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      if (!rows[0]) return undefined;
      await connection.query(
        `UPDATE privacy_outbox SET claimed_at = now(), attempts = attempts + 1 WHERE request_id = $1`, [rows[0].request_id],
      );
      return { ...rows[0], attempts: Number(rows[0].attempts) + 1 };
    });
    if (!item) return;
    const existingUser = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [item.actor_id]);
    if (!existingUser[0]) {
      await this.db.query(`DELETE FROM privacy_outbox WHERE request_id = $1`, [item.request_id]);
      return;
    }

    try {
      await this.db.asActor(item.actor_id, async (connection) => {
        await connection.query(
          `UPDATE privacy_requests SET state = 'PROCESSING', error_code = NULL, completed_at = NULL
           WHERE id = $1 AND user_id = $2 AND type = 'DELETE_ACCOUNT'`, [item.request_id, item.actor_id],
        );
      });
      await this.removeUserExports(item.actor_id);
      await this.intelligence.purgeUser(item.actor_id);
      await this.db.asActor(item.actor_id, async (connection) => {
        await connection.query(
          `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id)
           VALUES ($1, 'ACCOUNT_DELETION_COMPLETED', 'privacy_request', $2, $3)`,
          [item.actor_id, item.request_id, null],
        );
        await connection.query(
          `UPDATE privacy_requests SET state = 'COMPLETED', completed_at = now(), error_code = NULL
           WHERE id = $1 AND user_id = $2 AND type = 'DELETE_ACCOUNT'`, [item.request_id, item.actor_id],
        );
        await connection.query(`DELETE FROM users WHERE id = $1 AND status = 'DELETION_REQUESTED'`, [item.actor_id]);
      });
      await this.db.query(`DELETE FROM privacy_outbox WHERE request_id = $1`, [item.request_id]);
    } catch {
      await this.db.asActor(item.actor_id, async (connection) => {
        await connection.query(
          `UPDATE privacy_requests SET state = 'FAILED', error_code = 'PURGE_RETRYING', completed_at = now()
           WHERE id = $1 AND user_id = $2 AND type = 'DELETE_ACCOUNT'`, [item.request_id, item.actor_id],
        );
      }).catch(() => undefined);
      await this.db.query(`UPDATE privacy_outbox SET claimed_at = now() WHERE request_id = $1`, [item.request_id]).catch(() => undefined);
    }
  }

  private async processOneExpiredExport(): Promise<void> {
    const item = await this.db.transaction(async (connection) => {
      const rows = await connection.query<{ request_id: string; actor_id: string; storage_key: string }>(
        `SELECT request_id, actor_id, storage_key FROM privacy_export_cleanup
         WHERE expires_at <= now()
           AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => LEAST(attempts::bigint * 30, 3600)::integer))
         ORDER BY expires_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      if (!rows[0]) return undefined;
      await connection.query(
        `UPDATE privacy_export_cleanup SET claimed_at = now(), attempts = attempts + 1 WHERE request_id = $1`, [rows[0].request_id],
      );
      return rows[0];
    });
    if (!item) return;
    try {
      await this.storage.remove(item.storage_key);
      await this.db.asActor(item.actor_id, (connection) => connection.query(
        `UPDATE privacy_requests SET result_storage_key = NULL
         WHERE id = $1 AND user_id = $2 AND type = 'EXPORT'`, [item.request_id, item.actor_id],
      )).catch(() => undefined);
      await this.db.query(`DELETE FROM privacy_export_cleanup WHERE request_id = $1`, [item.request_id]);
    } catch {
      await this.db.query(`UPDATE privacy_export_cleanup SET claimed_at = now() WHERE request_id = $1`, [item.request_id]).catch(() => undefined);
    }
  }

  private async removeUserExports(userId: string): Promise<void> {
    const rows = await this.db.query<{ request_id: string; storage_key: string }>(
      `SELECT request_id, storage_key FROM privacy_export_cleanup WHERE actor_id = $1`, [userId],
    );
    for (const row of rows) await this.storage.remove(row.storage_key);
    await this.db.asActor(userId, async (connection) => {
      for (const row of rows) {
        await connection.query(
          `UPDATE privacy_requests SET result_storage_key = NULL WHERE id = $1 AND user_id = $2 AND type = 'EXPORT'`,
          [row.request_id, userId],
        );
      }
    });
    await this.db.query(`DELETE FROM privacy_export_cleanup WHERE actor_id = $1`, [userId]);
  }

  private requestView(row: RequestRow) {
    return {
      id: row.id,
      type: row.type,
      state: row.state,
      requestedAt: new Date(row.requested_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      errorCode: row.error_code,
      ...(row.type === 'EXPORT' && row.state === 'COMPLETED' && row.expires_at && row.expires_at > new Date()
        ? { downloadUrl: `/api/v1/me/privacy-requests/${row.id}/export`, expiresAt: new Date(row.expires_at).toISOString() }
        : {}),
    };
  }

  private assertUuid(value: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      fail(400, 'VALIDATION_FAILED', 'Identificador inválido.');
    }
  }
}
