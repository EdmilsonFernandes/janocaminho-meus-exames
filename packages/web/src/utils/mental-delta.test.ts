import { describe, expect, it } from 'vitest';
import { deltaEntre, deltaLabel, mesDe, proximaJanela } from './mental-delta';

// ISOs SEM timezone: `new Date('2026-09-14T10:00:00')` é hora LOCAL em qualquer
// ambiente → assertions de DD/MM e mês valem em qualquer TZ do runner.

describe('deltaEntre(anterior, atual)', () => {
  it('caiu → down/good com valor absoluto', () => {
    expect(deltaEntre(13, 9)).toEqual({ dir: 'down', abs: 4, tone: 'good' });
    expect(deltaEntre(9, 8)).toEqual({ dir: 'down', abs: 1, tone: 'good' });
  });

  it('subiu >= 3 → up/warn (âmbar)', () => {
    expect(deltaEntre(4, 9)).toEqual({ dir: 'up', abs: 5, tone: 'warn' });
    expect(deltaEntre(10, 13)).toEqual({ dir: 'up', abs: 3, tone: 'warn' });
  });

  it('subiu < 3 → up/neutral (sem drama)', () => {
    expect(deltaEntre(8, 9)).toEqual({ dir: 'up', abs: 1, tone: 'neutral' });
    expect(deltaEntre(8, 10)).toEqual({ dir: 'up', abs: 2, tone: 'neutral' });
  });

  it('igual → flat/neutral', () => {
    expect(deltaEntre(9, 9)).toEqual({ dir: 'flat', abs: 0, tone: 'neutral' });
  });
});

describe('proximaJanela(iso) — createdAt + 14d em DD/MM', () => {
  it('janela dentro do mesmo mês', () => {
    expect(proximaJanela('2026-09-14T10:00:00')).toBe('28/09');
  });

  it('janela virando o mês (28/09 → 12/10, caso do card G2)', () => {
    expect(proximaJanela('2026-09-28T08:30:00')).toBe('12/10');
  });

  it('virando ano (18/12 → 01/01)', () => {
    expect(proximaJanela('2026-12-18T09:00:00')).toBe('01/01');
  });

  it('ISO inválido → string vazia (nunca lança)', () => {
    expect(proximaJanela('não-data')).toBe('');
  });
});

describe('deltaLabel + mesDe — só o fato, nunca julgamento', () => {
  it('queda → seta ↓ e mês do registro anterior', () => {
    expect(deltaLabel(deltaEntre(13, 9), '2026-09-14T10:00:00')).toBe('↓4 desde setembro');
  });

  it('alta → seta ↑', () => {
    expect(deltaLabel(deltaEntre(4, 9), '2026-08-20T10:00:00')).toBe('↑5 desde agosto');
  });

  it('igual → ±0', () => {
    expect(deltaLabel(deltaEntre(9, 9), '2026-09-14T10:00:00')).toBe('±0 desde setembro');
  });

  it('mesDe em pt-BR minúsculo', () => {
    expect(mesDe('2026-01-10T10:00:00')).toBe('janeiro');
    expect(mesDe('2026-09-14T10:00:00')).toBe('setembro');
  });
});
