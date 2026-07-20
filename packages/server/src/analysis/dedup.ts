/**
 * Dedup de medições laboratoriais — camada compartilhada por todas as views de série temporal
 * (timeseries, evolution, computeMarkerState, doctor.evolution). Centralizada pra garantir que
 * Dashboard / Evolução / Tendência / portal do médico contem o MESMO nº de pontos.
 *
 * Colapsa a MESMA coleta registrada em 2 PDFs/datas distintas — o caso real do Edmilson:
 *   painel tireoidiano 05/03 (TSH=25.7) + bundle "HEMOGRAMA COMPLETO" 06/03 (TSH=25.7)
 *   → mesmíssima medição, 2 exames (títulos diferentes), 1 dia de diferença.
 *
 * O dedup-por-dia (item.routes/health-state) não pega isso (dias diferentes). O backfill
 * tampoco (título E data diferentes). Este colapso cross-day resolve: mesma medição em dias
 * adjacentes vira 1 ponto, mantendo a data MAIS ANTIGA (performedAt de coleta é clinicamente
 * correto; a posterior é data de emissão/laudo/reenvio).
 *
 * Conservador: só colapsa se o valor for praticamente idêntico (relTol default 1%) E dentro
 * de uma janela curta (dayWindow default 3 dias). Dois exames consecutivos com valores
 * diferentes (evolução clínica real) permanecem como pontos separados.
 */

/**
 * Colapsa pontos adjacentes (ordenados por data) que estejam dentro de `dayWindow` dias E com
 * valor dentro de `relTol`. Mantém o mais antigo de cada cluster (encadeado: compara sempre
 * contra o último SOBREVIVENTE, não contra o predecessor imediato — assim um cluster inteiro
 * de re-envios do mesmo laudo vira 1 ponto só).
 *
 * @param pts       pontos (shape qualquer) — ordenados asc por data internamente
 * @param dateMsOf  accessor da data (ms epoch)
 * @param valueOf   accessor do valor numérico
 * @param dayWindow janela em dias (default 3) — cobre drift coleta vs emissão/laudo
 * @param relTol    tolerância relativa do valor (default 0.01 = 1%); 0 exige valor idêntico
 * @returns         pontos filtrados, em ordem asc por data (mais antigo → mais recente)
 */
export function collapseAdjacentNearDupes<T>(
  pts: T[],
  dateMsOf: (t: T) => number,
  valueOf: (t: T) => number,
  dayWindow = 3,
  relTol = 0.01,
): T[] {
  if (pts.length < 2) return pts;
  const sorted = [...pts].sort((a, b) => dateMsOf(a) - dateMsOf(b)); // asc = mais antigo → mais recente
  const kept: T[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = kept[kept.length - 1];
    const cur = sorted[i];
    const dayDiff = Math.abs(dateMsOf(cur) - dateMsOf(last)) / 86_400_000;
    const vLast = valueOf(last);
    const vCur = valueOf(cur);
    const sameValue =
      vLast === vCur || (vLast !== 0 && Math.abs(vCur - vLast) / Math.abs(vLast) <= relTol);
    if (dayDiff <= dayWindow && sameValue) continue; // descarta cur — mantém o mais antigo (data de coleta)
    kept.push(cur);
  }
  return kept;
}
