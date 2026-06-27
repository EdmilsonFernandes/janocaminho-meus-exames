import { test, expect } from '@playwright/test';

const API = 'http://localhost:4011/api';
const DEV_USER = 'edmilson@exemplo.com';
const DEV_PASS = 'troque123';

/**
 * Projeto "setup": login dev UMA vez via API e persiste storageState (token + paciente +
 * user) p/ todos os projetos de viewport reutilizarem. No web o loginPage é a Landing
 * (vitrine) — login via API evita a dança de redirect do /entrar. Popula localStorage
 * igual ao authProvider. (Arquivo isolado pelo testMatch 'global-setup.ts'.)
 */
test('autenticar dev', async ({ page, request }) => {
  const r = await request.post(`${API}/auth/login`, { data: { username: DEV_USER, password: DEV_PASS } });
  expect(r.ok(), 'login API falhou no setup').toBeTruthy();
  const { token, patientId, user } = await r.json();
  await page.goto('http://localhost:4011/');
  await page.evaluate((ctx) => {
    localStorage.setItem('token', ctx.token);
    if (ctx.patientId) { localStorage.setItem('patientId', ctx.patientId); localStorage.setItem('selPatientId', ctx.patientId); }
    localStorage.setItem('user', JSON.stringify(ctx.user));
  }, { token, patientId, user });
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
