import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DatabaseService } from '../../core/database.service';
import { QuotaService } from '../../core/quota.service';
import { JobEnvelope, IntelligenceJob } from './job.types';
import { JobHandlerRegistry } from './job-handler.registry';

const QUEUE_NAME = 'intelligence-jobs';
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TTL_MS = 45_000;

@Injectable()
export class JobRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(JobRunnerService.name);
  private redis?: Redis;
  private queue?: Queue<JobEnvelope>;
  private worker?: Worker<JobEnvelope>;
  private timer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatKey?: string;
  private pumping = false;

  constructor(private readonly db: DatabaseService, private readonly handlers: JobHandlerRegistry, private readonly quota: QuotaService) {}

  async start(): Promise<void> {
    if (this.worker) return;
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is required to start intelligence workers');
    const prefix = process.env.QUEUE_PREFIX?.trim() || 'facilita';
    this.redis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    await this.redis.connect();
    this.queue = new Queue<JobEnvelope>(QUEUE_NAME, { connection: this.redis, prefix });
    this.worker = new Worker<JobEnvelope>(
      QUEUE_NAME,
      (job) => this.process(job),
      { connection: this.redis.duplicate(), concurrency: Number(process.env.INTELLIGENCE_CONCURRENCY ?? 2), prefix },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Intelligence job ${job?.id ?? 'unknown'} failed: ${error.name}`);
    });
    await this.worker.waitUntilReady();
    this.heartbeatKey = `${prefix}:health:worker:${randomUUID()}`;
    await this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.writeHeartbeat(), HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
    await this.dispatchOutbox();
    this.timer = setInterval(() => void this.dispatchOutbox(), 1_000);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    await this.worker?.close();
    await this.queue?.close();
    if (this.heartbeatKey) await this.redis?.del(this.heartbeatKey).catch(() => undefined);
    this.heartbeatKey = undefined;
    await this.redis?.quit();
    this.worker = undefined;
    this.queue = undefined;
    this.redis = undefined;
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private async dispatchOutbox(): Promise<void> {
    if (!this.queue || this.pumping) return;
    this.pumping = true;
    try {
      const events = await this.db.query<{ id: string; job_id: string; payload: JobEnvelope }>(
        `WITH selected AS (
           SELECT id FROM outbox_events
           WHERE state IN ('PENDING','DISPATCHED') AND (locked_until IS NULL OR locked_until < now())
           ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED
         )
         UPDATE outbox_events e
         SET locked_until = now() + interval '30 seconds', attempts = attempts + 1
         FROM selected s WHERE e.id = s.id
         RETURNING e.id, e.job_id, e.payload`,
      );
      for (const event of events) {
        const envelope = event.payload;
        if (!envelope?.jobId || !envelope.actorId || !envelope.workspaceId || envelope.jobId !== event.job_id) {
          await this.db.query(`UPDATE outbox_events SET state = 'FAILED', locked_until = NULL WHERE id = $1`, [event.id]);
          continue;
        }
        await this.queue.add('process', envelope, {
          jobId: event.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: { age: 86_400, count: 10_000 },
          removeOnFail: false,
        });
        await this.db.query(
          `UPDATE outbox_events SET state = 'DISPATCHED', dispatched_at = COALESCE(dispatched_at, now()), locked_until = now() + interval '30 seconds' WHERE id = $1`,
          [event.id],
        );
      }
    } catch (error) {
      this.logger.warn(`Outbox dispatch deferred: ${error instanceof Error ? error.name : 'unknown error'}`);
    } finally {
      this.pumping = false;
    }
  }

  private async writeHeartbeat(): Promise<void> {
    if (!this.redis || !this.heartbeatKey) return;
    try {
      await this.redis.set(this.heartbeatKey, String(Date.now()), 'PX', HEARTBEAT_TTL_MS);
    } catch (error) {
      this.logger.warn(`Worker heartbeat deferred: ${error instanceof Error ? error.name : 'unknown error'}`);
    }
  }

  private async process(queueJob: Job<JobEnvelope>): Promise<void> {
    const envelope = queueJob.data;
    const rows = await this.db.asActor(envelope.actorId, (connection) =>
      connection.query<IntelligenceJob>(
        `SELECT id, workspace_id, actor_id, feature, state, stage, progress, resource_type, resource_id, payload, result, error_code
         FROM jobs WHERE id = $1 AND workspace_id = $2 AND actor_id = $3`,
        [envelope.jobId, envelope.workspaceId, envelope.actorId],
      ),
    );
    const job = rows[0];
    if (!job) {
      await this.markOutbox(queueJob.id, 'FAILED');
      return;
    }
    if (job.state === 'SUCCEEDED' || job.state === 'FAILED' || job.state === 'CANCELLED') {
      await this.markOutbox(queueJob.id, 'DONE');
      return;
    }
    if (!this.handlers.has(job.feature)) {
      await this.finishFailure(job, 'JOB_HANDLER_UNAVAILABLE');
      await this.markOutbox(queueJob.id, 'FAILED');
      return;
    }

    await this.db.asActor(job.actor_id, async (connection) => {
      await connection.query(
        `UPDATE jobs SET state = 'RUNNING', stage = 'RUNNING', progress = GREATEST(COALESCE(progress, 0), 1), updated_at = now()
         WHERE id = $1 AND actor_id = $2 AND state IN ('QUEUED','RUNNING')`,
        [job.id, job.actor_id],
      );
    });
    try {
      const result = await this.handlers.execute(job);
      await this.db.asActor(job.actor_id, async (connection) => {
        await connection.query(
          `UPDATE jobs SET state = 'SUCCEEDED', stage = 'COMPLETED', progress = 100, result = $3::jsonb, error_code = NULL,
             updated_at = now(), finished_at = now() WHERE id = $1 AND actor_id = $2 AND state IN ('RUNNING','QUEUED')`,
          [job.id, job.actor_id, JSON.stringify(result)],
        );
      });
      await this.markOutbox(queueJob.id, 'DONE');
    } catch (error) {
      const code = this.safeErrorCode(error);
      const terminalAttempt = queueJob.attemptsMade + 1 >= Number(queueJob.opts.attempts ?? 1);
      // AIService already retries transport timeouts; repeating the job would reuse its released concurrency reservation.
      if (terminalAttempt || code !== 'PROVIDER_RATE_LIMITED') {
        await this.finishFailure(job, code);
        await this.markOutbox(queueJob.id, 'FAILED');
        return;
      }
      throw error;
    }
  }

  private async finishFailure(job: IntelligenceJob, code: string): Promise<void> {
    await this.db.asActor(job.actor_id, async (connection) => {
      await connection.query(
        `UPDATE jobs SET state = 'FAILED', stage = 'FAILED', error_code = $3, updated_at = now(), finished_at = now()
         WHERE id = $1 AND actor_id = $2 AND state IN ('QUEUED','RUNNING')`,
        [job.id, job.actor_id, code],
      );
    });
    await this.quota.release(job.actor_id, 'DAILY_GENERATIONS', job.id).catch(() => undefined);
  }

  private async markOutbox(eventId: string | undefined, state: 'DONE' | 'FAILED'): Promise<void> {
    if (!eventId) return;
    await this.db.query(`UPDATE outbox_events SET state = $2, locked_until = NULL WHERE id = $1`, [eventId, state]);
  }

  private safeErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      const code = (error as { code: string }).code;
      return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : 'JOB_FAILED';
    }
    if (error && typeof error === 'object' && 'getResponse' in error && typeof (error as { getResponse?: unknown }).getResponse === 'function') {
      const response = (error as { getResponse: () => unknown }).getResponse();
      if (response && typeof response === 'object' && 'code' in response && typeof (response as { code?: unknown }).code === 'string') {
        return (response as { code: string }).code;
      }
    }
    return 'JOB_FAILED';
  }
}
