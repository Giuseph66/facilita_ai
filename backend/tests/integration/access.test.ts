import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { TestClient } from '../support/http';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

type Session = { user: { id: string; name: string; defaultPersona: string }; workspaces: { id: string; roles: string[] }[]; csrfToken: string };
type Course = { id: string; workspaceId: string; title: string; revision: number };
type ClassView = { id: string; workspaceId: string; courseId: string };
type ClassDetail = ClassView & { studentCount: number | null; members: { userId: string; role: string; status: string }[] };
const password = 'Teste-local-Seguro!42';
type Job = { id: string; state: string; stage?: string; errorCode?: string };

async function waitForJob(client: TestClient, id: string): Promise<Job> {
  const deadline = Date.now() + 15_000;
  let latest: Job | undefined;
  while (Date.now() < deadline) {
    const response = await client.request<{ job: Job }>(`/jobs/${id}`);
    expect(response.status).toBe(200);
    latest = response.body.job;
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(latest.state)) return latest;
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error(`AI job did not reach a terminal state (${latest?.state ?? 'missing'} / ${latest?.stage ?? 'no-stage'} / ${latest?.errorCode ?? 'no-error'}).`);
}

describe('HTTP e RLS com runtime real', () => {
  let runtime: IntegrationRuntime;
  let teacher: TestClient;
  let student: TestClient;
  let stranger: TestClient;
  let teacherSession: Session;
  let studentSession: Session;
  let course: Course;
  let classroom: ClassView;

  beforeAll(async () => {
    runtime = await startRuntime();
    teacher = new TestClient(runtime.baseUrl);
    student = new TestClient(runtime.baseUrl);
    stranger = new TestClient(runtime.baseUrl);
    const register = async (client: TestClient, name: string, persona: string) => {
      const result = await client.json<Session>('/auth/register', 'POST', { name, email: `${name.toLowerCase()}@example.test`, password, persona });
      expect(result.status).toBe(201);
      expect(result.body.csrfToken).toBeTypeOf('string');
      return result.body;
    };
    teacherSession = await register(teacher, 'Professor', 'TEACHER');
    studentSession = await register(student, 'Aluno', 'STUDENT');
    await register(stranger, 'Externo', 'STUDENT');
    const create = await teacher.json<Course>(`/workspaces/${teacherSession.workspaces[0].id}/courses`, 'POST', {
      title: 'Bioquímica', description: 'Conteúdo acadêmico', topics: ['Glicólise'], objectives: ['Compreender metabolismo'],
    });
    expect(create.status).toBe(201);
    course = create.body;
    const createdClass = await teacher.json<ClassView>(`/courses/${course.id}/classes`, 'POST', { name: 'Turma A', period: '2026' });
    expect(createdClass.status).toBe(201);
    classroom = createdClass.body;
  });

  afterAll(async () => { await runtime?.stop(); });

  it('expõe contrato público sem liberar uma sessão ou schemas internos de IA', async () => {
    const anonymous = new TestClient(runtime.baseUrl);
    const result = await anonymous.request<{ openapi: string; paths: Record<string, unknown> }>('/openapi.json');
    expect(result.status).toBe(200);
    expect(result.body.openapi).toBe('3.1.0');
    expect(result.body.paths['/auth/register']).toBeDefined();
    expect(result.body.paths['/documents/{id}']).toBeDefined();
    expect(result.body.paths['/me/courses']).toBeDefined();
    expect(result.body.paths['/ai/preferences']).toBeDefined();
    expect(result.body.paths['/me/personas']).toBeUndefined();
    expect(result.headers.getSetCookie()).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain('VAULT_KEYS_JSON');
  });

  it('API-only fica pronta sem trabalhador e informa a fila agregada', async () => {
    const healthResponse = await fetch(`${runtime.baseUrl}/health`);
    const health = {
      status: healthResponse.status,
      body: await healthResponse.json() as {
      status: string; worker: { status: string; activeCount: number | null };
      queue: { queuedCount: number; oldestQueuedAgeSeconds: number | null };
      },
    };
    expect(health.status).toBe(200);
    expect(health.body).toEqual({
      status: 'ready',
      worker: { status: 'stale', activeCount: 0, oldestHeartbeatAgeSeconds: null },
      queue: { queuedCount: 0, oldestQueuedAgeSeconds: null },
    });
    expect(await (await fetch(`${runtime.baseUrl}/health/live`)).json()).toEqual({ status: 'ok' });
  });

  it('plano Livre preserva BYOK e concede cinco gerações diárias', async () => {
    const admin = new Client({ connectionString: runtime.migrationUrl });
    await admin.connect();
    try {
      const result = await admin.query<{ capability: string; value: unknown }>(
        `SELECT pe.capability, pe.value FROM plan_entitlements pe JOIN plans p ON p.id = pe.plan_id
         WHERE p.code = 'FREE' AND pe.capability = ANY($1::text[]) ORDER BY pe.capability`,
        [['AI_BYOK_ACCESS', 'AI_PLATFORM_ACCESS', 'DAILY_GENERATIONS', 'MAX_CONCURRENT_AI_JOBS']],
      );
      const entitlements = new Map(result.rows.map(row => [row.capability, row.value]));
      expect(entitlements.get('AI_BYOK_ACCESS')).toBe(true);
      expect(entitlements.get('AI_PLATFORM_ACCESS')).toBe(false);
      expect(entitlements.get('DAILY_GENERATIONS')).toEqual({ limit: 5, period: 'day' });
      expect(entitlements.get('MAX_CONCURRENT_AI_JOBS')).toEqual({ limit: 1, period: 'concurrent' });
    } finally { await admin.end(); }
  });

  it('completa cinco gerações BYOK de fixture no Livre e bloqueia a sexta pela cota', async () => {
    await runtime.startWorker();
    try {
      const created = await teacher.json<{ conversation: { id: string } }>('/conversations', 'POST', { kind: 'TEACHER_ASSISTANT' });
      expect(created.status).toBe(201);
      const conversationId = created.body.conversation.id;

      for (let index = 0; index < 5; index += 1) {
        const sent = await teacher.json<{ job: Job }>(`/conversations/${conversationId}/messages`, 'POST', {
          content: `Pergunta sintética ${index + 1}.`, clientMessageId: `free-generation-${index + 1}`,
        });
        expect(sent.status).toBe(202);
        expect((await waitForJob(teacher, sent.body.job.id)).state).toBe('SUCCEEDED');
      }

      const usageAfterFive = await teacher.request<{ items: Array<{ metric: string; used: number | string; reserved: number | string; limit: number | string | null }> }>('/me/usage');
      expect(usageAfterFive.status).toBe(200);
      expect(usageAfterFive.body.items.find(item => item.metric === 'DAILY_GENERATIONS')).toMatchObject({ used: 5, reserved: 0, limit: 5 });

      const sixth = await teacher.json<{ job: Job }>(`/conversations/${conversationId}/messages`, 'POST', {
        content: 'Sexta pergunta sintética.', clientMessageId: 'free-generation-6',
      });
      expect(sixth.status).toBe(202);
      expect(await waitForJob(teacher, sixth.body.job.id)).toMatchObject({ state: 'FAILED', errorCode: 'QUOTA_EXCEEDED' });
      const usageAfterBlocked = await teacher.request<{ items: Array<{ metric: string; used: number | string; reserved: number | string }> }>('/me/usage');
      expect(usageAfterBlocked.body.items.find(item => item.metric === 'DAILY_GENERATIONS')).toMatchObject({ used: 5, reserved: 0 });
    } finally {
      await runtime.stopWorker();
    }
  }, 30_000);

  it('rejeita cookie ausente e CSRF ausente ou com origem diferente', async () => {
    const anonymous = new TestClient(runtime.baseUrl);
    expect((await anonymous.request('/auth/session')).status).toBe(401);
    const csrf = teacher.csrfToken;
    teacher.csrfToken = undefined;
    const absent = await teacher.json('/me/profile', 'PATCH', { name: 'Professor' });
    teacher.csrfToken = csrf;
    expect(absent.status).toBe(403);
    expect(absent.body.code).toBe('CSRF_INVALID');
    const wrongOrigin = await fetch(`${runtime.baseUrl}/api/v1/auth/login`, {
      method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'professor@example.test', password }),
    });
    expect(wrongOrigin.status).toBe(403);
    const localAlias = await fetch(`${runtime.baseUrl}/api/v1/auth/login`, {
      method: 'OPTIONS', headers: {
        origin: 'http://127.0.0.1:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(localAlias.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:3000');
  });

  it('não revela recursos privados a usuários externos', async () => {
    expect((await stranger.request(`/courses/${course.id}`)).status).toBe(404);
    expect((await stranger.request(`/classes/${classroom.id}`)).status).toBe(404);
    expect((await student.request(`/courses/${course.id}`)).status).toBe(404);
  });

  it('abre turma vazia para o docente sem erro de tipos SQL', async () => {
    const result = await teacher.request<ClassDetail>(`/classes/${classroom.id}`);
    expect(result.status).toBe(200);
    expect(result.body.studentCount).toBe(0);
    expect(result.body.members).toEqual([]);
  });

  it('convite dá matrícula, sem permitir editar a disciplina', async () => {
    const invitation = await teacher.json<{ inviteCode: string }>(`/classes/${classroom.id}/invitations`, 'POST', { maxUses: 1, expiresInHours: 1 });
    expect(invitation.status).toBe(201);
    const enrollment = await student.json('/enrollments', 'POST', { code: invitation.body.inviteCode });
    expect(enrollment.status).toBe(201);
    expect((await student.request(`/courses/${course.id}`)).status).toBe(200);
    const discovered = await student.request<{ items: Array<{ id: string }>; nextCursor: string | null }>('/me/courses');
    expect(discovered.status).toBe(200);
    expect(discovered.body.items.map(item => item.id)).toContain(course.id);
    const strangerCourses = await stranger.request<{ items: Array<{ id: string }> }>('/me/courses');
    expect(strangerCourses.body.items.map(item => item.id)).not.toContain(course.id);
    expect((await student.json(`/courses/${course.id}`, 'PATCH', { title: 'Alteração indevida', revision: course.revision })).status).toBe(404);
    expect((await stranger.json('/enrollments', 'POST', { code: invitation.body.inviteCode })).status).toBeGreaterThanOrEqual(400);
  });

  it('docente vê alunos da turma e estudante vê somente sua matrícula', async () => {
    const otherStudent = new TestClient(runtime.baseUrl);
    const registered = await otherStudent.json<Session>('/auth/register', 'POST', {
      name: 'Outro aluno', email: 'outro-aluno@example.test', password, persona: 'STUDENT',
    });
    expect(registered.status).toBe(201);
    const invitation = await teacher.json<{ inviteCode: string }>(`/classes/${classroom.id}/invitations`, 'POST', { maxUses: 1, expiresInHours: 1 });
    expect(invitation.status).toBe(201);
    expect((await otherStudent.json('/enrollments', 'POST', { code: invitation.body.inviteCode })).status).toBe(201);

    const teacherView = await teacher.request<ClassDetail>(`/classes/${classroom.id}`);
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.studentCount).toBe(2);
    expect(teacherView.body.members.map(member => member.userId).sort()).toEqual([studentSession.user.id, registered.body.user.id].sort());
    for (const [client, id] of [[student, studentSession.user.id], [otherStudent, registered.body.user.id]] as const) {
      const studentView = await client.request<ClassDetail>(`/classes/${classroom.id}`);
      expect(studentView.status).toBe(200);
      expect(studentView.body.studentCount).toBeNull();
      expect(studentView.body.members).toEqual([expect.objectContaining({ userId: id, role: 'STUDENT', status: 'ACTIVE' })]);
    }
    expect((await stranger.request(`/classes/${classroom.id}`)).status).toBe(404);
  });

  it('tipo de conta permanece fixo; nome continua editável', async () => {
    for (const [client, persona, opposite] of [[teacher, 'TEACHER', 'STUDENT'], [student, 'STUDENT', 'TEACHER']] as const) {
      expect((await client.json('/me/personas', 'POST', { persona: opposite })).status).toBe(404);
      const rejected = await client.json('/me/profile', 'PATCH', { name: 'Nome indevido', defaultPersona: opposite });
      expect(rejected.status).toBe(400);
      expect(rejected.body.code).toBe('VALIDATION_FAILED');
      const before = await client.request<Session>('/auth/session');
      expect(before.status).toBe(200);
      expect(before.body.user.defaultPersona).toBe(persona);
      expect(before.body.user.name).not.toBe('Nome indevido');
      const profile = await client.json<{ defaultPersona: string; name: string }>('/me/profile', 'PATCH', { name: `Nome ${persona}` });
      expect(profile.status).toBe(200);
      expect(profile.body).toMatchObject({ defaultPersona: persona, name: `Nome ${persona}` });
      const after = await client.request<Session>('/auth/session');
      expect(after.status).toBe(200);
      expect(after.body.user.defaultPersona).toBe(persona);
      expect(after.body.workspaces.find(space => space.id === (persona === 'TEACHER' ? teacherSession : studentSession).workspaces[0].id)?.roles).toEqual([persona]);
    }
  });

  it('estudante não recebe privilégios de docente em outra turma', async () => {
    expect((await student.json(`/courses/${course.id}/classes`, 'POST', { name: 'Indevida', period: '2026' })).status).toBeGreaterThanOrEqual(400);
    expect((await student.request(`/courses/${course.id}/assessments`)).status).toBe(404);
  });

  it('detecta revisão concorrente sem sobrescrever alteração anterior', async () => {
    const update = await teacher.json<Course>(`/courses/${course.id}`, 'PATCH', { title: 'Bioquímica atualizada', revision: course.revision });
    expect(update.status).toBe(200);
    const conflict = await teacher.json(`/courses/${course.id}`, 'PATCH', { title: 'Título antigo', revision: course.revision });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('REVISION_CONFLICT');
    course = update.body;
  });

  it('a role runtime não tem bypass e RLS impede leitura sem contexto e de outro ator', async () => {
    const db = new Client({ connectionString: runtime.databaseUrl });
    await db.connect();
    try {
      const role = await db.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
      expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
      expect((await db.query('SELECT id FROM courses WHERE id=$1', [course.id])).rows).toHaveLength(0);
      await db.query('BEGIN');
      await db.query("SELECT set_config('app.user_id',$1,true)", [teacherSession.user.id]);
      expect((await db.query('SELECT id FROM courses WHERE id=$1', [course.id])).rows).toHaveLength(1);
      await db.query('COMMIT');
      expect((await db.query('SELECT id FROM courses WHERE id=$1', [course.id])).rows).toHaveLength(0);
    } finally { await db.end(); }
  });

  it('revogar matrícula remove imediatamente o acesso de leitura', async () => {
    expect((await teacher.request(`/classes/${classroom.id}/enrollments/${studentSession.user.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await student.request(`/courses/${course.id}`)).status).toBe(404);
    expect((await student.request(`/classes/${classroom.id}`)).status).toBe(404);
    expect((await student.request<{ items: Array<{ id: string }> }>('/me/courses')).body.items.map(item => item.id)).not.toContain(course.id);
  });

  it('logout revoga sessão no servidor', async () => {
    expect((await stranger.request('/auth/session', { method: 'DELETE' })).status).toBe(204);
    expect((await stranger.request('/auth/session')).status).toBe(401);
  });
});
