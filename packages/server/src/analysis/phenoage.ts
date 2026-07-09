/**
 * phenoage.ts — PhenoAge / Phenotypic Age (Liu et al. 2018, Aging).
 *
 * Fórmula cientificamente validada que estima idade biológica a partir de 9 biomarcadores
 * sanguíneos + idade cronológica. Determinística (matemática pura, sem IA).
 *
 * Marcadores obrigatórios: albumina, creatinina, glicose, PCR (CRP), linfócitos %,
 * VCM (MCV), RDW, fosfatase alcalina, leucócitos totais (WBC).
 *
 * Unidades esperadas pela fórmula: albumina g/L, creatinina µmol/L, glicose mmol/L,
 * PCR mg/dL, linfócitos %, VCM fL, RDW %, fosfatase alcalina U/L, leucócitos 1000/µL.
 *
 * EDUCATIVO: não substitui avaliação médica. Resultado informativo.
 */

export interface PhenoAgeInput {
  age: number;           // idade cronológica (anos) na data do exame
  albumin: number;       // g/L
  creatinine: number;    // µmol/L
  glucose: number;       // mmol/L
  crp: number;           // mg/dL (ln usado na fórmula — CRP deve ser > 0)
  lymphocytePct: number; // %
  mcv: number;           // fL
  rdw: number;           // %
  alkalinePhosphatase: number; // U/L
  wbc: number;           // 1000 células/µL
}

export interface PhenoAgeResult {
  biologicalAge: number;
  difference: number;    // bioAge - chronologicalAge
  method: 'phenoage';
  markersUsed: string[];
}

/**
 * Calcula PhenoAge / Phenotypic Age.
 * Retorna null se qualquer marcador for inválido (NaN, <=0 onde não pode).
 */
export function calculatePhenoAge(input: PhenoAgeInput): PhenoAgeResult | null {
  const { age, albumin, creatinine, glucose, crp, lymphocytePct, mcv, rdw, alkalinePhosphatase, wbc } = input;

  // Validação básica — nenhum valor pode ser NaN ou absurdo
  const vals = [age, albumin, creatinine, glucose, crp, lymphocytePct, mcv, rdw, alkalinePhosphatase, wbc];
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return null;
  if (crp <= 0 || age < 18) return null; // ln(CRP) precisa de > 0; PhenoAge validado só p/ adultos

  // xb (linear predictor) — coeficientes de Liu et al. 2018
  const xb =
    -19.907
    + (-0.0336 * albumin)
    + (0.0095 * creatinine)
    + (0.1953 * glucose)
    + (0.0954 * Math.log(crp))
    + (-0.0120 * lymphocytePct)
    + (0.0268 * mcv)
    + (0.3306 * rdw)
    + (0.0019 * alkalinePhosphatase)
    + (0.0554 * wbc)
    + (0.0804 * age);

  // Mortality score (Gompertz)
  const mortalityScore = 1 - Math.exp(-Math.exp(xb) * 0.0076927);

  // Phenotypic age
  if (mortalityScore <= 0 || mortalityScore >= 1) return null; // fora do domínio da fórmula
  const denom = -0.00553 * Math.log(1 - mortalityScore);
  if (denom <= 0) return null;
  const phenotypicAge = 141.50225 + Math.log(denom) / 0.090165;

  if (!Number.isFinite(phenotypicAge) || phenotypicAge < 0 || phenotypicAge > 150) return null;

  return {
    biologicalAge: Math.round(phenotypicAge),
    difference: Math.round(phenotypicAge - age),
    method: 'phenoage',
    markersUsed: ['Albumina', 'Creatinina', 'Glicose', 'PCR', 'Linfócitos %', 'VCM', 'RDW', 'Fosfatase Alcalina', 'Leucócitos'],
  };
}

// === Conversões de unidade (BR → PhenoAge) ===

/** Albumina: g/dL → g/L (×10) */
export const albuminGdLToGL = (g_dL: number) => g_dL * 10;

/** Creatinina: mg/dL → µmol/L (×88.4) */
export const creatinineMgDLToUmolL = (mg_dL: number) => mg_dL * 88.4;

/** Glicose: mg/dL → mmol/L (÷18) */
export const glucoseMgDLToMmolL = (mg_dL: number) => mg_dL / 18;

/** PCR: mg/L → mg/dL (÷10) */
export const crpMgLToMgDl = (mg_L: number) => mg_L / 10;

/** Leucócitos: células/µL → 1000/µL (÷1000) */
export const wbcPerULTo1000 = (per_uL: number) => per_uL / 1000;
