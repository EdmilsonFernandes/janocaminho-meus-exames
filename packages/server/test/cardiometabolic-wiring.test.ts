import { describe, it, expect } from 'vitest';
import { assessCardiometabolicRisk } from '../src/analysis/cardiometabolic-risk';
import { bmi, egfr, homaIr } from '../src/analysis/derived-markers';

// Revisão clínica 2026-07 — corrige bug em health-state.ts onde o dynamic import devolvia as
// FUNÇÕES bmi/egfr/homaIr sem chamar, e o score cardiometabólico só considerava LDL/HbA1c/PAS
// (rim, resistência insulínica e obesidade eram ignorados). Este teste exercita o wiring
// derived-markers -> assessCardiometabolicRisk exatamente como o caller (agora corrigido) faz.
describe('cardiometabolic-risk — eGFR/HOMA-IR/IMC derivados entram no score (revisão 2026-07)', () => {
  it('eGFR reduzido (creatinina alta) adiciona fator renal', () => {
    const egfrVal = egfr(2.5, 60, 'male'); // creat 2.5 mg/dL, 60a, homem -> eGFR < 60
    expect(egfrVal).not.toBeNull();
    expect(egfrVal!).toBeLessThan(60);
    const r = assessCardiometabolicRisk({ egfr: egfrVal });
    expect(r).toBeTruthy();
    expect(r!.factors.some((f) => f.label.startsWith('eGFR') && f.risk)).toBe(true);
    expect(r!.score).toBeGreaterThan(0);
  });

  it('HOMA-IR elevado adiciona fator de resistência insulínica', () => {
    const h = homaIr(100, 20); // (100*20)/405 ≈ 4,94 -> > 2,5
    expect(h!).toBeGreaterThan(2.5);
    const r = assessCardiometabolicRisk({ homaIr: h });
    expect(r!.factors.some((f) => f.label.startsWith('HOMA-IR') && f.risk)).toBe(true);
  });

  it('IMC obesidade adiciona fator de peso', () => {
    const b = bmi(100, 170); // ≈ 34,6 -> obesidade
    expect(b!).toBeGreaterThan(30);
    const r = assessCardiometabolicRisk({ bmi: b });
    expect(r!.factors.some((f) => f.label.startsWith('IMC') && f.risk)).toBe(true);
  });

  it('sem nenhum insumo -> null', () => {
    expect(assessCardiometabolicRisk({})).toBeNull();
  });
});
