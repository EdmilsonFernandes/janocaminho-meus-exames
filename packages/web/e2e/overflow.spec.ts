import { test, expect, type Page } from '@playwright/test';

/**
 * Helper: garante que a página não tem scroll horizontal (causa #1 de "tela
 * quebrada" no mobile). Tolerância de 2px p/ sub-pixel/arredondamento de borda.
 */
async function expectNoHorizontalOverflow(page: Page, label = '') {
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(diff, `overflow horizontal detectado${label ? ` em ${label}` : ''}`).toBeLessThanOrEqual(2);
}

test.describe('Layout base — sem overflow horizontal', () => {
  test('página de entrada carrega sem quebrar', async ({ page }, info) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page, 'entrada');
    await page.screenshot({ path: `e2e/screenshots/entry-${info.project.name}.png`, fullPage: true });
  });
});
