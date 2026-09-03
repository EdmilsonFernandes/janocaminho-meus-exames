import { test, expect, type Page } from '@playwright/test';

/**
 * Helper: garante que a página não tem scroll horizontal (causa #1 de "tela
 * quebrada" no mobile). Tolerância de 2px p/ sub-pixel/arredondamento de borda.
 */
async function expectNoHorizontalOverflow(page: Page, label = '') {
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(diff, `overflow horizontal detectado${label ? ` em ${label}` : ''}`).toBeLessThanOrEqual(2);
}

/**
 * Gate ampliado (P0 refatoração mobile-first): cobre as rotas principais do app
 * autenticado — header, evolução, medições, perguntas, despesas, vacinas,
 * lembretes, planos, conquistas, médicos e perfil. O clip global do index.html
 * mascara overflow VISUAL, mas o gate mede scrollWidth REAL do documento:
 * se uma causa raiz escapar do clip (container interno com scroll próprio),
 * esse teste pega antes do usuário.
 */
const AUTH_ROUTES = [
  ['/', 'dashboard'],
  ['/evolucao', 'evolucao'],
  ['/medicoes', 'medicoes'],
  ['/medicoes/historico/STEPS', 'medicoes-historico'],
  ['/perguntas', 'perguntas'],
  ['/despesas', 'despesas'],
  ['/vacinas', 'vacinas'],
  ['/lembretes', 'lembretes'],
  ['/planos', 'planos'],
  ['/conquistas', 'conquistas'],
  ['/medicos', 'medicos'],
  ['/perfil', 'perfil'],
] as const;

test.describe('Layout base — sem overflow horizontal', () => {
  test('página de entrada carrega sem quebrar', async ({ page }, info) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page, 'entrada');
    await page.screenshot({ path: `e2e/screenshots/entry-${info.project.name}.png`, fullPage: true });
  });

  for (const [route, name] of AUTH_ROUTES) {
    test(`${name} sem overflow horizontal`, async ({ page }, info) => {
      // HashRouter: navegação é '/#/rota' (padrão dos demais specs). domcontentloaded +
      // settle — networkidle nunca assenta com os polls (billing/perguntas/FCM).
      await page.goto('/#' + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      await expectNoHorizontalOverflow(page, name);
      await page.screenshot({ path: `e2e/screenshots/overflow-${name}-${info.project.name}.png`, fullPage: true });
    });
  }
});
