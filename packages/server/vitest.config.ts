import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Sequencial (1 worker): evita corrida de truncate no DB de teste compartilhado
    // e reaproveita a conexão Prisma entre arquivos.
    fileParallelism: false,
    testTimeout: 20_000, // testes de integração com DB + SSE podem passar de 5s
    setupFiles: ['./test/setup.ts'],
    // Exclui o dist/ — o tsc compila os *.test.ts (em src/utils) pra dist/, e sem isso
    // o vitest rodava as CÓPIAS compiladas (dist/src/utils/*.test.js) como "failed files" fantasma.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
