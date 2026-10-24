/**
 * Copy à prova de WebView (bug dono 24/10: copiar código PIX no APK dava erro).
 *
 * navigator.clipboard falha ou não existe dentro da WebView do Capacitor
 * (contexto não seguro / sem permissão) — e quando o caller faz
 * `void navigator.clipboard.writeText(...)` a rejeição some e o toast mente
 * "copiado". Aqui:
 *  1. Clipboard API (navegador moderno, contexto seguro) — aguardada de verdade;
 *  2. fallback document.execCommand('copy') com textarea offscreen readOnly
 *     (funciona na WebView Android/iOS, mesmo deprecated);
 *  3. false → caller SELECIONA o texto num input readOnly e orienta
 *     "toque e segure para copiar" (seleção nativa do WebView).
 *
 * Resolve sempre boolean — nunca rejeita (zero unhandled rejection).
 */
export const copyText = async (text: string): Promise<boolean> => {
  if (!text) return false;
  // 1. Async Clipboard API — só confia se a promise resolver de fato.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* WebView sem permissão / contexto não seguro → fallback */ }
  // 2. execCommand — textarea fora do fluxo visual mas DENTRO do viewport
  //    (fora dele o Android pode recusar o copy).
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS exige range explícito
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch { /* cai no caminho manual */ }
  // 3. Manual: caller seleciona o campo e ensina toque-e-segure.
  return false;
};
