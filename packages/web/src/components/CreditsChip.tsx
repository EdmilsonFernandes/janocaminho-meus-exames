import { ReadsPill } from '@/components/reui/app-header';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useCredits } from '../hooks/useCredits';
import { CREDITS_INSUFFICIENT_EVENT } from '../utils/credits-events';
import { readsOf, useReadsDivisor } from '../utils/creditsLabel';
import { usePlanInfo } from '../utils/planInfo';

/** Saldo no AppBar em LINGUAGEM DE PRODUTO (18/10): "⚡ 4 leituras" em vez do número cru de
 *  créditos — o usuário entende quanto pode USAR, não quanto de moeda tem. Os créditos
 *  exatos seguem no tooltip/aria (e na carteira). Saldo < 1 leitura mostra os 💎 restantes
 *  (sobra honesta que soma com os próximos ganhos). Chip TONAL discreto (o gradiente/sombra
 *  são assinatura da MARCA, não da carteira); toque → /carteira.
 *
 *  REATIVO (hooks/useCredits.ts): poll 30s + evento creditsChanged + foco na aba — qualquer
 *  transação (compra PIX/cartão aprovada, chat, resumo, quiz, indicação paga pelo server)
 *  reflete no chip sem reload. */
export const CreditsChip = () => {
  const navigate = useNavigate();
  const { credits, bonusPending } = useCredits();
  const divisor = useReadsDivisor();
  const planInfo = usePlanInfo();
  // SHAKE (14/10, pedido do dono): 402 de qualquer feature → chip TREME em vermelho ~1,5s
  // (mesmo evento que abre o InsufficientCreditsDialog).
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    const onInsufficient = () => { setShaking(true); setTimeout(() => setShaking(false), 1500); };
    window.addEventListener(CREDITS_INSUFFICIENT_EVENT, onInsufficient);
    return () => window.removeEventListener(CREDITS_INSUFFICIENT_EVENT, onInsufficient);
  }, []);
  if (credits == null) return null;
  const full = credits.toLocaleString('pt-BR');
  const reads = readsOf(credits, divisor);
  // BÔNUS INVISÍVEL (auditoria 31/10): conta nova via "0 💎" no topo e nada contava que o 1º
  // exame libera o bônus — o chip vira a promessa enquanto ela é real (saldo 0 + não resgatado).
  const bonus = planInfo?.signupBonus ?? 0;
  const promiseBonus = credits === 0 && bonusPending === true && bonus > 0;
  // < 1 leitura: mostra a sobra em 💎 (a sobra soma com os próximos ganhos — nunca some).
  const shown = promiseBonus ? `🎁 +${bonus} 💎` : reads > 0 ? `${reads} ${reads === 1 ? 'leitura' : 'leituras'}` : `${credits} 💎`;
  const open = () => navigate(promiseBonus ? '/exams/create' : '/carteira');
  return (
    <ReadsPill
      onClick={open}
      icon={!promiseBonus}
      alert={shaking}
      aria-label={promiseBonus ? `Envie seu 1º exame e ganhe ${bonus} créditos de IA. Toque para enviar.` : `Você tem ${shown} (${full} créditos). Toque para ver a carteira.`}
      title={promiseBonus ? `Seu 1º exame libera +${bonus} créditos de IA — toque para enviar` : `${full} créditos = ${shown} — toque para ver a carteira`}
    >
      {shown}
    </ReadsPill>
  );
};
