import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em produção o app roda num sub-caminho (ex.: https://janocaminho.com.br/meus-exames/).
// Em dev, base padrão '/' (localhost:5173).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Capacitor packages são runtime-only (fornecidos pelo WebView nativo, não no bundle web).
    // Sem isso, o rolldown falha ao resolver @capacitor/core no build Docker.
    rollupOptions: {
      external: [/^@capacitor\//, /^@capawesome\//],
    },
  },
});
