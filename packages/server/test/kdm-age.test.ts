import { describe, it, expect } from 'vitest';
import { calculateKdmAge, KDM_MIN_MARKERS, type KdmInput } from '../src/analysis/kdm-age';

/** Perfil saudável-típico masculino aos 45a: valores próximos das médias populacionais
 *  (NHANES III) — a expectativa do KDM é idade biológica ≈ cronológica. */
const HEALTHY_45_M: KdmInput = {
  chronologicalAge: 45,
  sex: 'male',
  albuminGDdL: 4.4,
  creatinineMgDdL: 1.05,
  glucoseMgDdL: 95,
  crpMgL: 1.5,
  lymphocytePercent: 30,
  mcvFemtoliter: 90,
  rdwPercent: 13.2,
  alkalinePhosphatase: 68,
  totalCholesterolMgDdL: 200,
  whiteBloodCellCount: 7000,
};

/** Perfil saudável-típico feminino (criatinina na média feminina — valida o caminho por sexo). */
const HEALTHY_45_F: KdmInput = {
  ...HEALTHY_45_M,
  sex: 'female',
  creatinineMgDdL: 0.82,
};

describe('calculateKdmAge — Klemera-Doubal 2006 (2º estimador)', () => {
  it('perfil saudável ≈ idade cronológica (±3a), com todos os marcadores', () => {
    const r = calculateKdmAge(HEALTHY_45_M);
    expect(r).not.toBeNull();
    expect(r!.markersUsed).toHaveLength(10);
    expect(Math.abs(r!.age - 45)).toBeLessThanOrEqual(3);
  });

  it('sexo feminino usa parâmetros femininos (criatinina 0,82 ≈ média → ≈ cronológica)', () => {
    const r = calculateKdmAge(HEALTHY_45_F);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.age - 45)).toBeLessThanOrEqual(3);
  });

  it('perfil alterado (PCR alto, glicose alta, creatinina alta) → MAIOR que a cronológica', () => {
    const healthy = calculateKdmAge(HEALTHY_45_M)!;
    const altered = calculateKdmAge({
      ...HEALTHY_45_M,
      crpMgL: 15,        // inflamação alta
      glucoseMgDdL: 130, // hiperglicemia
      creatinineMgDdL: 1.6, // função renal comprometida
    });
    expect(altered).not.toBeNull();
    expect(altered!.age).toBeGreaterThan(50); // bem acima dos 45
    expect(altered!.age).toBeLessThanOrEqual(60); // respeita o teto do clamp
    expect(altered!.age).toBeGreaterThan(healthy.age); // pior que o perfil saudável
  });

  it('clamp ±15a: perfil extremo satura exatamente em cronológica + 15', () => {
    const extreme = calculateKdmAge({
      ...HEALTHY_45_M,
      crpMgL: 80,
      glucoseMgDdL: 300,
      creatinineMgDdL: 3.0,
      albuminGDdL: 3.0,
      rdwPercent: 17,
      alkalinePhosphatase: 200,
      totalCholesterolMgDdL: 320,
      whiteBloodCellCount: 16000,
    });
    expect(extreme).not.toBeNull();
    expect(extreme!.rawUnclamped).toBeGreaterThan(60); // sem clamp passaria do teto
    expect(extreme!.age).toBe(60); // 45 + 15 (clamp igual ao resto do app)
  });

  it('clamp simétrico: perfil super-saudável extremo satura em cronológica − 15', () => {
    const rejuvenated = calculateKdmAge({
      ...HEALTHY_45_M,
      crpMgL: 0.3,
      glucoseMgDdL: 70,
      creatinineMgDdL: 0.7,
      albuminGDdL: 5.0,
      rdwPercent: 11.5,
      alkalinePhosphatase: 45,
      totalCholesterolMgDdL: 150,
      whiteBloodCellCount: 4000,
    });
    expect(rejuvenated).not.toBeNull();
    expect(rejuvenated!.age).toBe(30); // 45 − 15
  });

  it('insumo insuficiente (< KDM_MIN_MARKERS) → null (não improvisa)', () => {
    expect(KDM_MIN_MARKERS).toBe(4);
    const sparse = calculateKdmAge({
      chronologicalAge: 45,
      sex: 'male',
      glucoseMgDdL: 95,
      creatinineMgDdL: 1.05,
      albuminGDdL: 4.4, // só 3 marcadores
    });
    expect(sparse).toBeNull();
  });

  it('parcial com insumo suficiente (≥4) computa normalmente', () => {
    const partial = calculateKdmAge({
      chronologicalAge: 45,
      sex: 'male',
      glucoseMgDdL: 95,
      creatinineMgDdL: 1.05,
      albuminGDdL: 4.4,
      rdwPercent: 13.2,
      alkalinePhosphatase: 68, // 5 marcadores
    });
    expect(partial).not.toBeNull();
    expect(partial!.markersUsed).toHaveLength(5);
    expect(Number.isFinite(partial!.age)).toBe(true);
  });

  it('marcador fora de faixa fisiológica é descartado (erro de extração não vira idade absurda)', () => {
    const r = calculateKdmAge({ ...HEALTHY_45_M, crpMgL: 0 }); // log(0) inválido → excluído
    expect(r).not.toBeNull();
    expect(r!.markersUsed).toHaveLength(9);
    expect(r!.markersUsed).not.toContain('PCR');
    const absurd = calculateKdmAge({ ...HEALTHY_45_M, glucoseMgDdL: 5 }); // glicemia 5 mg/dL
    expect(absurd).not.toBeNull();
    expect(absurd!.markersUsed).not.toContain('GLICEMIA');
  });

  it('idade cronológica fora de [18, 120] → null (sanidade igual phenoage)', () => {
    expect(calculateKdmAge({ ...HEALTHY_45_M, chronologicalAge: 15 })).toBeNull();
    expect(calculateKdmAge({ ...HEALTHY_45_M, chronologicalAge: 200 })).toBeNull();
  });
});
