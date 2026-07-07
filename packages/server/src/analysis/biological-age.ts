/**
 * biological-age.ts — Estimativa de idade biológica baseada em marcadores sanguíneos.
 *
 * Modelo simplificado (não é PhenoAge completo): usa z-scores por idade/sexo de marcadores
 * comuns (hemoglobina, creatinina, glicemia, colesterol, leucócitos, albumina, VCM, PCR).
 * Cada marcador "envelhece" ou "rejuvenesce" o paciente proporcional ao seu desvio.
 *
 * IMPORTANTE: ESTIMATIVA EDUCATIVA, não diagnóstico. O objetivo é ENGAGEMENT (wow factor)
 * e consciência de saúde, não precisão clínica. Sempre acompanha disclaimer.
 *
 * Referências: PMC 10603148 (blood biomarkers for biological age), PhenoAge (Liu et al 2018).
 */
import type { BioSex } from './derived-markers';

interface MarkerInput { nameCanonical: string; value: number; }

/** Marcadores usados e seus pesos (quanto maior o peso, mais impacto na idade).
 *  'direction': +1 = valor ALTO envelhece; -1 = valor BAIXO envelhece. */
const AGE_MARKERS: { canonical: string; direction: 1 | -1 | 0; weight: number }[] = [
  { canonical: 'GLICEMIA', direction: 1, weight: 1.2 },      // glicose alta = envelhece
  { canonical: 'HEMOGLOBINA_GLICADA', direction: 1, weight: 1.5 },
  { canonical: 'CREATININA', direction: 1, weight: 1.0 },     // função renal
  { canonical: 'COLESTEROL_TOTAL', direction: 1, weight: 0.8 },
  { canonical: 'LDL', direction: 1, weight: 0.8 },
  { canonical: 'TRIGLICERIDES', direction: 1, weight: 0.6 },
  { canonical: 'LEUCOCITOS', direction: 1, weight: 0.7 },    // inflamação
  { canonical: 'PCR', direction: 1, weight: 1.0 },            // proteína C reativa
  { canonical: 'HEMOGLOBINA', direction: -1, weight: 0.8 },   // anemia envelhece
  { canonical: 'ALBUMINA', direction: -1, weight: 0.9 },      // nutrição/fígado
  { canonical: 'VCM', direction: 1, weight: 0.4 },
  { canonical: 'TESTOSTERONA_TOTAL', direction: 0, weight: 0.6 }, // U-shape: muito alto OU muito baixo envelhece
  { canonical: 'TESTOSTERONA_LIVRE', direction: 0, weight: 0.5 },
  { canonical: 'TGO', direction: 1, weight: 0.5 },             // AST — fígado
  { canonical: 'TGP', direction: 1, weight: 0.5 },             // ALT — fígado
];

/** Faixas de referência "saudável" por sexo (valores médios de adultos 20-40a).
 *  Usado pra normalizar o desvio — não é faixa clínica completa. */
const HEALTHY_RANGES: Record<string, { male: [number, number]; female: [number, number] }> = {
  GLICEMIA: { male: [70, 99], female: [70, 99] },
  HEMOGLOBINA_GLICADA: { male: [4.0, 5.6], female: [4.0, 5.6] },
  CREATININA: { male: [0.7, 1.2], female: [0.5, 0.9] },
  COLESTEROL_TOTAL: { male: [120, 200], female: [120, 200] },
  LDL: { male: [0, 130], female: [0, 130] },
  TRIGLICERIDES: { male: [0, 150], female: [0, 150] },
  LEUCOCITOS: { male: [4000, 10000], female: [4000, 10000] },
  PCR: { male: [0, 3], female: [0, 3] },
  HEMOGLOBINA: { male: [13.5, 17.5], female: [12.0, 15.5] },
  ALBUMINA: { male: [3.5, 5.0], female: [3.5, 5.0] },
  VCM: { male: [80, 100], female: [80, 100] },
  TESTOSTERONA_TOTAL: { male: [300, 1000], female: [15, 70] },
  TESTOSTERONA_LIVRE: { male: [50, 180], female: [0.3, 9] },
  TGO: { male: [10, 40], female: [7, 35] },
  TGP: { male: [10, 40], female: [7, 35] },
};

/**
 * Calcula idade biológica estimada.
 * @param markers Marcadores disponíveis do paciente (nameCanonical + value)
 * @param chronologicalAge Idade cronológica (anos)
 * @param gender Sexo biológico ('male' | 'female')
 * @returns { biologicalAge: number; confidence: 'alta' | 'baixa'; markersUsed: number }
 *   biologicalAge = idade cronológica + delta (soma dos desvios ponderados).
 *   confidence 'alta' se ≥6 marcadores usados, 'baixa' caso contrário.
 */
export function estimateBiologicalAge(
  markers: MarkerInput[],
  chronologicalAge: number,
  gender: BioSex | undefined,
): { biologicalAge: number; confidence: 'alta' | 'baixa'; markersUsed: number } {
  if (!chronologicalAge || chronologicalAge < 18 || markers.length === 0) {
    return { biologicalAge: chronologicalAge, confidence: 'baixa', markersUsed: 0 };
  }

  let totalDelta = 0;
  let totalWeight = 0;
  let used = 0;
  const sex: 'male' | 'female' = gender === 'female' ? 'female' : 'male';

  for (const m of markers) {
    const cfg = AGE_MARKERS.find((a) => a.canonical === m.nameCanonical);
    if (!cfg) continue;
    const range = HEALTHY_RANGES[cfg.canonical];
    if (!range) continue;
    const [lo, hi] = range[sex];
    const midpoint = (lo + hi) / 2;
    const halfRange = (hi - lo) / 2;

    // Desvio normalizado: quão longe do midpoint, em unidades de halfRange.
    // 0 = perfeitamente no meio da faixa. >1 = fora da faixa.
    const zScore = (m.value - midpoint) / (halfRange || 1);

    // direction = +1 (alto envelhece), -1 (baixo envelhece), 0 (U-shape: qualquer extremo envelhece)
    const ageDelta = cfg.direction === 0 ? Math.abs(zScore) : cfg.direction * zScore;

    // Clamp: cada marcador contribui no máximo ±3 anos (evita outlier dominar).
    const clampedDelta = Math.max(-3, Math.min(3, ageDelta * cfg.weight));

    totalDelta += clampedDelta;
    totalWeight += cfg.weight;
    used++;
  }

  if (used === 0 || totalWeight === 0) {
    return { biologicalAge: chronologicalAge, confidence: 'baixa', markersUsed: 0 };
  }

  // Média ponderada dos deltas (em anos)
  const avgDelta = totalDelta / totalWeight * 2.5; // escala: média ponderada → anos de diferença

  // Clamp: idade biológica não pode diferir mais que ±15 anos da cronológica
  const biologicalAge = Math.max(chronologicalAge - 15, Math.min(chronologicalAge + 15, Math.round(chronologicalAge + avgDelta)));

  return {
    biologicalAge,
    confidence: used >= 6 ? 'alta' : 'baixa',
    markersUsed: used,
  };
}
