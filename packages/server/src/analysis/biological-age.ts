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

/** Linha do "como chegamos" (29/09, pedido do dono): cada marcador usado com sua
 *  contribuição em anos — o card mostra ao clicar. delta>0 envelhece, <0 rejuvenesce. */
export interface BioMarkerDetail {
  label: string;          // nome amigável (GLICEMIA → Glicose)
  value: number;
  deltaYears: number;     // contribuição clamped (±3)
  status: 'ok' | 'envelhece' | 'rejuvenesce';
}

/** Marcadores usados e seus pesos (quanto maior o peso, mais impacto na idade).
 *  'direction': +1 = valor ALTO envelhece; -1 = valor BAIXO envelhece. */
const AGE_MARKERS: { canonical: string; direction: 1 | -1 | 0; weight: number; friendly?: string }[] = [
  { canonical: 'GLICEMIA', direction: 1, weight: 1.2, friendly: 'Glicose (jejum)' },      // glicose alta = envelhece
  { canonical: 'HEMOGLOBINA_GLICADA', direction: 1, weight: 1.5, friendly: 'Hemoglobina glicada (HbA1c)' },
  { canonical: 'CREATININA', direction: 1, weight: 1.0, friendly: 'Creatinina (rim)' },     // função renal
  { canonical: 'COLESTEROL_TOTAL', direction: 1, weight: 0.8, friendly: 'Colesterol total' },
  { canonical: 'LDL', direction: 1, weight: 0.8, friendly: 'LDL (colesterol ruim)' },
  { canonical: 'TRIGLICERIDES', direction: 1, weight: 0.6, friendly: 'Triglicérides' },
  { canonical: 'LEUCOCITOS', direction: 1, weight: 0.7, friendly: 'Leucócitos (inflamação)' },    // inflamação
  { canonical: 'PCR', direction: 1, weight: 1.0, friendly: 'Proteína C reativa (inflamação)' },            // proteína C reativa
  { canonical: 'HEMOGLOBINA', direction: -1, weight: 0.8, friendly: 'Hemoglobina (anemia)' },   // anemia envelhece
  { canonical: 'ALBUMINA', direction: -1, weight: 0.9, friendly: 'Albumina (nutrição/fígado)' },      // nutrição/fígado
  { canonical: 'VCM', direction: 1, weight: 0.4, friendly: 'VCM (glóbulos vermelhos)' },
  { canonical: 'TESTOSTERONA_TOTAL', direction: 0, weight: 0.6, friendly: 'Testosterona total' }, // U-shape: muito alto OU muito baixo envelhece
  { canonical: 'TESTOSTERONA_LIVRE', direction: 0, weight: 0.5, friendly: 'Testosterona livre' },
  { canonical: 'TGO', direction: 1, weight: 0.5, friendly: 'TGO (fígado)' },             // AST — fígado
  { canonical: 'TGP', direction: 1, weight: 0.5, friendly: 'TGP (fígado)' },             // ALT — fígado
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
 * E3.3 (Saúde Esportiva) — conjunto de marcadores conforme hormônio exógeno DECLARADO.
 *
 * `hasDeclaredHormones=true` (Medication ativa com prefixo '[Hormônio]' OU perfil clínico
 * citando testosterona — ver caller em health-state.ts) EXCLUI testosterona total/livre do
 * conjunto: testosterona EXÓGENA invalida o marcador — o valor reflete a reposição/uso, não
 * a fisiologia do paciente, e a curva U-shape pararia de significar "envelhecimento".
 *
 * Os pesos dos demais NÃO precisam de renormalização manual: estimateBiologicalAge já
 * normaliza pela soma dos pesos dos marcadores REALMENTE usados (totalWeight acumula só os
 * usados), então remover T do conjunto re-normaliza automaticamente a contribuição relativa
 * de cada um. false = conjunto COMPLETO — paciente normal tem resultado IDÊNTICO ao
 * histórico (mesmos números; teste de não-regressão em biological-age.sports.test.ts).
 */
export const HORMONE_MARKER_CANONICALS = ['TESTOSTERONA_TOTAL', 'TESTOSTERONA_LIVRE'] as const;

export function markersFor(hasDeclaredHormones: boolean): typeof AGE_MARKERS {
  return hasDeclaredHormones ? AGE_MARKERS.filter((m) => !HORMONE_MARKER_CANONICALS.includes(m.canonical as any)) : AGE_MARKERS;
}

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
  opts?: { hasDeclaredHormones?: boolean },
): { biologicalAge: number; confidence: 'alta' | 'baixa'; markersUsed: number; detail: BioMarkerDetail[] } {
  if (!chronologicalAge || chronologicalAge < 18 || markers.length === 0) {
    return { biologicalAge: chronologicalAge, confidence: 'baixa', markersUsed: 0, detail: [] };
  }

  // E3.3: sem hormônio declarado (default) o conjunto é o completo — resultado idêntico ao
  // histórico. Com hormônio declarado, T sai do conjunto (ver markersFor).
  const ageMarkers = markersFor(!!opts?.hasDeclaredHormones);

  let totalDelta = 0;
  let totalWeight = 0;
  let used = 0;
  const detail: BioMarkerDetail[] = [];
  const sex: 'male' | 'female' = gender === 'female' ? 'female' : 'male';

  for (const m of markers) {
    const cfg = ageMarkers.find((a) => a.canonical === m.nameCanonical);
    if (!cfg) continue;
    const range = HEALTHY_RANGES[cfg.canonical];
    if (!range) continue;
    const [lo, hi] = range[sex];
    const midpoint = (lo + hi) / 2;
    const halfRange = (hi - lo) / 2;

    // Desvio normalizado: quão longe do midpoint, em unidades de halfRange.
    // 0 = perfeitamente no meio da faixa. >1 = fora da faixa.
    const zScore = (m.value - midpoint) / (halfRange || 1);

    // Filtro de plausibilidade (revisão 2026-07): descarta valores absurdos (erro de extração —
    // ex.: hemoglobina 0,03 g/dL) que inflam/distorcem a idade biológica. |zScore|>4 = >4 meias-
    // faixas do centro, claramente fora do esperado. Legítimos levemente alterados (ex.: Hb 9) seguem.
    if (!Number.isFinite(zScore) || Math.abs(zScore) > 4) continue;

    // direction = +1 (alto envelhece), -1 (baixo envelhece), 0 (U-shape: qualquer extremo envelhece)
    const ageDelta = cfg.direction === 0 ? Math.abs(zScore) : cfg.direction * zScore;

    // Clamp: cada marcador contribui no máximo ±3 anos (evita outlier dominar).
    const clampedDelta = Math.max(-3, Math.min(3, ageDelta * cfg.weight));

    totalDelta += clampedDelta;
    totalWeight += cfg.weight;
    used++;
    detail.push({
      label: cfg.friendly ?? cfg.canonical,
      value: m.value,
      deltaYears: Math.round(clampedDelta * 10) / 10,
      status: clampedDelta > 0.15 ? 'envelhece' : clampedDelta < -0.15 ? 'rejuvenesce' : 'ok',
    });
  }

  if (used === 0 || totalWeight === 0) {
    return { biologicalAge: chronologicalAge, confidence: 'baixa', markersUsed: 0, detail: [] };
  }

  // Média ponderada dos deltas (em anos)
  const avgDelta = totalDelta / totalWeight * 2.5; // escala: média ponderada → anos de diferença

  // Clamp: idade biológica não pode diferir mais que ±15 anos da cronológica
  const biologicalAge = Math.max(chronologicalAge - 15, Math.min(chronologicalAge + 15, Math.round(chronologicalAge + avgDelta)));

  return {
    biologicalAge,
    confidence: used >= 6 ? 'alta' : 'baixa',
    markersUsed: used,
    detail,
  };
}
