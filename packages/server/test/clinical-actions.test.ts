import { describe, it, expect } from 'vitest';
import { computeClinicalActions } from '../src/analysis/clinical-actions';
import type { MarkerState } from '../src/analysis/health-state';
import type { ClinicalIndexResult } from '../src/analysis/clinical-indices';

/** MarkerState mínimo p/ o motor (campos usados: nameCanonical/name/priority/unit/latest). */
const mk = (nameCanonical: string, name: string, priority: MarkerState['priority'], valueNumeric: number | null, unit = 'mg/dL'): MarkerState =>
  ({ nameCanonical, name, priority, unit, refLow: null, refHigh: null, isAbnormal: priority !== 'normal', priorAbnormal: false,
     latest: { valueNumeric, valueText: valueNumeric != null ? String(valueNumeric) : null, performedAt: null, examId: null, stale: false },
     prior: null, deltaPct: null, trend: null } as unknown as MarkerState);

const idx = (key: string, name: string, value: number, level: ClinicalIndexResult['level']): ClinicalIndexResult =>
  ({ key, name, value, unit: '', level, interpretation: '', source: '', howTo: '' });

describe('clinical-actions: perguntas determinísticas pro médico', () => {
  it('tudo normal → nenhuma ação (silêncio honesto)', () => {
    const out = computeClinicalActions([mk('LDL_COLESTEROL', 'LDL', 'normal', 90)], [idx('castelli_i', 'Castelli I', 3.2, 'bom')]);
    expect(out).toHaveLength(0);
  });

  it('índice lipídico alterado → 1 ação do domínio cardiovascular com evidência do usuário', () => {
    const out = computeClinicalActions(
      [mk('LDL_COLESTEROL', 'LDL', 'alterado', 142)],
      [idx('castelli_i', 'Risco de Castelli I', 5.1, 'alterado')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe('Coração & vasos');
    expect(out[0].timeframe).toBe('semanas');
    expect(out[0].rationale).toContain('Castelli');
    expect(out[0].rationale).toContain('142');
    expect(out[0].source).toContain('SBC');
    expect(out[0].question).toMatch(/\?$/);
  });

  it('eGFR ruim vem PRIMEIRO (timeframe "agora" ordena antes de "semanas"/"rotina")', () => {
    const out = computeClinicalActions(
      [mk('LDL_COLESTEROL', 'LDL', 'alterado', 150), mk('TSH', 'TSH', 'alterado', 6.1)],
      [idx('castelli_i', 'Castelli I', 5, 'alterado'), idx('egfr', 'eGFR', 52, 'alterado')],
    );
    expect(out).toHaveLength(3);
    expect(out[0].domain).toBe('Rim');
    expect(out.map((a) => a.timeframe)).toEqual(['agora', 'semanas', 'semanas']);
  });

  it('máx. 1 ação por domínio (índice + marcador do mesmo domínio não duplicam)', () => {
    const out = computeClinicalActions(
      [mk('TRIGLICERIDES', 'Triglicerídeos', 'alterado', 210)],
      [idx('tg_hdl', 'TG/HDL', 4.8, 'alterado'), idx('aip', 'AIP', 0.6, 'alterado')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].rationale).toContain('TG/HDL');
  });

  it('cap de 6 ações mesmo com muitos domínios alterados', () => {
    const markers = [
      mk('LDL_COLESTEROL', 'LDL', 'alterado', 160),
      mk('GLICEMIA', 'Glicemia', 'alterado', 110),
      mk('CREATININA', 'Creatinina', 'alterado', 1.6),
      mk('TGP', 'TGP', 'alterado', 60),
      mk('TSH', 'TSH', 'alterado', 7),
      mk('HEMOGLOBINA', 'Hemoglobina', 'alterado', 11),
      mk('TESTOSTERONA', 'Testosterona', 'alterado', 250),
    ];
    const out = computeClinicalActions(markers, []);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.length).toBeGreaterThanOrEqual(6); // 7 domínios → capado em 6
  });
});
