import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import { ConfettiCanvas } from './Celebration';
import { CELEBRATE_EVENT, type CelebrationData, type CelebrationTrigger } from '../hooks/useCelebrate';

/**
 * CelebrateFx — overlay de feedback positivo (par do CreditRewardFx p/ os demais gatilhos:
 * exame pronto, meta de passos, premium ativado, score subiu). Escuta o barramento
 * `celebrate()` (hooks/useCelebrate.ts) e mostra pill discreta no topo + confetti da marca.
 *
 * Disciplina premium: 2,6s, NÃO bloqueia a UI (pointer-events none), prefers-reduced-motion
 * → pill estática sem confetti, 1 por vez (nova substitui a velha). Decorativa (aria-hidden):
 * a informação real sempre existe em outro lugar da tela — nada de ruído em leitor de tela.
 */

const PILL_MS = 2600;

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

type FxConfig = {
  emoji: string;
  title: (d: CelebrationData) => string;
};

const CONFIG: Record<Exclude<CelebrationTrigger, 'first_exam' | 'credits_earned'>, FxConfig> = {
  exam_extracted: {
    emoji: '✅',
    title: (d) => (d.count && d.count > 1 ? `${d.count} exames prontos! A IA terminou de ler.` : 'Exame pronto! A IA terminou de ler.'),
  },
  goal_reached: {
    emoji: '🎯',
    title: () => 'Meta de passos batida hoje!',
  },
  premium_activated: {
    emoji: '👑',
    title: () => 'Premium ativado!',
  },
  score_improved: {
    emoji: '⚡',
    title: (d) => (d.delta && d.delta > 0 ? `Score de saúde +${d.delta} desde sua última visita!` : 'Seu score de saúde subiu!'),
  },
};

export const CelebrateFx = () => {
  const [fx, setFx] = useState<{ trigger: CelebrationTrigger; data: CelebrationData; key: number } | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const { trigger, data } = (e as CustomEvent).detail ?? {};
      if (!trigger || !(trigger in CONFIG)) return;
      if (hideT.current) clearTimeout(hideT.current);
      setFx({ trigger, data: data ?? {}, key: Date.now() });
      hideT.current = setTimeout(() => setFx(null), PILL_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, onEvt as EventListener);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onEvt as EventListener);
      if (hideT.current) clearTimeout(hideT.current);
    };
  }, []);

  if (!fx || typeof document === 'undefined') return null;
  const cfg = CONFIG[fx.trigger as Exclude<CelebrationTrigger, 'first_exam' | 'credits_earned'>];

  return createPortal(
    <Box aria-hidden="true" sx={{
      position: 'fixed', inset: 0, zIndex: 1350, pointerEvents: 'none',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      pt: 'calc(env(safe-area-inset-top, 0px) + 64px)',
    }}>
      <ConfettiCanvas duration={2.5} count={40} />
      <Box key={fx.key} sx={{
        position: 'relative', zIndex: 1,
        display: 'inline-flex', alignItems: 'center', gap: 1, px: 2.25, py: 1.25,
        borderRadius: '999px',
        background: 'linear-gradient(135deg,#20b2aa,#178f89)',
        color: '#fff',
        boxShadow: '0 12px 32px rgba(32,178,170,.45), 0 2px 8px rgba(0,60,55,.25)',
        border: '1px solid rgba(255,255,255,.35)',
        animation: 'dxCelebPop .5s cubic-bezier(.2,1.4,.4,1) both, dxCelebFloat 2.1s ease-in-out .5s infinite',
        '@keyframes dxCelebPop': { from: { opacity: 0, transform: 'translateY(18px) scale(.7)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
        '@keyframes dxCelebFloat': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-5px)' } },
        ...(reducedMotion() ? { animation: 'dxCelebPop .2s ease both' } : {}),
      }}>
        <Box component="span" sx={{ fontSize: 20, lineHeight: 1 }}>{cfg.emoji}</Box>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 16, lineHeight: 1.15, maxWidth: { xs: 240, sm: 360 }, whiteSpace: 'normal' }}>
          {cfg.title(fx.data)}
        </Typography>
      </Box>
    </Box>,
    document.body,
  );
};
