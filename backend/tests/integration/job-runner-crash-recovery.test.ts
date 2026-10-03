import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { TestClient } from '../support/http';
import { pdfFixture } from '../support/fixtures';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

type Job = { id: string; state: string; result?: { artifactId?: string }; errorCode?: string };
type DocumentView = { id: string; status: string };

async function waitForSuccess(client: TestClient, jobId: string, timeoutMs: number): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await client.request<{ job: Job }>(`/jobs/${jobId}`);
    expect(response.status).toBe(200);
    const job = response.body.job;
    if (job.state === 'SUCCEEDED') return job;
    if (job.state === 'FAILED' || job.state === 'CANCELLED') {
      throw new Error(`Job ${jobId} terminou em ${job.state} (${job.errorCode ?? 'sem código'}).`);
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Job ${jobId} não foi recuperado no prazo após SIGKILL.`);
}

it('recupera geração RUNNING após SIGKILL sem duplicar artefato ou consumo', async () => {
  let runtime: IntegrationRuntime | undefined;
  let admin: Client | undefined;
  try {
    runtime = await startRuntime(true, { fakeAiDelayMs: 10_000 });
    const client = new TestClient(runtime.baseUrl);
    admin = new Client({ connectionString: runtime.migrationUrl });
    await admin.connect();

    const registered = await client.json<{
      user: { id: string }; workspaces: { id: string }[];
    }>('/auth/register', 'POST', {
      name: 'Recuperação de worker', email: `worker-crash-${randomUUID()}@example.test`,
      password: 'Worker-Crash!42', persona: 'TEACHER',
    });
    expect(registered.status).toBe(201);
    const actorId = registered.body.user.id;
    await admin.query(`UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='BYOK')
      WHERE account_id=(SELECT id FROM billing_accounts WHERE owner_user_id=$1)`, [actorId]);

    const course = await client.json<{ id: string }>(`/workspaces/${registered.body.workspaces[0].id}/courses`, 'POST', {
      title: 'Metabolismo', topics: ['Glicólise'], objectives: ['Relacionar glicose e ATP.'],
    });
    expect(course.status).toBe(201);
    const material = await client.json<{ id: string; revision: number }>(`/courses/${course.body.id}/materials`, 'POST', {
      title: 'Texto sintético de glicólise', kind: 'PDF', classification: 'ACADEMIC',
    });
    expect(material.status).toBe(201);
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(pdfFixture('A glicólise converte glicose em piruvato e produz ATP.'))], { type: 'application/pdf' }), 'glicolise.pdf');
    const upload = await client.request<{ document: DocumentView; job: Job }>(`/materials/${material.body.id}/documents`, {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: form,
    });
    expect(upload.status).toBe(202);
    await waitForSuccess(client, upload.body.job.id, 30_000);
    const readyDocument = await client.request<{ document: DocumentView }>(`/documents/${upload.body.document.id}`);
    expect(readyDocument.status).toBe(200);
    expect(readyDocument.body.document.status).toBe('READY');

    const queued = await client.json<{ job: Job }>('/study/artifacts', 'POST', {
      kind: 'SUMMARY', courseId: course.body.id, documentIds: [upload.body.document.id],
    });
    expect(queued.status).toBe(202);
    const jobId = queued.body.job.id;
    const deadline = Date.now() + 20_000;
    let providerStarted = false;
    let running = false;
    while (Date.now() < deadline) {
      const [response, requests] = await Promise.all([
        client.request<{ job: Job }>(`/jobs/${jobId}`), runtime.readAIRequests(),
      ]);
      expect(response.status).toBe(200);
      if (response.body.job.state === 'FAILED' || response.body.job.state === 'CANCELLED') {
        throw new Error(`Job ${jobId} terminou antes do crash (${response.body.job.errorCode ?? response.body.job.state}).`);
      }
      providerStarted ||= requests.some(request => request.actorId === actorId && request.prompt.includes('Fonte autorizada'));
      if (response.body.job.state === 'RUNNING' && providerStarted) { running = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(running).toBe(true);

    await runtime.crashWorker();
    const afterCrash = await client.request<{ job: Job }>(`/jobs/${jobId}`);
    expect(afterCrash.status).toBe(200);
    expect(afterCrash.body.job.state).toBe('RUNNING');

    await runtime.startWorker();
    const completed = await waitForSuccess(client, jobId, 100_000);
    expect(completed.result?.artifactId).toBeTypeOf('string');
    const artifact = await client.request<{ artifact: { id: string; kind: string } }>(`/study/artifacts/${completed.result!.artifactId}`);
    expect(artifact.status).toBe(200);
    expect(artifact.body.artifact.kind).toBe('SUMMARY');

    const artifacts = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM study_artifacts WHERE generation_job_id=$1`, [jobId],
    );
    expect(Number(artifacts.rows[0]?.count)).toBe(1);
    const counters = await admin.query<{ metric: string; used: string | number; reserved: string | number }>(
      `SELECT c.metric,c.used,c.reserved FROM usage_counters c
       JOIN billing_accounts b ON b.id=c.account_id WHERE b.owner_user_id=$1
         AND c.metric = ANY($2::text[])`, [actorId, ['DAILY_GENERATIONS', 'MAX_CONCURRENT_AI_JOBS']],
    );
    const byMetric = new Map(counters.rows.map(row => [row.metric, { used: Number(row.used), reserved: Number(row.reserved) }]));
    expect(byMetric.get('DAILY_GENERATIONS')).toEqual({ used: 1, reserved: 0 });
    expect(byMetric.get('MAX_CONCURRENT_AI_JOBS')).toEqual({ used: 0, reserved: 0 });
    const reservations = await admin.query<{ metric: string; state: string }>(
      `SELECT metric,state FROM usage_reservations WHERE operation_id=$1 ORDER BY metric`, [jobId],
    );
    expect(reservations.rows).toEqual([
      { metric: 'DAILY_GENERATIONS', state: 'COMMITTED' },
      { metric: 'MAX_CONCURRENT_AI_JOBS', state: 'RELEASED' },
    ]);
    const usageEvents = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ai_usage_events WHERE operation_id=$1 AND success=true`, [jobId],
    );
    expect(Number(usageEvents.rows[0]?.count)).toBe(1);
    const requests = (await runtime.readAIRequests()).filter(request => request.actorId === actorId && request.prompt.includes('Fonte autorizada'));
    expect(requests).toHaveLength(2);
  } finally {
    await admin?.end();
    await runtime?.stop();
  }
}, 120_000);
