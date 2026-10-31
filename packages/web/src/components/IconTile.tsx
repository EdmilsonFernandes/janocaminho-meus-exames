import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material';

/**
 * IconTile — azulejo de ícone do padrão ReUI (de-para 30/10, pedido do dono).
 * Fonte ÚNICA pros azulejos que vinham sendo Box ad-hoc (menu, card de exame,
 * medicamentos, FDA, timeline): gradiente semântico com sombra da mesma família,
 * ou variante `soft` (lavagem + texto forte) pra superfícies discretas.
 */
const BASE: Record<string, { grad: string; shadow: string; strong: string }> = {
  teal:    { grad: 'linear-gradient(135deg,#20b2aa,#178f89)', shadow: '0 6px 14px -6px rgba(23,143,137,.5)',  strong: '#0f766e' },
  amber:   { grad: 'linear-gradient(135deg,#f59e0b,#d97706)', shadow: '0 6px 14px -6px rgba(217,119,6,.55)',  strong: '#b45309' },
  sky:     { grad: 'linear-gradient(135deg,#38bdf8,#0284c7)', shadow: '0 6px 14px -6px rgba(2,132,199,.5)',   strong: '#0369a1' },
  red:     { grad: 'linear-gradient(135deg,#ef4444,#dc2626)', shadow: '0 6px 14px -6px rgba(220,38,38,.5)',   strong: '#b91c1c' },
  indigo:  { grad: 'linear-gradient(135deg,#6366f1,#4f46e5)', shadow: '0 6px 14px -6px rgba(79,70,229,.5)',   strong: '#4338ca' },
  copper:  { grad: 'linear-gradient(135deg,#d4a574,#b8835a)', shadow: '0 6px 14px -6px rgba(184,131,90,.5)',  strong: '#92400e' },
  neutral: { grad: 'linear-gradient(135deg,#64748b,#475569)', shadow: '0 6px 14px -6px rgba(71,85,105,.45)',  strong: '#475569' },
};

export type IconTileTone = keyof typeof BASE;

export const IconTile = ({ children, tone = 'teal', size = 42, radius = 12, soft = false, sx }: {
  children: ReactNode;
  tone?: IconTileTone;
  /** Lado do quadrado em px (34 compacto · 42 card · 54 herói). */
  size?: number;
  radius?: number;
  /** Lavagem suave + ícone forte (sem gradiente) — pra listas densas. */
  soft?: boolean;
  sx?: SxProps<Theme>;
}) => {
  const t = BASE[tone] ?? BASE.teal;
  return (
    <Box
      aria-hidden
      sx={[
        {
          width: size, height: size, borderRadius: `${radius}px`, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          ...(soft
            ? {
              bgcolor: alpha(t.strong, 0.12),
              color: (th: Theme) => th.palette.mode === 'dark' ? alpha('#ffffff', 0.85) : t.strong,
              boxShadow: `inset 0 0 0 1px ${alpha(t.strong, 0.22)}`,
            }
            : { background: t.grad, color: '#fff', boxShadow: t.shadow }),
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {children}
    </Box>
  );
};
