import { Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useEffect, useState } from 'react';

// Componente mais importante do app. Gauge SEMICIRCULAR (meio-arco) em SVG + info LADO A LADO
// (compacto, sem quebrar — preenche a largura do card, igual à referência).
const scoreColor = (s: number) => (s >= 80 ? '#059669' : s >= 60 ? '#f59e0b' : '#ef4444');
const badgeFor = (s: number) => (s >= 80 ? 'Excelente' : s >= 60 ? 'Bom' : 'Atenção');
const descFor = (s: number, n: number) =>
  s >= 80 ? 'A maioria dos seus valores está dentro da faixa.'
  : s >= 60 ? 'Alguns valores merecem atenção — comente com seu médico.'
  : n > 0 ? `${n} valor${n > 1 ? 'es' : ''} fora da faixa de referência — vale revisar com seu médico.`
  : 'Vale revisar seus exames com seu médico.';

// Gauge ANEL COMPLETO (premium) — gradiente teal→cor-do-status, progresso do topo (horário).
// Antes era semicircular; anel fechado dá mais "wow" e centraliza o número.
const Gauge = ({ value, color }: { value: number; color: string }) => {
  const size = 150, stroke = 13;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#20b2aa" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={stroke} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="url(#scoreGrad)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dashoffset .8s ease' }} />
    </svg>
  );
};

export const HealthScoreCard = ({ loaded, score, abnormalCount, onDetails }: { loaded: boolean; score: number | null; abnormalCount: number; onDetails: () => void }) => {
  // Score counter animation (0→score no mount) — sensação premium
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    if (score == null || score === 0) return;
    setDisplayScore(0);
    const duration = 800;
    const steps = 30;
    const inc = score / steps;
    let i = 0;
    const iv = setInterval(() => { i++; setDisplayScore(Math.round(Math.min(inc * i, score))); if (i >= steps) clearInterval(iv); }, duration / steps);
    return () => clearInterval(iv);
  }, [score]);
  if (!loaded && score === null) {
    return (
      <Card sx={{ mt: 3, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
        <CircularProgress size={28} sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Calculando seu score…</Typography>
      </Card>
    );
  }
  if (score === null) return null;
  const color = scoreColor(score);
  return (
    <Card sx={{ mt: 3, position: 'relative', overflow: 'hidden', borderRadius: 4, background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.03))', border: '1px solid', borderColor: 'divider' }}>
      <FavoriteIcon sx={{ position: 'absolute', right: -18, top: -14, fontSize: 150, color: 'primary.main', opacity: 0.05, pointerEvents: 'none', transform: 'rotate(-12deg)' }} />
      <CardContent sx={{ position: 'relative' }}>
        {/* gauge + info LADO A LADO (sem wrap — preenche a largura) */}
        <Stack direction="row" alignItems="center" gap={{ xs: 1.5, sm: 2.5 }} sx={{ flexWrap: 'nowrap' }}>
          <Box sx={{ position: 'relative', width: { xs: 130, sm: 150 }, height: { xs: 130, sm: 150 }, flexShrink: 0 }}>
            <Gauge value={score} color={color} />
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 34, sm: 42 }, lineHeight: 1, color: 'text.primary' }}>{displayScore}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: { xs: 9, sm: 11 } }}>de 100</Typography>
            </Box>
          </Box>
          <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
              <MonitorHeartIcon sx={{ color: 'primary.main', fontSize: 18 }} />
              <Typography variant="overline" sx={{ lineHeight: 1, color: 'text.secondary', fontSize: { xs: 9, sm: 11 } }}>Score de Saúde</Typography>
            </Stack>
            <Chip label={badgeFor(score)} size="small" sx={{ bgcolor: color, color: '#fff', fontWeight: 800, mb: 0.75, height: 22, fontSize: 11 }} />
            <Typography variant="body2" sx={{ mb: 0.5, color: 'text.primary', fontSize: { xs: 12.5, sm: 14 }, lineHeight: 1.35 }}>{descFor(score, abnormalCount)}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: 10, sm: 11 } }}>{abnormalCount > 0 ? `${abnormalCount} valor(es) fora da faixa.` : 'Nenhum fora da faixa.'}</Typography>
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" size="small" onClick={onDetails} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, fontSize: 12, py: 1.1, boxShadow: 'none' }}>Ver detalhes</Button>
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};
