import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Os plugins @capacitor/* (app, browser, camera...) têm @capacitor/core como *peer* dep.
// No build Docker, o npm hoista os plugins p/ /app/node_modules/ mas deixa o core aninhado
// no workspace → o rolldown, ao empacotar um plugin (na raiz), não resolve `import "@capacitor/core"`
// e o build falha: "Rolldown failed to resolve import @capacitor/core from @capacitor/app".
// Alias explícito → diretório instalado resolve em qualquer layout de node_modules (robusto vs hoisting).
// Localmente funcionava por acaso (um @capacitor/core fantasma na raiz); o `external` antigo só
// mascarava o problema — e external quebra o browser (specifier nu no bundle). Não use external.
const capCoreDir = path.dirname(require.resolve('@capacitor/core/package.json'));

// Em produção o app roda num sub-caminho (ex.: https://janocaminho.com.br/meus-exames/).
// Em dev, base padrão '/' (localhost:5173).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      // Cobre tanto `import "@capacitor/core"` quanto `@capacitor/core/sub` (alias de string
      // do vite casa o prefixo em boundary).
      '@capacitor/core': capCoreDir,
    },
  },
  build: {
    // NÃO externalizar @capacitor/* (ver bloco do capCoreDir acima): a implementação WEB (JS)
    // DEVE entrar no bundle — é ela que faz isNativePlatform() retornar false no browser.
    // Vite 8 = rolldown (não rollup) → usa advancedChunks (manualChunks não existe aqui).
    rolldownOptions: {
      // Separa os vendors grandes em chunks próprios → o chunk do app encolhe e os vendors
      // ficam cacheáveis entre releases (mudam só quando a dep muda). Não reduz o total, mas
      // melhora cache + carregamento paralelo. (Lazy das páginas é o próximo passo p/ 1º load.)
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-ui', test: /@mui|@emotion/ },
            { name: 'vendor-admin', test: /react-admin|ra-data-simple-rest/ },
            { name: 'vendor-charts', test: /recharts|react-markdown/ },
          ],
        },
      },
    },
  },
});
