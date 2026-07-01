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
