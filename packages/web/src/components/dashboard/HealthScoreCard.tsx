import { Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import FavoriteIcon from '@mui/icons-material/Favorite';

// Componente mais importante do app. Gauge SEMICIRCULAR (meio-arco) em SVG + info LADO A LADO
// (compacto, sem quebrar — preenche a largura do card, igual à referência).
const scoreColor = (s: number) => (s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444');
const badgeFor = (s: number) => (s >= 80 ? 'Excelente' : s >= 60 ? 'Bom' : 'Atenção');
const descFor = (s: number) => (s >= 80 ? 'A maioria dos seus valores está na faixa.' : s >= 60 ? 'Atenção a alguns valores — converse com seu médico.' : 'Vários valores fora da faixa — procure orientação.');

// Gauge semicircular responsivo (viewBox fixo, escala pro container — sem libs).
const Gauge = ({ value, color }: { value: number; color: string }) => {
  const W = 168, H = 100, stroke = 14;
  const r = (W - stroke) / 2;
  const cx = W / 2, cy = H - 8;
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const p = Math.max(0, Math.min(100, value)) / 100;
  const angle = Math.PI * (1 - p);
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  const prog = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
      <path d={track} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth={stroke} strokeLinecap="round" />
      <path d={prog} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
};

export const HealthScoreCard = ({ loaded, score, abnormalCount, onDetails }: { loaded: boolean; score: number | null; abnormalCount: number; onDetails: () => void }) => {
  if (!loaded && score === null) {
    return (
      <Card sx={{ mt: 3, borderRadius: 6, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
        <CircularProgress size={28} sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Calculando seu score…</Typography>
      </Card>
    );
  }
  if (score === null) return null;
  const color = scoreColor(score);
  return (
    <Card sx={{ mt: 3, borderRadius: 6, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.03))', border: '1px solid', borderColor: 'divider' }}>
      <FavoriteIcon sx={{ position: 'absolute', right: -18, top: -14, fontSize: 150, color: 'primary.main', opacity: 0.05, pointerEvents: 'none', transform: 'rotate(-12deg)' }} />
      <CardContent sx={{ position: 'relative' }}>
        {/* gauge + info LADO A LADO (sem wrap — preenche a largura) */}
        <Stack direction="row" alignItems="center" gap={{ xs: 1.5, sm: 2.5 }} sx={{ flexWrap: 'nowrap' }}>
          <Box sx={{ position: 'relative', width: { xs: 116, sm: 150 }, height: { xs: 70, sm: 90 }, flexShrink: 0 }}>
            <Gauge value={score} color={color} />
            <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 26, sm: 32 }, lineHeight: 1, color: 'text.primary' }}>{score}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: { xs: 9, sm: 11 } }}>de 100</Typography>
            </Box>
          </Box>
          <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
              <MonitorHeartIcon sx={{ color: 'primary.main', fontSize: 18 }} />
              <Typography variant="overline" sx={{ lineHeight: 1, color: 'text.secondary', fontSize: { xs: 9, sm: 11 } }}>Score de Saúde</Typography>
            </Stack>
            <Chip label={badgeFor(score)} size="small" sx={{ bgcolor: color, color: '#fff', fontWeight: 800, mb: 0.75, height: 22, fontSize: 11 }} />
            <Typography variant="body2" sx={{ mb: 0.5, color: 'text.primary', fontSize: { xs: 12.5, sm: 14 }, lineHeight: 1.35 }}>{descFor(score)}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: 10, sm: 11 } }}>*Educativo. {abnormalCount > 0 ? `${abnormalCount} alterado(s).` : 'Nenhum alterado.'}</Typography>
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" size="small" onClick={onDetails} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, fontSize: 12, py: 0.4, boxShadow: 'none' }}>Ver detalhes</Button>
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};
