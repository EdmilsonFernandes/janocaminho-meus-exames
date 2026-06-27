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

export interface AlertItemLike {
  flag?: string | null;
  valueNumeric?: number | null;
  refLow?: number | null;
  refHigh?: number | null;
}

/**
 * Calcula a prioridade de um item alterado.
 * - flag CRITICAL → Importante.
 * - Com valor numérico + faixa: magnitude = quão além do limite, relativo à LARGURA da faixa.
 *     • ≥ 100% além (deslocou ≥ uma faixa inteira) → Importante
 *     • 25%–100% → Moderada
 *     • < 25% → Leve
 * - Sem numérico/faixa: ABNORMAL/HIGH/LOW → Moderada (fallback sensato).
 */
export const priorityOf = (it: AlertItemLike | null | undefined): Priority => {
  if (!it) return 'leve';
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
