import { defineConfig } from '@playwright/test';

/**
 * E2E · Patrocinadores & Opiniões (02/11/26).
 * Config própria: neste host o Chromium headless não alcança loopback → serve pelo IP da
 * rede (vite preview --host) com a API no mesmo IP:4001. Sem projeto "setup": cada teste
 * autentica via API e semeia o storage (paciente/admin/médico) por conta própria.
 *
 *   E2E_BASE_URL=http://<IP>:4175 E2E_API_URL=http://<IP>:4001/api \
 *   npx playwright test -c e2e/sponsors-feedback.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'sponsors-feedback.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4175',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
