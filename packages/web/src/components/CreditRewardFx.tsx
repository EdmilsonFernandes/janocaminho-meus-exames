import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { ConfettiCanvas } from './Celebration';

/**
 * CreditRewardFx — feedback visível de ganho de créditos (padrão answer-here: recompensa
 * que o usuário VÊ). Qualquer parte do app dispara:
 *   celebrateCredits(3);
 * Overlay não-bloqueante (pointer-events none): pill "+N créditos ⚡" pulsando no topo com
 * confetti da marca atrás, auto-some. prefers-reduced-motion: sem confetti/bounce (pill estática).
 */

const EVT = 'dx:credit-reward';

/** Dispara o efeito de qualquer lugar (também dispara creditsChanged p/ o chip atualizar). */
export const celebrateCredits = (amount: number): void => {
  if (typeof window === 'undefined' || !(amount > 0)) return;
  window.dispatchEvent(new CustomEvent(EVT, { detail: { amount } }));
  window.dispatchEvent(new Event('creditsChanged'));
};

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export const CreditRewardFx = () => {
  const [reward, setReward] = useState<{ amount: number; key: number } | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const amount = Number((e as CustomEvent).detail?.amount ?? 0);
      if (!(amount > 0)) return;
      if (hideT.current) clearTimeout(hideT.current);
      setReward({ amount, key: Date.now() });
      hideT.current = setTimeout(() => setReward(null), 3600); // confetti 3,5s + respiro
    };
    window.addEventListener(EVT, onEvt as EventListener);
    return () => {
      window.removeEventListener(EVT, onEvt as EventListener);
      if (hideT.current) clearTimeout(hideT.current);
    };
  }, []);

  if (!reward || typeof document === 'undefined') return null;

  return createPortal(
    <Box aria-hidden="true" sx={{
      position: 'fixed', inset: 0, zIndex: 1350, pointerEvents: 'none',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      pt: 'calc(env(safe-area-inset-top, 0px) + 64px)',
    }}>
      <ConfettiCanvas duration={3.5} count={48} />
      <Box key={reward.key} sx={{
        position: 'relative', zIndex: 1,
        display: 'inline-flex', alignItems: 'center', gap: 1, px: 2.25, py: 1.25,
        borderRadius: '999px',
        background: 'linear-gradient(135deg,#20b2aa,#178f89)',
        color: '#fff',
        boxShadow: '0 12px 32px rgba(32,178,170,.45), 0 2px 8px rgba(0,60,55,.25)',
        border: '1px solid rgba(255,255,255,.35)',
        animation: 'dxCreditPop .5s cubic-bezier(.2,1.4,.4,1) both, dxCreditFloat 2.2s ease-in-out .5s infinite',
        '@keyframes dxCreditPop': { from: { opacity: 0, transform: 'translateY(18px) scale(.7)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
        '@keyframes dxCreditFloat': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-5px)' } },
        ...(reducedMotion() ? { animation: 'dxCreditPop .2s ease both' } : {}),
      }}>
        <BoltIcon sx={{ fontSize: 20 }} />
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>
          +{reward.amount.toLocaleString('pt-BR')} créditos
        </Typography>
      </Box>
    </Box>,
    document.body,
  );
};
