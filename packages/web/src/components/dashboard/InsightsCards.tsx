import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, CircularProgress, LinearProgress, Button } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';

const LEVEL_META: Record<string, { emoji: string; color: string; label: string }> = {
  diamante: { emoji: '💎', color: '#6366f1', label: 'Diamante' },
  ouro: { emoji: '🥇', color: '#f59e0b', label: 'Ouro' },
  prata: { emoji: '🥈', color: '#64748b', label: 'Prata' },
  bronze: { emoji: '🥉', color: '#b45309', label: 'Bronze' },
};

// Tradução das chaves do breakdown (vêm do servidor em inglês) pra exibição pt-BR.
const BREAKDOWN_LABEL: Record<string, string> = {
  exams: 'Exames',
  measurements: 'Medições',
  feedback: 'Avaliações',
  consent: 'Consentimento',
  engagement: 'Engajamento',
  freshness: 'Atualização',
};

/** Score de Adesão + Alertas Preditivos — gamificação + projeção de tendência (determinístico, grátis). */
export const InsightsCards = () => {
  const [pid] = useSelectedPatient();
  const [data, setData] = useState<{ adherence: any; predictions: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  // Previsões: mostra as 3 mais acionáveis por padrão (lista longa cansa no mobile). Restante expansível.
  const [showAllPred, setShowAllPred] = useState(false);

  useEffect(() => {
    if (!pid) { setLoading(false); setData(null); return; }
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/risk/adherence?patientId=${encodeURIComponent(pid)}`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/risk/predictions?patientId=${encodeURIComponent(pid)}`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([a, p]) => setData({ adherence: a, predictions: p?.predictions ?? [] }))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [pid]);

  if (loading) return <Card sx={{ mt: 2, borderRadius: 4, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={20} sx={{ color: 'primary.main' }} /></Card>;
  if (!data?.adherence) return null;

  const a = data.adherence;
  const meta = LEVEL_META[a.level] ?? LEVEL_META.bronze;

  return (
    <>
      {/* SCORE DE ADESÃO */}
      <Card sx={{ mt: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider', background: `linear-gradient(135deg, ${meta.color}0d, ${meta.color}03)` }}>
        <CardContent>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.5 }}>
            <EmojiEventsIcon sx={{ color: meta.color }} />
            <Typography sx={{ fontWeight: 800, flex: 1 }}>Score de Adesão</Typography>
            <Chip size="small" label={`${meta.emoji} ${meta.label}`} sx={{ fontWeight: 800, height: 22, bgcolor: meta.color + '22', color: meta.color }} />
          </Stack>

          <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: 32, color: meta.color, lineHeight: 1 }}>{a.score}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>/100</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              {Object.entries(a.breakdown).map(([k, v]: [string, any]) => (
                <Stack key={k} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.3 }}>
                  <Typography variant="caption" sx={{ width: 92, color: 'text.secondary' }}>{BREAKDOWN_LABEL[k] ?? k}</Typography>
                  <Box sx={{ flex: 1, maxWidth: 80 }}><LinearProgress variant="determinate" value={(v / (k === 'exams' ? 30 : k === 'measurements' ? 20 : k === 'feedback' || k === 'engagement' ? 15 : 10)) * 100} sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: meta.color } }} /></Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 20 }}>{v}</Typography>
                </Stack>
              ))}
            </Box>
          </Stack>

          {a.tips?.length > 0 && (
            <Stack spacing={0.3}>
              {a.tips.map((t: string, i: number) => <Typography key={i} variant="caption" sx={{ color: 'text.secondary' }}>💡 {t}</Typography>)}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* ALERTA PREDITIVO */}
      {data.predictions.length > 0 && (
        <Card sx={{ mt: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1 }}>
              <TrendingUpIcon sx={{ color: '#7b1fa2' }} />
              <Typography sx={{ fontWeight: 800, flex: 1 }}>Previsões</Typography>
              <Chip size="small" label="Premium" sx={{ fontWeight: 700, height: 20, bgcolor: 'rgba(123,31,162,.12)', color: '#7b1fa2', fontSize: 10 }} />
            </Stack>
            <Stack spacing={0.75}>
              {(showAllPred ? data.predictions : data.predictions.slice(0, 3)).map((p: any, i: number) => {
                const color = p.risk === 'alert' ? '#dc2626' : '#ea580c';
                return (
                  <Box key={i} sx={{ p: 1, borderRadius: 2, bgcolor: color + '0d', border: `1px solid ${color}22` }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
                      <Chip size="small" label={p.risk === 'alert' ? '🔴' : '🟠'} sx={{ height: 18, fontSize: 10 }} />
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem', color }}>{p.marker}</Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>{p.message}</Typography>
                  </Box>
                );
              })}
              {data.predictions.length > 3 && (
                <Button size="small" onClick={() => setShowAllPred((v) => !v)} sx={{ textTransform: 'none', fontWeight: 700, color: '#7b1fa2', py: 0.5 }}>
                  {showAllPred ? 'Ver menos' : `Ver todas (${data.predictions.length})`}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </>
  );
};
