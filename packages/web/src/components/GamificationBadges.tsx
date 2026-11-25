import type { KeyboardEvent } from 'react';
import { Card, CardContent, Typography, Box, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import { RADIUS, copperText } from '../theme';
import { useAnimateInView } from '../hooks/useAnimateInView';

// Preview rápido no Dashboard (streak fica no server — só em /conquistas).
const PREVIEW = [
  { id: 'first_exam', emoji: '🎉', need: 1, metric: 'exams' as const },
  { id: 'collector', emoji: '📚', need: 5, metric: 'exams' as const },
  { id: 'scholar', emoji: '🎓', need: 10, metric: 'exams' as const },
  { id: 'healthy', emoji: '💚', need: 80, metric: 'score' as const },
  { id: 'streak3', emoji: '🔥', need: 3, metric: 'streak' as const },
];

/** Card de conquistas no Dashboard — CLICÁVEL → /conquistas (detalhes + resgatar créditos).
 *  Superfície limpa (25/11/26): sem malha radial de fundo; o raio é o do design system. */
export const GamificationBadges = ({ examsCount, score }: { examsCount: number; score: number | null }) => {
  const navigate = useNavigate();
  const earned = (p: (typeof PREVIEW)[number]) =>
    p.metric === 'exams' ? examsCount >= p.need : p.metric === 'score' ? (score ?? 0) >= p.need : false;
  const earnedCount = PREVIEW.filter(earned).length;
  // perf 03/11: pulsos/shimmer infinitos só rodam com o card visível (eram 4 animações
  // rodando fora de tela no dashboard → quadros perdidos em Android médio).
  const [animRef, animInView] = useAnimateInView<HTMLDivElement>();
  // Teclado e leitor de tela (25/11/26): era <Card onClick> sem role, tabIndex ou foco visível.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate('/conquistas');
    }
  };

  return (
    <Card
      ref={animRef}
      role="button"
      tabIndex={0}
      aria-label="Suas conquistas — ver e resgatar créditos"
      onClick={() => navigate('/conquistas')}
      onKeyDown={onKey}
      sx={{
        borderRadius: RADIUS.card, cursor: 'pointer',
        border: '1px solid', borderColor: 'divider',
        transition: 'transform .2s ease, box-shadow .2s ease',
        '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,.08)', transform: 'translateY(-2px)' },
        '&:active': { transform: 'scale(.99)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: 16, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <EmojiEventsRoundedIcon sx={{ fontSize: 20, color: (t) => copperText(t.palette.mode) }} /> Suas conquistas
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 0.25 }}>Resgate 1 crédito a cada meta atingida</Typography>
          </Box>
          <ChevronRightIcon sx={{ color: (t) => copperText(t.palette.mode) }} />
        </Stack>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'space-between', mb: 1.5 }}>
          {PREVIEW.map((p, i) => {
            const on = earned(p);
            return (
              <Box key={p.id} sx={{
                textAlign: 'center', flex: 1, position: 'relative',
                ...(on ? {
                  animation: `dxBadgeBounce .5s cubic-bezier(.16,1,.3,1) ${i * 0.08}s both`,
                  '@keyframes dxBadgeBounce': {
                    from: { opacity: 0, transform: 'scale(.5) translateY(8px)' },
                    to: { opacity: 1, transform: 'scale(1) translateY(0)' },
                  },
                } : {}),
              }}>
                {on && <Box sx={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(212,165,116,.35), transparent 70%)',
                  animation: 'dxGoldPulse 2s ease-in-out infinite',
                  animationPlayState: animInView ? 'running' : 'paused', // perf 03/11: só roda visível
                  '@keyframes dxGoldPulse': {
                    '0%, 100%': { opacity: 0.5, transform: 'translate(-50%, -50%) scale(1)' },
                    '50%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1.2)' },
                  },
                  pointerEvents: 'none',
                }} />}
                <Box sx={{
                  fontSize: 28, position: 'relative', zIndex: 1,
                  filter: on ? 'none' : 'grayscale(1)',
                  opacity: on ? 1 : 0.28,
                  transition: 'filter .3s ease, opacity .3s ease',
                }}>{p.emoji}</Box>
              </Box>
            );
          })}
        </Box>

        {/* Mini progress bar */}
        <Box sx={{ width: '100%', height: 5, borderRadius: '999px', bgcolor: 'rgba(0,0,0,0.06)', overflow: 'hidden', mb: 1 }}>
          <Box sx={{
            height: '100%',
            width: `${Math.max(10, (earnedCount / PREVIEW.length) * 100)}%`,
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #20b2aa, #d4a574)',
            transition: 'width .6s cubic-bezier(.16, 1, .3, 1)',
          }} />
        </Box>

        {/* Cobre AA nos dois modos (copperText): o literal claro de antes sumia no dark. */}
        <Typography sx={{ display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 800, color: (t) => copperText(t.palette.mode) }}>
          {earnedCount} de {PREVIEW.length} desbloqueada{earnedCount === 1 ? '' : 's'} · toque para ver e resgatar →
        </Typography>
      </CardContent>
    </Card>
  );
};
