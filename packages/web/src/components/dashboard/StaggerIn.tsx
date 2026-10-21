import type { ReactNode } from 'react';
import { Box, type BoxProps } from '@mui/material';

/**
 * StaggerIn — entrada escalonada dos PRIMEIROS cards da viewport do Dashboard
 * (hero=0ms, KPI=100ms, "o que mudou"=200ms, demais=300ms). Aparece no mount —
 * diferente do ScrollReveal (IntersectionObserver, para o que está ABAIXO da
 * dobra), este é para o que o usuário vê já na 1ª pintura: nada de card pipocar
 * de uma vez; também nada de animar os 20 cards da página.
 *
 * - @keyframes dxCardIn: opacity 0→1 + translateY(12px→0), .5s ease-out.
 * - `both`: segura o estado inicial durante o animation-delay (card não "vaza").
 * - GPU-friendly: só transform/opacity.
 * - prefers-reduced-motion: animação desligada — card aparece direto, sem delay.
 */
export const StaggerIn = ({ delay = 0, children, sx, ...rest }: { delay?: number; children: ReactNode } & BoxProps) => (
  <Box
    sx={{
      animation: `dxCardIn .5s ease-out ${delay}ms both`,
      '@keyframes dxCardIn': {
        from: { opacity: 0, transform: 'translateY(12px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
      '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1, transform: 'none' },
      ...sx,
    }}
    {...rest}
  >
    {children}
  </Box>
);
