import { describe, it, expect, vi } from 'vitest';

// Mocka settings pra testar que classifyTemporal/getTemporalThresholds respeitam thresholds
// customizados (admin · app_settings). Defaults = spec clínica (6/12/12/36).
vi.mock('../src/utils/settings', async (importOriginal) => {
  const actual = await importOriginal<any>();
  let override: Record<string, number> | null = null;
  return {
    ...actual,
    getSettings: () => (override ? ({ temporalThresholds: override } as any) : actual.getSettings()),
    __setTemporalOverride: (v: Record<string, number> | null) => { override = v; },
  };
});

import { classifyTemporal, getTemporalThresholds } from '../src/analysis/health-state';
import { __setTemporalOverride } from '../src/utils/settings';

describe('Faixas temporais configuráveis (app_settings · temporalThresholds)', () => {
  it('defaults: classifyTemporal produz os buckets clínicos (6/12/36)', () => {
    __setTemporalOverride(null);
    expect(classifyTemporal(2, false)).toBe('atual');        // ≤6m
    expect(classifyTemporal(9, false)).toBe('recente');      // 6-12m
    expect(classifyTemporal(24, false)).toBe('historico');   // 1-3a
    expect(classifyTemporal(50, false)).toBe('antigo');      // >3a, sem alteração prévia
    expect(classifyTemporal(50, true)).toBe('desatualizado'); // >3a, COM alteração prévia
  });

  it('admin ampliou janelas (fresh=12/recent=24/old=60) → classify respeita', () => {
    __setTemporalOverride({ freshMonths: 12, recentMonths: 24, staleMonths: 24, oldMonths: 60 });
    expect(classifyTemporal(9, false)).toBe('atual');        // 9 ≤ 12 (fresh novo)
    expect(classifyTemporal(18, false)).toBe('recente');     // 12 < 18 ≤ 24
    expect(classifyTemporal(40, false)).toBe('historico');   // 24 < 40 ≤ 60
    expect(classifyTemporal(80, true)).toBe('desatualizado');
  });

  it('getTemporalThresholds reflete o override e cai no default se valor inválido', () => {
    __setTemporalOverride({ freshMonths: 3, recentMonths: 6, staleMonths: 6, oldMonths: 12 });
    const t = getTemporalThresholds();
    expect(t).toMatchObject({ freshMonths: 3, recentMonths: 6, staleMonths: 6, oldMonths: 12 });

    __setTemporalOverride({ freshMonths: 0, recentMonths: -1, staleMonths: NaN, oldMonths: 5 } as any);
    const t2 = getTemporalThresholds();
    expect(t2.freshMonths).toBe(6);   // 0 inválido → default
    expect(t2.recentMonths).toBe(12); // -1 inválido → default
    expect(t2.staleMonths).toBe(12);  // NaN inválido → default
    expect(t2.oldMonths).toBe(5);     // 5 válido → mantém
    __setTemporalOverride(null);
  });
});
