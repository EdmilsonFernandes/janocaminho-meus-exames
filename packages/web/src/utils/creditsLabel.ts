import { usePlanInfo } from './planInfo';

/**
 * LINGUAGEM DE PRODUTO: o usuário pensa em LEITURAS, não em créditos (decisão do dono
 * 18/10 — "estamos estranhos": 7 torneiras de crédito falando ao mesmo tempo). O crédito
 * continua sendo a moeda no servidor (nada muda por baixo) — aqui só vestimos a vitrine.
 *
 * Régua: 1 leitura = custo do RESUMO de exame (creditCosts.summary — settings, default 10).
 * Se o admin muda o custo do resumo, a régua acompanha sozinha.
 * - Saldo: floor(credits / régua) — 45 💎 = "4 leituras" (sobra 5 💎 segue nos créditos
 *   e aparece na carteira/tooltip — nunca se perde).
 * - Custo INTEIRO em leituras fala em leituras ("2 leituras"); fração de leitura (chat 3,
 *   share 5) NÃO vira "0,3 leitura" — mantém 💎 (moeda pequena pra gastos pequenos).
 */
export const READS_DEFAULT = 10;

export const readsOf = (credits: number, divisor = READS_DEFAULT): number =>
  Math.floor(credits / Math.max(1, divisor));

export const readsLabel = (credits: number, divisor = READS_DEFAULT): string => {
  const n = readsOf(credits, divisor);
  return `${n} ${n === 1 ? 'leitura' : 'leituras'}`;
};

/** Custo de UMA ação em linguagem de produto ("1 leitura" / "2 leituras" / "3 💎"). */
export const costLabel = (cost: number, divisor = READS_DEFAULT): string => {
  if (cost >= divisor && cost % divisor === 0) {
    const n = cost / divisor;
    return `${n} ${n === 1 ? 'leitura' : 'leituras'}`;
  }
  return `${cost} 💎`;
};

/** Régua viva (creditCosts.summary do /billing/plans — cache módulo, sem fetch extra). */
export const useReadsDivisor = (): number => {
  const info = usePlanInfo();
  const c = Number((info as any)?.summaryCost);
  return Number.isFinite(c) && c > 0 ? c : READS_DEFAULT;
};
