import { useEffect, useState } from 'react';

/**
 * Altura do teclado virtual (px) no navegador mobile, via VisualViewport API.
 *
 * POR QUÊ: no iOS Safari o teclado NÃO redimensiona o layout viewport — só o
 * visual viewport. Conteúdo in-flow ancorado no rodapé (ex.: compositor do
 * Chat com height:100dvh) fica POR TRÁS do teclado e depende do auto-scroll
 * do navegador (que falta em documentos que não overflowam). `100dvh` reage
 * às toolbars, NÃO ao teclado.
 *
 * COMO: inset = innerHeight − visualViewport.height − offsetTop, medido
 * apenas enquanto há um campo focado (elimina o ruído da url-bar do iOS,
 * que também encolhe o visual viewport ~60-100px sem teclado). Gatilho só
 * acima de 120px (teclado real ≥ ~200px; url-bar ≤ ~100px).
 *
 * APK/Android nativo: o WebView redimensiona o layout (adjustResize) →
 * innerHeight já encolhe junto → inset = 0 → hook é no-op (zero regressão).
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const active = document.activeElement;
        const fieldFocused = !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && !active.hasAttribute('readonly');
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        setInset(fieldFocused && kb > 120 ? kb : 0);
      });
    };

    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    window.addEventListener('focusin', measure);
    window.addEventListener('focusout', measure);
    measure();
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      window.removeEventListener('focusin', measure);
      window.removeEventListener('focusout', measure);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return inset;
}
