/**
 * Régua única do "fora da faixa" na Home — lógica pura (sem React), testada em markerBuckets.test.ts.
 *
 * Por que existe (IEC 62366, leitura de exame): herói, bloco "Fora da faixa" e card "Seus
 * Marcadores" precisam dizer a mesma coisa sobre o mesmo exame. Até 25/11/26 o card lia os
 * `buckets` do histórico (toda linha de resultado de todos os exames) e mostrava "3 requer
 * atenção" onde o herói não destacava nada.
 *
 * Mesma taxonomia de 3 níveis do herói (SEVERITY): Normal · Leve · Requer atenção. As prioridades
 * `leve` (desvio pequeno) e `moderada` são a família "Leve"; `importante` é "Requer atenção".
 * O `alerta + alterados` daqui é exatamente o número do bloco "Fora da faixa" e a soma das
 * pílulas do herói.
 */
export type PriorityCounts = { normal?: number; leve?: number; moderada?: number; importante?: number };
export type MarkerBuckets = { bons: number; alerta: number; alterados: number };

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Buckets no estado atual a partir do resumo de saúde (`health.byPriority` + `health.markers`).
 * Devolve null quando não há resumo ou nenhum marcador recente — nesse caso a tela cai nos
 * buckets do histórico e diz isso no rótulo.
 */
export function currentBucketsFromHealth(byPriority: PriorityCounts | null | undefined, markers: number | null | undefined): MarkerBuckets | null {
  if (!byPriority || !(markers != null && markers > 0)) return null;
  return {
    bons: count(byPriority.normal),
    alerta: count(byPriority.leve) + count(byPriority.moderada),
    alterados: count(byPriority.importante),
  };
}
