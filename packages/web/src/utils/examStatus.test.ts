import { describe, it, expect } from 'vitest';
import { displayStatus, isContextDependent } from './examStatus';

/**
 * displayStatus — NUMÉRICO-PRIMEIRO grauado (mandato 2026-08-18): o rótulo deriva do
 * VALOR × FAIXA EXIBIDA, com graus Abaixo/Muito abaixo/Acima/Muito acima (>20% além do
 * limite = "Muito"). Casos reais do bug da Heloisa (hemoglobina, série g/dL).
 */
describe('displayStatus — numérico-primeiro grauado', () => {
  // Bug reportado 2026-08-18: 12,9 "Abaixo" na tela com header 12–15,8 (a linha usava a faixa
  // 13–16,5 do PRÓPRIO exame). Classificando contra a faixa exibida → Normal.
  it('Hb 12,9 contra 12–15,8 → Normal (regressão do bug da Heloisa)', () => {
    const s = displayStatus('LOW', 'HEMOGLOBINA', 12, 15.8, 12.9);
    expect(s.short).toBe('Normal');
    expect(s.tone).toBe('normal');
  });

  it('Hb 12,6 contra 12–15,8 → Normal (continua normal)', () => {
    expect(displayStatus('NORMAL', 'HEMOGLOBINA', 12, 15.8, 12.6).short).toBe('Normal');
  });

  it('flag armazenado defasado NÃO vence o valor × faixa exibida', () => {
    // flag HIGH mas valor dentro da faixa exibida → Normal (nunca contradiz a faixa ao lado)
    expect(displayStatus('HIGH', 'HEMOGLOBINA', 12, 15.8, 13).short).toBe('Normal');
  });

  it('Hb 11 contra 12–15,8 → Abaixo (atenção; 8% além do limite, ainda não é "muito")', () => {
    const s = displayStatus('UNKNOWN', 'HEMOGLOBINA', 12, 15.8, 11);
    expect(s.short).toBe('Abaixo');
    expect(s.tone).toBe('atencao');
  });

  it('Hb 9 contra 12–15,8 → Muito abaixo (>20% além do limite)', () => {
    const s = displayStatus('UNKNOWN', 'HEMOGLOBINA', 12, 15.8, 9);
    expect(s.short).toBe('Muito abaixo');
    expect(s.tone).toBe('critico');
  });

  // Bug reportado 2026-08-18: hemoglobina 0,15 (extração ruim, sem faixa própria no ponto)
  // aparecia "—". Agora rotula contra a faixa exibida — consistência > silêncio.
  it('Hb 0,15 contra 12–15,8 → Muito abaixo (antes era "—")', () => {
    const s = displayStatus('UNKNOWN', 'HEMOGLOBINA', 12, 15.8, 0.15);
    expect(s.short).toBe('Muito abaixo');
    expect(s.tone).toBe('critico');
  });

  it('TSH 4,5 contra 0,4–4,0 → Acima; TSH 11 → Muito acima', () => {
    expect(displayStatus('HIGH', 'TSH', 0.4, 4, 4.5).short).toBe('Acima');
    const s = displayStatus('HIGH', 'TSH', 0.4, 4, 11);
    expect(s.short).toBe('Muito acima');
    expect(s.tone).toBe('critico');
  });

  it('limite exato (20%) separa Abaixo de Muito abaixo', () => {
    expect(displayStatus('UNKNOWN', 'X', 10, 20, 8.01).short).toBe('Abaixo');    // 19,9% além
    expect(displayStatus('UNKNOWN', 'X', 10, 20, 7.99).short).toBe('Muito abaixo'); // 20,1% além
    expect(displayStatus('UNKNOWN', 'X', 10, 20, 23.99).short).toBe('Acima');    // 19,95% além do high
    expect(displayStatus('UNKNOWN', 'X', 10, 20, 24.02).short).toBe('Muito acima');
  });
});

describe('displayStatus — fallbacks (sem valor numérico)', () => {
  it('flag HIGH sem valor → Acima', () => {
    expect(displayStatus('HIGH', 'X', 1, 2).short).toBe('Acima');
  });

  it('UNKNOWN + faixa + sem valor → "Não classificado" (—)', () => {
    const s = displayStatus('UNKNOWN', 'X', 1, 2);
    expect(s.short).toBe('—');
    expect(s.tone).toBe('neutro');
  });

  it('sem faixa + sem valor → "S/ referência"', () => {
    expect(displayStatus('UNKNOWN', 'HEMOGLOBINA', null, null).short).toBe('S/ referência');
  });

  it('sem faixa + LDL → contexto clínico', () => {
    expect(displayStatus('UNKNOWN', 'LDL', null, null).tone).toBe('contexto');
    expect(isContextDependent('LDL')).toBe(true);
  });

  it('faixa degenerada (refLow === refHigh) cai no fallback de flag', () => {
    expect(displayStatus('LOW', 'X', 5, 5, 3).short).toBe('Abaixo');
  });
});
