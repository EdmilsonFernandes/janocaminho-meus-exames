import { test, expect, type Page } from '@playwright/test';

// M4: admin (tabs scrollable) + chat (fix do mb) + landing (hero) — sem overflow.
async function dismissOverlays(page: Page) {
  for (const label of ['Pular', 'Depois', 'Agora não']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 500 }); } catch { /* */ }
  }
}

test('M4 — admin/chat/landing sem overflow horizontal', async ({ page }, info) => {
  test.setTimeout(120_000);
  for (const r of ['/admin', '/chat', '/landing']) {
    await page.goto('/#' + r, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await dismissOverlays(page);
    const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(diff, `overflow em ${r} (${info.project.name})`).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `e2e/screenshots/m4-${r.replace(/\//g, '-')}-${info.project.name}.png`, fullPage: true });
  }
});
