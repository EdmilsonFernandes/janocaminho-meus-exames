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
 * Helper: o fim da página é alcançável (nada prende a rolagem — dialog travado,
 * scroll-behavior, lock de body). smooth-scroll do tema anima saltos: usa instant.
 */
async function expectReachesBottom(page: Page, label = '') {
  const atEnd = await page.evaluate(async () => {
    const se = document.scrollingElement || document.documentElement;
    se.scrollTo({ top: se.scrollHeight, behavior: 'instant' });
    await new Promise((res) => setTimeout(res, 700));
    const ok = se.scrollTop + se.clientHeight >= se.scrollHeight - 3;
    se.scrollTo({ top: 0, behavior: 'instant' });
    return ok;
  });
  expect(atEnd, `página não alcança o próprio fim${label ? ` em ${label}` : ''}`).toBe(true);
}

/**
 * Gate ampliado (P0 refatoração mobile-first + auditoria iOS 10/2026): cobre as
 * rotas do app autenticado E as públicas (landing/login/termos/docs). O clip global
 * do index.html mascara overflow VISUAL, mas o gate mede scrollWidth REAL do
 * documento: se uma causa raiz escapar do clip (container interno com scroll
 * próprio), esse teste pega antes do usuário. Roda em Chromium (320/375) e WEBKIT
 * (motor do Safari iOS — ver playwright.config.ts).
 */
const AUTH_ROUTES = [
  ['/', 'dashboard'],
  ['/exams', 'exams-list'],
  ['/alterados', 'alterados'],
  ['/evolucao', 'evolucao'],
  ['/tendencias', 'tendencias'],
  ['/linha-do-tempo', 'timeline'],
  ['/relatorio', 'relatorio'],
  ['/medicoes', 'medicoes'],
  ['/medicoes/historico/STEPS', 'medicoes-historico'],
  ['/saude-mental', 'saude-mental'],
  ['/medicamentos', 'medicamentos'],
  ['/vacinas', 'vacinas'],
  ['/lembretes', 'lembretes'],
  ['/emergencia', 'emergencia'],
  ['/conquistas', 'conquistas'],
  ['/despesas', 'despesas'],
  ['/familia', 'familia'],
  ['/patients', 'dependentes'],
  ['/medicos', 'medicos'],
  ['/perguntas', 'perguntas'],
  ['/perfil', 'perfil'],
  ['/seguranca', 'seguranca'],
  ['/privacidade', 'privacidade'],
  ['/planos', 'planos'],
  ['/faq', 'faq'],
  ['/chat', 'chat'],
  ['/suporte', 'suporte'],
] as const;

const PUBLIC_ROUTES = [
  ['/entrar', 'login'],
  ['/registrar', 'registrar'],
  ['/recuperar-senha', 'recuperar-senha'],
  ['/landing', 'landing'],
  ['/termos', 'termos'],
  ['/como-validamos', 'como-validamos'],
  ['/api-docs', 'api-docs'],
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
      // fim da página alcançável (auditoria 10/2026: dialog esquecido/lock prende a rolagem)
      await expectReachesBottom(page, name);
      // fullPage em páginas com gráficos/animações pode passar dos 10s default sob carga
      // (CI paralelo) — 30s não muda a semântica do gate (a asserção já rodou acima).
      await page.screenshot({ path: `e2e/screenshots/overflow-${name}-${info.project.name}.png`, fullPage: true, timeout: 30000 });
    });
  }

  for (const [route, name] of PUBLIC_ROUTES) {
    test(`pública ${name} sem overflow horizontal`, async ({ page }, info) => {
      await page.goto('/#' + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      await expectNoHorizontalOverflow(page, name);
      await page.screenshot({ path: `e2e/screenshots/public-${name}-${info.project.name}.png`, fullPage: true, timeout: 30000 });
    });
  }
});
