/**
 * Prioridade de um valor alterado — RUNTIME (sem schema, sem diagnóstico).
 *
 * IMPORTANTE (responsabilidade): isto é prioridade de ATENÇÃO pra o paciente se organizar
 * e levar ao médico — NÃO é gravidade clínica nem diagnóstico. A decisão final é sempre do médico.
 */

export type Priority = 'importante' | 'moderada' | 'leve';

export interface PriorityMeta { key: Priority; label: string; emoji: string; color: string; hint: string }

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  importante: { key: 'importante', label: 'Importante', emoji: '🔴', color: '#dc2626', hint: 'Leve ao médico com prioridade' },
  moderada:   { key: 'moderada',   label: 'Moderada',  emoji: '🟠', color: '#ea580c', hint: 'Comente na próxima consulta' },
  leve:       { key: 'leve',       label: 'Leve',      emoji: '🟡', color: '#ca8a04', hint: 'Acompanhe — pouco fora da faixa' },
};

/** Ordem de gravidade pra comparar/ordenar (importante > moderada > leve). */
export const PRIORITY_RANK: Record<Priority, number> = { importante: 3, moderada: 2, leve: 1 };

// ---------------------------------------------------------------------------
// Magnitude plausível por analito — bounds GENEROSOS (ordem de grandeza, NÃO faixa clínica).
// Usado SOMENTE pra detectar "valor plausível mas faixa em escala errada" (erro de leitura/OCR),
// nunca pra diagnosticar. Analito fora do mapa → sem checagem (comporta como antes).
//   lo/hi = ordem de grandeza típica do valor numérico (na unidade usual brasileira).
// ---------------------------------------------------------------------------
const PLAUSIBLE: { keys: string[]; lo: number; hi: number }[] = [
  { keys: ['hemoglob'], lo: 3, hi: 25 },
  { keys: ['hematoc'], lo: 10, hi: 75 },
  { keys: ['hemác', 'hemac', 'eritroc', 'eritróc', 'hemacia', 'hemácia'], lo: 0.5, hi: 12 }, // milhões/mm³
  { keys: ['reticuloc'], lo: 0.01, hi: 200 },
  { keys: ['vcm', 'cgm'], lo: 40, hi: 130 },
  { keys: ['hcm', 'rhc'], lo: 12, hi: 45 },
  { keys: ['chcm'], lo: 20, hi: 420 }, // 25-40 g/dL ou 250-400 g/L
  { keys: ['rdw'], lo: 5, hi: 30 },
  { keys: ['leucoc', 'leucóc', 'wbc'], lo: 200, hi: 60000 },
  { keys: ['neutro'], lo: 0.5, hi: 95 },
  { keys: ['linfoc', 'linfóc'], lo: 0.5, hi: 95 },
  { keys: ['monoc', 'eosino', 'baso'], lo: 0.1, hi: 90 },
  { keys: ['plaque', 'plaquet'], lo: 5000, hi: 1500000 },
  { keys: ['vpm', 'pdw'], lo: 5, hi: 20 },
  { keys: ['glicose', 'glicemi'], lo: 20, hi: 1000 },
  { keys: ['hba1c', 'glicosilada', 'glicosada', 'frutosam'], lo: 3, hi: 20 },
  { keys: ['insulina', 'homa'], lo: 0.1, hi: 1000 },
  { keys: ['colesterol', 'ldl', 'hdl', 'vldl', 'apolipo', 'castelli'], lo: 3, hi: 700 },
  { keys: ['triglic'], lo: 10, hi: 3000 },
  { keys: ['creatinina'], lo: 0.1, hi: 30 },
  { keys: ['ureia', 'uréia'], lo: 3, hi: 400 },
  { keys: ['acido urico', 'ácido úrico', 'urato'], lo: 0.5, hi: 30 },
  { keys: ['tfg', 'egfr', 'depura', 'clearance', 'cistatina'], lo: 1, hi: 200 },
  { keys: ['tgo', 'ast', 'tgp', 'alt', 'transamin'], lo: 2, hi: 2000 },
  { keys: ['gama-gt', 'gama gt', 'ggt', 'gamagt'], lo: 2, hi: 2000 },
  { keys: ['fosfatase alcalin'], lo: 10, hi: 1500 },
  { keys: ['bilirrub'], lo: 0.05, hi: 60 },
  { keys: ['albumina'], lo: 0.5, hi: 6 },
  { keys: ['tsh', 'tireotropina'], lo: 0.005, hi: 200 },
  { keys: ['t4', 'tiroxina', 't3'], lo: 0.05, hi: 600 },
  { keys: ['sodio', 'sódio'], lo: 110, hi: 170 },
  { keys: ['potassio', 'potáss'], lo: 1.5, hi: 15 },
  { keys: ['calcio', 'cálc'], lo: 1, hi: 15 },
  { keys: ['magnesio', 'magnés'], lo: 0.3, hi: 5 },
  { keys: ['cloro', 'cloret'], lo: 70, hi: 140 },
  { keys: ['fosforo', 'fósfor'], lo: 0.5, hi: 12 },
  { keys: ['pcr', 'proteina c reativa', 'proteína c reativa'], lo: 0.01, hi: 600 },
  { keys: ['vhs'], lo: 0.3, hi: 200 },
  { keys: ['ferritina'], lo: 0.5, hi: 6000 },
  { keys: ['ferro'], lo: 5, hi: 400 },
  { keys: ['transferr', 'tibc', 'uibc', 'saturacao', 'saturação'], lo: 1, hi: 600 },
  { keys: ['vitamina', 'acido folico', 'ácido fólico', 'folato', 'homociste'], lo: 0.3, hi: 2000 },
  { keys: ['trop'], lo: 0.001, hi: 1000 },
  { keys: ['inr', 'ratio', 'protrombina', 'ttpa', 'fibrinogen', 'fibrinogên'], lo: 0.2, hi: 200 },
];

const stripAcc = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Bounds plausíveis (ordem de grandeza) pra um analito, ou null se não mapeado. */
export const plausibleBoundsFor = (name?: string | null): { lo: number; hi: number } | null => {
  const n = stripAcc(name || '');
  if (!n) return null;
  for (const p of PLAUSIBLE) if (p.keys.some((k) => n.includes(stripAcc(k)))) return { lo: p.lo, hi: p.hi };
  return null;
};

/**
 * Suspeita de ERRO DE ESCALA na faixa (não de valor clínico):
 * o VALOR está dentro da magnitude plausível do analito, mas a FAIXA (refLow/refHigh) está FORA dela.
 * Isso indica leitura/OCR que escalou a faixa errada (ex.: Hemoglobina 15 com faixa 130-170).
 * Num crítico real, valor E faixa estão na mesma escala → não suspeito (não suprime críticos verdadeiros).
 */
export const refScaleSuspect = (it: { name?: string | null; nameCanonical?: string | null; valueNumeric?: number | null; refLow?: number | null; refHigh?: number | null }): boolean => {
  const v = it?.valueNumeric;
  const lo = it?.refLow, hi = it?.refHigh;
  if (v == null || lo == null || hi == null) return false;
  const b = plausibleBoundsFor(it?.nameCanonical || it?.name);
  if (!b) return false; // analito não mapeado → não opinamos
  const valPlausible = v >= b.lo && v <= b.hi;
  const refOutside = (lo < b.lo && hi < b.lo) || (lo > b.hi && hi > b.hi); // faixa inteira fora da magnitude
  return valPlausible && refOutside;
};

export interface AlertItemLike {
  flag?: string | null;
  valueNumeric?: number | null;
  refLow?: number | null;
  refHigh?: number | null;
  name?: string | null;
  nameCanonical?: string | null;
}

/**
 * Calcula a prioridade de um item alterado.
 * - Faixa possivelmente em escala errada (refScaleSuspect) → Leve (NUNCA 🔴 — pode ser erro de leitura).
 * - flag CRITICAL → Importante.
 * - Com valor numérico + faixa: magnitude = quão além do limite, relativo à LARGURA da faixa.
 *     • ≥ 100% além (deslocou ≥ uma faixa inteira) → Importante
 *     • 25%–100% → Moderada
 *     • < 25% → Leve
 * - Sem numérico/faixa: ABNORMAL/HIGH/LOW → Moderada (fallback sensato).
 */
export const priorityOf = (it: AlertItemLike | null | undefined): Priority => {
  if (!it) return 'leve';
  if (refScaleSuspect(it)) return 'leve'; // faixa duvidosa → nunca alarmar como importante
  const flag = (it.flag || '').toUpperCase();
  if (flag === 'CRITICAL') return 'importante';

  const v = it.valueNumeric;
  const lo = it.refLow;
  const hi = it.refHigh;
  if (v != null && lo != null && hi != null && hi > lo) {
    const width = hi - lo;
    if (v > hi) {
      const over = (v - hi) / width;
      if (over >= 1) return 'importante';
      if (over >= 0.25) return 'moderada';
      return 'leve';
    }
    if (v < lo) {
      const under = (lo - v) / width;
      if (under >= 1) return 'importante';
      if (under >= 0.25) return 'moderada';
      return 'leve';
    }
  }

  if (flag === 'ABNORMAL' || flag === 'HIGH' || flag === 'LOW') return 'moderada';
  return 'leve';
};

/** Maior prioridade de uma lista (pra colorir o cabeçalho do exame). */
export const maxPriority = (items: AlertItemLike[]): Priority =>
  items.reduce<Priority>((acc, it) => (PRIORITY_RANK[priorityOf(it)] > PRIORITY_RANK[acc] ? priorityOf(it) : acc), 'leve');

/** Exame "antigo" se a coleta foi há mais de `months` (default 12). Sem data → não marca. */
export const isStaleExam = (performedAt?: string | null, months = 12): boolean => {
  if (!performedAt) return false;
  const ms = Date.now() - new Date(performedAt).getTime();
  if (Number.isNaN(ms)) return false;
  return ms > months * 30 * 86400000;
};
