import { Card, CardContent, Typography, Box, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

// Preview rápido no Dashboard (streak fica no server — só em /conquistas).
const PREVIEW = [
  { id: 'first_exam', emoji: '🎉', need: 1, metric: 'exams' as const },
  { id: 'collector', emoji: '📚', need: 5, metric: 'exams' as const },
  { id: 'scholar', emoji: '🎓', need: 10, metric: 'exams' as const },
  { id: 'healthy', emoji: '💚', need: 80, metric: 'score' as const },
  { id: 'streak3', emoji: '🔥', need: 3, metric: 'streak' as const },
];

/** Card de conquistas no Dashboard — CLICÁVEL → /conquistas (detalhes + resgatar créditos). */
export const GamificationBadges = ({ examsCount, score }: { examsCount: number; score: number | null }) => {
  const navigate = useNavigate();
  const earned = (p: (typeof PREVIEW)[number]) =>
    p.metric === 'exams' ? examsCount >= p.need : p.metric === 'score' ? (score ?? 0) >= p.need : false; // streak: só no server
  const earnedCount = PREVIEW.filter(earned).length;

  return (
    <Card
      onClick={() => navigate('/conquistas')}
      sx={{
        borderRadius: 4, cursor: 'pointer', background: 'rgba(32,178,170,0.06)', border: '1px solid', borderColor: 'divider',
        transition: 'all .2s', '&:hover': { boxShadow: '0 10px 26px rgba(32,178,170,.14)', transform: 'translateY(-1px)' }, '&:active': { transform: 'scale(.99)' },
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: 16 }}>🏆 Suas conquistas</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Resgate 1 crédito a cada meta atingida</Typography>
          </Box>
          <ChevronRightIcon sx={{ color: '#178f89' }} />
        </Stack>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
          {PREVIEW.map((p) => {
            const on = earned(p);
            return (
              <Box key={p.id} sx={{ textAlign: 'center', flex: 1 }}>
                <Box sx={{ fontSize: 26, filter: on ? 'none' : 'grayscale(1)', opacity: on ? 1 : 0.45 }}>{p.emoji}</Box>
              </Box>
            );
          })}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1.25, color: '#178f89', fontWeight: 700 }}>
          {earnedCount} desbloqueada(s) · toque para ver e resgatar →
        </Typography>
      </CardContent>
    </Card>
  );
};
