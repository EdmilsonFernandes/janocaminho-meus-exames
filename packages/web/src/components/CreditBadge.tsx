import { Chip, Box } from '@mui/material';
import { API_URL, token } from '../config';

// Default — sincronizado com o backend. Atualizado via fetchCreditCosts() no startup.
// NÃO usar `as const` — o admin pode mudar os valores em runtime.
export const CREDIT_COSTS: { extraction: number; summary: number; consolidated: number; chat: number } = { extraction: 0, summary: 10, consolidated: 20, chat: 2 };

/** Busca os custos atuais do backend (admin pode ter mudado). Chama no startup do app. */
export async function syncCreditCosts() {
  try {
    const r = await fetch(`${API_URL}/billing/plans`);
    if (r.ok) {
      const d = await r.json();
      if (d.creditCosts) {
        CREDIT_COSTS.chat = d.creditCosts.chat ?? CREDIT_COSTS.chat;
        CREDIT_COSTS.summary = d.creditCosts.summary ?? CREDIT_COSTS.summary;
        CREDIT_COSTS.consolidated = d.creditCosts.consolidated ?? CREDIT_COSTS.consolidated;
        CREDIT_COSTS.extraction = d.creditCosts.extraction ?? CREDIT_COSTS.extraction;
      }
    }
  } catch { /* fallback: defaults do código */ }
}

/** Selo "💎 N créditos" que mostra o custo de uma ação de IA antes do clique. */
export const CreditBadge = ({ amount, label, size = 'small', sx }: { amount: number; label?: string; size?: 'small' | 'medium'; sx?: any }) => (
  <Chip
    size={size}
    avatar={<Box sx={{ width: 16, fontSize: 13, textAlign: 'center' }}>💎</Box>}
    label={label ?? `${amount} crédito${amount > 1 ? 's' : ''}`}
    sx={{ bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', fontWeight: 700, height: size === 'small' ? 22 : 28, '& .MuiChip-avatar': { margin: '0 2px 0 6px' }, ...sx }}
  />
);
