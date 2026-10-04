import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const password = 'Teste-local-Seguro!42';
const fixturePath = resolve(process.cwd(), '..', 'testes', 'fixtures', 'fotossintese-qa.pdf');
const operationTimeout = 120_000;

async function register(page: Page, name: string, email: string, persona: 'TEACHER' | 'STUDENT') {
  await page.goto('/cadastro');
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByText(persona === 'TEACHER' ? 'Como docente' : 'Como acadêmico', { exact: true }).click();
  await page.getByRole('button', { name: /criar meu espaço/i }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
}

async function connectFakeKey(page: Page, label: string, identity: string, saveModel: boolean) {
  await page.goto('/app/configuracoes/ia');
  await page.getByRole('button', { name: /Conectar sua primeira chave/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar sua chave Ollama Cloud' });
  await dialog.locator('input').first().fill(label);
  await dialog.getByLabel('Chave da API').fill(`e2e-fake-ollama-key-${identity}`);
  await dialog.getByRole('button', { name: 'Adicionar chave', exact: true }).click();
  await expect(dialog).toBeHidden();

  const keyCard = page.locator('.ai-key').filter({ hasText: label });
  await expect(keyCard.locator('.connection-state')).toHaveText('Verificada', { timeout: operationTimeout });
  await expect(page.getByText(/está funcionando\./)).toBeVisible({ timeout: operationTimeout });

  if (!saveModel) return;
  const model = page.getByRole('combobox', { name: 'Modelo', exact: true });
  await expect(model.locator('option').nth(2)).toBeAttached({ timeout: operationTimeout });
  const modelId = await model.locator('option').nth(2).getAttribute('value');
  expect(modelId).toBe('fake-e5-chat-alt');
  await model.selectOption(modelId!);
  await page.getByRole('button', { name: 'Salvar modelo', exact: true }).click();
  await expect(page.getByText('Modelo salvo para as próximas gerações.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Modelo', exact: true })).toHaveValue(modelId!);
}

async function waitForJob(page: Page, doneLabel: string) {
  const job = page.locator('.job-card').filter({ hasText: doneLabel });
  await expect(job).toContainText('Tudo pronto.', { timeout: operationTimeout });
}

async function createAssessmentDraft(page: Page, courseUrl: string, title: string) {
  await page.goto(courseUrl);
  const viewportWidth = page.viewportSize()!.width;
  await expect(page.getByRole('button', { name: 'Nova avaliação', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
  await page.getByRole('button', { name: 'Nova avaliação', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar avaliação' });
  await dialog.locator('input[name="title"]').fill(title);
  await dialog.locator('select[name="kind"]').selectOption('EXAM');
  await expect.poll(() => dialog.evaluate((element, width) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= width
      && document.documentElement.scrollWidth <= width;
  }, viewportWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Criar rascunho', exact: true }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/app\/avaliacoes\/[^/]+$/);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return page.url();
}

async function addManualQuestion(page: Page, statement: string) {
  await page.getByRole('button', { name: 'Adicionar questão', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar questão' });
  await expect(dialog.locator('input[type="radio"]:checked')).toHaveCount(0);
  await dialog.getByLabel('Enunciado').fill(statement);
  await dialog.getByRole('textbox', { name: 'Alternativa 1', exact: true }).fill('A energia luminosa é convertida em energia química.');
  await dialog.getByRole('textbox', { name: 'Alternativa 2', exact: true }).fill('A planta consome glicose para liberar luz.');
  await dialog.getByRole('button', { name: 'Adicionar questão', exact: true }).click();
  await expect(dialog.getByText('Marque uma alternativa como gabarito.', { exact: true })).toBeVisible();
  await expect(dialog.locator('input[type="radio"]').first()).toBeFocused();
  await dialog.locator('input[type="radio"]').first().check();
  await dialog.getByRole('button', { name: 'Adicionar questão', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar questões', exact: true }).click();
  await expect(page.locator('.question-list .question-editor').filter({ hasText: statement })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mover questão 1 para cima', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mover questão 1 para baixo', exact: true })).toBeDisabled();
}

async function markAssessmentReady(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: 'Marcar pronta para finalizar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar avaliação como pronta?' });
  await dialog.getByRole('button', { name: 'Marcar como pronta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prova · PDF', exact: true })).toBeVisible();
}

async function downloadAssessmentPdf(page: Page, buttonLabel: string, linkLabel: string) {
  await page.getByRole('button', { name: buttonLabel, exact: true }).click();
  const job = page.locator('.job-card').filter({ hasText: 'Arquivo pronto' });
  await expect(job).toContainText('Tudo pronto.', { timeout: operationTimeout });
  await job.getByRole('link', { name: 'Abrir arquivo exportado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arquivo pronto', exact: true })).toBeVisible({ timeout: operationTimeout });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: linkLabel, exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
}

test('jornada de inteligência: conexão, materiais, estudo, avaliações e acesso do aluno', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000);
  const identity = `${testInfo.project.name}-${Date.now()}`;
  const teacherEmail = `e2e-intelligence-${identity}@example.test`;
  const studentEmail = `e2e-learner-${identity}@example.test`;
  const courseTitle = `Fotossíntese QA ${identity}`;
  const className = `Turma de fotossíntese ${identity}`;
  const academicMaterialTitle = `Apostila pública ${identity}`;
  const privateMaterialTitle = `Notas privadas ${identity}`;
  const summaryHeading = 'Resumo';
  const manualAssessmentTitle = `Prova manual ${identity}`;
  const generatedAssessmentTitle = `Prova com IA ${identity}`;
  const manualQuestion = 'Qual é a função da luz na fotossíntese?';
  const projectUse = testInfo.project.use as {
    baseURL?: string;
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    userAgent?: string;
    locale?: string;
  };
  const studentContext = await browser.newContext({
    baseURL: projectUse.baseURL || 'http://127.0.0.1:3100',
    viewport: projectUse.viewport,
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
    userAgent: projectUse.userAgent,
    locale: projectUse.locale,
  });
  const student = await studentContext.newPage();

  try {
    await test.step('Docente cadastra a chave sintética e persiste o modelo', async () => {
      await register(page, 'Docente da jornada E2E', teacherEmail, 'TEACHER');
      const onboarding = page.locator('section.panel').filter({
        has: page.getByRole('heading', { name: 'Primeiros passos', exact: true }),
      });
      await expect(onboarding).toBeVisible({ timeout: operationTimeout });
      await expect(onboarding.locator('.resource-main small')).toHaveCount(4);
      await expect(onboarding.getByText('Concluído', { exact: true })).toHaveCount(0);
      await connectFakeKey(page, 'Chave sintética E2E', identity, true);
    });

    let courseUrl = '';
    let classUrl = '';
    let inviteCode = '';
    await test.step('Docente cria a disciplina, envia os PDFs e publica um roteiro sem código de competência', async () => {
      await page.goto('/app/disciplinas');
      await page.getByRole('button', { name: 'Nova disciplina', exact: true }).click();
      const createCourse = page.getByRole('dialog', { name: 'Criar disciplina' });
      await createCourse.locator('input[name="title"]').fill(courseTitle);
      await createCourse.getByRole('button', { name: 'Criar disciplina', exact: true }).click();
      await expect(page.getByText('Disciplina criada no seu espaço.', { exact: true })).toBeVisible();
      const courseLink = page.getByRole('link').filter({ hasText: courseTitle });
      await expect(courseLink).toBeVisible();
      courseUrl = (await courseLink.getAttribute('href'))!;
      await courseLink.click();

      await page.getByRole('button', { name: 'Editar disciplina', exact: true }).click();
      const editCourse = page.getByRole('dialog', { name: 'Editar disciplina' });
      await editCourse.locator('textarea[name="topics"]').fill('Fotossíntese');
      await editCourse.locator('textarea[name="objectives"]').fill('Relacionar luz, água e gás carbônico à produção de glicose.');
      await editCourse.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
      await expect(page.getByText('Disciplina atualizada.', { exact: true })).toBeVisible();

      const uploadPdf = async (title: string, classification: 'ACADEMIC' | 'TEACHER_SECRET', probeSlowQueue = false) => {
        await page.getByRole('button', { name: 'Adicionar material', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Adicionar material' });
        await dialog.locator('input[name="title"]').fill(title);
        await dialog.locator('input[name="file"]').setInputFiles(fixturePath);
        await dialog.locator('select[name="classification"]').selectOption(classification);
        const createResponsePromise = page.waitForResponse((response) => (
          response.request().method() === 'POST'
          && /\/courses\/[^/]+\/materials$/.test(new URL(response.url()).pathname)
        ), { timeout: 15_000 });
        const uploadResponsePromise = page.waitForResponse((response) => {
          const path = new URL(response.url()).pathname;
          return response.request().method() === 'POST' && /\/materials\/[^/]+\/documents$/.test(path);
        }, { timeout: 15_000 });
        // Handle a missing upload without leaving a rejected promise behind when creation fails.
        void uploadResponsePromise.catch(() => undefined);
        await dialog.getByRole('button', { name: 'Criar e enviar', exact: true }).click();
        expect((await createResponsePromise).status()).toBe(201);
        const uploadResponse = await uploadResponsePromise;
        expect(uploadResponse.status()).toBe(202);
        const uploadPayload = await uploadResponse.json() as { job: { id: string; createdAt: string } };
        expect(new Date(uploadPayload.job.createdAt).toISOString()).toBe(uploadPayload.job.createdAt);
        const jobRoute = `**/api/v1/jobs/${uploadPayload.job.id}`;
        let injectedSlowQueue = false;
        if (probeSlowQueue) {
          await page.route(jobRoute, async (route) => {
            injectedSlowQueue = true;
            const response = await route.fetch();
            const payload = await response.json() as { job: Record<string, unknown> };
            await route.fulfill({
              response,
              body: JSON.stringify({
                ...payload,
                job: {
                  ...payload.job,
                  state: 'QUEUED',
                  createdAt: new Date(Date.now() - 120_000).toISOString(),
                  result: undefined,
                  errorCode: undefined,
                },
              }),
            });
          });
        }
        await expect(dialog).toBeHidden();
        await expect(page.getByText('Material criado como privado.', { exact: false })).toBeVisible();
        if (probeSlowQueue) {
          await expect(page.getByText('A fila está demorando', { exact: true })).toBeVisible({ timeout: 15_000 });
          expect(injectedSlowQueue).toBe(true);
          await page.unroute(jobRoute);
        }
        await waitForJob(page, 'Material processado');
        await page.reload();
        const materialRow = page.locator('.resource-row-stacked').filter({ hasText: title });
        await expect(materialRow.locator('.document-link')).toContainText('fotossintese-qa.pdf');
        const documentLink = materialRow.locator('.document-link');
        await expect(documentLink).toContainText('Pronto para estudar', { timeout: operationTimeout });
        const documentPath = new URL((await documentLink.getAttribute('href'))!, 'http://localhost').pathname;
        const documentId = documentPath.split('/').at(-1)!;
        const documentResponsePromise = page.waitForResponse((response) => (
          response.request().method() === 'GET'
          && new URL(response.url()).pathname === `/api/v1/documents/${documentId}`
        ));
        await documentLink.click();
        const documentPayload = await (await documentResponsePromise).json() as { document?: { status?: string }; status?: string };
        expect((documentPayload.document ?? documentPayload).status?.toUpperCase()).toBe('READY');
        await expect(page.getByText('Pronto para estudar', { exact: true })).toBeVisible();
        await page.goto(courseUrl);
      };

      await uploadPdf(academicMaterialTitle, 'ACADEMIC', true);
      await uploadPdf(privateMaterialTitle, 'TEACHER_SECRET');

      await page.getByRole('button', { name: 'Criar turma', exact: true }).click();
      const createClass = page.getByRole('dialog', { name: 'Criar turma' });
      await createClass.locator('input[name="name"]').fill(className);
      await createClass.locator('input[name="period"]').fill('2026');
      await createClass.getByRole('button', { name: 'Criar turma', exact: true }).click();
      await expect(page.getByText('Turma criada.', { exact: true })).toBeVisible();
      const classLink = page.getByRole('link').filter({ hasText: className });
      await expect(classLink).toBeVisible();
      classUrl = (await classLink.getAttribute('href'))!;
      await classLink.click();

      const blueprintPanel = page.locator('section.panel').filter({
        has: page.getByRole('heading', { name: 'Roteiro de estudo', exact: true }),
      });
      await blueprintPanel.getByRole('button', { name: 'Preparar roteiro', exact: true }).click();
      const blueprintDialog = page.getByRole('dialog', { name: 'Editar roteiro de estudo' });
      await blueprintDialog.getByRole('checkbox').check();
      await expect(blueprintDialog.getByLabel('Código de competência para Fotossíntese')).toHaveValue('');
      await blueprintDialog.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
      await expect(page.getByText('Roteiro salvo como rascunho.', { exact: true })).toBeVisible();
      await blueprintPanel.getByRole('button', { name: 'Publicar roteiro', exact: true }).click();
      const publishDialog = page.getByRole('dialog', { name: 'Publicar roteiro de estudo?' });
      await publishDialog.getByRole('button', { name: 'Publicar roteiro', exact: true }).click();
      await expect(page.getByText('Roteiro publicado para esta turma.', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Criar convite', exact: true }).click();
      const inviteDialog = page.getByRole('dialog', { name: 'Criar convite' });
      await inviteDialog.getByRole('button', { name: 'Criar convite', exact: true }).click();
      await expect(page.getByText('Convite criado. Copie o código agora; ele só aparece nesta tela uma vez.', { exact: true })).toBeVisible();
      inviteCode = (await page.locator('.invite-code').textContent())?.trim() || '';
      expect(inviteCode).not.toBe('');
    });

    await test.step('Aluno entra por convite, encontra a disciplina e só vê os materiais liberados', async () => {
      await register(student, 'Estudante da jornada E2E', studentEmail, 'STUDENT');
      await student.goto('/app/turmas');
      await student.getByRole('button', { name: 'Entrar com convite', exact: true }).click();
      const joinDialog = student.getByRole('dialog', { name: 'Entrar em uma turma' });
      await joinDialog.getByLabel('Código do convite').fill(inviteCode);
      await joinDialog.getByRole('button', { name: 'Entrar na turma', exact: true }).click();
      await expect(joinDialog).toBeHidden();
      await student.reload();
      await expect(student.getByRole('link').filter({ hasText: className })).toBeVisible();
      await student.goto('/app');
      const dashboardClassLink = student.getByRole('link').filter({ hasText: className });
      const dashboardCourseLink = student.getByRole('link').filter({ hasText: courseTitle });
      await expect(dashboardClassLink).toBeVisible();
      await expect(dashboardCourseLink).toBeVisible();
      await student.reload();
      await expect(dashboardClassLink).toBeVisible();
      await expect(dashboardCourseLink).toBeVisible();

      await student.goto('/app/disciplinas');
      const discoveredCourse = student.getByRole('link').filter({ hasText: courseTitle });
      await expect(discoveredCourse).toBeVisible();
      await discoveredCourse.click();
      await expect(student.getByText('Sem materiais por enquanto', { exact: true })).toBeVisible();
      await expect(student.getByText('fotossintese-qa.pdf', { exact: false })).toHaveCount(0);

      await student.goto(classUrl);
      const publishedBlueprint = student.locator('section.panel').filter({
        has: student.getByRole('heading', { name: 'Roteiro de estudo', exact: true }),
      });
      await expect(publishedBlueprint.getByText('Publicado para esta turma', { exact: true })).toBeVisible();
      await expect(publishedBlueprint.getByText('Fotossíntese', { exact: true })).toBeVisible();
      await expect(publishedBlueprint.locator('.blueprint-code')).toHaveCount(0);

      await page.goto(courseUrl);
      const materialRow = page.locator('.resource-row-stacked').filter({ hasText: academicMaterialTitle });
      const releaseForm = materialRow.locator('.release-form');
      await releaseForm.locator('select[name="classId"]').selectOption({ label: className });
      await releaseForm.getByRole('button', { name: 'Liberar', exact: true }).click();
      const releaseDialog = page.getByRole('dialog', { name: 'Liberar material' });
      await releaseDialog.getByRole('button', { name: 'Liberar material', exact: true }).click();
      await expect(page.getByText(`Material liberado para ${className}.`, { exact: true })).toBeVisible();

      await student.goto(courseUrl);
      const releasedRow = student.locator('.resource-row-stacked').filter({ hasText: academicMaterialTitle });
      await expect(releasedRow.locator('.document-link')).toContainText('fotossintese-qa.pdf');
      await expect(student.locator('.resource-row-stacked').filter({ hasText: privateMaterialTitle })).toHaveCount(0);
    });

    await test.step('Docente pergunta com fonte e cria um resumo com referência ao PDF', async () => {
      await page.goto(courseUrl);
      await page.getByRole('button', { name: 'Perguntar à IA', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/conversas\/[^/]+$/);
      await page.getByLabel('Sua pergunta').fill('Como a luz participa da fotossíntese?');
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await waitForJob(page, 'Resposta pronta');
      await expect(page.locator('.message.assistant .message-body').last()).toBeVisible();
      const citations = page.locator('.message-sources');
      await expect(citations).toBeVisible();
      await expect(citations).toContainText(/fotossintese-qa\.pdf|Apostila pública/);

      await page.goto(courseUrl);
      await page.getByRole('button', { name: /Criar resumo/ }).click();
      const summaryJob = page.locator('.job-card').filter({ hasText: 'Material de estudo pronto' });
      await expect(summaryJob).toContainText('Tudo pronto.', { timeout: operationTimeout });
      await summaryJob.getByRole('link', { name: 'Abrir material de estudo', exact: true }).click();
      await expect(page.getByRole('heading', { name: new RegExp(summaryHeading, 'i'), level: 1 })).toBeVisible();
      const artifactSources = page.locator('.artifact-sources');
      await expect(artifactSources).toBeVisible();
      await expect(artifactSources).toContainText(/fotossintese-qa\.pdf|Apostila pública/);
    });

    await test.step('Dashboard marca os primeiros passos como concluídos depois do reload', async () => {
      await page.goto('/app');
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.waitForLoadState('networkidle');
      const onboarding = page.locator('section.panel').filter({
        has: page.getByRole('heading', { name: 'Primeiros passos', exact: true }),
      });
      if (await onboarding.count()) {
        await expect(onboarding.locator('.resource-main small')).toHaveCount(4);
        await expect(onboarding.getByText('Concluído', { exact: true })).toHaveCount(4);
      } else {
        await expect(page.getByRole('heading', { name: 'Primeiros passos', exact: true })).toHaveCount(0);
      }
    });

    let manualAssessmentUrl = '';
    await test.step('Docente cria uma avaliação manual, marca como pronta e baixa prova e gabarito em PDF', async () => {
      manualAssessmentUrl = await createAssessmentDraft(page, courseUrl, manualAssessmentTitle);
      await addManualQuestion(page, manualQuestion);
      await markAssessmentReady(page);
      await downloadAssessmentPdf(page, 'Prova · PDF', 'Baixar prova');
      await page.goto(manualAssessmentUrl);
      await downloadAssessmentPdf(page, 'Gabarito separado · PDF', 'Baixar gabarito separado');
    });

    await test.step('Docente também gera questões de avaliação por IA a partir do material pronto', async () => {
      await createAssessmentDraft(page, courseUrl, generatedAssessmentTitle);
      await page.getByRole('button', { name: 'Configurar geração', exact: true }).click();
      const generator = page.getByRole('dialog', { name: 'Gerar questões a partir de materiais' });
      await generator.locator('label.document-choice').filter({ hasText: academicMaterialTitle }).getByRole('checkbox').check();
      await generator.locator('input[name="totalQuestions"]').fill('2');
      await generator.locator('input[name="multipleChoice"]').fill('2');
      await generator.locator('input[name="shortAnswer"]').fill('0');
      await generator.locator('input[name="essay"]').fill('0');
      await generator.getByRole('button', { name: 'Gerar rascunho', exact: true }).click();
      await waitForJob(page, 'Avaliação gerada');
      const generatedJob = page.locator('.job-card').filter({ hasText: 'Avaliação gerada' });
      await generatedJob.getByRole('link', { name: 'Abrir avaliação', exact: true }).click();
      await expect(page.locator('.question-list .question-editor')).toHaveCount(2, { timeout: operationTimeout });
      await expect(page.getByRole('heading', { name: generatedAssessmentTitle, exact: true })).toBeVisible();
    });

    await test.step('Aluno no plano FREE gera um simulado e não recebe o gabarito antes da entrega', async () => {
      await connectFakeKey(student, 'Chave sintética do aluno', identity, true);
      await student.goto('/app/simulados');
      await student.getByRole('button', { name: 'Novo simulado', exact: true }).click();
      const createPractice = student.getByRole('dialog', { name: 'Criar simulado' });
      await createPractice.getByRole('combobox', { name: 'Disciplina', exact: true }).selectOption({ label: courseTitle });
      const documentChoice = createPractice.locator('label.document-choice').filter({ hasText: 'fotossintese-qa.pdf' });
      await expect(documentChoice).toBeVisible({ timeout: operationTimeout });
      await documentChoice.getByRole('checkbox').check();
      await createPractice.getByRole('button', { name: 'Gerar simulado', exact: true }).click();
      const practiceJob = student.locator('.job-card').filter({ hasText: 'Material de estudo pronto' });
      await expect(practiceJob).toContainText('Tudo pronto.', { timeout: operationTimeout });
      const practiceLink = practiceJob.getByRole('link', { name: 'Abrir simulado', exact: true });
      await expect(practiceLink).toBeVisible();
      const practiceResponsePromise = student.waitForResponse((response) => {
        const path = new URL(response.url()).pathname;
        return response.request().method() === 'GET' && /\/practice-tests\/[^/]+$/.test(path);
      });
      await practiceLink.click();
      const practiceResponse = await practiceResponsePromise;
      expect(practiceResponse.ok()).toBe(true);
      const practicePayload = JSON.stringify(await practiceResponse.json());
      expect(practicePayload).not.toContain('correctOptionId');
      expect(practicePayload).not.toContain('explanation');
      await expect(student.getByText('Responda todas as questões para entregar. Depois, você verá sua pontuação e os comentários por tópico.', { exact: true })).toBeVisible();

      const attemptResponsePromise = student.waitForResponse((response) => {
        const path = new URL(response.url()).pathname;
        return response.request().method() === 'POST' && /\/practice-tests\/[^/]+\/attempts$/.test(path);
      });
      await student.getByRole('button', { name: 'Começar simulado', exact: true }).click();
      const attemptResponse = await attemptResponsePromise;
      expect(attemptResponse.ok()).toBe(true);
      const attemptPayload = JSON.stringify(await attemptResponse.json());
      expect(attemptPayload).not.toContain('correctOptionId');
      await expect(student.getByText('Respostas ocultas', { exact: true })).toBeVisible();
      await expect(student.locator('.practice-question').first()).not.toContainText(/gabarito|resposta correta|explicação/i);
      await expect(student.locator('.result-score')).toHaveCount(0);
      const firstQuestion = student.locator('.practice-question').first();
      await firstQuestion.locator('label.practice-option').first().click();
      await expect(firstQuestion.getByRole('radio').first()).toBeChecked();
      await student.getByRole('button', { name: 'Entregar simulado', exact: true }).click();
      await expect(student.getByText('Responda todas as questões antes de entregar.', { exact: true })).toBeVisible();
      const questions = student.locator('.practice-question');
      await expect(questions.nth(1).getByRole('radio').first()).toBeFocused();
      for (let index = 1; index < await questions.count(); index += 1) {
        await questions.nth(index).locator('label.practice-option').first().click();
      }
      const submissionResponsePromise = student.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/practice-attempts\/[^/]+\/submission$/.test(new URL(response.url()).pathname)
      ), { timeout: 15_000 });
      await student.getByRole('button', { name: 'Entregar simulado', exact: true }).click();
      expect((await submissionResponsePromise).status()).toBe(200);
      await expect(student.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible({ timeout: operationTimeout });
      await expect(student.locator('.result-score')).toBeVisible();
    });
  } finally {
    await studentContext.close();
  }
});
