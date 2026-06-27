import type { ReactNode } from 'react';
import { Box, type BoxProps } from '@mui/material';
import { LAYOUT } from '../../theme';

type Width = 'content' | 'wide' | 'narrow' | number;

export interface PageContainerProps extends Omit<BoxProps, 'children'> {
  /** Largura máxima tokenizada ('content' | 'wide' | 'narrow') ou número fixo. Default 'content'. */
  width?: Width;
  children: ReactNode;
}

/**
 * Container de página padronizado: maxWidth token + mx auto + padding responsivo.
 * Substitui os <Box maxWidth={720|760|780|...} p={...} mx="auto"> espalhados pelas telas.
 *
 * NÃO adiciona padding inferior: o clearance da MobileBottomNav é responsabilidade do
 * shell (AppLayout, via calc(var(--me-bottom-nav-h) + 14px) no .RaLayout-content). Somar
 * pb aqui dobraria o espaço embaixo. Use `sx` para overrides (ex.: layout flex column).
 */
export const PageContainer = ({ width = 'content', children, sx, ...rest }: PageContainerProps) => (
  <Box
    sx={{
      width: '100%',
      maxWidth: typeof width === 'number' ? width : LAYOUT[width],
      mx: 'auto',
      p: { xs: 2, md: 3 },
      ...(sx as object),
    }}
    {...rest}
  >
    {children}
  </Box>
);
