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
    // NÃO externalizar @capacitor/* : esses pacotes trazem uma implementação WEB (JS) que DEVE
    // entrar no bundle — é ela que faz isNativePlatform() retornar false no browser. Externalizar
    // deixava `import "@capacitor/core"` como specifier nu no bundle → o browser quebrava com
    // "Failed to resolve module specifier @capacitor/core". No APK o nativo ainda wins porque o
    // bridge injeta as implementações reais por cima. (Já foi external p/ o build Docker passar
    // quando @capacitor/core ainda não era dep do web — hoje é, então virou obsoleto e nocivo.)
  },
});
