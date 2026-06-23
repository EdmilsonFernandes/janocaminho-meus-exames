import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, Stack, Chip, LinearProgress } from '@mui/material';
import { API_URL, token } from '../config';

interface Badge { id: string; emoji: string; title: string; desc: string; earned: boolean; progress?: number; }

/** Card de Gamificação — badges + streak de uso. Aparece no Dashboard. */
export const GamificationBadges = ({ examsCount, score }: { examsCount: number; score: number | null }) => {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    // Streak = dias consecutivos com atividade (lê do localStorage — simples, sem backend)
    try {
      const lastVisit = localStorage.getItem('lastVisit');
      const today = new Date().toDateString();
      if (lastVisit === today) {
        setStreak(Number(localStorage.getItem('streak') || '0'));
      } else {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const newStreak = lastVisit === yesterday ? Number(localStorage.getItem('streak') || '0') + 1 : 1;
        localStorage.setItem('streak', String(newStreak));
        localStorage.setItem('lastVisit', today);
        setStreak(newStreak);
      }
    } catch { /* storage indisponível */ }
  }, []);

  const badges: Badge[] = [
    { id: 'first', emoji: '🎉', title: 'Primeiro exame', desc: 'Envie seu primeiro exame', earned: examsCount >= 1 },
    { id: 'five', emoji: '📚', title: 'Colecionador', desc: '5 exames enviados', earned: examsCount >= 5, progress: Math.min(examsCount / 5, 1) },
    { id: 'healthy', emoji: '💚', title: 'Saudável', desc: 'Score acima de 80', earned: score != null && score >= 80 },
    { id: 'streak3', emoji: '🔥', title: 'Constância', desc: '3 dias seguidos', earned: streak >= 3, progress: Math.min(streak / 3, 1) },
    { id: 'streak7', emoji: '⚡', title: 'Dedicado', desc: '7 dias seguidos', earned: streak >= 7, progress: Math.min(streak / 7, 1) },
    { id: 'streak30', emoji: '👑', title: 'Mestre da saúde', desc: '30 dias seguidos', earned: streak >= 30, progress: Math.min(streak / 30, 1) },
  ];

  const earned = badges.filter((b) => b.earned).length;

  return (
    <Card sx={{ borderRadius: 4, background: 'linear-gradient(135deg,#f0f9f7,#e8f5f3)', border: '1px solid #bfe7e3' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#0f3d3a', fontSize: 16 }}>🏆 Suas conquistas</Typography>
            <Typography variant="caption" sx={{ color: '#6b7b80' }}>{earned} de {badges.length} desbloqueadas</Typography>
          </Box>
          {streak > 0 && (
            <Chip icon={<Box component="span" sx={{ ml: 0.5 }}>🔥</Box>} label={`${streak} ${streak === 1 ? 'dia' : 'dias'}`} sx={{ bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 800, fontSize: 14 }} />
          )}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
          {badges.map((b) => (
            <Box key={b.id} sx={{
              p: 1.25, borderRadius: 2.5, textAlign: 'center', position: 'relative', transition: 'all .2s',
              bgcolor: b.earned ? 'rgba(32,178,170,.10)' : 'rgba(0,0,0,.03)',
              opacity: b.earned ? 1 : 0.5,
              border: b.earned ? '1.5px solid rgba(32,178,170,.3)' : '1.5px solid transparent',
            }}>
              <Box sx={{ fontSize: 28, mb: 0.5, filter: b.earned ? 'none' : 'grayscale(1)' }}>{b.emoji}</Box>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: b.earned ? '#0f3d3a' : '#94a3b8', lineHeight: 1.2 }}>{b.title}</Typography>
              <Typography sx={{ fontSize: 9.5, color: '#94a3b8', lineHeight: 1.2, mt: 0.25 }}>{b.desc}</Typography>
              {!b.earned && b.progress != null && b.progress > 0 && (
                <LinearProgress variant="determinate" value={b.progress * 100} sx={{ mt: 0.5, height: 3, borderRadius: 99, bgcolor: 'rgba(0,0,0,.06)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
              )}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};
