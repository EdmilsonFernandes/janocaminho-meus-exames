import { defineConfig, devices } from '@playwright/test';

/**
 * E2E · Bottom Sheet de insight clínico × tipografia dinâmica (02/11/26).
 *
 * Projetos = LARGURAS (a escala de fonte varia DENTRO de cada teste, assim largura e
 * escala não variam sempre juntas). Mesmo padrão do projeto (viewport + isMobile +
 * hasTouch, Chromium) + 1 descritor de dispositivo Android real do Playwright (Pixel 5:
 * UA Android/Chrome, DPR 2.75) — viewport pequena sozinha não é um Android.
 *
 *   E2E_BASE_URL=http://<IP>:4175 E2E_API_URL=http://<IP>:4001/api \
 *   npx playwright test -c e2e/insight-sheet.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'insight-sheet.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/insight-sheet/{projectName}/{arg}{ext}',
  expect: {
    // Tolerância BAIXA e deliberada: 0,2% dos pixels (~500 px num sheet 390×640) cobre
    // antialiasing de fonte entre execuções sem esconder um chip cortado ou um botão
    // deslocado (0,02 global esconderia ~50k px). Baselines revisadas a olho antes de aceitar.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4175',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'w360', use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: 'w390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'w412', use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
    // Pouca altura (teclado aberto / landscape curto / aparelho pequeno).
    { name: 'w360-short', use: { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true } },
    // Descritor Android do Playwright (UA Chrome Android, DPR 2.75, 393×851).
    { name: 'android-pixel5', use: { ...devices['Pixel 5'] } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
