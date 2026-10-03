import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService, QueryConnection } from '../../core/database.service';
import { fail } from '../../core/errors';
import { QuotaService } from '../../core/quota.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { StorageService } from '../../core/storage.service';
import { JobHandlerRegistry } from '../ai/job-handler.registry';
import { IntelligenceJob, JobView, toJobView } from '../ai/job.types';
import { JobsService } from '../ai/jobs.service';
import { ExportInput } from './export.dto';
import { ExportQuestion, ExportRenderer, ExportSnapshot, renderExportHtml } from './export-renderer';

type AssessmentMeta = { id: string; workspace_id: string; title: string; course_title: string; kind: string; state: string; revision: number };
type ExportRow = {
  id: string; workspace_id: string; actor_id: string; assessment_id: string; assessment_revision: number;
  format: 'PDF' | 'PRINT'; variant: 'QUESTIONS' | 'ANSWER_KEY'; storage_key: string | null;
  expires_at: Date; status: string; job_id: string;
};

@Injectable()
export class ExportsService implements OnModuleInit {
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleanupWork?: Promise<void>;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly handlers: JobHandlerRegistry,
    private readonly renderer: ExportRenderer,
    private readonly quota: QuotaService,
    private readonly rateLimits: RateLimitService,
  ) {}

  onModuleInit(): void { this.handlers.register('ASSESSMENT_EXPORT', job => this.process(job)); }

  async create(actorId: string, assessmentId: string, input: ExportInput, idempotencyKey?: string): Promise<JobView> {
    this.uuid(assessmentId);
    await this.db.asActor(actorId, connection => this.assessment(connection, actorId, assessmentId, input.revision));
    await this.quota.require(actorId, 'PDF_EXPORT');
    await this.rateLimits.enforce('assessment-export', actorId, 20, 60);
    return this.db.asActor(actorId, async connection => {
      const assessment = await this.assessment(connection, actorId, assessmentId, input.revision);
      if (idempotencyKey) {
        await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`export:${actorId}:${idempotencyKey}`]);
        const existing = await connection.query<IntelligenceJob>(
          `SELECT * FROM jobs WHERE actor_id=$1 AND feature='ASSESSMENT_EXPORT' AND idempotency_key=$2`, [actorId, idempotencyKey],
        );
        if (existing[0]) {
          const payload = existing[0].payload;
          if (payload.resourceId !== assessmentId || payload.assessmentRevision !== input.revision || payload.format !== input.format || payload.variant !== input.variant) {
            fail(409, 'IDEMPOTENCY_CONFLICT', 'A chave já foi usada para outra exportação.');
          }
          return toJobView(existing[0]);
        }
      }
      const exportId = randomUUID();
      const job = await this.jobs.createInConnection(actorId, assessment.workspace_id, 'ASSESSMENT_EXPORT', {
        resourceType: 'ASSESSMENT', resourceId: assessmentId, exportId,
        assessmentRevision: input.revision, format: input.format, variant: input.variant,
      }, idempotencyKey, connection);
      await connection.query(
        `INSERT INTO exports(id,workspace_id,actor_id,assessment_id,assessment_revision,format,variant,expires_at,job_id,storage_key)
         VALUES($1,$2,$3,$4,$5,$6,$7,now()+($8::integer*interval '1 second'),$9,$10)`,
        [exportId, assessment.workspace_id, actorId, assessmentId, input.revision, input.format, input.variant, this.ttlSeconds(), job.id,
          this.fileKey(actorId, exportId, input.variant, input.format)],
      );
      await connection.query(
        `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,workspace_id,job_id,metadata)
         VALUES($1,'ASSESSMENT_EXPORT_REQUESTED','ASSESSMENT',$2,$3,$4,$5::jsonb)`,
        [actorId, assessmentId, assessment.workspace_id, job.id, JSON.stringify({ format: input.format, variant: input.variant, revision: input.revision })],
      );
      return job;
    });
  }

  async get(actorId: string, exportId: string) {
    this.uuid(exportId);
    return this.db.asActor(actorId, async connection => {
      const row = await this.loadExport(connection, actorId, exportId);
      await this.assessment(connection, actorId, row.assessment_id);
      return { export: {
        id: row.id, assessmentId: row.assessment_id, revision: row.assessment_revision,
        format: row.format, variant: row.variant,
        status: row.expires_at <= new Date() ? 'EXPIRED' : row.status,
        expiresAt: row.expires_at.toISOString(), jobId: row.job_id,
        ...(row.status === 'READY' && row.expires_at > new Date() ? { downloadUrl: `/api/v1/exports/${row.id}/content` } : {}),
      } };
    });
  }

  async download(actorId: string, exportId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    this.uuid(exportId);
    return this.db.asActor(actorId, async connection => {
      const row = await this.loadExport(connection, actorId, exportId);
      const assessment = await this.assessment(connection, actorId, row.assessment_id);
      if (row.expires_at <= new Date() || row.status === 'EXPIRED') fail(410, 'EXPORT_EXPIRED', 'Esta exportação expirou. Gere um novo arquivo.');
      if (row.status !== 'READY' || !row.storage_key) fail(409, 'EXPORT_NOT_READY', 'A exportação ainda não está disponível.');
      const buffer = await this.storage.get(row.storage_key).catch(() => fail(503, 'EXPORT_UNAVAILABLE', 'O arquivo precisa ser gerado novamente.'));
      await this.assessment(connection, actorId, row.assessment_id);
      const base = assessment.title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').slice(0, 100).trim() || 'avaliacao';
      return { buffer, mimeType: row.format === 'PDF' ? 'application/pdf' : 'text/html; charset=utf-8', filename: `${base}${row.variant === 'ANSWER_KEY' ? '-gabarito' : '-questoes'}.${row.format === 'PDF' ? 'pdf' : 'html'}` };
    });
  }

  startCleanup(): void {
    if (this.cleanupTimer) return;
    const run = () => {
      if (this.cleanupWork) return;
      this.cleanupWork = this.cleanupExpired().catch(() => undefined).finally(() => { this.cleanupWork = undefined; });
    };
    run();
    this.cleanupTimer = setInterval(run, 60000);
    this.cleanupTimer.unref();
  }

  async stopCleanup(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    await this.cleanupWork;
  }

  async cleanupExpired(): Promise<void> {
    const actors = await this.db.query<{ actor_id: string }>('SELECT actor_id FROM public.expired_export_actors()');
    for (const actor of actors) await this.db.asActor(actor.actor_id, async connection => {
      const expired = await connection.query<ExportRow>(
        `SELECT * FROM exports WHERE actor_id=$1 AND expires_at<=now() AND status<>'EXPIRED' ORDER BY expires_at LIMIT 100 FOR UPDATE`, [actor.actor_id],
      );
      for (const row of expired) {
        if (row.storage_key) await this.storage.remove(row.storage_key);
        await connection.query("UPDATE exports SET status='EXPIRED',storage_key=NULL WHERE id=$1", [row.id]);
      }
    });
  }

  private async process(job: IntelligenceJob): Promise<Record<string, unknown>> {
    const exportId = String(job.payload.exportId || '');
    this.uuid(exportId);
    let storageKey: string | undefined;
    let newlyWritten = false;
    try {
      const { row, snapshot } = await this.db.asActor(job.actor_id, async connection => {
        const row = await this.loadExport(connection, job.actor_id, exportId);
        if (row.job_id !== job.id || row.workspace_id !== job.workspace_id) fail(404, 'RESOURCE_NOT_FOUND', 'Exportação indisponível.');
        if (row.expires_at <= new Date()) fail(410, 'EXPORT_EXPIRED', 'O prazo da exportação terminou.');
        const assessment = await this.assessment(connection, job.actor_id, row.assessment_id, row.assessment_revision);
        const questions = await connection.query<{
          id: string; position: number; type: string; statement: string; points: string; options: unknown;
          correct_option_id: string | null; expected_answer: string | null; rubric: unknown;
        }>(
          `SELECT q.id,q.position,q.type,q.statement,q.points,q.options,a.correct_option_id,a.expected_answer,a.rubric
           FROM assessment_questions q LEFT JOIN assessment_answers a ON a.workspace_id=q.workspace_id AND a.question_id=q.id AND $3::text='ANSWER_KEY'
           WHERE q.workspace_id=$1 AND q.assessment_id=$2 ORDER BY q.position LIMIT 101`, [row.workspace_id, row.assessment_id, row.variant],
        );
        if (!questions.length || questions.length > 100) fail(409, 'EXPORT_INVALID_ASSESSMENT', 'Revise as questões antes de exportar.');
        const mapped: ExportQuestion[] = questions.map(question => ({
          id: question.id, position: question.position, type: question.type, statement: question.statement, points: question.points,
          options: this.options(question.options),
          ...(row.variant === 'ANSWER_KEY' ? { answer: { correctOptionId: question.correct_option_id, expectedAnswer: question.expected_answer, rubric: question.rubric } } : {}),
        }));
        return { row, snapshot: { title: assessment.title, courseTitle: assessment.course_title, revision: assessment.revision, kind: assessment.kind, variant: row.variant, questions: mapped } satisfies ExportSnapshot };
      });
      if (row.status === 'READY' && row.storage_key) {
        const previous = await this.storage.get(row.storage_key).catch(() => null);
        if (previous && this.validBuffer(previous, row.format)) {
          await this.db.asActor(job.actor_id, connection => this.assessment(connection, job.actor_id, row.assessment_id, row.assessment_revision));
          return { exportId };
        }
      }
      await this.quota.require(job.actor_id, 'PDF_EXPORT');
      storageKey = this.fileKey(job.actor_id, exportId, row.variant, row.format);
      const html = renderExportHtml(snapshot);
      const buffer = row.format === 'PDF' ? await this.renderer.pdf(html) : Buffer.from(html, 'utf8');
      try { await this.storage.put(storageKey, buffer); newlyWritten = true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await this.storage.get(storageKey);
        const valid = row.format === 'PDF' ? this.validBuffer(existing, 'PDF') : existing.equals(buffer);
        if (!valid) fail(503, 'EXPORT_STORAGE_CONFLICT', 'O arquivo anterior precisa ser removido antes de gerar novamente.');
      }
      await this.db.asActor(job.actor_id, async connection => {
        await this.assessment(connection, job.actor_id, row.assessment_id, row.assessment_revision);
        const current = await this.loadExport(connection, job.actor_id, exportId);
        if (current.expires_at <= new Date() || current.status === 'EXPIRED') fail(410, 'EXPORT_EXPIRED', 'O prazo da exportação terminou.');
        await connection.query("UPDATE exports SET storage_key=$2,status='READY' WHERE id=$1", [exportId, storageKey]);
        await connection.query(
          `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,workspace_id,job_id,metadata)
           SELECT $1,'ASSESSMENT_EXPORTED','ASSESSMENT',$2,$3,$4,$5::jsonb
           WHERE NOT EXISTS(SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='ASSESSMENT_EXPORTED' AND job_id=$4)`,
          [job.actor_id, row.assessment_id, row.workspace_id, job.id, JSON.stringify({ format: row.format, variant: row.variant, revision: row.assessment_revision })],
        );
      });
      return { exportId };
    } catch (error) {
      const ready = await this.db.asActor(job.actor_id, connection => connection.query<{ status: string }>('SELECT status FROM exports WHERE id=$1 AND actor_id=$2', [exportId, job.actor_id])).catch(() => []);
      if (newlyWritten && storageKey && ready[0]?.status !== 'READY') await this.storage.remove(storageKey).catch(() => undefined);
      await this.db.asActor(job.actor_id, connection => connection.query("UPDATE exports SET status='FAILED' WHERE id=$1 AND status NOT IN ('READY','EXPIRED')", [exportId])).catch(() => undefined);
      throw error;
    }
  }

  private async assessment(connection: QueryConnection, actorId: string, id: string, revision?: number): Promise<AssessmentMeta> {
    const rows = await connection.query<AssessmentMeta>(
      `SELECT a.id,a.workspace_id,a.title,a.kind,a.state,a.revision,c.title AS course_title
       FROM assessments a JOIN courses c ON c.workspace_id=a.workspace_id AND c.id=a.course_id
       JOIN workspace_memberships m ON m.workspace_id=a.workspace_id AND m.user_id=$2 AND m.status='ACTIVE'
       JOIN workspace_roles r ON r.workspace_id=a.workspace_id AND r.user_id=$2 AND r.role='TEACHER'
       JOIN users u ON u.id=$2 AND u.status='ACTIVE'
       WHERE a.id=$1 AND a.author_user_id=$2 FOR SHARE OF a,u`, [id, actorId],
    );
    const row = rows[0];
    if (!row) fail(404, 'RESOURCE_NOT_FOUND', 'A avaliação solicitada não está disponível.');
    if (revision !== undefined && row.revision !== revision) fail(409, 'REVISION_CONFLICT', 'A avaliação mudou. Recarregue antes de exportar.');
    if (!['READY', 'PUBLISHED'].includes(row.state)) fail(409, 'INVALID_STATE', 'Revise e finalize a avaliação antes de exportar.');
    return row;
  }

  private async loadExport(connection: QueryConnection, actorId: string, id: string): Promise<ExportRow> {
    const rows = await connection.query<ExportRow>('SELECT * FROM exports WHERE id=$1 AND actor_id=$2', [id, actorId]);
    if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'A exportação solicitada não está disponível.');
    return rows[0];
  }

  private options(value: unknown): { id: string; text: string }[] {
    if (!Array.isArray(value)) fail(409, 'EXPORT_INVALID_ASSESSMENT', 'As alternativas precisam de revisão.');
    return value.map(option => {
      const parsed = z.object({ id: z.string().min(1).max(80), text: z.string().max(20000) }).passthrough().safeParse(option);
      if (!parsed.success) fail(409, 'EXPORT_INVALID_ASSESSMENT', 'As alternativas precisam de revisão.');
      return { id: parsed.data.id, text: parsed.data.text };
    });
  }

  private uuid(value: string): void { if (!z.string().uuid().safeParse(value).success) fail(400, 'VALIDATION_FAILED', 'Identificador inválido.'); }
  private fileKey(actorId: string, exportId: string, variant: ExportInput['variant'], format: ExportInput['format']): string {
    return `exports/${actorId}/${exportId}/${variant.toLowerCase()}.${format === 'PDF' ? 'pdf' : 'html'}`;
  }
  private validBuffer(buffer: Buffer, format: 'PDF' | 'PRINT'): boolean {
    return format === 'PDF'
      ? buffer.subarray(0, 5).toString() === '%PDF-' && buffer.subarray(-128).includes(Buffer.from('%%EOF'))
      : buffer.subarray(0, 15).toString().toLowerCase().startsWith('<!doctype html>');
  }
  private ttlSeconds(): number {
    const ttl = Number(process.env.EXPORT_TTL_SECONDS || 3600);
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) fail(503, 'EXPORT_NOT_CONFIGURED', 'O prazo de exportação não está configurado.');
    return ttl;
  }
}
