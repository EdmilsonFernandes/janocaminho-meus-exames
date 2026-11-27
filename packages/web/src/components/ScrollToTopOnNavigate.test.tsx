// @vitest-environment node
/**
 * ScrollToTopOnNavigate — regressão do bug do dono (26/11/26): trocar de tela no app Android
 * herdava a rolagem da tela anterior. O componente em si precisa de roteador e DOM; aqui fica a
 * parte pura (`resetScroll`), que é a que efetivamente zera a posição.
 */
import { describe, expect, it, vi } from 'vitest';
import { resetScroll } from './ScrollToTopOnNavigate';

/** Cadeia fake de elementos: cada um com `scrollTop` e `parentElement`. */
const el = (scrollTop: number, parentElement: Element | null) => ({ scrollTop, parentElement }) as unknown as Element;

describe('resetScroll', () => {
  it('zera a rolagem da janela', () => {
    const scrollTo = vi.fn();
    resetScroll(null, { scrollTo });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('zera a rolagem de todos os ancestrais roláveis (shell que rola dentro de um elemento)', () => {
    const scrollTo = vi.fn();
    const fora = el(0, null);
    const layout = el(640, fora);
    const pagina = el(0, layout);
    const host = el(0, pagina);
    resetScroll(host, { scrollTo });
    expect(layout.scrollTop).toBe(0);
    expect(pagina.scrollTop).toBe(0);
  });

  it('sem elemento (componente desmontado) só zera a janela e não quebra', () => {
    const scrollTo = vi.fn();
    expect(() => resetScroll(null, { scrollTo })).not.toThrow();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
