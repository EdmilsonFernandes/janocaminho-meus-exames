// @vitest-environment node
/**
 * ScrollToTopOnNavigate — regressão do bug do dono (26/11/26): trocar de tela no app Android
 * herdava a rolagem da tela anterior. O componente em si precisa de roteador e DOM; aqui fica a
 * parte pura (`resetScroll`), que é a que efetivamente zera a posição.
 */
import { describe, expect, it, vi } from 'vitest';
import { planScroll, resetScroll, savedScroll, saveScroll } from './ScrollToTopOnNavigate';

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

describe('planScroll — Voltar devolve a pessoa onde estava (27/11/26)', () => {
  it('avançar para uma tela (link, menu, rodapé) sempre começa no topo', () => {
    expect(planScroll('PUSH', 900)).toEqual({ mode: 'top' });
    expect(planScroll('REPLACE', 900)).toEqual({ mode: 'top' });
  });

  it('voltar restaura a posição guardada daquela entrada do histórico', () => {
    expect(planScroll('POP', 1240)).toEqual({ mode: 'restore', y: 1240 });
  });

  it('voltar para uma tela que estava no topo (ou sem posição guardada) fica no topo', () => {
    expect(planScroll('POP', 0)).toEqual({ mode: 'top' });
    expect(planScroll('POP', undefined)).toEqual({ mode: 'top' });
  });
});

describe('saveScroll', () => {
  it('guarda a última posição de cada entrada e no máximo 60 entradas', () => {
    savedScroll.clear();
    saveScroll('a', 10.6);
    saveScroll('a', 500);
    expect(savedScroll.get('a')).toBe(500);
    for (let i = 0; i < 70; i++) saveScroll(`k${i}`, i);
    expect(savedScroll.size).toBe(60);
    expect(savedScroll.has('a')).toBe(false);
    expect(savedScroll.get('k69')).toBe(69);
  });
});

