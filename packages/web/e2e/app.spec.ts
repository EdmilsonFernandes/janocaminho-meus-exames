import { test, expect, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page, label = '') {
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(diff, `overflow horizontal${label ? ` em ${label}` : ''}`).toBeLessThanOrEqual(2);
}

/** Dispensa overlays de 1ª visita (Onboarding "Pular", NotificationPopup "Depois",
 *  biometria "Agora não") p/ capturar a tela real da página. Não-fatal se ausentes. */
async function dismissOverlays(page: Page) {
  for (const label of ['Pular', 'Depois', 'Agora não']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 1500 }); } catch { /* overlay ausente */ }
  }
}

// Auth vem do projeto "setup" (storageState e2e/.auth/user.json) — login dev via API, 1x.

test.describe('Telas patient-facing — sem overflow horizontal (M1)', () => {
  test('Dashboard', async ({ page }, info) => {
    await page.goto('/#/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await dismissOverlays(page);
    await expectNoHorizontalOverflow(page, 'Dashboard');
    await page.screenshot({ path: `e2e/screenshots/dashboard-${info.project.name}.png`, fullPage: true });
  });

  test('ExamList', async ({ page }, info) => {
    await page.goto('/#/exams');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await dismissOverlays(page);
    await expectNoHorizontalOverflow(page, 'ExamList');
    await page.screenshot({ path: `e2e/screenshots/examlist-${info.project.name}.png`, fullPage: true });
  });
});
