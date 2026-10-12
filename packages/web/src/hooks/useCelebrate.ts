// useCelebrate — Sistema de Feedback Positivo (pedido do dono: "qualquer ação positiva
// merece animação igual à de compra de crédito").
//
// Um único barramento p/ TODAS as celebrações curtas: `celebrate(trigger, data?)` dispara
// de qualquer lugar (import direto ou via hook) e o <CelebrateFx /> (montado no App, ao
// lado do CreditRewardFx) desenha a pill + confetti.
//
// DISCIPLINA PREMIUM (especificação):
// - curta (2,6s), NÃO bloqueia a UI (overlay pointer-events:none);
// - respeita prefers-reduced-motion ( CelebrateFx desliga confetti/animação);
// - anti-spam: máx 1 celebração por 30s (global — não importa o trigger);
// - 'credits_earned' DELEGA pro CreditRewardFx existente (pill "+N créditos ⚡" é a
//   assinatura da marca p/ dinheiro — não duplicamos o efeito);
// - 'first_exam' NÃO passa por aqui: tem modal dedicado (Celebration.tsx, 1×/paciente).
import { useCallback } from 'react';
import { celebrateCredits } from '../components/CreditRewardFx';

export type CelebrationTrigger =
  | 'exam_extracted'    // exame terminou de processar (EXTRACTING → EXTRACTED)
  | 'credits_earned'    // comprou/ganhou créditos (delega ao CreditRewardFx)
  | 'goal_reached'      // meta de passos do Health Connect batida HOJE
  | 'premium_activated' // plano premium ativado (compra aprovada de plano)
  | 'score_improved'    // score de saúde subiu desde a última visita
  | 'first_exam';       // 1º exame — modal Celebration dedicado (fora do barramento)

export interface CelebrationData {
  /** exames que ficaram prontos (exam_extracted) */
  count?: number;
  /** variação do score (score_improved) */
  delta?: number;
  /** créditos ganhos (credits_earned) */
  amount?: number;
}

/** Evento p/ o CelebrateFx escutar (exportado p/ testes). */
export const CELEBRATE_EVENT = 'dx:celebrate';

/** Anti-spam global: máx 1 celebração por 30s. */
export const CELEBRATE_COOLDOWN_MS = 30_000;
let lastCelebrationAt = 0;

/** Dispara a celebração. Chame após o sucesso confirmado (nunca "vamos ver"). */
export const celebrate = (trigger: CelebrationTrigger, data: CelebrationData = {}): void => {
  if (typeof window === 'undefined') return;
  if (trigger === 'first_exam') return; // modal dedicado (Celebration.tsx) — pill seria dupla celebração
  // credits_earned sem valor não gasta o cooldown (celebrateCredits ignora amount <= 0).
  if (trigger === 'credits_earned' && !(Number(data.amount ?? 0) > 0)) return;
  const now = Date.now();
  if (now - lastCelebrationAt < CELEBRATE_COOLDOWN_MS) return; // anti-spam
  lastCelebrationAt = now;
  if (trigger === 'credits_earned') {
    // Pill "+N créditos ⚡" + confetti do CreditRewardFx (também refetcha o saldo do chip).
    celebrateCredits(Number(data.amount ?? 0));
    return;
  }
  window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT, { detail: { trigger, data } }));
};

/** Hook — devolve `celebrate` estável (o import direto é equivalente; o hook existe para
 *  consumir dentro de componentes com a API `const { celebrate } = useCelebrate()`). */
export const useCelebrate = () => ({ celebrate: useCallback(celebrate, []) });
