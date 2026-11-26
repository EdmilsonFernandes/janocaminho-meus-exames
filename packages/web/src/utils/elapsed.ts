/**
 * Tempo decorrido de um exame em processamento — lógica pura (sem React), testada em elapsed.test.ts.
 *
 * O card "Em processamento" mostrava "há 86884:55" para um exame preso há dois meses (conta de QA,
 * 25/11/2026): o contador de minutos:segundos crescia sem limite. Agora ele sobe de unidade:
 *   até 1 hora      → "há 3:20"
 *   até 1 dia       → "há 2 h 05 min"
 *   a partir de 1 dia → "há mais de 1 dia" (o card já explica que está demorando e que o crédito volta)
 */
const HORA = 3600;
const DIA = 86400;

export function elapsedLabel(segundos: number): string {
  const s = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  if (s >= DIA) {
    const dias = Math.floor(s / DIA);
    return dias === 1 ? 'há mais de 1 dia' : `há ${dias} dias`;
  }
  if (s >= HORA) {
    const h = Math.floor(s / HORA);
    const min = String(Math.floor((s % HORA) / 60)).padStart(2, '0');
    return `há ${h} h ${min} min`;
  }
  return `há ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
