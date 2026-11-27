import { describe, it, expect } from 'vitest';
import { groupOpen, menuScrollFor } from './menuPosition';

describe('menuScrollFor — o menu abre ancorado na tela atual', () => {
  const view = { viewHeight: 600, contentHeight: 1400, itemHeight: 40 };

  it('item na primeira tela → abre no topo', () => {
    expect(menuScrollFor({ ...view, itemTop: 0 })).toBe(0);
    expect(menuScrollFor({ ...view, itemTop: 300 })).toBe(0);
    expect(menuScrollFor({ ...view, itemTop: 548 })).toBe(0);
  });

  it('item abaixo da dobra → fica no meio da área visível', () => {
    // meio: 900 - (600 - 40) / 2 = 620
    expect(menuScrollFor({ ...view, itemTop: 900 })).toBe(620);
  });

  it('item cortado pela borda de baixo conta como fora da tela', () => {
    expect(menuScrollFor({ ...view, itemTop: 570 })).toBe(290);
  });

  it('item no fim do menu → rola até o limite, nunca além', () => {
    expect(menuScrollFor({ ...view, itemTop: 1350 })).toBe(800);
  });

  it('menu que cabe inteiro, ou medida inválida → topo', () => {
    expect(menuScrollFor({ itemTop: 700, itemHeight: 40, viewHeight: 600, contentHeight: 500 })).toBe(0);
    expect(menuScrollFor({ itemTop: 700, itemHeight: 0, viewHeight: 600, contentHeight: 1400 })).toBe(0);
    expect(menuScrollFor({ itemTop: 700, itemHeight: 40, viewHeight: 0, contentHeight: 1400 })).toBe(0);
  });
});

describe('groupOpen — um caminho aberto por vez', () => {
  it('sem escolha da pessoa: só o grupo da tela atual abre', () => {
    expect(groupOpen(null, 3, true)).toBe(true);
    expect(groupOpen(null, 3, false)).toBe(false);
  });

  it('o toque no cabeçalho manda enquanto o menu está aberto', () => {
    expect(groupOpen({ epoch: 3, current: false, open: true }, 3, false)).toBe(true);
    expect(groupOpen({ epoch: 3, current: true, open: false }, 3, true)).toBe(false);
  });

  it('abrir o menu de novo descarta a escolha antiga', () => {
    expect(groupOpen({ epoch: 3, current: false, open: true }, 4, false)).toBe(false);
  });

  it('a pessoa foi para uma tela do grupo que tinha fechado → ele reabre', () => {
    expect(groupOpen({ epoch: 3, current: false, open: false }, 3, true)).toBe(true);
  });
});
