/**
 * Resposta imediata ao toque (26/11/26).
 *
 * Medido com CPU 4x mais lenta: o endereço trocava em ~30 ms, mas a aba só acendia de 1,9 a
 * 4,5 s depois e o botão de tema levava 3,5 s para marcar. O toque não tinha atraso — o que
 * travava era o processamento da tela nova, que segurava QUALQUER mudança visível até acabar.
 *
 * Padrão usado aqui (o mesmo de app nativo): primeiro pinta a resposta do toque (aba acesa,
 * menu fechando, botão marcado); só depois começa o trabalho pesado.
 */
import { flushSync } from 'react-dom';

/** Roda `fn` logo DEPOIS de o navegador pintar o quadro atual. */
export function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame !== 'function') { setTimeout(fn, 0); return; }
  requestAnimationFrame(() => { setTimeout(fn, 0); });
}

/** Roda `fn` quando o aparelho estiver ocioso (ou em ~1,5 s onde não há requestIdleCallback). */
export function whenIdle(fn: () => void, timeout = 4000): void {
  const w = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 1500);
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Troca de tema com um único esmaecer da tela inteira (View Transition: o navegador fotografa
 * o antes e o depois e cruza as duas imagens na placa de vídeo). Antes, CADA elemento da página
 * animava cor de fundo, borda e texto ao mesmo tempo — milhares de animações num WebView.
 * Sem suporte, ou com "reduzir movimento", a troca é direta.
 */
export function withThemeTransition(apply: () => void): void {
  const doc = typeof document === 'undefined' ? null : (document as ViewTransitionDocument);
  const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc?.startViewTransition || reduce) { apply(); return; }
  try {
    doc.startViewTransition(() => { flushSync(apply); });
  } catch {
    apply();
  }
}
