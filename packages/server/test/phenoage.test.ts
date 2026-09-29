import { describe, it, expect } from 'vitest';
import { calculatePhenoAge, crpMgLToMgDl } from '../src/analysis/phenoage';

/** Oráculo: caso de referência do KyteProject/phenotypic-age-calc (Levine 2018) —
 *  xb=-8.0477, M=0.061129, phenoAge=54.6395 (calculado com as mesmas constantes). */
describe('calculatePhenoAge — fórmula Levine 2018', () => {
  const base = {
    albuminGDdL: 4.1, creatinineMgDdL: 0.73, glucoseMgDdL: 94,
    crpMgD: crpMgLToMgDl(0.19), lymphocytePercent: 27.78, mcvFemtoliter: 88,
    rdwPercent: 13.6, alkalinePhosphatase: 48, whiteBloodCellCount: 3900,
    chronologicalAge: 64.12,
  };

  it('reproduz o caso de referência do paper (54,6 anos)', () => {
    const r = calculatePhenoAge(base);
    expect(r).not.toBeNull();
    expect(r!.phenotypicAge).toBeCloseTo(54.6, 0);
    expect(r!.mortalityScore).toBeCloseTo(-8.0477, 2);
  });

  it('perfil inflamatório/alterado envelhece mais que o saudável', () => {
    const worse = calculatePhenoAge({ ...base, crpMgD: crpMgLToMgDl(8), glucoseMgDdL: 130, rdwPercent: 15.5, whiteBloodCellCount: 9000 });
    expect(worse!.phenotypicAge).toBeGreaterThan(base.chronologicalAge);
    expect(worse!.phenotypicAge).toBeGreaterThan(58);
  });

  it('insumo fora de faixa fisiológica → null (cai pro z-score, nunca idade absurda)', () => {
    expect(calculatePhenoAge({ ...base, albuminGDdL: 0.1 })).toBeNull();
    expect(calculatePhenoAge({ ...base, crpMgD: 0 })).toBeNull(); // log(0)
    expect(calculatePhenoAge({ ...base, chronologicalAge: 15 })).toBeNull();
  });
});
