import { defineConfig } from '@playwright/test';

/**
 * Validação visual E2E do app Meus Exames contra o dev server local (porta 4011).
 * Foco do gate: SEM overflow horizontal, conteúdo não coberto pela bottom-nav,
 * snapshot por viewport (mobile/tablet/desktop). Arquivos em packages/web/e2e/
 * (fora de src/) — não entram no typecheck nem no bundle de produção.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  report: [['list']],
  use: {
    baseURL: 'http://localhost:4011',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 760 }, isMobile: true } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
