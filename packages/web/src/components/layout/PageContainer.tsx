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
 * Container de página padronizado: maxWidth token + gutter responsivo + padding
 * inferior que respeita a MobileBottomNav (CSS var --me-bottom-nav-h).
 * Substitui os <Box maxWidth={720|760|780|...}> espalhados pelas telas e os
 * chutes "calc(84px + env(...))" do rodapé móvel.
 *
 * Idioma visual idêntico ao já usado (Box mx:auto + px responsivo), só que
 * centralizado — nenhuma mudança de aparência por si, consistência no rastro.
 */
export const PageContainer = ({ width = 'content', children, sx, ...rest }: PageContainerProps) => (
  <Box
    sx={{
      width: '100%',
      maxWidth: typeof width === 'number' ? width : LAYOUT[width],
      mx: 'auto',
      px: { xs: LAYOUT.gutters.xs, md: LAYOUT.gutters.md },
      pb: LAYOUT.mobileBottomPad,
      ...(sx as object),
    }}
    {...rest}
  >
    {children}
  </Box>
);
