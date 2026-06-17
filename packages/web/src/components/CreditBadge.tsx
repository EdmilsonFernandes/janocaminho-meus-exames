import { Chip, Box } from '@mui/material';

// Espelho do CREDIT_COSTS do backend (packages/server/src/utils/credits.ts) — mantenha sincronizado.
// extração (upload) é GRÁTIS (Modelo A).
export const CREDIT_COSTS = { extraction: 0, summary: 5, consolidated: 25, chat: 1 } as const;

/** Selo "💎 N créditos" que mostra o custo de uma ação de IA antes do clique. */
export const CreditBadge = ({ amount, label, size = 'small', sx }: { amount: number; label?: string; size?: 'small' | 'medium'; sx?: any }) => (
  <Chip
    size={size}
    avatar={<Box sx={{ width: 16, fontSize: 13, textAlign: 'center' }}>💎</Box>}
    label={label ?? `${amount} crédito${amount > 1 ? 's' : ''}`}
    sx={{ bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', fontWeight: 700, height: size === 'small' ? 22 : 28, '& .MuiChip-avatar': { margin: '0 2px 0 6px' }, ...sx }}
  />
);
