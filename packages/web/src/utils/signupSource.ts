/**
 * Origem do cadastro (auditoria de monetização 18/10 — "16 signups/semana... de onde?").
 * Captura utm_source/campaign (ou hostname do referrer) no momento do registro e guarda
 * em localStorage — a UTM só bate na 1ª página (landing), o formulário está em /registrar,
 * então sem persistir a navegação no meio apagaria a origem. O server sanitiza de novo
 * e o admin agrega por fonte ("/admin/metrics → acquisition").
 */
export function signupSource(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    let src = [p.get('utm_source'), p.get('utm_campaign')].filter(Boolean).join('/');
    if (!src) src = localStorage.getItem('signup_source') || '';
    if (!src && document.referrer) {
      try { src = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch { src = ''; }
    }
    // Direto no /registrar sem UTM e sem referrer = orgânico/direto (vira "(direto)" no admin).
    if (src) { try { localStorage.setItem('signup_source', src.slice(0, 120)); } catch { /* storage cheio/bloqueado */ } }
    return src.slice(0, 120);
  } catch {
    return '';
  }
}
