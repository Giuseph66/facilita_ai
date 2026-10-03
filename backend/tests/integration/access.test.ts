import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { TestClient } from '../support/http';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

type Session = { user: { id: string; name: string; defaultPersona: string }; workspaces: { id: string; roles: string[] }[]; csrfToken: string };
type Course = { id: string; workspaceId: string; title: string; revision: number };
type ClassView = { id: string; workspaceId: string; courseId: string };
type ClassDetail = ClassView & { studentCount: number | null; members: { userId: string; role: string; status: string }[] };
const password = 'Teste-local-Seguro!42';

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
    expect(result.body.paths['/me/personas']).toBeUndefined();
    expect(result.headers.getSetCookie()).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain('VAULT_KEYS_JSON');
  });

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
  });

  it('logout revoga sessão no servidor', async () => {
    expect((await stranger.request('/auth/session', { method: 'DELETE' })).status).toBe(204);
    expect((await stranger.request('/auth/session')).status).toBe(401);
  });
});
