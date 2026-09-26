import { Capacitor } from '@capacitor/core';

/**
 * Deep links (G2 — padrão app grande): App Links https abrem o app direto no destino.
 * Nossas URLs são https://janocaminho.com.br/minhasaude/#/rota — o Android entrega o
 * URL completo no appUrlOpen; aqui normalizamos pro HashRouter. Também casa o formato
 * "limpo" (/minhasaude/rota) por segurança (links externos podem vir sem #).
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
        // Sem hash: extrai a rota do path (/minhasaude/convite/xyz → #/convite/xyz)
        const m = u.pathname.match(/^\/minhasaude(\/.*)?$/);
        if (m) location.hash = '#' + (m[1] ?? '/');
      } catch { /* URL inválida — ignora */ }
    }).catch(() => { /* listener falhou — app segue normal */ });
  }).catch(() => { /* plugin indisponível — web */ });
}
