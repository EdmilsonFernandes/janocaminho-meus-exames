import { describe, it, expect } from 'vitest';
import { evaluateCrossInsights } from '../src/analysis/cross-insights';

describe('Engine clínica determinística: Cruzamentos laboratoriais', () => {
  it('REGRA 01: Músculo vs Fígado (CK e TGO altos, GGT normal e TGP normal)', () => {
    const payload = evaluateCrossInsights([
      { name: 'Creatinofosfoquinase (CK)', valueNumeric: 1120, refHigh: 190 },
      { name: 'TGO (AST)', valueNumeric: 68, refHigh: 40 },
      { name: 'Gama-GT', valueNumeric: 21, refHigh: 50 },
      { name: 'TGP (ALT)', valueNumeric: 32, refHigh: 45 },
    ]);

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('musculo_vs_figado');
    expect(payload.category).toBe('sports');
    expect(payload.severity).toBe('info');
    expect(payload.badge_text).toBe('Modo Esporte');
    expect(payload.metrics.length).toBe(3);
    expect(payload.clinical_summary).toContain('esforço físico intenso');
    expect(payload.push_notification.title).toContain('Treinou pesado');
  });

  it('REGRA 02: Discordância Aterogênica (LDL <= 100 com ApoB > 90)', () => {
    const payload = evaluateCrossInsights([
      { name: 'Colesterol LDL', valueNumeric: 85, refHigh: 100 },
      { name: 'Apolipoproteína B (ApoB)', valueNumeric: 105, refHigh: 90 },
    ]);

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('discordancia_aterogenica');
    expect(payload.category).toBe('cardio');
    expect(payload.severity).toBe('warning');
    expect(payload.clinical_summary).toContain('Discordância aterogênica');
  });

  it('REGRA 03: Falsa Disfunção Renal (Creatinina alta com Cistatina-C normal)', () => {
    const payload = evaluateCrossInsights([
      { name: 'Creatinina', valueNumeric: 1.45, refHigh: 1.2 },
      { name: 'Cistatina-C', valueNumeric: 0.82, refHigh: 1.0 },
      { name: 'eGFR Cistatina', valueNumeric: 98 },
    ]);

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('falsa_disfuncao_renal');
    expect(payload.category).toBe('sports');
    expect(payload.severity).toBe('success');
    expect(payload.clinical_summary).toContain('massa muscular');
  });

  it('REGRA 04: Ferritina Inflamatória (Ferritina > 300, PCR alta, Sat. Transferrina <= 45%)', () => {
    const payload = evaluateCrossInsights([
      { name: 'Ferritina', valueNumeric: 480, refHigh: 300 },
      { name: 'PCR Ultrassensível', valueNumeric: 4.2, refHigh: 1.0 },
      { name: 'Saturação de Transferrina', valueNumeric: 28, refHigh: 45 },
    ]);

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('ferritina_inflamatoria');
    expect(payload.severity).toBe('info');
    expect(payload.clinical_summary).toContain('fase aguda');
  });

  it('REGRA 05: HOMA-IR Calculado (> 2.7)', () => {
    // (90 * 18) / 405 = 4.0
    const payload = evaluateCrossInsights([
      { name: 'Glicemia de Jejum', valueNumeric: 90 },
      { name: 'Insulina', valueNumeric: 18 },
    ]);

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('homa_ir_elevado');
    expect(payload.calculated_indexes.homa_ir).toBe(4);
    expect(payload.severity).toBe('warning');
  });

  it('REGRA 06: FIB-4 Calculado (> 2.67)', () => {
    // FIB-4 = (47 * 80) / (150 * sqrt(64)) = 3760 / (150 * 8) = 3760 / 1200 = 3.13
    const payload = evaluateCrossInsights(
      [
        { name: 'TGO', valueNumeric: 80 },
        { name: 'TGP', valueNumeric: 64 },
        { name: 'Plaquetas', valueNumeric: 150 },
      ],
      { ageYears: 47 }
    );

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('fib4_elevado');
    expect(payload.calculated_indexes.fib4).toBe(3.13);
    expect(payload.severity).toBe('critical');
  });

  it('REGRA 07: Viscosidade Sanguínea / TRT (Hematócrito > 52% em homem em TRT)', () => {
    const payload = evaluateCrossInsights(
      [{ name: 'Hematócrito', valueNumeric: 54.5, refHigh: 52 }],
      { sex: 'male', hasTrtOrSteroids: true }
    );

    expect(payload.has_cross_insight).toBe(true);
    expect(payload.insight_id).toBe('viscosidade_trt');
    expect(payload.severity).toBe('warning');
    expect(payload.clinical_summary).toContain('viscosidade sanguínea');
  });

  it('Priorização: critical supera warning e info', () => {
    // Paciente com Músculo vs Fígado (info) E FIB-4 alterado (critical)
    const payload = evaluateCrossInsights(
      [
        { name: 'CK', valueNumeric: 1200, refHigh: 190 },
        { name: 'TGO', valueNumeric: 120, refHigh: 40 },
        { name: 'GGT', valueNumeric: 25, refHigh: 50 },
        { name: 'TGP', valueNumeric: 50, refHigh: 45 },
        { name: 'Plaquetas', valueNumeric: 150 },
      ],
      { ageYears: 47 }
    );

    expect(payload.insight_id).toBe('fib4_elevado');
    expect(payload.severity).toBe('critical');
    expect(payload.secondary_insights).toBeDefined();
    expect(payload.secondary_insights?.length).toBeGreaterThan(0);
    expect(payload.secondary_insights?.[0].insight_id).toBe('musculo_vs_figado');
  });
});
