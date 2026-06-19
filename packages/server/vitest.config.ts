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
  },
});
