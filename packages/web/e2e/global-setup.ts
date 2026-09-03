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
  // addInitScript (em vez de page.evaluate pós-goto): o boot do app (splash → redirect
  // de rota) destrói o execution context durante o evaluate — corrida clássica. Com o
  // init script os itens já existem ANTES de qualquer script da página rodar.
  await page.addInitScript((ctx) => {
    localStorage.setItem('token', ctx.token);
    if (ctx.patientId) { localStorage.setItem('patientId', ctx.patientId); localStorage.setItem('selPatientId', ctx.patientId); }
    localStorage.setItem('user', JSON.stringify(ctx.user));
  }, { token, patientId, user });
  await page.goto('http://localhost:4011/');
  await page.waitForTimeout(1200);
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
