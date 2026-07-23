import { describe, it, expect } from 'vitest';
import { assessRisk, type RiskMarker } from '../src/analysis/risk-engine';

const mk = (key: string, value: number, unit = ''): RiskMarker => ({ key, value, unit });

describe('risk-engine.assessRisk', () => {
  it('diabetes: glicose + HbA1c altas -> high, primary diabetes, 2 findings', () => {
    const r = assessRisk([
      mk('GLICEMIA', 168, 'mg/dL'), mk('HEMOGLOBINA_GLICADA', 8.1, '%'),
      mk('PRESSAO_SISTOLICA', 118, 'mmHg'), mk('PRESSAO_DIASTOLICA', 75, 'mmHg'),
      mk('LDL', 110, 'mg/dL'), mk('HDL', 52, 'mg/dL'), mk('TRIGLICERIDES', 120, 'mg/dL'),
      mk('HEMOGLOBINA', 14, 'g/dL'), mk('VCM', 88, 'fL'),
    ]);
    expect(r.predictedConditionKey).toBe('diabetes');
    expect(r.riskLevel).toBe('high');
    expect(r.findings.length).toBe(2);
    expect(r.markersEvaluated).toBe(9);
    expect(r.ruleConfidence).toBe('alta');
    expect(r.medicalDisclaimer).toContain('não substitui');
  });

  it('prediabetes: glicose 113 + HbA1c 5.9 -> low, primary prediabetes (dataset chamaria de Fit)', () => {
    const r = assessRisk([
      mk('GLICEMIA', 113, 'mg/dL'), mk('HEMOGLOBINA_GLICADA', 5.9, '%'),
      mk('PRESSAO_SISTOLICA', 122, 'mmHg'), mk('PRESSAO_DIASTOLICA', 76, 'mmHg'),
      mk('LDL', 118, 'mg/dL'), mk('HDL', 58, 'mg/dL'), mk('TRIGLICERIDES', 100, 'mg/dL'),
      mk('HEMOGLOBINA', 13.8, 'g/dL'), mk('VCM', 87, 'fL'),
    ]);
    expect(r.predictedConditionKey).toBe('prediabetes');
    expect(r.riskLevel).toBe('low');
  });

  it('anemia: Hb 9.5 + VCM 68 -> moderate, 2 findings', () => {
    const r = assessRisk([mk('HEMOGLOBINA', 9.5, 'g/dL'), mk('VCM', 68, 'fL')]);
    expect(r.predictedConditionKey).toBe('anemia');
    expect(r.findings.length).toBe(2);
    expect(['moderate', 'high']).toContain(r.riskLevel);
  });

  it('hemoglobina gender-aware: Hb 12.5 é anemia leve no homem, normal na mulher', () => {
    // homem (OMS: anemia Hb<13) => 12.5 cai na banda masculina 11–12.9 (low)
    const m = assessRisk([mk('HEMOGLOBINA', 12.5, 'g/dL')], 'male');
    expect(m.predictedConditionKey).toBe('anemia');
    expect(m.findings.length).toBe(1);
    expect(m.findings[0].severity).toBe('low');
    // mulher (OMS: anemia Hb<12) => 12.5 fora das bandas femininas => sem finding
    const f = assessRisk([mk('HEMOGLOBINA', 12.5, 'g/dL')], 'female');
    expect(f.predictedConditionKey).toBe('none');
    expect(f.findings.length).toBe(0);
    // sem sexo => default feminina (mais sensível) => sem finding em 12.5
    expect(assessRisk([mk('HEMOGLOBINA', 12.5, 'g/dL')]).findings.length).toBe(0);
  });

  it('hemoglobina gender-aware: Hb 9.5 -> moderate em ambos os sexos', () => {
    expect(assessRisk([mk('HEMOGLOBINA', 9.5, 'g/dL')], 'male').findings.length).toBe(1);
    expect(assessRisk([mk('HEMOGLOBINA', 9.5, 'g/dL')], 'female').findings.length).toBe(1);
  });

  it('M2 IMC derivado: 32 -> obesidade grau I (moderate)', () => {
    const r = assessRisk([mk('IMC', 32, 'kg/m²')]);
    expect(r.predictedConditionKey).toBe('obesidade');
    expect(r.findings.length).toBe(1);
    expect(['moderate', 'high']).toContain(r.riskLevel);
  });

  it('M2 eGFR derivado: 40 -> função renal reduzida (renal)', () => {
    const r = assessRisk([mk('EGFR', 40, 'mL/min/1.73m²')]);
    expect(r.predictedConditionKey).toBe('renal');
    expect(r.findings.length).toBe(1);
  });

  it('M2 HOMA-IR derivado: 4 -> resistência insulínica (insulinica)', () => {
    const r = assessRisk([mk('HOMA_IR', 4, '')]);
    expect(r.predictedConditionKey).toBe('insulinica');
    expect(r.findings.length).toBe(1);
  });

  it('M2 índices normais (IMC 22, eGFR 90) -> sem finding', () => {
    const r = assessRisk([mk('IMC', 22, 'kg/m²'), mk('EGFR', 90, 'mL/min/1.73m²')]);
    expect(r.findings.length).toBe(0);
    expect(r.predictedConditionKey).toBe('none');
  });

  it('escalonamento multi-sistema: HAS moderada + colesterol moderado -> high', () => {
    const r = assessRisk([
      mk('PRESSAO_SISTOLICA', 135, 'mmHg'), mk('PRESSAO_DIASTOLICA', 85, 'mmHg'),
      mk('LDL', 170, 'mg/dL'), mk('HDL', 50, 'mg/dL'), mk('TRIGLICERIDES', 100, 'mg/dL'),
    ]);
    expect(r.riskLevel).toBe('high');
    expect(r.conditions.length).toBe(2);
  });

  it('desempate: high_cholesterol (LDL+Trig, 2f) vence cardiovascular_risk (HDL, 1f)', () => {
    const r = assessRisk([mk('LDL', 170, 'mg/dL'), mk('TRIGLICERIDES', 220, 'mg/dL'), mk('HDL', 35, 'mg/dL')]);
    expect(r.predictedConditionKey).toBe('high_cholesterol');
  });

  it('fit: tudo normal -> none, low, sem findings', () => {
    const r = assessRisk([
      mk('GLICEMIA', 88, 'mg/dL'), mk('HEMOGLOBINA_GLICADA', 5.1, '%'),
      mk('PRESSAO_SISTOLICA', 112, 'mmHg'), mk('PRESSAO_DIASTOLICA', 70, 'mmHg'),
      mk('LDL', 95, 'mg/dL'), mk('HDL', 55, 'mg/dL'), mk('TRIGLICERIDES', 90, 'mg/dL'),
      mk('HEMOGLOBINA', 14.8, 'g/dL'), mk('VCM', 88, 'fL'),
    ]);
    expect(r.predictedConditionKey).toBe('none');
    expect(r.riskLevel).toBe('low');
    expect(r.findings.length).toBe(0);
    expect(r.userExplanation).toContain('não foram identificadas alterações');
  });

  it('ignora marcadores fora do escopo das regras', () => {
    const r = assessRisk([mk('GLICEMIA', 168, 'mg/dL'), mk('TSH', 4.2), mk('CREATININA', 1.0)]);
    expect(r.predictedConditionKey).toBe('diabetes');
    expect(r.markersEvaluated).toBe(1); // só GLICEMIA é das regras
  });

  it('confiança baixa com poucos marcadores', () => {
    const r = assessRisk([mk('GLICEMIA', 168, 'mg/dL')]);
    expect(r.ruleConfidence).toBe('baixa');
  });

  it('perguntas do médico preenchidas para condição ativa', () => {
    const r = assessRisk([mk('GLICEMIA', 168, 'mg/dL'), mk('HEMOGLOBINA_GLICADA', 8.1, '%')]);
    expect(r.doctorQuestions.length).toBeGreaterThan(0);
    expect(r.doctorQuestions.some((q) => q.includes('diabetes'))).toBe(true);
  });
});

// ───────── Revisão clínica 2026-07 (BioMCP: ATP-III/SBC-SBI; SBD 2025 PMID 40038723; SBC HAS PMID 38695411) ─────────
describe('risk-rules v1.1.0 — sexo-aware HDL, LDL≥190 (FH), wording "requer confirmação"', () => {
  it('HDL sexo-aware: mulher HDL 45 -> finding; homem HDL 45 -> sem finding', () => {
    // ATP-III/SBC: HDL protetor mulher <50, homem <40.
    const f = assessRisk([mk('HDL', 45, 'mg/dL')], 'female');
    expect(f.findings.some((x) => x.condition === 'cardiovascular_risk')).toBe(true);
    const m = assessRisk([mk('HDL', 45, 'mg/dL')], 'male');
    expect(m.findings.some((x) => x.condition === 'cardiovascular_risk')).toBe(false);
  });

  it('HDL 55 -> sem finding em ambos os sexos', () => {
    expect(assessRisk([mk('HDL', 55, 'mg/dL')], 'female').findings.length).toBe(0);
    expect(assessRisk([mk('HDL', 55, 'mg/dL')], 'male').findings.length).toBe(0);
  });

  it('LDL ≥190 -> high (possível hipercolesterolemia familiar)', () => {
    const f = assessRisk([mk('LDL', 195, 'mg/dL')]).findings.find((x) => x.condition === 'high_cholesterol');
    expect(f).toBeTruthy();
    expect(f!.severity).toBe('high');
    expect(f!.finding).toContain('familiar');
  });

  it('LDL 170 continua moderate (banda 160–189)', () => {
    const f = assessRisk([mk('LDL', 170, 'mg/dL')]).findings.find((x) => x.condition === 'high_cholesterol');
    expect(f).toBeTruthy();
    expect(f!.severity).toBe('moderate');
  });

  it('diabetes por glicemia isolada menciona confirmar (leitura única não diagnóstica)', () => {
    const d = assessRisk([mk('GLICEMIA', 168, 'mg/dL')]).findings.find((x) => x.condition === 'diabetes');
    expect(d).toBeTruthy();
    expect(d!.finding.toLowerCase()).toContain('confirm');
  });

  it('hipertensão por PAS menciona MAPA/várias medidas (leitura única não diagnóstica)', () => {
    const h = assessRisk([mk('PRESSAO_SISTOLICA', 150, 'mmHg')]).findings.find((x) => x.condition === 'hypertension');
    expect(h).toBeTruthy();
    expect(h!.finding).toMatch(/MAPA|várias medidas|aferição/i);
  });
});
