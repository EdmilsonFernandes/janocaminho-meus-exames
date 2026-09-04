import { Box } from '@mui/material';

/** Marcador de status sem emoji (a11y) — ponto colorido. */
export const statusDot = (color: string) => (
  <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, display: 'inline-block', flexShrink: 0 }} />
);
export const inlineStat = { display: 'inline-flex', alignItems: 'center', gap: 0.4, verticalAlign: 'middle' } as const;

/** Cards clicáveis acessíveis por TECLADO (WCAG 2.1.1) — Enter/Space disparam o clique. */
export const a11yClick = (fn: () => void) => ({
  onClick: fn,
  onKeyDown: (e: any) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  },
});
export const focusRingSx = { '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } } as const;

/** Cobre premium — assinatura do portal do médico. */
import { COPPER } from '../../../tokens';
export { COPPER };
