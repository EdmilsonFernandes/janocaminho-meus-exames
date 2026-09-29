/**
 * phenoage.ts — PhenoAge / Phenotypic Age (Levine et al. 2018, Aging; Liu et al. 2018).
 *
 * Fórmula cientificamente validada que estima idade biológica a partir de 9 biomarcadores
 * sanguíneos + idade cronológica. Determinística (matemática pura, sem IA). Constantes
 * portadas de KyteProject/phenotypic-age-calc (iguais ao paper) — oráculo validado
 * (caso de teste do repo): xb=-8.0477, M=0.061129, phenoAge=54.6395.
 *
 * Marcadores obrigatórios: albumina, creatinina, glicose, PCR (CRP), linfócitos %,
 * VCM (MCV), RDW, fosfatase alcalina, leucócitos totais (WBC).
 *
 * Unidades de ENTRADA (o que o app tem — BR): albumina g/dL, creatinina mg/dL,
 * glicose mg/dL, PCR mg/L, linfócitos %, VCM fL, RDW %, fosfatase alcalina U/L,
 * leucócitos /µL (ex.: 5780). Converções internas pra g/L, µmol/L, mmol/L, mg/dL, 10³/µL.
 *
 * EDUCATIVO: não substitui avaliação médica. Resultado informativo.
 */

export interface PhenoAgeInput {
  albuminGDdL: number;      // g/dL
  creatinineMgDdL: number;  // mg/dL
  glucoseMgDdL: number;     // mg/dL
  crpMgD: number;           // mg/dL (fonte comum: mg/L — usar crpMgLToMgDl)
  lymphocytePercent: number; // %
  mcvFemtoliter: number;    // fL
  rdwPercent: number;       // %
  alkalinePhosphatase: number; // U/L
  whiteBloodCellCount: number; // /µL (ex.: 5780)
  chronologicalAge: number; // anos
}

export interface PhenoAgeResult {
  phenotypicAge: number;   // anos (idade biológica PhenoAge)
  mortalityScore: number;  // xb (score de risco do modelo Gompertz)
  /** M (mortalidade acumulada estimada, 0-1) — educativo, não diagnóstico. */
  mortalityIndex: number;
  /** Contribuição de cada marcador no score (b_i × valor) — o 'porquê' explicável. */
  contributions: { label: string; value: string; contribution: number }[];
}

/** Conversões de unidade (o que os exames BR entregam → o que a fórmula quer). */
export const albuminGdLToGL = (g_dL: number) => g_dL * 10;
export const creatinineMgDLToUmolL = (mg_dL: number) => mg_dL * 88.401;
export const glucoseMgDLToMmolL = (mg_dL: number) => mg_dL * 0.0555;
export const crpMgLToMgDl = (mg_L: number) => mg_L / 10;
export const wbcPerULTo1000 = (per_uL: number) => per_uL / 1000;

/** Calcula o PhenoAge. Retorna null se qualquer insumo faltar/inválido (a fórmula
 *  exige os 9 + idade — sem improvisar: parcial vira fallback pro z-score simplificado). */
export function calculatePhenoAge(input: PhenoAgeInput): PhenoAgeResult | null {
  const { albuminGDdL, creatinineMgDdL, glucoseMgDdL, crpMgD, lymphocytePercent, mcvFemtoliter, rdwPercent, alkalinePhosphatase, whiteBloodCellCount, chronologicalAge } = input;
  // Sanidade dura (erro de extração não pode gerar idade absurda): faixas fisiológicas amplas.
  if (!(chronologicalAge >= 18 && chronologicalAge <= 120)) return null;
  if (!(albuminGDdL > 0.5 && albuminGDdL <= 7)) return null;
  if (!(creatinineMgDdL > 0.05 && creatinineMgDdL <= 20)) return null;
  if (!(glucoseMgDdL >= 20 && glucoseMgDdL <= 600)) return null;
  if (!(crpMgD > 0 && crpMgD <= 100)) return null; // log exige > 0
  if (!(lymphocytePercent > 0 && lymphocytePercent <= 100)) return null;
  if (!(mcvFemtoliter > 40 && mcvFemtoliter < 140)) return null;
  if (!(rdwPercent > 5 && rdwPercent < 30)) return null;
  if (!(alkalinePhosphatase > 5 && alkalinePhosphatase <= 5000)) return null;
  if (!(whiteBloodCellCount > 100 && whiteBloodCellCount <= 200000)) return null;

  const contrib = (label: string, value: string, c: number) => ({ label, value, contribution: Math.round(c * 10000) / 10000 });
  const parts = [
    contrib('Albumina (nutrição)', `${albuminGDdL} g/dL`, -0.0336 * albuminGdLToGL(albuminGDdL)),
    contrib('Creatinina (rim)', `${creatinineMgDdL} mg/dL`, 0.0095 * creatinineMgDLToUmolL(creatinineMgDdL)),
    contrib('Glicose', `${glucoseMgDdL} mg/dL`, 0.1953 * glucoseMgDLToMmolL(glucoseMgDdL)),
    contrib('PCR (inflamação)', `${crpMgD} mg/dL`, 0.0954 * Math.log(crpMgD)),
    contrib('Linfócitos', `${lymphocytePercent}%`, -0.0120 * lymphocytePercent),
    contrib('VCM (glóbulos)', `${mcvFemtoliter} fL`, 0.0268 * mcvFemtoliter),
    contrib('RDW (glóbulos)', `${rdwPercent}%`, 0.3306 * rdwPercent),
    contrib('Fosfatase alcalina', `${alkalinePhosphatase} U/L`, 0.00188 * alkalinePhosphatase),
    contrib('Leucócitos', `${Math.round(whiteBloodCellCount)}/µL`, 0.0554 * wbcPerULTo1000(whiteBloodCellCount)),
    contrib('Idade', `${chronologicalAge}a`, 0.0804 * chronologicalAge),
  ];
  const xb = -19.9067 + parts.reduce((s, p) => s + p.contribution, 0);

  const gamma = -1.51714;
  const lambda_ = 0.0076927;
  const M = 1 - Math.exp((gamma * Math.exp(xb)) / lambda_);
  if (!Number.isFinite(M) || M <= 0 || M >= 1) return null;

  const alpha = 141.50225;
  const beta = -0.00553;
  const lnTerm = beta * Math.log(1 - M);
  if (!(lnTerm > 0)) return null; // log de não-positivo → sem resultado
  const phenotypicAge = alpha + (Math.log(lnTerm) / 0.09165);
  if (!Number.isFinite(phenotypicAge)) return null;

  return {
    phenotypicAge: Math.round(phenotypicAge * 10) / 10,
    mortalityScore: Math.round(xb * 10000) / 10000,
    mortalityIndex: Math.round(M * 100000) / 100000,
    contributions: parts,
  };
}
