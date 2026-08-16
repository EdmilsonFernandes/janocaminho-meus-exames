import type { ButtonProps } from '@mui/material';
import { Button } from '@mui/material';

/**
 * GradientButton — Button com o gradiente teal de MARCA garantido.
 *
 * O theme já aplica o gradiente em `containedPrimary` (theme.ts → MuiButton),
 * mas ~13 locais re-escrevem o gradiente inline (em buttons outlined, custom bg,
 * etc.). Esta primitiva centraliza: sempre gradiente teal, texto branco, hover
 * mais escuro — sem re-declarar CSS.
 *
 * Props: qualquer ButtonProps (size, startIcon, onClick, disabled, fullWidth…).
 * Não use `color`/`variant` (sobrescritos p/ garantir o gradiente).
 */
export const GradientButton = ({ sx, children, ...rest }: ButtonProps) => (
  <Button
    variant="contained"
    disableElevation
    sx={{
      background: 'linear-gradient(135deg, #20b2aa, #178f89)',
      color: '#fff',
      fontWeight: 700,
      textTransform: 'none',
      minHeight: 44, // CTA primário do sistema: alvo de toque confortável (craft-floor) — 25px antigo
      '&:hover': { background: 'linear-gradient(135deg, #1ca299, #0f7670)' },
      ...(sx as object),
    }}
    {...rest}
  >
    {children}
  </Button>
);
