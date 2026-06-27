import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Button, LinearProgress, IconButton, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { API_URL, token } from '../config';
import { PageContainer } from '../components/layout/PageContainer';

interface Badge {
  id: string; emoji: string; title: string; desc: string;
  metric: string; threshold: number; reward: number;
  earned: boolean; progress: number; claimed: boolean; claimable: boolean;
}
interface State {
  badges: Badge[]; streak: number; creditsClaimed: number; creditsAvailable: number;
  balance: number; achievementAlerts: boolean;
}

/** Página /conquistas — gamificação com recompensa em crédito (1 por conquista, server-side). */
export const ConquistasPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // badgeId em resgate, ou 'all'

  const load = () =>
    fetch(`${API_URL}/achievements`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setState(d); });

  useEffect(() => { load(); }, []);

  const claim = async (badgeId?: string) => {
    setBusy(badgeId ?? 'all');
    try {
      const r = await fetch(`${API_URL}/achievements/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(badgeId ? { badgeId } : {}),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.count > 0) window.dispatchEvent(new Event('creditsChanged')); // atualiza o 💎 do header
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!state) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  const claimable = state.badges.filter((b) => b.claimable);
  const earnedCount = state.badges.filter((b) => b.earned).length;

  return (
    <PageContainer width="narrow" sx={{ p: { xs: 1.5, sm: 2 }, pb: { xs: 'calc(84px + env(safe-area-inset-bottom))', sm: 4 } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Voltar"><ArrowBackIcon /></IconButton>
        <EmojiEventsIcon sx={{ color: '#178f89' }} />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Minhas conquistas</Typography>
      </Stack>

      {/* Resumo + resgatar tudo */}
      <Card sx={{ borderRadius: 4, mb: 2, background: 'linear-gradient(135deg,#0f3d3a,#1f9d95)', color: '#fff', boxShadow: '0 12px 30px rgba(15,61,58,.18)' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 22 }}>{state.creditsClaimed} <Box component="span" sx={{ fontSize: 13, opacity: 0.85 }}>de {state.creditsAvailable} créditos resgatados</Box></Typography>
              <Typography sx={{ fontSize: 13, opacity: 0.85 }}>{earnedCount} conquistas desbloqueadas · saldo atual 💎 {state.balance}</Typography>
            </Box>
            {state.streak > 0 && (
              <Chip icon={<Box component="span" sx={{ ml: 0.5 }}>🔥</Box>} label={`${state.streak} ${state.streak === 1 ? 'dia' : 'dias'}`} sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 800 }} />
            )}
          </Stack>
          {claimable.length > 0 && (
            <Button fullWidth variant="contained" disabled={busy === 'all'} onClick={() => claim()} sx={{ mt: 2, bgcolor: 'background.paper', color: 'text.primary', fontWeight: 800, borderRadius: 99, textTransform: 'none', '&:hover': { bgcolor: 'background.default' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,.6)' } }}>
              {busy === 'all' ? 'Resgatando…' : `🎁 Resgatar tudo (${claimable.length} crédito${claimable.length > 1 ? 's' : ''})`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Badges */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {state.badges.map((b) => (
          <Card key={b.id} sx={{ borderRadius: 3, p: 1.75, textAlign: 'center', border: b.claimed ? '1.5px solid rgba(32,178,170,.45)' : b.earned ? '1.5px solid rgba(32,178,170,.3)' : '1.5px solid', borderColor: b.claimed || b.earned ? undefined : 'divider', bgcolor: b.claimed ? 'rgba(32,178,170,.08)' : b.earned ? 'rgba(32,178,170,.05)' : 'background.paper' }}>
            <Box sx={{ fontSize: 34, mb: 0.5, filter: b.earned ? 'none' : 'grayscale(1)', opacity: b.earned ? 1 : 0.5 }}>{b.emoji}</Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: b.earned ? 'text.primary' : 'text.secondary', lineHeight: 1.2 }}>{b.title}</Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary', lineHeight: 1.25, mt: 0.25, minHeight: 26 }}>{b.desc}</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#b88a54', mt: 0.5 }}>🎁 {b.reward} crédito</Typography>
            {b.claimed ? (
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#178f89', mt: 0.75 }}>✓ Resgatado</Typography>
            ) : b.claimable ? (
              <Button size="small" fullWidth disabled={busy === b.id} onClick={() => claim(b.id)} sx={{ mt: 0.75, borderRadius: 99, textTransform: 'none', fontWeight: 800, fontSize: 12, bgcolor: '#20b2aa', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>
                {busy === b.id ? '…' : 'Resgatar'}
              </Button>
            ) : (
              <>
                <LinearProgress variant="determinate" value={b.progress * 100} sx={{ mt: 0.75, height: 4, borderRadius: 99, bgcolor: 'rgba(0,0,0,.06)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
                <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.25 }}>{Math.round(b.progress * 100)}%</Typography>
              </>
            )}
          </Card>
        ))}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
        Cada conquista dá 1 crédito de IA (resumo, relatório, chat). O streak conta dias seguidos usando o app.
      </Typography>
    </PageContainer>
  );
};
