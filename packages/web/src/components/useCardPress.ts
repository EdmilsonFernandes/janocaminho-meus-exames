import { useEffect, useState } from 'react';

/**
 * usePrefersReducedMotion — ponto único p/ prefers-reduced-motion.
 * Regra do design system ("Consultório de Vidro"): `reduce` DESLIGA toda
 * animação/transição — nada de exceção "só essa aqui".
 * (Consolida a cópia local que vivia em DashboardV2.)
 */
export const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
};

/**
 * useCardPress — feedback tátil de "card pressionado": scale(.98) + sombra
 * achatada no estado `:active`. Espalhado no `base` do AppCard → vale para
 * TODOS os cards do app (o ripple do MUI dá o toque, o scale dá a física).
 *
 * - GPU-friendly: só `transform` + `box-shadow` (nada de layout thrash).
 * - prefers-reduced-motion: reduce → sem efeito (gate JS + media query de defesa).
 */
export const useCardPress = (): Record<string, unknown> => {
  const reduced = usePrefersReducedMotion();
  if (reduced) return {};
  return {
    // entrada/saída do press suaves, mesma família de curva do motion system
    transition: 'transform .15s cubic-bezier(.16,1,.3,1), box-shadow .2s ease',
    '&:active': { transform: 'scale(.98)', boxShadow: '0 1px 6px rgba(0,0,0,.10)' },
    // defesa p/ variantes que redeclaram `:active` sem passar pelo gate JS
    '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
  };
};
