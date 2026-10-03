import { randomUUID } from 'node:crypto';
import { Client, type QueryResult } from 'pg';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';
import { TestClient } from '../support/http';

describe('conteúdo acadêmico, provas privadas e revogação no PostgreSQL', () => {
  let runtime: IntegrationRuntime;
  let admin: Client;
  let db: Client;
  let studentHttp: TestClient;
  const teacher = randomUUID();
  const student = randomUUID();
  const outsider = randomUUID();
  const workspace = randomUUID();
  const course = randomUUID();
  const classroom = randomUUID();
  const material = randomUUID();
  const secretMaterial = randomUUID();
  const document = randomUUID();
  const secretDocument = randomUUID();
  const version = randomUUID();
  const ingestionJob = randomUUID();
  const page = randomUUID();
  const chunk = randomUUID();
  const assessment = randomUUID();
  const question = randomUUID();
  const artifact = randomUUID();
  const derivedMarker = 'RESUMO_DERIVADO_DO_MATERIAL_LIBERADO';
  const password = 'Teste-local-Seguro!42';
  const marker = 'GABARITO_PRIVADO_NUNCA_INCLUIR_NO_CONTEXTO';

  async function asActor(actor: string, sql: string, params: unknown[] = []): Promise<QueryResult> {
    await db.query('BEGIN');
    try {
      await db.query("SELECT set_config('app.user_id',$1,true)", [actor]);
      const result = await db.query(sql, params);
      await db.query('COMMIT');
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }

  beforeAll(async () => {
    runtime = await startRuntime();
    admin = new Client({ connectionString: runtime.migrationUrl });
    db = new Client({ connectionString: runtime.databaseUrl });
    await Promise.all([admin.connect(), db.connect()]);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const [id, persona] of [[teacher, 'TEACHER'], [student, 'STUDENT'], [outsider, 'STUDENT']]) {
      await admin.query('INSERT INTO users(id,email_normalized,name,password_hash,default_persona) VALUES($1,$2,$3,$4,$5)', [id, `${id}@example.test`, persona, passwordHash, persona]);
    }
    await admin.query("INSERT INTO workspaces(id,type,name,owner_user_id) VALUES($1,'PERSONAL','Professor',$2)", [workspace, teacher]);
    for (const [id, role] of [[teacher, 'TEACHER'], [student, 'STUDENT']]) {
      await admin.query('INSERT INTO workspace_memberships(workspace_id,user_id) VALUES($1,$2)', [workspace, id]);
      await admin.query('INSERT INTO workspace_roles(workspace_id,user_id,role) VALUES($1,$2,$3)', [workspace, id, role]);
    }
    await admin.query("INSERT INTO courses(id,workspace_id,owner_user_id,title) VALUES($1,$2,$3,'Bioquímica')", [course, workspace, teacher]);
    await admin.query("INSERT INTO classes(id,workspace_id,course_id,teacher_user_id,name) VALUES($1,$2,$3,$4,'Turma A')", [classroom, workspace, course, teacher]);
    await admin.query("INSERT INTO enrollments(workspace_id,class_id,user_id,role,status) VALUES($1,$2,$3,'STUDENT','ACTIVE')", [workspace, classroom, student]);
    for (const [id, classification] of [[material, 'ACADEMIC'], [secretMaterial, 'TEACHER_SECRET']]) {
      await admin.query("INSERT INTO materials(id,workspace_id,course_id,owner_user_id,title,kind,classification) VALUES($1,$2,$3,$4,$5,'PDF',$6)", [id, workspace, course, teacher, classification, classification]);
    }
    await admin.query('INSERT INTO material_class_releases(workspace_id,material_id,class_id,released_at) VALUES($1,$2,$3,now())', [workspace, material, classroom]);
    for (const [id, materialId] of [[document, material], [secretDocument, secretMaterial]]) {
      await admin.query("INSERT INTO documents(id,workspace_id,material_id,owner_user_id,original_storage_key,original_name,mime_type,size_bytes,sha256,status) VALUES($1,$2,$3,$4,$5,'aula.pdf','application/pdf',100,$6,'READY')", [id, workspace, materialId, teacher, `documents/${id}/source.pdf`, 'a'.repeat(64)]);
    }
    await admin.query("INSERT INTO jobs(id,workspace_id,actor_id,feature,resource_type,resource_id,payload,payload_hash,state) VALUES($1,$2,$3,'DOCUMENT_PROCESS','DOCUMENT',$4,'{}'::jsonb,$5,'SUCCEEDED')", [ingestionJob, workspace, teacher, document, 'c'.repeat(64)]);
    await admin.query("INSERT INTO document_versions(id,workspace_id,document_id,job_id,version,parser_version,chunker_version,embedding_fingerprint,status) VALUES($1,$2,$3,$4,1,'test','test','test-384','READY')", [version, workspace, document, ingestionJob]);
    await admin.query('UPDATE documents SET active_version_id=$1 WHERE id=$2', [version, document]);
    await admin.query("INSERT INTO document_pages(id,workspace_id,version_id,page_number,extracted_text) VALUES($1,$2,$3,1,'Glicólise produz piruvato.')", [page, workspace, version]);
    await admin.query("INSERT INTO document_chunks(id,workspace_id,version_id,page_id,position,content,token_count,content_hash) VALUES($1,$2,$3,$4,0,'Glicólise produz piruvato.',5,$5)", [chunk, workspace, version, page, 'b'.repeat(64)]);
    await admin.query("INSERT INTO assessments(id,workspace_id,author_user_id,course_id,class_id,title,kind,state) VALUES($1,$2,$3,$4,$5,'Prova final','EXAM','PUBLISHED')", [assessment, workspace, teacher, course, classroom]);
    await admin.query("INSERT INTO assessment_questions(id,workspace_id,assessment_id,position,type,statement,difficulty,points) VALUES($1,$2,$3,1,'SHORT_ANSWER',$4,'MEDIUM',1)", [question, workspace, assessment, marker]);
    await admin.query('INSERT INTO assessment_answers(workspace_id,question_id,expected_answer) VALUES($1,$2,$3)', [workspace, question, marker]);
    await admin.query("INSERT INTO study_artifacts(id,workspace_id,owner_user_id,course_id,kind,title,payload,schema_version,source_count) VALUES($1,$2,$3,$4,'SUMMARY','Resumo',$5::jsonb,'1',1)", [artifact, workspace, student, course, JSON.stringify({ summary: derivedMarker })]);
    await admin.query('INSERT INTO study_artifact_sources(workspace_id,artifact_id,document_version_id,chunk_id) VALUES($1,$2,$3,$4)', [workspace, artifact, version, chunk]);
    studentHttp = new TestClient(runtime.baseUrl);
    expect((await studentHttp.json('/auth/login', 'POST', { email: `${student}@example.test`, password })).status).toBe(200);
  });

  afterAll(async () => {
    await Promise.all([db?.end(), admin?.end()]);
    await runtime?.stop();
  });

  it('somente documento acadêmico liberado chega ao aluno; autor vê os privados', async () => {
    expect((await asActor(student, 'SELECT id FROM documents ORDER BY id')).rows.map(row => row.id)).toEqual([document]);
    expect((await asActor(student, 'SELECT id FROM document_versions')).rows).toHaveLength(1);
    expect((await asActor(student, 'SELECT content FROM document_chunks')).rows).toEqual([{ content: 'Glicólise produz piruvato.' }]);
    expect((await asActor(outsider, 'SELECT id FROM documents')).rows).toHaveLength(0);
    expect((await asActor(teacher, 'SELECT id FROM documents')).rows).toHaveLength(2);
  });

  it('finalizar prova não libera questões e gabarito ao aluno', async () => {
    for (const table of ['assessments', 'assessment_questions', 'assessment_answers']) {
      expect((await asActor(student, `SELECT * FROM ${table}`)).rows).toHaveLength(0);
    }
    expect((await asActor(teacher, 'SELECT expected_answer FROM assessment_answers')).rows).toEqual([{ expected_answer: marker }]);
  });

  it('entrega artefato derivado enquanto todas as fontes estão autorizadas', async () => {
    const response = await studentHttp.request(`/study/artifacts/${artifact}`);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain(derivedMarker);
  });

  it('aluno não pode alterar ou apagar a fonte liberada em nenhuma camada', async () => {
    for (const [table, id] of [['documents', document], ['document_versions', version], ['document_pages', page], ['document_chunks', chunk]]) {
      const deleted = await asActor(student, `DELETE FROM ${table} WHERE id=$1 RETURNING id`, [id]);
      expect(deleted.rowCount).toBe(0);
    }
    const altered = await asActor(student, 'UPDATE document_chunks SET content=$1 WHERE id=$2 RETURNING id', [marker, chunk]);
    expect(altered.rowCount).toBe(0);
    expect((await asActor(teacher, 'SELECT content FROM document_chunks WHERE id=$1', [chunk])).rows[0].content).toBe('Glicólise produz piruvato.');
  });

  it('revogação fecha documento, versão, página e chunk imediatamente', async () => {
    await admin.query('UPDATE material_class_releases SET revoked_at=now() WHERE material_id=$1', [material]);
    for (const table of ['documents', 'document_versions', 'document_pages', 'document_chunks']) {
      expect((await asActor(student, `SELECT * FROM ${table}`)).rows).toHaveLength(0);
    }
    expect((await asActor(teacher, 'SELECT id FROM document_chunks')).rows).toHaveLength(1);
    const artifactResponse = await studentHttp.request(`/study/artifacts/${artifact}`);
    expect(artifactResponse.status).toBe(404);
    expect(JSON.stringify(artifactResponse.body)).not.toContain(derivedMarker);
  });

  it('exportação de privacidade não contorna revogação de fontes', async () => {
    const request = await studentHttp.json<{ id: string; state: string }>('/me/privacy-requests', 'POST', { type: 'EXPORT', password });
    expect(request.status).toBe(202);
    expect(request.body.state).toBe('COMPLETED');
    const download = await studentHttp.request(`/me/privacy-requests/${request.body.id}/export`);
    expect(download.status).toBe(200);
    expect(JSON.stringify(download.body)).not.toContain(derivedMarker);
    expect(JSON.stringify(download.body)).not.toContain(marker);
    expect(JSON.stringify(download.body)).not.toContain('ciphertext');
  });

  it('purge invalida conteúdo derivado antes de apagar a proveniência', async () => {
    await asActor(teacher, 'SELECT public.invalidate_document_intelligence($1)', [document]);
    await admin.query('DELETE FROM documents WHERE id=$1', [document]);
    expect((await asActor(student, 'SELECT id FROM study_artifact_sources WHERE artifact_id=$1', [artifact])).rows).toHaveLength(0);
    const response = await studentHttp.request(`/study/artifacts/${artifact}`);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(derivedMarker);
  });
});
