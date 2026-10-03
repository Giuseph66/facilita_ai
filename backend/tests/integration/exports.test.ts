import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient } from '../support/http';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

type Session = { user: { id: string }; workspaces: { id: string }[] };
type ExportView = { id: string; status: string; downloadUrl?: string };
type JobResponse = { job: { id: string; state: string; result?: { exportId?: string }; errorCode?: string } };
type AssessmentResponse = { assessment: {
  id: string; revision: number; state: string; familyId: string; copiedFromId?: string;
  questions: { id: string; type: string; statement: string; options: { id: string; text: string }[]; answer: { correctOptionId?: string } }[];
} };
const answerMarker = 'RESPOSTA_PRIVADA_NAO_DEVE_APARECER_NAS_QUESTOES';

describe('exportação privada pelo worker', () => {
  let runtime: IntegrationRuntime;
  let admin: Client;
  let teacher: TestClient;
  let outsider: TestClient;
  let assessmentId: string;
  let questionsExport: ExportView;

  async function waitForExport(jobId: string): Promise<ExportView> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const response = await teacher.request<JobResponse>(`/jobs/${jobId}`);
      expect(response.status).toBe(200);
      // JobsController returns {job}; accepting a bare JobView here would hide a contract drift.
      const job = response.body.job;
      expect(job).toBeDefined();
      if (job.state === 'FAILED' || job.state === 'CANCELLED') throw new Error(`Export job failed: ${job.errorCode || job.state}`);
      if (job.state === 'SUCCEEDED') {
        expect(job.result?.exportId).toBeTypeOf('string');
        const metadata = await teacher.request<{ export: ExportView }>(`/exports/${job.result!.exportId}`);
        expect(metadata.status).toBe(200);
        expect(metadata.body.export.status).toBe('READY');
        return metadata.body.export;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Export worker did not finish within the test deadline');
  }

  beforeAll(async () => {
    runtime = await startRuntime(true);
    admin = new Client({ connectionString: runtime.migrationUrl });
    await admin.connect();
    teacher = new TestClient(runtime.baseUrl);
    outsider = new TestClient(runtime.baseUrl);
    const register = async (client: TestClient, persona: string): Promise<Session> => {
      const response = await client.json<Session>('/auth/register', 'POST', {
        name: persona, persona, email: `${randomUUID()}@example.test`, password: 'Teste-local-Seguro!42',
      });
      expect(response.status).toBe(201);
      return response.body;
    };
    const session = await register(teacher, 'TEACHER');
    await register(outsider, 'STUDENT');
    const course = await teacher.json<{ id: string }>(`/workspaces/${session.workspaces[0].id}/courses`, 'POST', {
      title: 'Bioquímica', topics: ['Metabolismo'], objectives: ['Explicar glicólise'],
    });
    expect(course.status).toBe(201);
    assessmentId = randomUUID();
    const questionId = randomUUID();
    await admin.query(
      `INSERT INTO assessments(id,workspace_id,author_user_id,course_id,title,kind,state)
       VALUES($1,$2,$3,$4,'Avaliação de bioquímica','EXAM','READY')`,
      [assessmentId, session.workspaces[0].id, session.user.id, course.body.id],
    );
    await admin.query(
      `INSERT INTO assessment_questions(id,workspace_id,assessment_id,position,type,statement,difficulty,points)
       VALUES($1,$2,$3,1,'SHORT_ANSWER','Qual o produto da glicólise?','MEDIUM',2)`,
      [questionId, session.workspaces[0].id, assessmentId],
    );
    await admin.query('INSERT INTO assessment_answers(workspace_id,question_id,expected_answer) VALUES($1,$2,$3)',
      [session.workspaces[0].id, questionId, answerMarker]);
    const objectiveQuestionId = randomUUID();
    await admin.query(
      `INSERT INTO assessment_questions(id,workspace_id,assessment_id,position,type,statement,options,difficulty,points)
       VALUES($1,$2,$3,2,'MULTIPLE_CHOICE','Escolha a alternativa correta.',$4::jsonb,'MEDIUM',1)`,
      [objectiveQuestionId, session.workspaces[0].id, assessmentId, JSON.stringify([{ id: 'a', text: 'Piruvato' }, { id: 'b', text: 'Nenhum produto' }])],
    );
    await admin.query('INSERT INTO assessment_answers(workspace_id,question_id,correct_option_id) VALUES($1,$2,$3)',
      [session.workspaces[0].id, objectiveQuestionId, 'a']);
  });

  afterAll(async () => { await admin?.end(); await runtime?.stop(); });

  it('retenta o mesmo pedido sem criar outro job, arquivo ou variante', async () => {
    const body = { revision: 1, format: 'PRINT', variant: 'QUESTIONS' };
    const key = randomUUID();
    const request = () => teacher.request<JobResponse>(`/assessments/${assessmentId}/exports`, {
      method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body),
    });
    const [first, second] = await Promise.all([request(), request()]);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.job.id).toBe(first.body.job.id);
    const conflict = await teacher.request(`/assessments/${assessmentId}/exports`, {
      method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ ...body, variant: 'ANSWER_KEY' }),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    questionsExport = await waitForExport(first.body.job.id);
    const count = await admin.query('SELECT count(*)::int AS count FROM exports WHERE assessment_id=$1', [assessmentId]);
    expect(count.rows[0].count).toBe(1);
  });

  it('questões chegam sem resposta, com download privado e HTML escapado', async () => {
    const download = await teacher.request<{ raw: string }>(`/exports/${questionsExport.id}/content`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('text/html');
    expect(download.headers.get('cache-control')).toBe('private, no-store');
    expect(download.headers.get('content-disposition')).toContain('attachment;');
    expect(download.body.raw).toContain('Qual o produto da glicólise?');
    expect(download.body.raw).not.toContain(answerMarker);
    expect(download.body.raw).not.toContain('correctOptionId');
    expect(download.body.raw).not.toContain('<script');
    expect((await outsider.request(`/exports/${questionsExport.id}`)).status).toBe(404);
    expect((await outsider.request(`/exports/${questionsExport.id}/content`)).status).toBe(404);
    expect((await outsider.json(`/assessments/${assessmentId}/exports`, 'POST', { revision: 1, format: 'PRINT', variant: 'ANSWER_KEY' })).status).toBe(404);
  });

  it('gabarito tem seu próprio arquivo e revisão desatualizada falha', async () => {
    const stale = await teacher.json(`/assessments/${assessmentId}/exports`, 'POST', { revision: 2, format: 'PRINT', variant: 'ANSWER_KEY' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('REVISION_CONFLICT');
    const generated = await teacher.json<JobResponse>(`/assessments/${assessmentId}/exports`, 'POST', { revision: 1, format: 'PRINT', variant: 'ANSWER_KEY' });
    expect(generated.status).toBe(202);
    const answerExport = await waitForExport(generated.body.job.id);
    expect(answerExport.id).not.toBe(questionsExport.id);
    const answer = await teacher.request<{ raw: string }>(`/exports/${answerExport.id}/content`);
    expect(answer.status).toBe(200);
    expect(answer.body.raw).toContain(answerMarker);
    expect(answer.headers.get('content-disposition')).toContain('gabarito');
  });

  it('gera PDF pelo worker com texto pesquisável e sem gabarito no arquivo de questões', async () => {
    const generated = await teacher.json<JobResponse>(`/assessments/${assessmentId}/exports`, 'POST', { revision: 1, format: 'PDF', variant: 'QUESTIONS' });
    expect(generated.status).toBe(202);
    const pdf = await waitForExport(generated.body.job.id);
    const download = await teacher.request(`/exports/${pdf.id}/content`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    const buffer = Buffer.from(download.bytes);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await getDocument({ data: download.bytes, useSystemFonts: true }).promise;
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const content = await (await document.getPage(pageNumber)).getTextContent();
        pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      }
    } finally {
      await document.destroy();
    }
    const text = pages.join('\n');
    expect(text).toContain('Qual o produto da glicólise?');
    expect(text).not.toContain(answerMarker);
    expect((await outsider.request(`/exports/${pdf.id}/content`)).status).toBe(404);
  });

  it('prazo vencido bloqueia download mesmo antes da limpeza periódica', async () => {
    await admin.query("UPDATE exports SET expires_at=now()-interval '1 second' WHERE id=$1", [questionsExport.id]);
    const metadata = await teacher.request<{ export: ExportView }>(`/exports/${questionsExport.id}`);
    expect(metadata.status).toBe(200);
    expect(metadata.body.export.status).toBe('EXPIRED');
    expect(metadata.body.export.downloadUrl).toBeUndefined();
    const download = await teacher.request(`/exports/${questionsExport.id}/content`);
    expect(download.status).toBe(410);
    expect(download.body.code).toBe('EXPORT_EXPIRED');
  });

  it('cópia remapeia questões, alternativas e gabarito sem alterar o original', async () => {
    const before = await teacher.request<AssessmentResponse>(`/assessments/${assessmentId}`);
    expect(before.status).toBe(200);
    const blocked = await teacher.json(`/assessments/${assessmentId}/copies`, 'POST', {
      revision: before.body.assessment.revision, title: 'Avaliação · versão B', variantLabel: 'B',
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('CAPABILITY_REQUIRED');
    await admin.query(`UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='TEACHER_PRO')
      WHERE account_id=(SELECT id FROM billing_accounts WHERE owner_user_id=(SELECT author_user_id FROM assessments WHERE id=$1))`, [assessmentId]);
    const copy = await teacher.json<AssessmentResponse>(`/assessments/${assessmentId}/copies`, 'POST', {
      revision: before.body.assessment.revision, title: 'Avaliação · versão B', variantLabel: 'B',
    });
    expect(copy.status).toBe(201);
    expect(copy.body.assessment.id).not.toBe(assessmentId);
    expect(copy.body.assessment.state).toBe('DRAFT');
    expect(copy.body.assessment.familyId).toBe(before.body.assessment.familyId);
    expect(copy.body.assessment.copiedFromId).toBe(assessmentId);
    const originalQuestion = before.body.assessment.questions.find(question => question.type === 'MULTIPLE_CHOICE')!;
    const copiedQuestion = copy.body.assessment.questions.find(question => question.type === 'MULTIPLE_CHOICE')!;
    expect(copiedQuestion.id).not.toBe(originalQuestion.id);
    expect(copiedQuestion.statement).toBe(originalQuestion.statement);
    expect(copiedQuestion.options.map(option => option.text)).toEqual(originalQuestion.options.map(option => option.text));
    const originalIds = new Set(originalQuestion.options.map(option => option.id));
    expect(copiedQuestion.options.some(option => originalIds.has(option.id))).toBe(false);
    expect(copiedQuestion.options.find(option => option.id === copiedQuestion.answer.correctOptionId)?.text).toBe('Piruvato');
    const after = await teacher.request<AssessmentResponse>(`/assessments/${assessmentId}`);
    expect(after.status).toBe(200);
    expect(after.body.assessment).toEqual(before.body.assessment);
  });
});
