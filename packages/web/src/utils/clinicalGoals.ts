// Metas clínicas (E2 — camada 2 da política de referências, RELATORIO §4).
// Lógica PURA (sem React/DB) p/ ser testável: a meta é INFORMATIVA — nunca altera
// isAbnormal/flag/alertas (camada 4 intocada); ela só ADICIONA banda/chip/texto.
import type { ClinicalGoalView } from '@meus-exames/shared';

/** Meta vigente do analito (opcionalmente do paciente selecionado). */
export function goalFor(goals: ClinicalGoalView[] | null | undefined, analyte: string, patientId?: string | null): ClinicalGoalView | null {
  if (!goals?.length) return null;
  const key = (analyte ?? '').toUpperCase();
  const mine = goals.filter((g) => g.analyte === key && (!patientId || g.patientId === patientId));
  return mine[0] ?? null;
}

/** Valor dentro da meta? (limites null = sem piso/teto naquele lado). null se valor não-numérico. */
export function withinGoal(value: number | null | undefined, goal: Pick<ClinicalGoalView, 'targetLow' | 'targetHigh'> | null): boolean | null {
  if (!goal || value == null || !Number.isFinite(value)) return null;
  if (goal.targetLow != null && value < goal.targetLow) return false;
  if (goal.targetHigh != null && value > goal.targetHigh) return false;
  return true;
}

/** Valor dentro da referência do laboratório? (limites null = sem piso/teto naquele lado). */
export function withinRef(value: number | null | undefined, refLow?: number | null, refHigh?: number | null): boolean | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (refLow == null && refHigh == null) return null;
  if (refLow != null && value < refLow) return false;
  if (refHigh != null && value > refHigh) return false;
  return true;
}

/** Texto explícito do duplo-estado (REGRA DURA §4): mostrar AMBOS, nunca deixar a meta
 *  "explicar" uma alteração nem o valor normal "esconder" o desvio da meta.
 *  null = sem nada a declarar (dentro dos dois, ou sem dados p/ comparar). */
export function dualStatusText(inGoal: boolean | null, inRef: boolean | null): string | null {
  if (inGoal == null && inRef == null) return null;
  if (inGoal && inRef === false) return 'Atinge a meta clínica; permanece fora da referência do laboratório.';
  if (inGoal === false && inRef) return 'Está dentro da referência do laboratório, mas fora da meta clínica definida pelo médico.';
  if (inGoal === false && inRef === false) return 'Fora da meta clínica definida pelo médico e fora da referência do laboratório.';
  if (inGoal && inRef) return 'Dentro da meta clínica e da referência do laboratório.';
  return null;
}

/** Meta formatada p/ exibição: "450 – 600 ng/dL" / "≥ 450 ng/dL" / "≤ 600 ng/dL". */
export function goalRangeText(goal: { targetLow?: number | null; targetHigh?: number | null; unit?: string | null }): string {
  const u = goal.unit ? ` ${goal.unit}` : '';
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (goal.targetLow != null && goal.targetHigh != null) return `${fmt(goal.targetLow)} – ${fmt(goal.targetHigh)}${u}`;
  if (goal.targetLow != null) return `≥ ${fmt(goal.targetLow)}${u}`;
  if (goal.targetHigh != null) return `≤ ${fmt(goal.targetHigh)}${u}`;
  return '—';
}

// ── E2.5: métodos diferentes NÃO comparam (chip "⚠️ Métodos diferentes" + pontos isolados) ──

export interface MethodPoint { method?: string | null }

/** Métodos distintos enough p/ BLOQUEAR comparação? true quando há ≥2 métodos informados
 *  diferentes OU mistura de informado × não-informado (não dá para afirmar que é o mesmo
 *  ensaio — conservador clinicanente). Todos sem método → false (comportamento atual). */
export function hasMixedMethods(points: MethodPoint[]): boolean {
  const seen = new Set<string>();
  let hasNull = false;
  let hasKnown = false;
  for (const p of points) {
    const m = (p.method ?? '').trim();
    if (!m) { hasNull = true; continue; }
    hasKnown = true;
    seen.add(m.toUpperCase());
  }
  return seen.size >= 2 || (hasKnown && hasNull);
}

/** Por ponto: a LINHA deve "pular" este ponto (quebra o segmento vindo do anterior)?
 *  Quebra quando o método difere do ponto anterior (método informado vs não-informado
 *  também quebra — não dá para afirmar que é o mesmo ensaio). O ponto continua visível
 *  como dot isolado. Uso: valor=null no data point + série paralela só de dots. */
export function lineBreakFlags(points: MethodPoint[]): boolean[] {
  return points.map((p, i) => {
    if (i === 0) return false;
    const prev = (points[i - 1].method ?? '').trim().toUpperCase();
    const cur = (p.method ?? '').trim().toUpperCase();
    return prev !== cur;
  });
}
