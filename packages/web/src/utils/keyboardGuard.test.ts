// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { coveredByKeyboard } from './keyboardGuard';

describe('teclado cobrindo o campo', () => {
  it('janela não encolheu (Android 15+): o teclado inteiro está cobrindo', () => {
    expect(coveredByKeyboard(310, 800, 800)).toBe(310);
  });
  it('janela já encolheu o tamanho do teclado: nada coberto (não conta em dobro)', () => {
    expect(coveredByKeyboard(310, 800, 490)).toBe(0);
  });
  it('janela encolheu só em parte: cobre a diferença', () => {
    expect(coveredByKeyboard(310, 800, 700)).toBe(210);
  });
  it('teclado fechado ou valor inválido: zero', () => {
    expect(coveredByKeyboard(0, 800, 800)).toBe(0);
    expect(coveredByKeyboard(-5, 800, 800)).toBe(0);
    expect(coveredByKeyboard(Number.NaN, 800, 800)).toBe(0);
  });
});
