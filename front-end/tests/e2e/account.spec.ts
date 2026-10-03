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
  await page.goto('/app/configuracoes/perfil');
  await expect(page.getByRole('heading', { name: 'Perfil e conta' })).toBeVisible();
  await expect(page.locator('select[name="defaultPersona"]')).toHaveCount(0);
  await expect(page.getByText('Experiência inicial', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Docente|Acadêmico|Estudante)$/ })).toHaveCount(0);
  await page.locator('input[name="name"]').fill('Docente atualizado');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByText('Seu perfil foi atualizado.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="name"]')).toHaveValue('Docente atualizado');
  await expect(page.getByText('Docente', { exact: true }).last()).toBeVisible();

  if (testInfo.project.name === 'mobile') {
    await page.goto('/app/configuracoes/ia');
    const opener = page.getByRole('button', { name: 'Abrir navegação' });
    const drawer = page.getByRole('dialog', { name: 'Navegação principal' });
    await expect(opener).toBeVisible();
    await page.mouse.move(370, 400);
    await page.mouse.wheel(0, 350);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await opener.click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('Selecionar contexto')).toBeVisible();
    await expect(drawer.getByText('Docente', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Docente' })).toHaveCount(0);
    await expect(drawer.locator('.profile-link')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Fechar navegação' })).toBeFocused();
    const contentTop = await page.locator('.content-column').evaluate(element => element.getBoundingClientRect().top);
    await page.mouse.move(380, 400);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.locator('.content-column').evaluate(element => element.getBoundingClientRect().top)).toBe(contentTop);
    await drawer.getByRole('button', { name: 'Sair da conta' }).focus();
    await page.keyboard.press('Tab');
    await expect(drawer.locator('.brand-lockup')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('button', { name: 'Sair da conta' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    await opener.click();
    await expect(drawer).toBeVisible();
    await page.mouse.click(380, 100);
    await expect(drawer).toBeHidden();
    await opener.click();
    await drawer.getByRole('link', { name: 'Disciplinas', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/disciplinas$/);
    await expect(drawer).toBeHidden();
    await opener.click();
    await drawer.getByRole('link', { name: 'Disciplinas', exact: true }).click();
    await expect(drawer).toBeHidden();

    await page.setViewportSize({ width: 320, height: 480 });
    await opener.click();
    await drawer.getByRole('button', { name: 'Sair da conta' }).scrollIntoViewIfNeeded();
    await expect(drawer.getByRole('button', { name: 'Sair da conta' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('drawer-small.png') });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await opener.click();
    await expect(drawer.getByRole('button', { name: 'Fechar navegação' })).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(drawer).toBeHidden();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.content-column')).not.toHaveAttribute('inert');
    expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
  }
});

test('cadastro acadêmico mantém tipo fixo no perfil', async ({ page }, testInfo) => {
  await page.goto('/cadastro');
  await page.locator('input[name="name"]').fill('Acadêmico de teste');
  await page.locator('input[name="email"]').fill(`academico-${testInfo.project.name}-${Date.now()}@example.test`);
  await page.locator('input[name="password"]').fill('Teste-local-Seguro!42');
  await page.getByText('Como acadêmico', { exact: true }).click();
  await page.getByRole('button', { name: /criar meu espaço/i }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
  await page.goto('/app/configuracoes/perfil');
  await expect(page.getByText('Acadêmico', { exact: true }).last()).toBeVisible();
  await expect(page.locator('select[name="defaultPersona"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Docente|Acadêmico|Estudante)$/ })).toHaveCount(0);
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
