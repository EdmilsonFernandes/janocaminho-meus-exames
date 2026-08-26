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
  period?: 'monthly';
}
interface State {
  badges: Badge[]; streak: number; creditsClaimed: number; creditsAvailable: number;
  balance: number; achievementAlerts: boolean; monthLabel?: string;
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
  // Desafios do mês (renováveis) × conquistas permanentes (feedback: quem completa tudo
  // ficava sem conteúdo — os mensais recomeçam a cada mês calendário).
  const monthly = state.badges.filter((b) => b.period === 'monthly');
  const permanent = state.badges.filter((b) => b.period !== 'monthly');

  const badgeCard = (b: Badge) => (
    <Card key={b.id} sx={{
      borderRadius: '20px', p: 2, textAlign: 'center', position: 'relative',
      border: b.claimed ? '1.5px solid rgba(32,178,170,.45)' : b.earned ? '1.5px solid rgba(32,178,170,.3)' : '1px solid',
      borderColor: b.claimed || b.earned ? undefined : 'divider',
      bgcolor: b.claimed ? 'rgba(32,178,170,.07)' : b.earned ? 'rgba(32,178,170,.04)' : 'background.paper',
      boxShadow: b.earned ? '0 8px 24px rgba(32,178,170,0.12)' : '0 4px 16px rgba(0,0,0,0.03)',
      transition: 'all .2s ease',
      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 12px 28px rgba(32,178,170,0.18)' }
    }}>
      {b.period === 'monthly' && (
        <Chip size="small" label="♻️ mensal" sx={{ position: 'absolute', top: 8, right: 8, height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(32,178,170,.14)', color: '#178f89' }} />
      )}
      <Box sx={{ fontSize: 38, mb: 0.5, filter: b.earned ? 'none' : 'grayscale(1)', opacity: b.earned ? 1 : 0.45, transition: 'all .2s ease' }}>{b.emoji}</Box>
      <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: b.earned ? 'text.primary' : 'text.secondary', lineHeight: 1.25 }}>{b.title}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.35, mt: 0.5, minHeight: 32 }}>{b.desc}</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#b88a54', mt: 0.75 }}>🎁 {b.reward} crédito{b.reward > 1 ? 's' : ''}</Typography>
      {b.claimed ? (
        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#178f89', mt: 1 }}>✓ {b.period === 'monthly' ? 'Resgatado este mês' : 'Resgatado'}</Typography>
      ) : b.claimable ? (
        <Button size="small" fullWidth disabled={busy === b.id} onClick={() => claim(b.id)} sx={{ mt: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 12.5, bgcolor: '#20b2aa', color: '#fff', boxShadow: '0 6px 16px rgba(32,178,170,0.3)', '&:hover': { bgcolor: '#178f89' } }}>
          {busy === b.id ? '…' : 'Resgatar'}
        </Button>
      ) : (
        <>
          <LinearProgress variant="determinate" value={b.progress * 100} sx={{ mt: 1, height: 5, borderRadius: '999px', bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa', borderRadius: '999px' } }} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', mt: 0.5 }}>{Math.round(b.progress * 100)}%</Typography>
        </>
      )}
    </Card>
  );

  return (
    <PageContainer width="narrow" sx={{ p: { xs: 1.5, sm: 2 }, pb: { xs: 10, sm: 5 } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Voltar"><ArrowBackIcon /></IconButton>
        <EmojiEventsIcon sx={{ color: '#178f89', fontSize: 28 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Minhas conquistas</Typography>
      </Stack>

      {/* Resumo + resgatar tudo */}
      <Card sx={{ borderRadius: '24px', mb: 3, background: 'linear-gradient(135deg, #0c4a46 0%, #137a72 50%, #178f89 100%)', color: '#fff', boxShadow: '0 16px 36px rgba(15,61,58,.25)', border: '1px solid rgba(255,255,255,0.2)' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 24, fontFamily: 'Poppins, sans-serif' }}>{state.creditsClaimed} <Box component="span" sx={{ fontSize: 13.5, opacity: 0.85, fontWeight: 500 }}>de {state.creditsAvailable} créditos resgatados</Box></Typography>
              <Typography sx={{ fontSize: 13.5, opacity: 0.9, mt: 0.5 }}>{earnedCount} conquistas desbloqueadas · saldo atual 💎 {state.balance}</Typography>
            </Box>
            {state.streak > 0 && (
              <Chip icon={<Box component="span" sx={{ ml: 0.5 }}>🔥</Box>} label={`${state.streak} ${state.streak === 1 ? 'dia' : 'dias'}`} sx={{ bgcolor: 'rgba(255,255,255,.2)', color: '#fff', fontWeight: 800, fontSize: 13, border: '1px solid rgba(255,255,255,0.3)' }} />
            )}
          </Stack>
          {claimable.length > 0 && (
            <Button fullWidth variant="contained" disabled={busy === 'all'} onClick={() => claim()} sx={{ mt: 2.5, bgcolor: '#ffffff', color: '#0f5f5a', fontWeight: 800, fontSize: 15, borderRadius: '999px', textTransform: 'none', py: 1.25, boxShadow: '0 8px 20px rgba(0,0,0,0.2)', '&:hover': { bgcolor: '#f0fafa' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,.6)' } }}>
              {busy === 'all' ? 'Resgatando…' : `🎁 Resgatar tudo (${claimable.length} crédito${claimable.length > 1 ? 's' : ''})`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* DESAFIOS DO MÊS — renováveis (recomeçam no 1º dia de cada mês) */}
      {monthly.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>♻️ Desafios do mês</Typography>
            {state.monthLabel && <Chip size="small" label={state.monthLabel} sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.10)', color: '#178f89' }} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
            Recomeçam todo mês — mantê-los em dia é o hábito que cuida da sua saúde.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
            {monthly.map(badgeCard)}
          </Box>
        </Box>
      )}

      {/* CONQUISTAS PERMANENTES */}
      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>🏆 Conquistas permanentes</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {permanent.map(badgeCard)}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
        Conquistas dão créditos de IA (resumo, relatório, chat). O streak conta dias seguidos usando o app.
      </Typography>
    </PageContainer>
  );
};
