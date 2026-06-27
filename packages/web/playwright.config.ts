import { defineConfig } from '@playwright/test';

/**
 * Validação visual E2E do app Meus Exames contra o dev server local (porta 4011).
 * Foco do gate: SEM overflow horizontal, snapshot por viewport (mobile/tablet/desktop).
 * Arquivos em packages/web/e2e/ (fora de src/) — não entram no typecheck nem no bundle.
 *
 * Auth: projeto "setup" faz login dev UMA vez (via API) e salva storageState; os demais
 * projetos dependem dele e reutilizam (evita rate-limit de N logins).
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
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // Login dev 1x → salva e2e/.auth/user.json (storageState).
    { name: 'setup', testMatch: 'global-setup.ts' },
    {
      name: 'mobile-375',
      testMatch: '*.spec.ts',
      dependencies: ['setup'],
      use: { viewport: { width: 375, height: 760 }, isMobile: true, storageState: 'e2e/.auth/user.json' },
    },
    {
      name: 'tablet-768',
      testMatch: '*.spec.ts',
      dependencies: ['setup'],
      use: { viewport: { width: 768, height: 1024 }, storageState: 'e2e/.auth/user.json' },
    },
    {
      name: 'desktop-1440',
      testMatch: '*.spec.ts',
      dependencies: ['setup'],
      use: { viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/user.json' },
    },
  ],
});
