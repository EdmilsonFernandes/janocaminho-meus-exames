import { describe, it, expect } from 'vitest';
import { estimateBiologicalAge, markersFor, HORMONE_MARKER_CANONICALS } from './biological-age';

// E3.3 (Saúde Esportiva) — bio-idade sem marcadores de T quando hormônio exógeno declarado.
// AC do backlog: paciente NORMAL = resultado IDÊNTICO ao atual; com hormônio = sem T nos pesos.

const MALE_47 = {
  GLICEMIA: 92, HEMOGLOBINA_GLICADA: 5.4, CREATININA: 1.0, COLESTEROL_TOTAL: 190,
  LDL: 110, TRIGLICERIDES: 130, LEUCOCITOS: 6500, PCR: 1.2, HEMOGLOBINA: 15.2,
  ALBUMINA: 4.4, VCM: 90, TGO: 25, TGP: 28,
  TESTOSTERONA_TOTAL: 551, TESTOSTERONA_LIVRE: 95,
};
const markersOf = (m: Record<string, number>) => Object.entries(m).map(([nameCanonical, value]) => ({ nameCanonical, value }));

describe('markersFor', () => {
  it('default (sem hormônio): conjunto COMPLETO com T total/livre', () => {
    const all = markersFor(false);
    expect(all.map((m) => m.canonical)).toEqual(expect.arrayContaining([...HORMONE_MARKER_CANONICALS]));
  });
  it('hormônio declarado: exclui EXATAMENTE T total/livre (nada mais)', () => {
    const full = markersFor(false);
    const cut = markersFor(true);
    expect(cut.map((m) => m.canonical)).not.toContain('TESTOSTERONA_TOTAL');
    expect(cut.map((m) => m.canonical)).not.toContain('TESTOSTERONA_LIVRE');
    expect(cut).toHaveLength(full.length - 2);
  });
});

describe('estimateBiologicalAge — não-regressão e variante sem-T', () => {
  it('paciente normal (sem hormônio): opts undefined e hasDeclaredHormones:false dão o MESMO resultado', () => {
    const a = estimateBiologicalAge(markersOf(MALE_47), 47, 'male');
    const b = estimateBiologicalAge(markersOf(MALE_47), 47, 'male', { hasDeclaredHormones: false });
    expect(a).toEqual(b); // byte/valor idêntico ao comportamento histórico
    expect(a.markersUsed).toBeGreaterThan(0);
    expect(a.detail.map((d) => d.label)).toContain('Testosterona total');
  });

  it('sem hormônio: conjunto completo calcula como ANTES (T entra no detalhe e na conta)', () => {
    const withT = estimateBiologicalAge(markersOf(MALE_47), 47, 'male');
    // Mesmo input SEM os valores de T → os demais marcadores têm mesmas contribuições;
    // T total 551 está DENTRO da faixa 300-1000 (mid 650): |z| pequeno mas ≠ 0 → detail tem T.
    expect(withT.detail.some((d) => d.label === 'Testosterona total')).toBe(true);
    expect(withT.detail.some((d) => d.label === 'Testosterona livre')).toBe(true);
  });

  it('com hormônio declarado: T some do conjunto (detalhe e contagem) e pesos renormalizam', () => {
    const cut = estimateBiologicalAge(markersOf(MALE_47), 47, 'male', { hasDeclaredHormones: true });
    expect(cut.detail.some((d) => /Testosterona/.test(d.label))).toBe(false);
    expect(cut.markersUsed).toBe(markersOf(MALE_47).length - 2);
    // Renormalização automática: sem T, o avgDelta divide só pelo peso dos demais — o
    // resultado pode mudar (é o esperado), mas NÃO pode ficar igual à variante com T no
    // arco: excluirmos 2 marcadores muda a média ponderada.
    const full = estimateBiologicalAge(markersOf(MALE_47), 47, 'male', { hasDeclaredHormones: false });
    // z(T total)=|551-650|/350≈0.28, z(T livre)=|95-115|/65≈0.31 → contribuições > 0
    // (U-shape: |z|) → removê-las REDUZ delta somado e o peso → idade sem-T ≤ com-T aqui.
    expect(cut.biologicalAge).toBeLessThanOrEqual(full.biologicalAge);
  });

  it('paciente SEM exames de T: resultado idêntico com e sem a flag (nada a excluir)', () => {
    const noT = Object.fromEntries(Object.entries(MALE_47).filter(([k]) => !HORMONE_MARKER_CANONICALS.includes(k as any)));
    expect(estimateBiologicalAge(markersOf(noT), 47, 'male', { hasDeclaredHormones: false }))
      .toEqual(estimateBiologicalAge(markersOf(noT), 47, 'male', { hasDeclaredHormones: true }));
  });
});
