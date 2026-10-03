import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { TestClient } from '../support/http';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

type JobView = { id: string; state: string; result?: { connection?: { status?: string } }; errorCode?: string };

async function awaitSucceeded(client: TestClient, jobId: string): Promise<JobView> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await client.request<{ job: JobView }>(`/jobs/${jobId}`);
    expect(response.status).toBe(200);
    const job = response.body.job;
    if (job.state === 'SUCCEEDED') return job;
    if (job.state === 'FAILED' || job.state === 'CANCELLED') {
      throw new Error(`Job ${jobId} terminou em ${job.state} (${job.errorCode ?? 'sem código'}).`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Job ${jobId} não terminou no prazo; workers podem ter compartilhado a fila.`);
}

it('isola filas por banco e recupera job persistido após reiniciar um worker', async () => {
  const runtimes: IntegrationRuntime[] = [];
  try {
    const started = await Promise.all([startRuntime(true), startRuntime(true)]);
    runtimes.push(...started);
    const clients = started.map(runtime => new TestClient(runtime.baseUrl));

    const accounts = await Promise.all(clients.map((client, index) => client.json<{
      user: { id: string }; workspaces: { id: string }[];
    }>('/auth/register', 'POST', {
      name: `Worker ${index + 1}`, email: `worker-${index}-${randomUUID()}@example.test`,
      password: 'Worker-Isolation!42', persona: 'TEACHER',
    })));
    expect(accounts.map(account => account.status)).toEqual([201, 201]);

    const configured = await Promise.all(clients.map(client => client.json('/ai/connections/ollama', 'PUT', {
      apiKey: 'local-test-key-never-sent-to-cloud',
    })));
    expect(configured.map(response => response.status)).toEqual([200, 200]);

    const checks = await Promise.all(clients.map(client => client.request<{ job: JobView }>('/ai/connections/ollama/checks', {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    })));
    expect(checks.map(response => response.status)).toEqual([202, 202]);

    const jobs = await Promise.all(checks.map((response, index) => awaitSucceeded(clients[index], response.body.job.id)));
    expect(jobs.map(job => job.state)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    expect(jobs.map(job => job.result?.connection?.status)).toEqual(['CONNECTED', 'CONNECTED']);

    await started[0].stopWorker();
    const offline = await clients[0].request<{ job: JobView }>('/ai/connections/ollama/checks', {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(offline.status).toBe(202);
    const stillRunning = await clients[1].request<{ job: JobView }>('/ai/connections/ollama/checks', {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(stillRunning.status).toBe(202);
    expect((await awaitSucceeded(clients[1], stillRunning.body.job.id)).state).toBe('SUCCEEDED');
    const persisted = await clients[0].request<{ job: JobView }>(`/jobs/${offline.body.job.id}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body.job.state).toBe('QUEUED');

    await started[0].startWorker();
    const recovered = await awaitSucceeded(clients[0], offline.body.job.id);
    expect(recovered.state).toBe('SUCCEEDED');
    expect(recovered.result?.connection?.status).toBe('CONNECTED');
  } finally {
    await Promise.all(runtimes.map(runtime => runtime.stop()));
  }
}, 120_000);
