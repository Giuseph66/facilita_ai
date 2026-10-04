import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient } from '../support/http';
import { pdfFixture, pptxFixture } from '../support/fixtures';
import { startRuntime, type IntegrationRuntime } from '../support/runtime.mts';

type Session = { user: { id: string }; workspaces: { id: string }[] };
type Job = { id: string; state: string; createdAt?: string; result?: Record<string, unknown>; errorCode?: string };
type Material = { id: string; revision: number; title: string };
type Document = { id: string; materialId: string; courseId: string | null; status: string; activeVersionId: string | null };
type Source = { documentId: string; documentName: string; pageNumber: number };
type Assessment = {
  id: string; state: string; revision: number;
  questions: { id: string; type: string; options: { id: string; text: string }[] }[];
};
type PracticeTest = {
  id: string; questions: { id: string; options: { id: string; text: string }[] }[];
};
type Blueprint = {
  id: string; classId: string; courseId: string; revision: number; state: string; difficulty: string;
  objectives: unknown[]; topics: Array<{ courseTopicId: string; title: string; position: number; competencyCode: string }>;
  publishedAt: string | null;
};

const password = 'Teste-local-Seguro!42';
const timeoutMs = 120_000;

describe('jornada integrada de documentos, RAG e avaliações', () => {
  let runtime: IntegrationRuntime;
  let teacher: TestClient;
  let student: TestClient;
  let studentPeer: TestClient;
  let studentId: string;
  let teacherId: string;
  let teacherWorkspaceId: string;
  let courseId: string;
  let classId: string;
  let pdfMaterial: Material;
  let pptxMaterial: Material;
  let pdfDocument: Document;
  let pptxDocument: Document;
  let conversationId: string;
  let artifactId: string;
  let derivedArtifactIds: string[];
  let practiceTestId: string;
  let assessmentId: string;
  let publishedBlueprint: Blueprint;
  const privateSentinel = 'CONTEUDO_RESERVADO_AO_PROFESSOR_74B';

  async function waitForJob(client: TestClient, jobId: string): Promise<Job> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const response = await client.request<{ job: Job }>(`/jobs/${jobId}`);
      expect(response.status).toBe(200);
      const job = response.body.job;
      expect(job).toBeDefined();
      if (job.state === 'FAILED' || job.state === 'CANCELLED') {
        throw new Error(`Job ${jobId} terminou em ${job.state} (${job.errorCode ?? 'sem código'}).`);
      }
      if (job.state === 'SUCCEEDED') return job;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Job ${jobId} não terminou no prazo.`);
  }

  async function upload(
    materialId: string,
    filename: string,
    mimeType: string,
    bytes: Buffer,
  ): Promise<Document> {
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(bytes)], { type: mimeType }), filename);
    const response = await teacher.request<{ document: Document; job: Job }>(`/materials/${materialId}/documents`, {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: form,
    });
    expect(response.status).toBe(202);
    expect(response.body.document.status).toBe('QUEUED');
    await waitForJob(teacher, response.body.job.id);
    const ready = await teacher.request<{ document: Document }>(`/documents/${response.body.document.id}`);
    expect(ready.status).toBe(200);
    expect(ready.body.document.status).toBe('READY');
    expect(ready.body.document.activeVersionId).toBeTypeOf('string');
    return ready.body.document;
  }

  beforeAll(async () => {
    runtime = await startRuntime(true);
    teacher = new TestClient(runtime.baseUrl);
    student = new TestClient(runtime.baseUrl);
    studentPeer = new TestClient(runtime.baseUrl);

    const register = async (client: TestClient, persona: 'TEACHER' | 'STUDENT'): Promise<Session> => {
      const response = await client.json<Session>('/auth/register', 'POST', {
        name: persona === 'TEACHER' ? 'Professora Integração' : 'Estudante Integração',
        email: `${persona.toLowerCase()}-${randomUUID()}@example.test`, password, persona,
      });
      expect(response.status).toBe(201);
      return response.body;
    };

    const teacherSession = await register(teacher, 'TEACHER');
    const studentSession = await register(student, 'STUDENT');
    const studentPeerSession = await register(studentPeer, 'STUDENT');
    studentId = studentSession.user.id;
    teacherId = teacherSession.user.id;
    teacherWorkspaceId = teacherSession.workspaces[0].id;
    expect((await teacher.request('/ai/preferences')).body).toEqual({ mode: 'BYOK', preferredModel: null });
    expect((await teacher.json('/ai/preferences', 'PUT', { mode: 'BYOK', preferredModel: 'fake-e5-chat-alt' })).status).toBe(200);
    expect((await teacher.request('/ai/preferences')).body).toMatchObject({ mode: 'BYOK', preferredModel: 'fake-e5-chat-alt' });
    const admin = new Client({ connectionString: runtime.migrationUrl });
    await admin.connect();
    try {
      await admin.query(`UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='BYOK')
        WHERE account_id IN (SELECT id FROM billing_accounts WHERE owner_user_id = ANY($1::uuid[]))`,
      [[teacherSession.user.id, studentSession.user.id, studentPeerSession.user.id]]);
    } finally {
      await admin.end();
    }
    const createdCourse = await teacher.json<{ id: string }>(`/workspaces/${teacherSession.workspaces[0].id}/courses`, 'POST', {
      title: 'Metabolismo e energia',
      topics: ['Glicólise', 'Fotossíntese'],
      objectives: ['Relacionar etapas metabólicas às fontes de energia.'],
    });
    expect(createdCourse.status).toBe(201);
    courseId = createdCourse.body.id;
    const course = await teacher.request<{ topicItems: Array<{ id: string; title: string; position: number }>; objectives: unknown[] }>(`/courses/${courseId}`);
    expect(course.status).toBe(200);
    expect(course.body.topicItems.length).toBeGreaterThan(0);

    const createdClass = await teacher.json<{ id: string }>(`/courses/${courseId}/classes`, 'POST', { name: 'Turma de integração', period: '2026' });
    expect(createdClass.status, JSON.stringify(createdClass.body)).toBe(201);
    classId = createdClass.body.id;
    const invitation = await teacher.json<{ inviteCode: string }>(`/classes/${classId}/invitations`, 'POST', { expiresInHours: 1, maxUses: 2 });
    expect(invitation.status, JSON.stringify(invitation.body)).toBe(201);
    expect((await student.json('/enrollments', 'POST', { code: invitation.body.inviteCode })).status).toBe(201);
    expect((await studentPeer.json('/enrollments', 'POST', { code: invitation.body.inviteCode })).status).toBe(201);

    const blueprintPath = `/classes/${classId}/study-blueprint`;
    const blueprintDraft = await teacher.json<{ blueprint: Blueprint }>(blueprintPath, 'PUT', {
      difficulty: 'MIXED',
      topics: course.body.topicItems.map(topic => ({ courseTopicId: topic.id, competencyCode: null })),
    });
    expect(blueprintDraft.status).toBe(200);
    expect(blueprintDraft.body.blueprint.state).toBe('DRAFT');
    const publication = await teacher.json<{ blueprint: Blueprint }>(`${blueprintPath}/publications`, 'POST', {
      revision: blueprintDraft.body.blueprint.revision,
    });
    expect(publication.status).toBe(201);
    expect(publication.body.blueprint.state).toBe('PUBLISHED');
    publishedBlueprint = publication.body.blueprint;
    const studentBlueprints = await Promise.all([
      student.request<{ blueprint: Blueprint }>(blueprintPath),
      studentPeer.request<{ blueprint: Blueprint }>(blueprintPath),
    ]);
    expect(studentBlueprints.map(response => response.status)).toEqual([200, 200]);
    expect(studentBlueprints[0].body.blueprint).toEqual(publishedBlueprint);
    expect(studentBlueprints[1].body.blueprint).toEqual(publishedBlueprint);

    const pdf = await teacher.json<Material>(`/courses/${courseId}/materials`, 'POST', {
      title: 'Apostila de glicólise', kind: 'PDF', classification: 'ACADEMIC',
    });
    const pptx = await teacher.json<Material>(`/courses/${courseId}/materials`, 'POST', {
      title: 'Slides de fotossíntese', kind: 'PPTX', classification: 'ACADEMIC',
    });
    expect(pdf.status).toBe(201);
    expect(pptx.status).toBe(201);
    pdfMaterial = pdf.body;
    pptxMaterial = pptx.body;

    const secret = await teacher.json<Material>(`/courses/${courseId}/materials`, 'POST', {
      title: 'Notas privadas da docente', kind: 'PDF', classification: 'TEACHER_SECRET',
    });
    expect(secret.status).toBe(201);
    await upload(secret.body.id, 'notas-privadas.pdf', 'application/pdf', pdfFixture(`Anotação confidencial: ${privateSentinel}.`));
    pdfDocument = await upload(pdfMaterial.id, 'glicolise.pdf', 'application/pdf', pdfFixture('Glicólise: a glicose é convertida em piruvato com produção de ATP.'));
    pptxDocument = await upload(pptxMaterial.id, 'fotossintese.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      pptxFixture('Fotossíntese: energia luminosa permite a produção de glicose.'));

    expect((await teacher.json(`/materials/${pdfMaterial.id}/classes/${classId}`, 'PUT', { revision: pdfMaterial.revision })).status).toBe(200);
    expect((await teacher.json(`/materials/${pptxMaterial.id}/classes/${classId}`, 'PUT', { revision: pptxMaterial.revision })).status).toBe(200);
    const studentPdf = await student.request<{ document: Document }>(`/documents/${pdfDocument.id}`);
    expect(studentPdf.status).toBe(200);
    expect(studentPdf.body.document).toMatchObject({ materialId: pdfMaterial.id, courseId });
    const studentPptx = await student.request<{ document: Document }>(`/documents/${pptxDocument.id}`);
    expect(studentPptx.status).toBe(200);
    expect(studentPptx.body.document).toMatchObject({ materialId: pptxMaterial.id, courseId });
    expect((await student.request(`/documents/${secret.body.id}`)).status).toBe(404);
  }, timeoutMs);

  afterAll(async () => { await runtime?.stop(); }, timeoutMs);

  it('PDF permite prévia somente na mesma origem e mantém autorização e download PPTX', async () => {
    const pdf = await student.request(`/documents/${pdfDocument.id}/content`);
    expect(pdf.status).toBe(200);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
    expect(pdf.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(pdf.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(pdf.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect(pdf.headers.get('cache-control')).toBe('private, no-store');
    expect(pdf.headers.get('x-content-type-options')).toBe('nosniff');
    const pptx = await teacher.request(`/documents/${pptxDocument.id}/content`);
    expect(pptx.status).toBe(200);
    expect(pptx.headers.get('content-disposition')).toMatch(/^attachment;/);
    const anonymous = new TestClient(runtime.baseUrl);
    expect((await anonymous.request(`/documents/${pdfDocument.id}/content`)).status).toBe(401);
  });

  it('health observa o worker e a idade agregada da fila sem expor job ou ator', async () => {
    const admin = new Client({ connectionString: runtime.migrationUrl });
    await admin.connect();
    let jobId = '';
    try {
      const inserted = await admin.query<{ id: string }>(
        `INSERT INTO jobs (workspace_id, actor_id, feature, resource_type, payload, payload_hash, created_at)
         VALUES ($1, $2, 'HEALTH_PROBE', 'HEALTH', '{}'::jsonb, $3, now() - interval '30 seconds') RETURNING id`,
        [teacherWorkspaceId, teacherId, 'd'.repeat(64)],
      );
      jobId = inserted.rows[0].id;
    } finally { await admin.end(); }
    const healthResponse = await fetch(`${runtime.baseUrl}/health`);
    const health = {
      status: healthResponse.status,
      body: await healthResponse.json() as {
      status: string; worker: { status: string; activeCount: number | null };
      queue: { queuedCount: number; oldestQueuedAgeSeconds: number | null };
      },
    };
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ready');
    expect(health.body.worker).toMatchObject({ status: 'active', activeCount: 1 });
    expect(health.body.queue.queuedCount).toBe(1);
    expect(health.body.queue.oldestQueuedAgeSeconds).toBeGreaterThanOrEqual(29);
    expect(JSON.stringify(health.body)).not.toContain(jobId);
    expect(JSON.stringify(health.body)).not.toContain('HEALTH_PROBE');
  });

  it('processa originais, responde com citações, gera materiais e avalia sem expor gabaritos antes do envio', async () => {
    const conversation = await student.json<{ conversation: { id: string } }>('/conversations', 'POST', {
      kind: 'STUDENT_TUTOR', courseId, documentIds: [],
    });
    expect(conversation.status).toBe(201);
    conversationId = conversation.body.conversation.id;
    const message = await student.json<{ job: Job }>(`/conversations/${conversationId}/messages`, 'POST', {
      content: 'Explique como a glicólise produz piruvato e ATP.', clientMessageId: randomUUID(),
    });
    expect(message.status).toBe(202);
    expect(message.body.job.createdAt).toBeTypeOf('string');
    await waitForJob(student, message.body.job.id);
    const conversations = await student.request<{ items: Array<{ id: string; title: string }> }>('/conversations');
    expect(conversations.body.items.find(item => item.id === conversationId)?.title)
      .toBe('Explique como a glicólise produz piruvato e ATP.');
    const titledConversation = await student.json<{ conversation: { title: string } }>('/conversations', 'POST', {
      kind: 'STUDENT_TUTOR', title: 'Revisão de metabolismo', courseId, documentIds: [],
    });
    expect(titledConversation.status).toBe(201);
    expect(titledConversation.body.conversation.title).toBe('Revisão de metabolismo');
    const history = await student.request<{ items: Array<{ role: string; content: string; sources?: Source[] }> }>(`/conversations/${conversationId}/messages`);
    expect(history.status).toBe(200);
    const assistantMessage = history.body.items.find(item => item.role === 'ASSISTANT');
    expect(assistantMessage?.content).toBeTruthy();
    expect(assistantMessage?.sources?.length).toBeGreaterThan(0);
    expect(assistantMessage?.sources?.every(source => [pdfDocument.id, pptxDocument.id].includes(source.documentId))).toBe(true);
    expect(JSON.stringify(history.body)).not.toContain(privateSentinel);

    const summaryJob = await student.json<{ job: Job }>('/study/artifacts', 'POST', {
      kind: 'SUMMARY', courseId, documentIds: [pdfDocument.id, pptxDocument.id],
    });
    expect(summaryJob.status).toBe(202);
    const summaryResult = await waitForJob(student, summaryJob.body.job.id);
    expect(summaryResult.result?.artifactId).toBeTypeOf('string');
    artifactId = String(summaryResult.result!.artifactId);
    const summary = await student.request<{ artifact: { payload: unknown; sources: Source[] } }>(`/study/artifacts/${artifactId}`);
    expect(summary.status).toBe(200);
    expect(summary.body.artifact.sources.map(source => source.documentId)).toEqual(expect.arrayContaining([pdfDocument.id, pptxDocument.id]));
    expect(summary.body.artifact.payload).toHaveProperty('sections.0.sources.0.pageNumber', 1);
    const sectionSource = (summary.body.artifact.payload as { sections: Array<{ sources: Source[] }> }).sections[0].sources[0];
    expect([pdfDocument.id, pptxDocument.id]).toContain(sectionSource.documentId);
    expect(summary.body.artifact.payload).not.toHaveProperty('sections.0.sourceIds');
    expect(JSON.stringify(summary.body)).not.toContain(privateSentinel);

    derivedArtifactIds = [];
    for (const [kind, payloadKey] of [
      ['FLASHCARDS', 'cards'],
      ['STUDY_PLAN', 'days'],
      ['REVIEW', 'items'],
      ['SIMILAR_EXERCISES', 'exercises'],
    ] as const) {
      const queued = await student.json<{ job: Job }>('/study/artifacts', 'POST', {
        kind, courseId, documentIds: [pdfDocument.id, pptxDocument.id],
      });
      expect(queued.status).toBe(202);
      const completed = await waitForJob(student, queued.body.job.id);
      expect(completed.result?.artifactId).toBeTypeOf('string');
      const created = await student.request<{ artifact: { payload: Record<string, unknown>; sources: Source[] } }>(
        `/study/artifacts/${completed.result!.artifactId}`,
      );
      expect(created.status).toBe(200);
      expect(Array.isArray(created.body.artifact.payload[payloadKey])).toBe(true);
      expect(created.body.artifact.sources).toHaveLength(2);
      expect(JSON.stringify(created.body)).not.toContain(privateSentinel);
      derivedArtifactIds.push(String(completed.result!.artifactId));
    }

    const practiceJob = await student.json<{ job: Job }>('/study/artifacts', 'POST', {
      kind: 'PRACTICE_TEST', courseId, documentIds: [pdfDocument.id, pptxDocument.id], configuration: { questionCount: 10 },
    });
    expect(practiceJob.status).toBe(202);
    const practiceResult = await waitForJob(student, practiceJob.body.job.id);
    expect(practiceResult.result?.artifactId).toBeTypeOf('string');
    expect(practiceResult.result?.practiceTestId).toBeTypeOf('string');
    practiceTestId = String(practiceResult.result!.practiceTestId);
    const practice = await student.request<{ practiceTest: PracticeTest }>(`/practice-tests/${practiceTestId}`);
    expect(practice.status).toBe(200);
    expect(practice.body.practiceTest.questions).toHaveLength(10);
    expect(JSON.stringify(practice.body)).not.toContain('correctOptionId');
    expect(JSON.stringify(practice.body)).not.toContain('explanation');

    const attemptResponse = await student.request<{ attempt: { id: string; questions: PracticeTest['questions'] } }>(`/practice-tests/${practiceTestId}/attempts`, { method: 'POST' });
    expect(attemptResponse.status).toBe(201);
    expect(JSON.stringify(attemptResponse.body)).not.toContain('correctOptionId');
    const submission = await student.json<{ attempt: { state: string; score: number; feedback: Array<{ topicId: string; topicTitle: string }> } }>(
      `/practice-attempts/${attemptResponse.body.attempt.id}/submission`, 'POST', {
        answers: attemptResponse.body.attempt.questions.map(question => ({ questionId: question.id, optionId: question.options[0].id })),
      },
    );
    expect(submission.status).toBe(200);
    expect(submission.body.attempt.state).toBe('SUBMITTED');
    expect(submission.body.attempt.score).toBe(100);
    expect(submission.body.attempt.feedback[0]?.topicTitle).toBe('Glicólise');

    const draft = await teacher.json<{ assessment: Assessment }>(`/courses/${courseId}/assessments`, 'POST', {
      title: 'Avaliação de integração', kind: 'EXAM', classId,
    });
    expect(draft.status).toBe(201);
    assessmentId = draft.body.assessment.id;
    const generation = await teacher.json<{ job: Job }>(`/assessments/${assessmentId}/generations`, 'POST', {
      revision: draft.body.assessment.revision,
      totalQuestions: 10,
      difficulty: 'MIXED',
      distribution: { MULTIPLE_CHOICE: 6, SHORT_ANSWER: 2, ESSAY: 2 },
      documentIds: [pdfDocument.id, pptxDocument.id],
    });
    expect(generation.status).toBe(202);
    const generated = await waitForJob(teacher, generation.body.job.id);
    expect(generated.result?.questionCount).toBe(10);
    const privateAssessment = await teacher.request<{ assessment: Assessment }>(`/assessments/${assessmentId}`);
    expect(privateAssessment.status).toBe(200);
    expect(privateAssessment.body.assessment.questions).toHaveLength(10);
    expect(privateAssessment.body.assessment.questions.filter(question => question.type === 'MULTIPLE_CHOICE')).toHaveLength(6);
    expect(privateAssessment.body.assessment.questions.filter(question => question.type !== 'MULTIPLE_CHOICE')).toHaveLength(4);
    const ready = await teacher.json<{ assessment: Assessment }>(`/assessments/${assessmentId}`, 'PATCH', {
      revision: privateAssessment.body.assessment.revision, state: 'READY',
    });
    expect(ready.status).toBe(200);
    expect(ready.body.assessment.state).toBe('READY');
    expect((await student.request(`/assessments/${assessmentId}`)).status).toBe(404);
    const blueprintsAfterAssessment = await Promise.all([
      student.request<{ blueprint: Blueprint }>(`/classes/${classId}/study-blueprint`),
      studentPeer.request<{ blueprint: Blueprint }>(`/classes/${classId}/study-blueprint`),
    ]);
    expect(blueprintsAfterAssessment.map(response => response.status)).toEqual([200, 200]);
    expect(blueprintsAfterAssessment[0].body.blueprint).toEqual(publishedBlueprint);
    expect(blueprintsAfterAssessment[1].body.blueprint).toEqual(publishedBlueprint);

    const studentRequests = (await runtime.readAIRequests()).filter(request => request.actorId === studentId);
    expect(studentRequests.length).toBeGreaterThan(0);
    expect(JSON.stringify(studentRequests)).not.toContain(privateSentinel);

    expect((await teacher.request(`/materials/${pdfMaterial.id}/classes/${classId}`, { method: 'DELETE' })).status).toBe(204);
    expect((await student.request(`/documents/${pdfDocument.id}`)).status).toBe(404);
    expect((await student.request(`/study/artifacts/${artifactId}`)).status).toBe(404);
    for (const derivedId of derivedArtifactIds) expect((await student.request(`/study/artifacts/${derivedId}`)).status).toBe(404);
    expect((await student.request(`/practice-tests/${practiceTestId}`)).status).toBe(404);
    const revokedHistory = await student.request(`/conversations/${conversationId}/messages`);
    expect(revokedHistory.status).toBe(404);
    const blueprintAfterRevocation = await Promise.all([
      student.request<{ blueprint: Blueprint }>(`/classes/${classId}/study-blueprint`),
      studentPeer.request<{ blueprint: Blueprint }>(`/classes/${classId}/study-blueprint`),
    ]);
    expect(blueprintAfterRevocation.map(response => response.status)).toEqual([200, 200]);
    expect(blueprintAfterRevocation[0].body.blueprint).toEqual(publishedBlueprint);
    expect(blueprintAfterRevocation[1].body.blueprint).toEqual(publishedBlueprint);
  }, timeoutMs);
});
