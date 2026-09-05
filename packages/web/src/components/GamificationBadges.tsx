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

/** Card de conquistas no Dashboard — CLICÁVEL → /conquistas (detalhes + resgatar créditos).
 *  Premium: bounce animation nos badges ativos, gold shimmer glow, frosted blur nos trancados. */
export const GamificationBadges = ({ examsCount, score }: { examsCount: number; score: number | null }) => {
  const navigate = useNavigate();
  const earned = (p: (typeof PREVIEW)[number]) =>
    p.metric === 'exams' ? examsCount >= p.need : p.metric === 'score' ? (score ?? 0) >= p.need : false;
  const earnedCount = PREVIEW.filter(earned).length;

  return (
    <Card
      onClick={() => navigate('/conquistas')}
      sx={{
        borderRadius: '16px', cursor: 'pointer',
        background: (t) => t.palette.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(212,165,116,.06), rgba(32,178,170,.04))'
          : 'linear-gradient(135deg, rgba(212,165,116,.06), rgba(32,178,170,.03))',
        border: '1px solid', borderColor: 'divider',
        transition: 'transform .2s ease, box-shadow .2s ease',
        '&:hover': { boxShadow: '0 10px 30px rgba(212,165,116,.14)', transform: 'translateY(-2px)' },
        '&:active': { transform: 'scale(.99)' },
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
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'space-between' }}>
          {PREVIEW.map((p, i) => {
            const on = earned(p);
            return (
              <Box key={p.id} sx={{
                textAlign: 'center', flex: 1, position: 'relative',
                // Earned badge: bounce in + gold glow
                ...(on ? {
                  animation: `dxBadgeBounce .5s cubic-bezier(.34,1.56,.64,1) ${i * 0.08}s both`,
                  '@keyframes dxBadgeBounce': {
                    from: { opacity: 0, transform: 'scale(.5) translateY(8px)' },
                    to: { opacity: 1, transform: 'scale(1) translateY(0)' },
                  },
                } : {}),
              }}>
                {/* Gold shimmer glow behind earned badge */}
                {on && <Box sx={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(212,165,116,.35), transparent 70%)',
                  animation: 'dxGoldPulse 2s ease-in-out infinite',
                  '@keyframes dxGoldPulse': {
                    '0%, 100%': { opacity: 0.5, transform: 'translate(-50%, -50%) scale(1)' },
                    '50%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1.2)' },
                  },
                  pointerEvents: 'none',
                }} />}
                <Box sx={{
                  fontSize: 28, position: 'relative', zIndex: 1,
                  // Locked: frosted blur instead of flat grayscale
                  filter: on ? 'none' : 'grayscale(1) blur(1px)',
                  opacity: on ? 1 : 0.35,
                  transition: 'filter .3s ease, opacity .3s ease',
                }}>{p.emoji}</Box>
              </Box>
            );
          })}
        </Box>
        <Typography variant="caption" sx={{
          display: 'block', textAlign: 'center', mt: 1.25,
          color: '#b88a54', fontWeight: 700,
        }}>
          {earnedCount} desbloqueada(s) · toque para ver e resgatar →
        </Typography>
      </CardContent>
    </Card>
  );
};
