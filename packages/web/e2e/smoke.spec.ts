import { test, expect, type Page } from '@playwright/test';

// Rotas migradas no M3 (PageContainer/PageHeader). Smoke de largura: nenhuma rota
// pode ter overflow horizontal nem ficar em branco. Roda em mobile/tablet/desktop.
const ROUTES = [
  '/perfil', '/planos', '/medicos', '/familia', '/conquistas',
  '/tendencias', '/alterados', '/evolucao', '/linha-do-tempo',
  '/lembretes', '/vacinas', '/medicoes', '/despesas', '/emergencia', '/notificacoes',
];

async function dismissOverlays(page: Page) {
  for (const label of ['Pular', 'Depois', 'Agora não']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 500 }); } catch { /* overlay ausente */ }
  }
}

test('Smoke M3 — telas migradas sem overflow horizontal', async ({ page }, info) => {
  test.setTimeout(180_000); // 15 rotas em série precisam de fôlego
  for (const r of ROUTES) {
    await page.goto('/#' + r, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await dismissOverlays(page);
    const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(diff, `overflow horizontal em ${r} (${info.project.name})`).toBeLessThanOrEqual(2);
    if (info.project.name === 'mobile-375') {
      await page.screenshot({ path: `e2e/screenshots/smoke-${r.replace(/\//g, '-')}-${info.project.name}.png`, fullPage: true });
    }
  }
});
