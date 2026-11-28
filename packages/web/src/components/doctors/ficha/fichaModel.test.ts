import { describe, expect, it } from 'vitest';
import { ago, axisOf, bmi, bpSummary, buildCopySummary, egfrCkdEpi2021, fmtNum, isStale, linkInteractions, niceName, parseAllergy, parseConditions } from './fichaModel';

const NOW = new Date('2026-11-28T12:00:00Z').getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

describe('fichaModel', () => {
  it('TFGe CKD-EPI 2021 bate com a calculadora (homem 54a, Cr 1,42 → ~59)', () => {
    expect(egfrCkdEpi2021(1.42, 54, 'male')).toBe(59);
    expect(egfrCkdEpi2021(0.8, 40, 'female')).toBeGreaterThan(90);
    expect(egfrCkdEpi2021(1.2, 54, null)).toBeNull(); // sem sexo não chuta
    expect(egfrCkdEpi2021(1.2, 15, 'male')).toBeNull(); // pediátrico: outra fórmula
  });

  it('interação só fica vermelha quando o exame ligado ao efeito está fora da faixa', () => {
    const hit = { drugA: 'Losartana', drugB: 'Espironolactona', severity: 'grave', effect: 'Risco de hipercalemia (potássio alto).' };
    const red = linkInteractions([hit], [{ name: 'POTASSIO', value: 5.3, unit: 'mEq/L', abnormal: true, prev: 4.8 }]);
    expect(red[0].level).toBe('red');
    expect(red[0].title).toContain('Potássio 5,3 mEq/L (era 4,8)');
    expect(red[0].detail).toMatch(/avaliar/);
    const amber = linkInteractions([hit], [{ name: 'POTASSIO', value: 4.5, unit: 'mEq/L', abnormal: false }]);
    expect(amber[0].level).toBe('amber');
    expect(linkInteractions([hit], [])[0].level).toBe('amber');
  });

  it('eixos clínicos: HbA1c é glicêmico, hemoglobina do hemograma é sangue', () => {
    expect(axisOf('HEMOGLOBINA GLICADA').key).toBe('glic');
    expect(axisOf('HEMOGLOBINA').key).toBe('hemo');
    expect(axisOf('Potássio').key).toBe('renal');
    expect(axisOf('COLESTEROL LDL').key).toBe('lip');
    expect(axisOf('XYZ').key).toBe('outros');
    expect(niceName('HEMOGLOBINA GLICADA')).toBe('HbA1c');
  });

  it('perfil e alergia em texto livre', () => {
    expect(parseConditions('Hipertensão, diabetes tipo 2; ex-tabagista')).toEqual(['Hipertensão', 'Diabetes tipo 2', 'Ex-tabagista']);
    expect(parseConditions(null)).toEqual([]);
    expect(parseAllergy('Não')).toEqual({ has: false, text: '' });
    expect(parseAllergy('Dipirona (urticária)').has).toBe(true);
  });

  it('datas, números e PA', () => {
    expect(ago(daysAgo(9), NOW)).toBe('há 9 dias');
    expect(ago(daysAgo(130), NOW)).toBe('há 4 meses');
    expect(isStale(daysAgo(91), NOW)).toBe(true);
    expect(isStale(daysAgo(30), NOW)).toBe(false);
    expect(fmtNum(8.1)).toBe('8,1');
    expect(fmtNum(162)).toBe('162');
    expect(Math.round(bmi(92.4, 177)! * 10) / 10).toBe(29.5);
    const bp = bpSummary([{ systolic: 142, diastolic: 88, at: daysAgo(1) }, { systolic: 130, diastolic: 80, at: daysAgo(2) }]);
    expect(bp).toMatchObject({ systolic: 136, diastolic: 84, n: 2, above: 1 });
    expect(bpSummary([])).toBeNull();
  });

  it('resumo para colar: curto, com fonte e sem linguagem de conduta', () => {
    const txt = buildCopySummary({
      name: 'Carlos', age: 54, sex: 'male', convenio: 'Unimed', allergy: 'Dipirona', conditions: ['HAS', 'DM2'],
      meds: [{ name: 'Losartana 50 mg', frequency: '12/12h' }],
      changes: [{ name: 'HEMOGLOBINA GLICADA', prev: 7.4, last: 8.1, unit: '%' }], changesSince: daysAgo(130),
      egfr: 59, pending: ['Microalbuminúria'],
    });
    expect(txt).toContain('Carlos, 54a, M, Unimed.');
    expect(txt).toContain('Alergias: Dipirona.');
    expect(txt).toContain('HbA1c 7,4→8,1 %');
    expect(txt).toContain('TFGe 59 mL/min/1,73m² (CKD-EPI 2021).');
    expect(txt).toMatch(/Fonte: dados compartilhados pelo paciente/);
    expect(txt).not.toMatch(/suspender|diagn[oó]stico/i);
    expect(buildCopySummary({ name: 'X' })).toContain('Alergias: nenhuma informada pelo paciente.');
  });
});
