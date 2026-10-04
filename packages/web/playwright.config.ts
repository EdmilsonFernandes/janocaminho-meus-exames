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
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  report: [['list']],
  use: {
    // Stack local padrão: docker 4011 (imagem de prod contra o banco dev). E2E_BASE_URL
    // permite apontar pro vite dev (5173) ao iterar sem rebuild.
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4011',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // Login dev 1x → salva e2e/.auth/user.json (storageState).
    { name: 'setup', testMatch: 'global-setup.ts' },
    {
      // iPhone SE / Android pequeno — pior caso de largura.
      name: 'mobile-320',
      testMatch: '*.spec.ts',
      dependencies: ['setup'],
      use: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, storageState: 'e2e/.auth/user.json' },
    },
    {
      name: 'mobile-375',
      testMatch: '*.spec.ts',
      dependencies: ['setup'],
      use: { viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, storageState: 'e2e/.auth/user.json' },
    },
    {
      // WEBKIT = motor do Safari iOS. Auditoria mobile 10/2026: overflow/dvh/clip
      // comportam diferente do Chromium — o gate precisa cobrir os dois motores.
      name: 'mobile-390-webkit',
      testMatch: '*.spec.ts',
      dependencies: ['setup'],
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true, storageState: 'e2e/.auth/user.json' },
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
