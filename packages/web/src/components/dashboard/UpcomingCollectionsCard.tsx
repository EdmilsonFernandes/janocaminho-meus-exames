import { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { AppCard } from '../AppCard';
import { API_URL, token } from '../../config';

// CHECKLIST DE COLETA (T2, 28/10/26) — card compacto "Próximas coletas" do dashboard.
// Só renderiza se houver itens PENDENTES (coletados ✓ e vencidos ficam no histórico da rota).
// Compacto: 1 coleta por vez com contagem; item coletado some sozinho (extração marca ✓).
// Teal #20b2aa (assinatura da marca); vencido em vermelho suave.

type Item = {
  id: string;
  analyteName: string;
  instruction: string | null;
  dueAt: string;
  status: string;
};

const daysLeft = (dueAt: string): number => Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400_000);

export const UpcomingCollectionsCard = () => {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;
    const t = token();
    if (!t) { setItems([]); return; }
    fetch(`${API_URL}/collection-checklist`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (alive) setItems(d.items ?? []); })
      .catch(() => { if (alive) setItems([]); }); // offline → não renderiza (padrão fetch-cache)
    return () => { alive = false; };
  }, []);

  if (!items) return null; // carregando: sem placeholder — card só "acorda" com dado
  const pending = items.filter((i) => i.status === 'pending');
  if (!pending.length) return null;

  const next = pending[0]; // ordenado por dueAt asc no server
  const left = daysLeft(next.dueAt);
  const overdue = left < 0;

  return (
    <AppCard sx={{ p: 1.75, mb: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        <Box component="span" sx={{ fontSize: 18 }}>🧪</Box>
        <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
          Próximas coletas{pending.length > 1 ? ` (${pending.length})` : ''}
        </Typography>
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.07)', border: '1px solid', borderColor: 'rgba(32,178,170,.18)' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: 'text.primary' }}>{next.analyteName}</Typography>
          <Typography variant="caption" sx={{ display: 'block', color: overdue ? '#b91c1c' : 'text.secondary', mt: 0.25 }}>
            {overdue ? `prazo vencido há ${-left} dia${-left > 1 ? 's' : ''}` : left === 0 ? 'coletar hoje' : `coletar em ${left} dia${left > 1 ? 's' : ''}`}
            {next.instruction ? ` · ${next.instruction}` : ''}
          </Typography>
          {pending.length > 1 && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
              + {pending.length - 1} outra{pending.length - 1 > 1 ? 's' : ''} coleta{pending.length - 1 > 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: overdue ? 'rgba(239,68,68,.10)' : 'rgba(32,178,170,.12)',
            color: overdue ? '#b91c1c' : '#20b2aa',
            fontWeight: 800, fontSize: 13,
          }}
        >
          {overdue ? '!' : `${Math.max(left, 0)}d`}
        </Box>
      </Stack>
    </AppCard>
  );
};
