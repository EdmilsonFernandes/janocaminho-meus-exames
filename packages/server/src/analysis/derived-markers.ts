/**
 * derived-markers.ts — Índices derivados DETERMINÍSTICOS (sem IA).
 *
 * Fórmulas clínicas puras a partir dos dados do paciente + exames. Mesma filosofia
 * do health-state.ts: o quadro é DADO, não inferido por prompt. Cada função cita a
 * fonte e devolve null quando faltam entradas (NUNCA inventa valor).
 *
 * Fontes:
 *  - IMC:    OMS/WHO (kg/m²).
 *  - eGFR:   CKD-EPI 2021 (race-free) — Inker et al., NEJM 2021. Sem coeficiente de raça.
 *  - HOMA-IR: Matthews et al., Diabetologia 1985.
 *
 * Entradas esperadas (padrão laboratorial BR):
 *  - criatinina em mg/dL · glicemia em mg/dL (jejum) · insulina em µIU/mL (jejum)
 *  - peso em kg · altura em cm · idade em anos · sexo ('male' | 'female').
 *
 * Estes índices NÃO são diagnóstico — bandas são educativas (ver health-state/risk-rules).
 */
export type BioSex = 'male' | 'female';

/** Banda educativa de classificação. */
export type DerivedBand = 'normal' | 'attention' | 'alert';

/** Fonte/atribuição (M4: exibir no card "por quê?"). */
export const DERIVED_SOURCES = {
  imc: 'OMS/WHO — Índice de Massa Corporal (kg/m²)',
  egfr: 'CKD-EPI 2021 (race-free) — Inker et al., NEJM 2021',
  homaIr: 'HOMA-IR — Matthews et al., Diabetologia 1985',
} as const;

/** Índice de Massa Corporal (kg/m²), 1 casa decimal. Null se peso/altura inválidos. */
export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (weightKg == null || heightCm == null) return null;
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

/**
 * eGFR — Taxa de Filtração Glomerular estimada (mL/min/1.73m²), inteiro.
 * CKD-EPI 2021 (race-free): 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.200 × 0.9938^idade × (1.012 se mulher).
 * Exige sexo (κ/α diferem) — sem sexo, retorna null (não calcula valor possivelmente errado).
 */
export function egfr(
  creatinineMgDl: number | null | undefined,
  ageYears: number | null | undefined,
  sex: BioSex | null | undefined,
): number | null {
  if (creatinineMgDl == null || ageYears == null) return null;
  if (sex !== 'male' && sex !== 'female') return null; // eGFR é sexo-dependente
  const scr = Number(creatinineMgDl);
  const age = Number(ageYears);
  if (!Number.isFinite(scr) || !Number.isFinite(age) || scr <= 0 || age <= 0) return null;
  const isFemale = sex === 'female';
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const sexMult = isFemale ? 1.012 : 1.0;
  const scrK = scr / kappa;
  const v = 142
    * Math.pow(Math.min(scrK, 1), alpha)
    * Math.pow(Math.max(scrK, 1), -1.200)
    * Math.pow(0.9938, age)
    * sexMult;
  return Math.round(v);
}

/**
 * HOMA-IR — resistência insulínica (Matthews 1985). (glicemia × insulina) / 405.
 * Glicemia mg/dL + insulina µIU/mL (jejum). Corte comum: <2.5 normal; ≥2.5 resistência.
 */
export function homaIr(
  glucoseMgDl: number | null | undefined,
  insulinUiuMl: number | null | undefined,
): number | null {
  if (glucoseMgDl == null || insulinUiuMl == null) return null;
  const g = Number(glucoseMgDl);
  const i = Number(insulinUiuMl);
  if (!Number.isFinite(g) || !Number.isFinite(i) || g <= 0 || i < 0) return null;
  return Math.round(((g * i) / 405) * 100) / 100;
}

/** IMC → banda. Fonte: OMS. <18,5 baixo; 18,5–24,9 normal; 25–29,9 sobrepeso; ≥30 obesidade. */
export function bmiBand(imc: number | null): DerivedBand | null {
  if (imc == null) return null;
  if (imc < 18.5) return 'attention';
  if (imc < 25) return 'normal';
  if (imc < 30) return 'attention';
  return 'alert';
}

/** eGFR → banda (estágios DRC, KDIGO). ≥60 normal; 30–59 atenção; <30 alerta. */
export function egfrBand(egfrVal: number | null): DerivedBand | null {
  if (egfrVal == null) return null;
  if (egfrVal >= 60) return 'normal';
  if (egfrVal >= 30) return 'attention';
  return 'alert';
}

/** HOMA-IR → banda. <2,5 normal; 2,5–5 atenção; ≥5 alerta. */
export function homaIrBand(homa: number | null): DerivedBand | null {
  if (homa == null) return null;
  if (homa < 2.5) return 'normal';
  if (homa < 5) return 'attention';
  return 'alert';
}
