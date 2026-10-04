import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { DatabaseService } from '../../src/core/database.service';
import type { QuotaService } from '../../src/core/quota.service';
import type { JobHandlerRegistry } from '../../src/features/ai/job-handler.registry';
import { JobRunnerService } from '../../src/features/ai/job-runner.service';
import type { JobEnvelope } from '../../src/features/ai/job.types';

function runner(errorCode: string) {
  const row = { id: 'job', actor_id: 'actor', workspace_id: 'workspace', feature: 'STUDY_ARTIFACT', state: 'QUEUED' };
  const query = vi.fn(async () => [row]);
  const db = { asActor: vi.fn(async (_actor: string, callback: (connection: { query: typeof query }) => Promise<unknown>) => callback({ query })), query: vi.fn(async () => []) };
  const handlers = { has: vi.fn(() => true), execute: vi.fn().mockRejectedValue({ code: errorCode }) };
  const quota = { release: vi.fn().mockResolvedValue(undefined) };
  const service = new JobRunnerService(db as unknown as DatabaseService, handlers as unknown as JobHandlerRegistry, quota as unknown as QuotaService);
  const process = service as unknown as { process(job: Job<JobEnvelope>): Promise<void> };
  const job = { id: 'event', data: { jobId: 'job', actorId: 'actor', workspaceId: 'workspace' }, attemptsMade: 0, opts: { attempts: 3 } } as Job<JobEnvelope>;
  return { process, job, query, db, quota };
}

describe('timeout já tentado pelo serviço de IA', () => {
  it('encerra o job com o erro original e libera a cota sem repetir a geração', async () => {
    const { process, job, query, db, quota } = runner('PROVIDER_TIMEOUT');
    await expect(process.process(job)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("state = 'FAILED'"), ['job', 'actor', 'PROVIDER_TIMEOUT']);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE outbox_events'), ['event', 'FAILED']);
    expect(quota.release).toHaveBeenCalledWith('actor', 'DAILY_GENERATIONS', 'job');
  });

  it('mantém a política existente de repetição após limite do fornecedor', async () => {
    const { process, job, query, quota } = runner('PROVIDER_RATE_LIMITED');
    await expect(process.process(job)).rejects.toEqual({ code: 'PROVIDER_RATE_LIMITED' });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("state = 'FAILED'"), expect.anything());
    expect(quota.release).not.toHaveBeenCalled();
  });
});
