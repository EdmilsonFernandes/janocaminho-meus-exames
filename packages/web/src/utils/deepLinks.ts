import { Capacitor } from '@capacitor/core';

/**
 * Deep links (G2 — padrão app grande): App Links https abrem o app direto no destino.
 * Domínio verificado: https://drexame.janocaminho.com.br/#/rota (assetlinks.json no
 * Express). Formato antigo https://janocaminho.com.br/minhasaude/#/rota também é
 * aceito — o Android entrega o URL completo no appUrlOpen; aqui normalizamos pro
 * HashRouter (com ou sem #).
 * No web é no-op (o browser já roteia).
 */
export function initDeepLinks(): void {
  if (!Capacitor.isNativePlatform()) return;
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', ({ url }) => {
      try {
        const u = new URL(url);
        if (u.hash) { // https://…/minhasaude/#/convite/xyz → rota já pronta
          if (location.hash !== u.hash) location.hash = u.hash;
          return;
        }
        // Sem hash: extrai a rota do path. Dois formatos:
        // - /minhasaude/convite/xyz (domínio antigo janocaminho.com.br)
        // - /convite/xyz direto no domínio próprio drexame.janocaminho.com.br (raiz serve a mesma SPA)
        const m = u.pathname.match(/^\/minhasaude(\/.*)?$/);
        if (m) { location.hash = '#' + (m[1] ?? '/'); return; }
        if (u.hostname === 'drexame.janocaminho.com.br') location.hash = '#' + (u.pathname || '/');
      } catch { /* URL inválida — ignora */ }
    }).catch(() => { /* listener falhou — app segue normal */ });
  }).catch(() => { /* plugin indisponível — web */ });
}
