import { test, expect, type Cookie } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { qaAccounts } from '../support/qa-accounts';

let accountName = 'Docente QA Regressões';
const accountPassword = 'Teste-local-Seguro!42';
let accountCookies: Cookie[];

// Share only authentication: each case exercises its own unrelated resource.
// This keeps the complete suite within the production registration IP limit.
test.beforeAll(async ({ browser }, testInfo) => {
  const existing = qaAccounts.get(testInfo.project.name);
  if (existing) {
    accountName = existing.name;
    accountCookies = existing.cookies;
    return;
  }
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  try {
    const page = await context.newPage();
    await page.goto('/cadastro');
    await page.locator('input[name="name"]').fill(accountName);
    await page.locator('input[name="email"]').fill(`qa-regressions-${testInfo.project.name}-${Date.now()}@example.test`);
    await page.locator('input[name="password"]').fill(accountPassword);
    await page.getByText('Como docente', { exact: true }).click();
    await page.getByRole('button', { name: 'Criar meu espaço' }).click();
    await expect(page).toHaveURL(/\/app$/);
    accountCookies = await context.cookies();
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(accountCookies);
});

test('criar e editar disciplina e turma usa modais sem falso erro após sucesso', async ({ page }, testInfo) => {
  const identity = `${testInfo.project.name}-${Date.now()}`;
  const courseTitle = `Disciplina QA ${identity}`;
  const updatedTitle = `${courseTitle} atualizada`;
  const className = `Turma QA ${identity}`;
  const nativeDialogs: string[] = [];
  page.on('dialog', async dialog => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });

  await page.goto('/app/disciplinas');
  const createButton = page.getByRole('button', { name: 'Nova disciplina', exact: true });
  await createButton.click();
  const createDialog = page.getByRole('dialog', { name: 'Criar disciplina', exact: true });
  await expect(createDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(createDialog).toBeHidden();
  await expect(createButton).toBeFocused();
  await createButton.click();
  await createDialog.locator('input[name="title"]').fill(courseTitle);
  await page.screenshot({ path: testInfo.outputPath('course-create-modal.png') });
  await createDialog.getByRole('button', { name: 'Criar disciplina', exact: true }).click();
  await expect(createDialog).toBeHidden();
  await expect(page.getByText('Disciplina criada no seu espaço.', { exact: true })).toBeVisible();
  await page.getByRole('link').filter({ hasText: courseTitle }).click();
  await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Editar disciplina', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar disciplina', exact: true });
  await expect(editDialog).toBeVisible();
  await editDialog.locator('input[name="title"]').fill(updatedTitle);
  await editDialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Criar turma', exact: true }).click();
  const classDialog = page.getByRole('dialog', { name: 'Criar turma', exact: true });
  await classDialog.locator('input[name="name"]').fill(className);
  await classDialog.getByRole('button', { name: 'Criar turma', exact: true }).click();
  await expect(classDialog).toBeHidden();
  await expect(page.getByText('Turma criada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link').filter({ hasText: className })).toBeVisible();
  await expect(page.locator('.notice-error')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link').filter({ hasText: className })).toBeVisible();

  await page.getByRole('button', { name: 'Editar disciplina', exact: true }).click();
  await editDialog.getByRole('button', { name: 'Arquivar disciplina', exact: true }).click();
  const archiveDialog = page.getByRole('dialog', { name: 'Arquivar disciplina', exact: true });
  await expect(archiveDialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('archive-confirm-modal.png') });
  await archiveDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(archiveDialog).toBeHidden();
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByRole('button', { name: 'Arquivar disciplina', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.content-column')).not.toHaveAttribute('inert');
  await expect.poll(() => page.locator('.main-content').evaluate(element => Boolean(element.closest('[inert]')))).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

  // Confirming from inside an edit modal can unmount both layers at once.
  await page.getByRole('button', { name: 'Editar disciplina', exact: true }).click();
  await editDialog.getByRole('button', { name: 'Arquivar disciplina', exact: true }).click();
  await archiveDialog.getByRole('button', { name: 'Arquivar disciplina', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.locator('.main-content').evaluate(element => Boolean(element.closest('[inert]')))).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.getByRole('button', { name: 'Editar disciplina', exact: true }).click();
  await expect(editDialog).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  expect(nativeDialogs).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('course-class-modals.png'), fullPage: true });
});

test('exportação pessoal mostra um resultado, limpa senha e cabe no mobile', async ({ page }, testInfo) => {
  const password = accountPassword;
  const name = accountName;
  await page.goto('/app/configuracoes/privacidade');

  const exportPanel = page.locator('section.panel').filter({
    has: page.getByRole('heading', { name: 'Exportar dados', exact: true }),
  });
  const passwordField = exportPanel.locator('input[name="password"]');
  await passwordField.fill(password);
  await exportPanel.getByRole('button', { name: 'Solicitar exportação', exact: true }).click();
  await expect(page.getByText(/Pedido de exportação registrado/)).toBeVisible();
  await expect(passwordField).toHaveValue('');
  await expect(page.locator('.notice-error')).toHaveCount(0);
  const downloadLink = page.getByRole('link', { name: 'Baixar cópia', exact: true });
  await expect(downloadLink).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const file = await download.path();
  expect(file).not.toBeNull();
  const payload = await readFile(file!, 'utf8');
  expect(() => JSON.parse(payload)).not.toThrow();
  expect(payload).toContain(name);
  expect(payload).not.toContain(password);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('privacy-export-mobile.png'), fullPage: true });
});
