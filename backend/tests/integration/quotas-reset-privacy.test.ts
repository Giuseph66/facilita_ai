import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient } from '../support/http';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

const password = 'Teste-local-Seguro!42';
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('quota, recuperação de senha e privacidade', () => {
  let runtime: IntegrationRuntime;
  let admin: Client;
  let teacher: TestClient;
  let teacherId: string;
  let courseId: string;

  beforeAll(async () => {
    runtime = await startRuntime(true);
    admin = new Client({ connectionString: runtime.migrationUrl });
    await admin.connect();
    teacher = new TestClient(runtime.baseUrl);
    const account = await teacher.json<{ user: { id: string }; workspaces: { id: string }[] }>(
      '/auth/register', 'POST', {
        name: 'Quota', email: `${randomUUID()}@example.test`, password, persona: 'TEACHER',
      },
    );
    expect(account.status).toBe(201);
    teacherId = account.body.user.id;
    const course = await teacher.json<{ id: string }>(
      `/workspaces/${account.body.workspaces[0].id}/courses`, 'POST', {
        title: 'Concorrência de quota', topics: ['Tópico'], objectives: [],
      },
    );
    expect(course.status).toBe(201);
    courseId = course.body.id;
  }, 120_000);

  afterAll(async () => {
    await admin?.end();
    await runtime?.stop();
  });

  it('serializa reservas concorrentes de MAX_CLASSES sem ultrapassar o limite', async () => {
    const createClass = () => teacher.json(`/courses/${courseId}/classes`, 'POST', { name: 'Turma concorrente', period: '2026' });
    const results = await Promise.all([createClass(), createClass()]);
    expect(results.map((result) => result.status).sort((left, right) => left - right)).toEqual([201, 429]);

    const account = await admin.query<{ id: string }>(`SELECT id FROM billing_accounts WHERE owner_user_id = $1`, [teacherId]);
    const counters = await admin.query<{ used: string; reserved: string }>(
      `SELECT used::text, reserved::text FROM usage_counters WHERE account_id = $1 AND metric = 'MAX_CLASSES'`,
      [account.rows[0].id],
    );
    const reservations = await admin.query<{ state: string }>(
      `SELECT state FROM usage_reservations WHERE account_id = $1 AND metric = 'MAX_CLASSES'`, [account.rows[0].id],
    );
    expect(counters.rows).toEqual([{ used: '1', reserved: '0' }]);
    expect(reservations.rows.map((row) => row.state)).toEqual(['COMMITTED']);
  }, 30_000);

  it('consome token de recuperação uma vez e revoga sessões anteriores', async () => {
    const client = new TestClient(runtime.baseUrl);
    const email = `${randomUUID()}@example.test`;
    const account = await client.json<{ user: { id: string } }>('/auth/register', 'POST', {
      name: 'Recuperação', email, password, persona: 'STUDENT',
    });
    expect(account.status).toBe(201);

    const known = await client.json('/auth/password-recovery', 'POST', { email });
    const unknown = await client.json('/auth/password-recovery', 'POST', { email: `${randomUUID()}@example.test` });
    expect(known.status).toBe(202);
    expect(unknown).toMatchObject({ status: known.status, body: known.body });

    const token = randomBytes(32).toString('base64url');
    await admin.query(
      `INSERT INTO account_tokens(user_id, purpose, token_hash, expires_at)
       VALUES($1, 'PASSWORD_RECOVERY', $2, now() + interval '30 minutes')`,
      [account.body.user.id, createHash('sha256').update(token).digest('hex')],
    );
    const replacementPassword = 'Nova-Senha-Segura!84';
    const reset = await client.json('/auth/password-reset', 'POST', { token, password: replacementPassword });
    expect(reset.status).toBe(204);
    expect((await client.request('/auth/session')).status).toBe(401);
    expect((await client.json('/auth/password-reset', 'POST', { token, password: replacementPassword })).status).toBe(400);

    const oldCredentials = new TestClient(runtime.baseUrl);
    expect((await oldCredentials.json('/auth/login', 'POST', { email, password })).status).toBe(401);
    const newCredentials = new TestClient(runtime.baseUrl);
    expect((await newCredentials.json('/auth/login', 'POST', { email, password: replacementPassword })).status).toBe(200);
  }, 30_000);

  it('exporta dados autorizados e processa exclusão assíncrona, removendo o export', async () => {
    const client = new TestClient(runtime.baseUrl);
    const email = `${randomUUID()}@example.test`;
    const account = await client.json<{ user: { id: string } }>('/auth/register', 'POST', {
      name: 'Privacidade', email, password, persona: 'STUDENT',
    });
    expect(account.status).toBe(201);

    const exported = await client.json<{ id: string; state: string }>('/me/privacy-requests', 'POST', {
      type: 'EXPORT', password,
    });
    expect(exported.status).toBe(202);
    expect(exported.body.state).toBe('COMPLETED');
    const download = await client.request<Record<string, any>>(`/me/privacy-requests/${exported.body.id}/export`);
    expect(download.status).toBe(200);
    expect(download.body.account.profile.name).toBe('Privacidade');
    expect(JSON.stringify(download.body)).not.toMatch(/password_hash|token_hash|storage_key|VAULT_KEYS_JSON/);

    const deletion = await client.json<{ id: string; state: string; accepted: boolean }>(
      '/me/privacy-requests', 'POST', { type: 'DELETE_ACCOUNT', password, confirmation: 'EXCLUIR' },
    );
    expect(deletion.status).toBe(202);
    expect(deletion.body).toMatchObject({ state: 'PENDING', accepted: true });
    expect((await client.request('/auth/session')).status).toBe(401);

    let deletionRow: { state: string; user_id: string | null } | undefined;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const rows = await admin.query<{ state: string; user_id: string | null }>(
        `SELECT state, user_id FROM privacy_requests WHERE id = $1`, [deletion.body.id],
      );
      deletionRow = rows.rows[0];
      if (deletionRow?.state === 'COMPLETED' || deletionRow?.state === 'FAILED') break;
      await pause(200);
    }
    expect(deletionRow?.state).toBe('COMPLETED');
    expect(deletionRow?.user_id).toBeNull();
    const userRows = await admin.query(`SELECT id FROM users WHERE id = $1`, [account.body.user.id]);
    expect(userRows.rows).toHaveLength(0);
    const exportRows = await admin.query<{ result_storage_key: string | null }>(
      `SELECT result_storage_key FROM privacy_requests WHERE id = $1`, [exported.body.id],
    );
    expect(exportRows.rows[0].result_storage_key).toBeNull();
    const cleanup = await admin.query(`SELECT request_id FROM privacy_export_cleanup WHERE actor_id = $1`, [account.body.user.id]);
    expect(cleanup.rows).toHaveLength(0);
  }, 45_000);
});
