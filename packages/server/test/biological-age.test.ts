import { describe, it, expect } from 'vitest';
import { estimateBiologicalAge } from '../src/analysis/biological-age';

/** Idade biológica — regressão do bug bash 28/09 ("esposa e eu sempre a mesma idade"):
 *  o dono suspeitou de fallback disfarçado. Estes testes PROVAM os três caminhos:
 *  (1) com marcadores ALTERADOS a bio DIFERE da cronológica (não-fallback!),
 *  (2) com marcadores saudáveis e ≥6 insumos → confiança ALTA (bio≈cronológica é
 *      o RESULTADO correto, não fallback — e vem carimbada),
 *  (3) sem marcadores → fallback EXPLÍCITO (confidence 'baixa', markersUsed 0),
 *      que a UI hoje rotula como "estimativa FRACA". */
describe('estimateBiologicalAge — não-fallback garantido', () => {
  it('perfil doente → bio MAIOR que a cronológica (o cálculo acontece de verdade)', () => {
    // Homem 40a com painel ruim: glicose 140, HbA1c 6.8, colesterol 260, LDL 190,
    // triglicerídeos 280, creatinina 1.6 — 6 marcadores, todos envelhecendo.
    const r = estimateBiologicalAge([
      { nameCanonical: 'GLICEMIA', value: 140 },
      { nameCanonical: 'HEMOGLOBINA_GLICADA', value: 6.8 },
      { nameCanonical: 'COLESTEROL_TOTAL', value: 260 },
      { nameCanonical: 'LDL', value: 190 },
      { nameCanonical: 'TRIGLICERIDES', value: 280 },
      { nameCanonical: 'CREATININA', value: 1.6 },
    ], 40, 'male');
    expect(r.markersUsed).toBe(6);
    expect(r.confidence).toBe('alta');
    expect(r.biologicalAge).toBeGreaterThan(40); // envelheceu — NÃO é a cronológica
  });

  it('perfil saudável completo → confiança alta e bio alinhada (resultado legítimo, não fallback)', () => {
    const r = estimateBiologicalAge([
      { nameCanonical: 'GLICEMIA', value: 85 },
      { nameCanonical: 'HEMOGLOBINA_GLICADA', value: 5.2 },
      { nameCanonical: 'COLESTEROL_TOTAL', value: 165 },
      { nameCanonical: 'LDL', value: 90 },
      { nameCanonical: 'TRIGLICERIDES', value: 90 },
      { nameCanonical: 'CREATININA', value: 0.9 },
      { nameCanonical: 'HEMOGLOBINA', value: 15.2 },
    ], 42, 'female');
    expect(r.markersUsed).toBe(7);
    expect(r.confidence).toBe('alta');
    // Saudável = delta pequeno: bio fica a ±1 da cronológica (40-43). É o cálculo, não fallback.
    expect(Math.abs(r.biologicalAge - 42)).toBeLessThanOrEqual(1);
  });

  it('sem marcadores → fallback EXPLÍCITO (confidence baixa, markersUsed 0)', () => {
    const r = estimateBiologicalAge([], 45, 'male');
    expect(r.markersUsed).toBe(0);
    expect(r.confidence).toBe('baixa');
    expect(r.biologicalAge).toBe(45); // devolve a cronológica — mas SEMPRE carimbada de fraca
  });

  it('poucos marcadores (<6) → confidence baixa (UI mostra “estimativa FRACA”)', () => {
    const r = estimateBiologicalAge([{ nameCanonical: 'GLICEMIA', value: 110 }], 50, 'male');
    expect(r.markersUsed).toBe(1);
    expect(r.confidence).toBe('baixa');
  });

  it('outlier absurdo (z>4) é descartado — não distorce a idade', () => {
    const r = estimateBiologicalAge([
      { nameCanonical: 'HEMOGLOBINA', value: 0.03 }, // erro de extração clássico
      { nameCanonical: 'GLICEMIA', value: 90 },
      { nameCanonical: 'COLESTEROL_TOTAL', value: 170 },
      { nameCanonical: 'LDL', value: 95 },
      { nameCanonical: 'TRIGLICERIDES', value: 80 },
      { nameCanonical: 'CREATININA', value: 0.8 },
    ], 40, 'male');
    expect(r.markersUsed).toBe(5); // Hb 0,03 caiu fora
    expect(r.biologicalAge).toBeGreaterThanOrEqual(38);
    expect(r.biologicalAge).toBeLessThanOrEqual(42);
  });
});
