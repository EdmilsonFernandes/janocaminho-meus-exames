import { describe, it, expect } from 'vitest';
import { priorityOf, maxPriority, isStaleExam, PRIORITY_RANK, refScaleSuspect, plausibleBoundsFor } from './alertPriority';

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

describe('alertPriority — refScaleSuspect (erro de escala da faixa)', () => {
  it('plausibleBoundsFor mapeia analitos comuns', () => {
    expect(plausibleBoundsFor('Hemoglobina')).toEqual({ lo: 3, hi: 25 });
    expect(plausibleBoundsFor('GLICOSE')).toEqual({ lo: 20, hi: 1000 });
    expect(plausibleBoundsFor('zzz desconhecido')).toBeNull();
  });

  it('valor plausível + faixa fora da magnitude → suspeito (Hb 15 vs 130-170)', () => {
    expect(refScaleSuspect({ name: 'Hemoglobina', valueNumeric: 15, refLow: 130, refHigh: 170 })).toBe(true);
    expect(refScaleSuspect({ nameCanonical: 'HEMATÓCRITO', valueNumeric: 46.7, refLow: 400, refHigh: 500 })).toBe(true);
    expect(refScaleSuspect({ nameCanonical: 'HEMÁCIAS', valueNumeric: 5.78, refLow: 450, refHigh: 550 })).toBe(true);
  });

  it('faixa na escala certa → NÃO suspeito (mesmo se valor extremo/crítico real)', () => {
    // Hemoglobina normal com faixa certa:
    expect(refScaleSuspect({ name: 'Hemoglobina', valueNumeric: 15, refLow: 13, refHigh: 17 })).toBe(false);
    // Crítico real: glicose 900 com faixa 70-100 — ambos plausíveis → NÃO suspeito (continua 🔴):
    expect(refScaleSuspect({ name: 'Glicose', valueNumeric: 900, refLow: 70, refHigh: 100 })).toBe(false);
    // Hemoglobina bem baixa (anemia real) com faixa certa → não suspeito:
    expect(refScaleSuspect({ name: 'Hemoglobina', valueNumeric: 5, refLow: 13, refHigh: 17 })).toBe(false);
  });

  it('analito não mapeado ou sem numérico → não suspeito (sem regressão)', () => {
    expect(refScaleSuspect({ name: 'Exótico XYZ', valueNumeric: 15, refLow: 130, refHigh: 170 })).toBe(false);
    expect(refScaleSuspect({ name: 'Hemoglobina', valueNumeric: null, refLow: 130, refHigh: 170 })).toBe(false);
    expect(refScaleSuspect({})).toBe(false);
  });

  it('priorityOf nunca dá Importante pra faixa suspeita (Hb 15 vs 130-170 → leve)', () => {
    expect(priorityOf({ name: 'Hemoglobina', flag: 'LOW', valueNumeric: 15, refLow: 130, refHigh: 170 })).toBe('leve');
  });
});
