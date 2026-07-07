/**
 * cardiometabolic-risk.ts — Score composto de risco cardiometabólico (regra determinística).
 *
 * Combina índices já derivados (eGFR, HOMA-IR, BMI) + LDL + pressão arterial + HbA1c
 * numa classificação simples: Baixo / Moderado / Alto. Baseado em diretrizes ESC/AHA
 * (simplificado — não substitui SCORE2 nem ASCVD).
 *
 * EDUCATIVO: não é diagnóstico. A decisão clínica é sempre do médico.
 */
export type CardioRiskLevel = 'baixo' | 'moderado' | 'alto';

export interface CardioRiskInput {
  ldl?: number | null;
  hba1c?: number | null;
  systolicBP?: number | null;
  egfr?: number | null;
  homaIr?: number | null;
  bmi?: number | null;
}

export interface CardioRiskResult {
  level: CardioRiskLevel;
  score: number; // 0-100 (maior = mais risco)
  factors: { label: string; risk: boolean }[];
}

/**
 * Calcula risco cardiometabólico. Cada fator contribui pontos:
 * - LDL > 160: +20; > 130: +10
 * - HbA1c > 6.5: +25; > 5.7: +10
 * - PAS > 140: +20; > 130: +10
 * - eGFR < 60: +15; < 90: +5
 * - HOMA-IR > 2.5: +15; > 1.5: +5
 * - BMI > 30: +10; > 25: +5
 *
 * Total: 0-30 = Baixo; 35-70 = Moderado; 75+ = Alto.
 */
export function assessCardiometabolicRisk(input: CardioRiskInput): CardioRiskResult | null {
  const hasAny = input.ldl != null || input.hba1c != null || input.systolicBP != null || input.egfr != null || input.homaIr != null || input.bmi != null;
  if (!hasAny) return null;

  let score = 0;
  const factors: { label: string; risk: boolean }[] = [];

  if (input.ldl != null) {
    if (input.ldl > 160) { score += 20; factors.push({ label: `LDL ${input.ldl} (alto)`, risk: true }); }
    else if (input.ldl > 130) { score += 10; factors.push({ label: `LDL ${input.ldl} (limítrofe)`, risk: true }); }
    else { factors.push({ label: `LDL ${input.ldl}`, risk: false }); }
  }
  if (input.hba1c != null) {
    if (input.hba1c >= 6.5) { score += 25; factors.push({ label: `HbA1c ${input.hba1c}% (diabetes)`, risk: true }); }
    else if (input.hba1c >= 5.7) { score += 10; factors.push({ label: `HbA1c ${input.hba1c}% (pré-diabetes)`, risk: true }); }
    else { factors.push({ label: `HbA1c ${input.hba1c}%`, risk: false }); }
  }
  if (input.systolicBP != null) {
    if (input.systolicBP > 140) { score += 20; factors.push({ label: `PAS ${input.systolicBP} (elevada)`, risk: true }); }
    else if (input.systolicBP > 130) { score += 10; factors.push({ label: `PAS ${input.systolicBP} (limítrofe)`, risk: true }); }
    else { factors.push({ label: `PAS ${input.systolicBP}`, risk: false }); }
  }
  if (input.egfr != null) {
    if (input.egfr < 60) { score += 15; factors.push({ label: `eGFR ${input.egfr} (reduzido)`, risk: true }); }
    else if (input.egfr < 90) { score += 5; factors.push({ label: `eGFR ${input.egfr} (leve redução)`, risk: true }); }
    else { factors.push({ label: `eGFR ${input.egfr}`, risk: false }); }
  }
  if (input.homaIr != null) {
    if (input.homaIr > 2.5) { score += 15; factors.push({ label: `HOMA-IR ${input.homaIr} (resistência)`, risk: true }); }
    else if (input.homaIr > 1.5) { score += 5; factors.push({ label: `HOMA-IR ${input.homaIr} (limítrofe)`, risk: true }); }
    else { factors.push({ label: `HOMA-IR ${input.homaIr}`, risk: false }); }
  }
  if (input.bmi != null) {
    if (input.bmi > 30) { score += 10; factors.push({ label: `IMC ${input.bmi.toFixed(1)} (obesidade)`, risk: true }); }
    else if (input.bmi > 25) { score += 5; factors.push({ label: `IMC ${input.bmi.toFixed(1)} (sobrepeso)`, risk: true }); }
    else { factors.push({ label: `IMC ${input.bmi.toFixed(1)}`, risk: false }); }
  }

  const level: CardioRiskLevel = score >= 75 ? 'alto' : score >= 35 ? 'moderado' : 'baixo';
  return { level, score: Math.min(100, score), factors };
}
