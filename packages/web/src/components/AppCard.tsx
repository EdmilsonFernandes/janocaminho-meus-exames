import type { ReactNode } from 'react';
import { Card, CardProps } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { RADIUS } from '../theme';

/**
 * AppCard — primitiva de Card do design-system (unifica as ~10 variantes inline).
 *
 * Variantes (`kind`):
 *   - default     : Card padrão (raio 16, borda sutil, sombra do theme) — o workhorse.
 *   - elevated    : sem borda, sombra um pouco mais forte (destaque).
 *   - interactive : cursor ponteiro + hover lift (cards clicáveis/lista).
 *   - tinted      : bg gradiente sutil do tone (o "teal-tint" duplicado ~18× no app).
 *   - accent      : borda esquerda colorida do tone (sinal, não cromagem) — duplicado ~12×.
 *   - outline     : variant="outlined" (KPI tiles, frames simples).
 *
 * `tone` (p/ tinted/accent): 'primary' | 'success' | 'warning' | 'error' | 'info' | 'premium'.
 *
 * Cores via theme.palette + alpha() (sem hex literal). Raio via RADIUS.card (token string).
 * Uso:
 *   <AppCard>Coffee</AppCard>
 *   <AppCard kind="tinted" tone="primary">Resumo IA</AppCard>
 *   <AppCard kind="accent" tone="error">Crítico</AppCard>
 *   <AppCard kind="interactive" onClick={...}>Abrir</AppCard>
 */
export type AppCardKind = 'default' | 'elevated' | 'interactive' | 'tinted' | 'accent' | 'outline';
export type AppCardTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'premium';

export interface AppCardProps extends Omit<CardProps, 'variant'> {
  kind?: AppCardKind;
  tone?: AppCardTone;
  children?: ReactNode;
}

const resolveTone = (theme: any, t: AppCardTone): string => {
  if (t === 'premium') return theme.palette.premium?.main ?? '#6366f1';
  return theme.palette[t]?.main ?? theme.palette.primary.main;
};

export const AppCard = ({ kind = 'default', tone = 'primary', sx, children, ...rest }: AppCardProps) => {
  const theme = useTheme();
  const col = resolveTone(theme, tone);

  const base: Record<string, unknown> = { borderRadius: RADIUS.card, overflow: 'hidden' };
  let extra: Record<string, unknown> = {};

  switch (kind) {
    case 'elevated':
      extra = { boxShadow: theme.shadows[6], border: 'none' };
      break;
    case 'interactive':
      extra = {
        cursor: 'pointer', border: 'none', boxShadow: theme.shadows[3],
        transition: 'transform .12s ease, box-shadow .2s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[8] },
        '&:active': { transform: 'translateY(0)' },
      };
      break;
    case 'tinted':
      extra = {
        bgcolor: `linear-gradient(135deg, ${alpha(col, 0.10)}, ${alpha(col, 0.02)})`,
        borderColor: 'divider',
      };
      break;
    case 'accent':
      extra = { borderLeft: `4px solid ${col}`, borderColor: 'divider' };
      break;
    case 'outline':
      // Card variant="outlined" via prop abaixo.
      break;
    default:
      break;
  }

  return (
    <Card
      variant={kind === 'outline' ? 'outlined' : undefined}
      sx={{ ...base, ...extra, ...(sx as object) }}
      {...rest}
    >
      {children}
    </Card>
  );
};
