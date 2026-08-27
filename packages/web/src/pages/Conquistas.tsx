import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Button, LinearProgress, IconButton, CircularProgress } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { API_URL, token } from '../config';
import { PageContainer } from '../components/layout/PageContainer';

const shimmer = keyframes`0%{background-position:-200% 0}100%{background-position:200% 0}`;
const pop = keyframes`0%{transform:scale(.85)}60%{transform:scale(1.08)}100%{transform:scale(1)}`;

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
  const totalBadges = state.badges.length;
  const pct = totalBadges > 0 ? Math.round((earnedCount / totalBadges) * 100) : 0;

  const badgeCard = (b: Badge) => (
    <Card key={b.id} sx={{
      borderRadius: '20px', p: 0, textAlign: 'center', position: 'relative',
      border: b.claimed ? '1.5px solid rgba(32,178,170,.45)' : b.earned ? '1.5px solid rgba(32,178,170,.3)' : '1px solid',
      borderColor: b.claimed || b.earned ? undefined : 'divider',
      bgcolor: b.claimed ? 'rgba(32,178,170,.07)' : b.earned ? 'rgba(32,178,170,.04)' : 'background.paper',
      boxShadow: b.earned ? '0 8px 24px rgba(32,178,170,0.12)' : '0 4px 16px rgba(0,0,0,0.03)',
      transition: 'all .2s ease',
      overflow: 'hidden',
      '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 12px 28px rgba(32,178,170,0.18)' }
    }}>
      {/* Shimmer de brilho nos badges desbloqueados */}
      {b.earned && (
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 0, opacity: 0.12,
          background: 'linear-gradient(110deg, transparent 30%, rgba(32,178,170,.6) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
          animation: `${shimmer} 3s ease-in-out infinite`,
        }} />
      )}
      <Box sx={{ position: 'relative', zIndex: 1, p: 2 }}>
        {b.period === 'monthly' && (
          <Chip size="small" label="♻️ mensal" sx={{ position: 'absolute', top: 0, right: 0, height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(32,178,170,.14)', color: '#178f89' }} />
        )}
        <Box sx={{
          fontSize: 42, mb: 0.75, lineHeight: 1,
          filter: b.earned ? 'none' : 'grayscale(1)',
          opacity: b.earned ? 1 : 0.35,
          transition: 'all .3s ease',
          animation: b.claimable ? `${pop} .5s ease both` : 'none',
        }}>{b.emoji}</Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: b.earned ? 'text.primary' : 'text.secondary', lineHeight: 1.25 }}>{b.title}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.35, mt: 0.5, minHeight: 32 }}>{b.desc}</Typography>
        <Chip size="small" label={`🎁 ${b.reward} crédito${b.reward > 1 ? 's' : ''}`} sx={{ height: 22, mt: 0.75, bgcolor: 'rgba(184,138,84,.12)', color: '#b88a54', fontWeight: 800, fontSize: 11.5 }} />
        {b.claimed ? (
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#178f89', mt: 1 }}>✓ {b.period === 'monthly' ? 'Resgatado este mês' : 'Resgatado'}</Typography>
        ) : b.claimable ? (
          <Button size="small" fullWidth disabled={busy === b.id} onClick={() => claim(b.id)} sx={{ mt: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 12.5, bgcolor: '#20b2aa', color: '#fff', boxShadow: '0 6px 16px rgba(32,178,170,0.3)', '&:hover': { bgcolor: '#178f89' } }}>
            {busy === b.id ? '…' : '🎉 Resgatar'}
          </Button>
        ) : (
          <>
            <Box sx={{ mt: 1.25, px: 1 }}>
              <LinearProgress variant="determinate" value={b.progress * 100} sx={{ height: 6, borderRadius: '999px', bgcolor: 'rgba(0,0,0,0.06)', '& .MuiLinearProgress-bar': { bgcolor: b.progress >= 0.75 ? '#059669' : '#20b2aa', borderRadius: '999px', transition: 'width .4s ease' } }} />
            </Box>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: b.progress >= 0.75 ? '#059669' : 'text.secondary', mt: 0.5 }}>{Math.round(b.progress * 100)}%</Typography>
          </>
        )}
      </Box>
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
      <Card sx={{ borderRadius: '24px', mb: 3, background: 'linear-gradient(135deg, #0c4a46 0%, #137a72 50%, #178f89 100%)', color: '#fff', boxShadow: '0 16px 36px rgba(15,61,58,.25)', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden', position: 'relative' }}>
        {/* Decoração de fundo */}
        <Box sx={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />
        <Box sx={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)' }} />
        <CardContent sx={{ p: { xs: 2.5, sm: 3 }, position: 'relative', zIndex: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: 28, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.02em' }}>
                {state.creditsClaimed}
                <Box component="span" sx={{ fontSize: 14, opacity: 0.85, fontWeight: 500, ml: 1 }}>de {state.creditsAvailable} créditos resgatados</Box>
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }} useFlexGap flexWrap="wrap">
                <Chip size="small" label={`🏆 ${earnedCount}/${totalBadges} conquistas`} sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 700, fontSize: 12 }} />
                <Chip size="small" label={`💎 ${state.balance} saldo`} sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 700, fontSize: 12 }} />
                {state.streak > 0 && (
                  <Chip icon={<Box component="span" sx={{ ml: 0.5 }}>🔥</Box>} label={`${state.streak} ${state.streak === 1 ? 'dia' : 'dias'}`} sx={{ bgcolor: 'rgba(255,200,50,.25)', color: '#fff', fontWeight: 800, fontSize: 13, border: '1px solid rgba(255,200,50,0.4)' }} />
                )}
              </Stack>
            </Box>
          </Stack>

          {/* Barra de progresso geral */}
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Progresso geral</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{pct}%</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: '999px', bgcolor: 'rgba(255,255,255,.15)', '& .MuiLinearProgress-bar': { bgcolor: '#fff', borderRadius: '999px' } }} />
          </Box>

          {claimable.length > 0 && (
            <Button fullWidth variant="contained" disabled={busy === 'all'} onClick={() => claim()} sx={{ mt: 2.5, bgcolor: '#ffffff', color: '#0f5f5a', fontWeight: 800, fontSize: 15, borderRadius: '999px', textTransform: 'none', py: 1.25, boxShadow: '0 8px 20px rgba(0,0,0,0.2)', '&:hover': { bgcolor: '#f0fafa' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,.6)' } }}>
              {busy === 'all' ? 'Resgatando…' : `🎁 Resgatar tudo (${claimable.length} crédito${claimable.length > 1 ? 's' : ''})`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* DESAFIOS DO MÊS — renováveis (recomeçam no 1º dia de cada mês) */}
      {monthly.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary', fontFamily: 'Poppins, sans-serif', fontSize: 15 }}>♻️ Desafios do mês</Typography>
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
      <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary', mb: 1.25, fontFamily: 'Poppins, sans-serif', fontSize: 15 }}>🏆 Conquistas permanentes</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {permanent.map(badgeCard)}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2.5 }}>
        Conquistas dão créditos de IA (resumo, relatório, chat). O streak conta dias seguidos usando o app.
      </Typography>
    </PageContainer>
  );
};
