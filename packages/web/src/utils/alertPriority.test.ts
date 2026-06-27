import { describe, it, expect } from 'vitest';
import { priorityOf, maxPriority, isStaleExam, PRIORITY_RANK } from './alertPriority';

describe('alertPriority — priorityOf (magnitude)', () => {
  // Faixa de referência 3.5–5.0 (largura 1.5)
  it('CRITICAL → importante (independente do valor)', () => {
    expect(priorityOf({ flag: 'CRITICAL', valueNumeric: 5.2, refLow: 3.5, refHigh: 5 })).toBe('importante');
  });

  it('muito acima (≥1 faixa além) → importante', () => {
    expect(priorityOf({ flag: 'HIGH', valueNumeric: 7, refLow: 3.5, refHigh: 5 })).toBe('importante'); // over=1.33
  });

  it('moderadamente acima (25%–100%) → moderada', () => {
    expect(priorityOf({ flag: 'HIGH', valueNumeric: 5.6, refLow: 3.5, refHigh: 5 })).toBe('moderada'); // over=0.4
  });

  it('pouco acima (<25%) → leve', () => {
    expect(priorityOf({ flag: 'HIGH', valueNumeric: 5.1, refLow: 3.5, refHigh: 5 })).toBe('leve'); // over=0.067
  });

  it('abaixo: muito abaixo → importante, pouco → leve', () => {
    // Faixa 4.0–11.0 (largura 7)
    expect(priorityOf({ flag: 'LOW', valueNumeric: -3, refLow: 4, refHigh: 11 })).toBe('importante'); // under=1.0
    expect(priorityOf({ flag: 'LOW', valueNumeric: 3.9, refLow: 4, refHigh: 11 })).toBe('leve'); // under=0.014
  });
});

describe('alertPriority — fallback sem valor numérico', () => {
  it('ABNORMAL/HIGH/LOW sem numérico → moderada', () => {
    expect(priorityOf({ flag: 'ABNORMAL' })).toBe('moderada');
    expect(priorityOf({ flag: 'HIGH' })).toBe('moderada');
    expect(priorityOf({ flag: 'LOW' })).toBe('moderada');
  });

  it('sem flag e sem numérico → leve', () => {
    expect(priorityOf({})).toBe('leve');
    expect(priorityOf(null)).toBe('leve');
  });
});

describe('alertPriority — maxPriority', () => {
  it('retorna a pior prioridade da lista', () => {
    const items = [
      { flag: 'HIGH', valueNumeric: 5.1, refLow: 3.5, refHigh: 5 }, // leve
      { flag: 'CRITICAL', valueNumeric: 5.2, refLow: 3.5, refHigh: 5 }, // importante
      { flag: 'LOW', valueNumeric: 3.9, refLow: 4, refHigh: 11 }, // leve
    ];
    expect(maxPriority(items)).toBe('importante');
    expect(PRIORITY_RANK[maxPriority(items)]).toBe(3);
  });

  it('lista só leves → leve', () => {
    expect(maxPriority([{ flag: 'HIGH', valueNumeric: 5.1, refLow: 3.5, refHigh: 5 }])).toBe('leve');
  });
});

describe('alertPriority — isStaleExam (exame antigo)', () => {
  const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

  it('mais de 12 meses → antigo', () => {
    expect(isStaleExam(days(400))).toBe(true);
  });
  it('menos de 12 meses → não antigo', () => {
    expect(isStaleExam(days(30))).toBe(false);
    expect(isStaleExam(days(180))).toBe(false);
  });
  it('sem data ou inválida → não marca', () => {
    expect(isStaleExam(null)).toBe(false);
    expect(isStaleExam(undefined)).toBe(false);
    expect(isStaleExam('não-é-data')).toBe(false);
  });
});
