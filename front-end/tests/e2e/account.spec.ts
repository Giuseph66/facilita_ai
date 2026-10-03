import { test, expect } from '@playwright/test';

test('cadastro e sessão persistente sem rolagem horizontal', async ({ page }, testInfo) => {
  const identity = `${testInfo.project.name}-${Date.now()}`;
  await page.goto('/cadastro');
  await page.locator('input[name="name"]').fill('Professora de teste');
  await page.locator('input[name="email"]').fill(`${identity}@example.test`);
  await page.locator('input[name="password"]').fill('Teste-local-Seguro!42');
  await page.locator('input[name="persona-choice"][value="TEACHER"]').check();
  await page.getByRole('button', { name: /criar meu espaço/i }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
  await page.reload();
  await expect(page.getByText('Professora de teste', { exact: false }).filter({ visible: true }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true });
});

test('erro de login informa falha e permite corrigir os campos', async ({ page }) => {
  await page.goto('/entrar');
  await page.locator('input[name="email"]').fill(`ausente-${Date.now()}@example.test`);
  await page.locator('input[name="password"]').fill('Senha-local-Invalida!42');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.locator('.form-alert')).toContainText(/senha|credenciais|email|e-mail/i);
  await expect(page.locator('input[name="email"]')).toBeEnabled();
  await expect(page.getByRole('button', { name: /entrar/i })).toBeEnabled();
});
