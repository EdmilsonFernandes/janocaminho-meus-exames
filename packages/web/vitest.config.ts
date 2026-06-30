import { defineConfig } from 'vitest/config';

// Vitest roda SÓ os testes unitários (src/). Os specs em e2e/ são E2E do
// Playwright e rodam via `npx playwright test` (playwright.config.ts) — não
// devem ser coletados pelo vitest (senão `npm test` fica sempre vermelho).
export default defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
