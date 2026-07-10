import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL ?? '';
const appUrl = (path: string) => (baseUrl ? `${baseUrl}${path}` : path);

test.describe('CPF fields', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('patient registration masks CPF', async ({ page }) => {
    await page.goto(appUrl('/#/registrar'), { waitUntil: 'domcontentloaded' });
    const cpf = page.getByPlaceholder('CPF');
    await expect(cpf).toBeVisible({ timeout: 15_000 });
    await cpf.fill('52998224725');
    await expect(cpf).toHaveValue('529.982.247-25');
  });

  test('doctor registration masks CPF', async ({ page }) => {
    await page.goto(appUrl('/#/doctor?mode=register'), { waitUntil: 'domcontentloaded' });
    const cpf = page.getByPlaceholder('CPF');
    await expect(cpf).toBeVisible({ timeout: 15_000 });
    await cpf.fill('52998224725');
    await expect(cpf).toHaveValue('529.982.247-25');
  });
});
