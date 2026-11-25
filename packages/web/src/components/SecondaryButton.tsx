import type { ButtonProps } from '@mui/material';
import { Button } from '@mui/material';
import { RADIUS, tealText } from '../theme';

/**
 * SecondaryButton — a ação secundária do app, numa peça só.
 *
 * "Uma ação primária por tela": o gradiente de marca fica com o CTA principal (GradientButton).
 * Todo segundo botão da mesma tela usa este estilo — contorno teal discreto, texto no tom AA de
 * `tealText`, alvo de 44px. Até 25/11/26 cada card reescrevia o estilo inline (herói) ou virava
 * `contained`/gradiente (quiz, próximos passos, saúde mental), e a Home mostrava quatro botões
 * com cara de primário.
 *
 * Não use `variant`/`color` (sobrescritos para garantir o estilo secundário).
 */
export const SecondaryButton = ({ sx, children, variant: _variantIgnored, color: _colorIgnored, ...rest }: ButtonProps) => (
  <Button
    variant="outlined"
    disableElevation
    sx={{
      py: 1.1, px: 2.25, minHeight: 44, borderRadius: RADIUS.button,
      borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(45, 212, 191, 0.35)' : 'rgba(13, 148, 136, 0.35)'),
      color: (t) => tealText(t.palette.mode),
      fontWeight: 700, fontSize: 14, textTransform: 'none',
      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(45, 212, 191, 0.06)' : 'rgba(13, 148, 136, 0.04)'),
      '&:hover': {
        borderColor: 'primary.main',
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(45, 212, 191, 0.14)' : 'rgba(13, 148, 136, 0.08)'),
      },
      ...(sx as object),
    }}
    {...rest}
  >
    {children}
  </Button>
);
