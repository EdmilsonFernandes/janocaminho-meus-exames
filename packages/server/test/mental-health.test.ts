import { describe, it, expect } from 'vitest';
import {
  PHQ9_ITEMS, GAD7_ITEMS, validateScreeningAnswers, scoreScreening, severityOf,
  hasSuicidalIdeation, maxScoreOf, screeningItems,
} from '@meus-exames/shared';

/**
 * Scoring/faixas PHQ-9 e GAD-7 (lógica pura em packages/shared — sem DB).
 * Faixas da versão PT-BR validada: PHQ-9 0-4/5-9/10-14/15-19/20-27;
 * GAD-7 0-4/5-9/10-14/15-21. Fronteiras testadas uma a uma (bug clássico: off-by-one).
 */

describe('instrumentos', () => {
  it('tem 9 itens PHQ-9 e 7 itens GAD-7', () => {
    expect(PHQ9_ITEMS.length).toBe(9);
    expect(GAD7_ITEMS.length).toBe(7);
    expect(screeningItems('phq9')).toBe(PHQ9_ITEMS);
    expect(maxScoreOf('phq9')).toBe(27);
    expect(maxScoreOf('gad7')).toBe(21);
  });
});

describe('scoreScreening', () => {
  it('soma os itens 0-3', () => {
    expect(scoreScreening([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(scoreScreening([3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(27);
    expect(scoreScreening([1, 2, 3, 0, 1, 2, 3, 0, 1])).toBe(13);
    expect(scoreScreening([2, 2, 2, 2, 2, 2, 2])).toBe(14);
  });
});

describe('validateScreeningAnswers', () => {
  it('aceita array com o nº exato de inteiros 0-3', () => {
    expect(validateScreeningAnswers('phq9', new Array(9).fill(0))).toBe(true);
    expect(validateScreeningAnswers('phq9', [3, 2, 1, 0, 3, 2, 1, 0, 3])).toBe(true);
    expect(validateScreeningAnswers('gad7', new Array(7).fill(2))).toBe(true);
  });
  it('rejeita tamanho errado, não-array, não-inteiro e fora de 0-3', () => {
    expect(validateScreeningAnswers('phq9', new Array(8).fill(0))).toBe(false);
    expect(validateScreeningAnswers('gad7', new Array(8).fill(0))).toBe(false);
    expect(validateScreeningAnswers('phq9', 'não sou array')).toBe(false);
    expect(validateScreeningAnswers('phq9', null)).toBe(false);
    expect(validateScreeningAnswers('phq9', [1.5, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(validateScreeningAnswers('phq9', [4, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(validateScreeningAnswers('phq9', [-1, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(validateScreeningAnswers('gad7', ['1', '1', '1', '1', '1', '1', '1'])).toBe(false);
  });
});

describe('severityOf — PHQ-9', () => {
  const cases: [number, string][] = [
    [0, 'minima'], [4, 'minima'],
    [5, 'leve'], [9, 'leve'],
    [10, 'moderada'], [14, 'moderada'],
    [15, 'moderadamente_grave'], [19, 'moderadamente_grave'],
    [20, 'grave'], [27, 'grave'],
  ];
  it.each(cases)('total %i → %s', (total, key) => {
    expect(severityOf('phq9', total).key).toBe(key);
  });
});

describe('severityOf — GAD-7', () => {
  const cases: [number, string][] = [
    [0, 'minima'], [4, 'minima'],
    [5, 'leve'], [9, 'leve'],
    [10, 'moderada'], [14, 'moderada'],
    [15, 'grave'], [21, 'grave'],
  ];
  it.each(cases)('total %i → %s', (total, key) => {
    expect(severityOf('gad7', total).key).toBe(key);
  });
});

describe('hasSuicidalIdeation (item 9 do PHQ-9)', () => {
  it('dispara com qualquer resposta > 0 no item 9 (índice 8)', () => {
    expect(hasSuicidalIdeation([0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe(true);
    expect(hasSuicidalIdeation([3, 3, 0, 0, 0, 0, 0, 0, 3])).toBe(true);
  });
  it('não dispara com item 9 = 0 (mesmo com score alto nos demais)', () => {
    expect(hasSuicidalIdeation([3, 3, 3, 3, 3, 3, 3, 3, 0])).toBe(false);
  });
});
