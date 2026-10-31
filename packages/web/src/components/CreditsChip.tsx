import { Box, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
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
    <Box
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      role="button"
      tabIndex={0}
      aria-label={promiseBonus ? `Envie seu 1º exame e ganhe ${bonus} créditos de IA. Toque para enviar.` : `Você tem ${shown} (${full} créditos). Toque para ver a carteira.`}
      title={promiseBonus ? `Seu 1º exame libera +${bonus} créditos de IA — toque para enviar` : `${full} créditos = ${shown} — toque para ver a carteira`}
      sx={(theme) => ({
        display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none', flexShrink: 0,
        px: 1.25, minHeight: 40, mr: 0.5, borderRadius: '999px',
        // Cap de largura (P0 header): chip nunca cresce além disso nem empurra os irmãos.
        maxWidth: { xs: 128, sm: 170 }, overflow: 'hidden',
        // TONAL (fundo teal translúcido + texto teal): o gradiente/sombra ficam reservados à MARCA.
        // Texto #0f766e (light ~5,5:1) / #5fc9c3 (dark ~5,4:1) — AA nos dois temas.
        background: theme.palette.mode === 'dark' ? 'rgba(32,178,170,0.14)' : 'rgba(32,178,170,0.10)',
        border: theme.palette.mode === 'dark' ? '1px solid rgba(32,178,170,0.32)' : '1px solid rgba(32,178,170,0.25)',
        boxShadow: theme.palette.mode === 'dark' ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 3px rgba(32,178,170,0.08)',
        color: theme.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e',
        transition: 'all .15s ease',
        '&:hover': {
          background: theme.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.18)',
          boxShadow: '0 2px 8px rgba(32,178,170,0.18)',
          transform: 'translateY(-0.5px)',
        },
        '&:active': { transform: 'scale(.96)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        ...(shaking ? {
          animation: 'chipShake .45s ease-in-out 3',
          '@keyframes chipShake': { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
          background: 'rgba(239,68,68,.14)',
          border: '1px solid rgba(239,68,68,.45)',
          color: '#dc2626',
        } : {}),
      })}
    >
      <BoltIcon sx={{ fontSize: 16, color: '#f59e0b', filter: 'drop-shadow(0 1px 2px rgba(245,158,11,0.35))' }} />
      <Typography
        component="span"
        sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 12.5, lineHeight: 1, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {shown}
      </Typography>
    </Box>
  );
};
