import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Grid, Stack, Chip, Avatar, Alert, AlertTitle } from '@mui/material';
import { Title } from 'react-admin';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { API_URL, token, photoUrlFor } from '../config';

interface FamPatient {
  id: string; fullName: string; relationship: string | null; photoUrl: string | null;
  score: number | null; abnormalCount: number; examTitle: string | null; performedAt: string | null;
  topAbnormal: { name: string; value: string | null; flag: string }[];
}
interface CrossAlert { analyte: string; patients: string[]; }

const scoreColor = (s: number | null) => (s == null ? '#9e9e9e' : s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444');
const MEDAL = ['🥇', '🥈', '🥉'];
const PODIUM_BG = ['linear-gradient(135deg,#fef3c7,#fde68a)', 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', 'linear-gradient(135deg,#fef3c7,#fcd34d)'];

export const FamilyPage = () => {
  const [data, setData] = useState<{ patients: FamPatient[]; crossAlerts: CrossAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/patients/family-overview`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const patients = data?.patients ?? [];
  const withScore = patients.filter((p) => p.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const podium = withScore.slice(0, 3);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 980, mx: 'auto' }}>
      <Title title="Saúde da Família" />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <EmojiEventsIcon sx={{ color: '#f59e0b' }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Saúde da Família</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Score de cada um (último exame) e padrões que aparecem em mais de uma pessoa.
      </Typography>

      {(data?.crossAlerts ?? []).length > 0 && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
          <AlertTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>🧬 Padrão familiar detectado</AlertTitle>
          <Stack spacing={0.5}>
            {data!.crossAlerts.map((c) => (
              <Typography key={c.analyte} variant="body2"><strong>{c.analyte}</strong> alterado em: {c.patients.join(', ')}.</Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {/* PÓDIO — top 3 por score */}
      {podium.length > 0 && (
        <Card sx={{ mb: 3, borderRadius: 4, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)' }} variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>🏆 Ranking de saúde</Typography>
            <Grid container spacing={2} alignItems="end" justifyContent="center">
              {podium.map((p, idx) => (
                <Grid key={p.id} size={{ xs: 12, sm: 4 }} sx={{ order: { xs: idx, sm: idx === 0 ? 1 : idx === 1 ? 0 : 2 } }}>
                  <Box sx={{ textAlign: 'center', p: 2, borderRadius: 4, background: PODIUM_BG[idx], minHeight: idx === 0 ? 150 : 120, border: '1px solid rgba(0,0,0,.06)' }}>
                    <Typography sx={{ fontSize: 40, lineHeight: 1 }}>{MEDAL[idx]}</Typography>
                    <Avatar src={p.photoUrl ? photoUrlFor(p.id) : undefined} sx={{ width: idx === 0 ? 56 : 44, height: idx === 0 ? 56 : 44, mx: 'auto', my: 0.5, bgcolor: 'primary.main', fontWeight: 800 }}>{p.fullName.charAt(0).toUpperCase()}</Avatar>
                    <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{p.fullName}</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: idx === 0 ? 30 : 24, color: scoreColor(p.score) }}>{p.score}<span style={{ fontSize: 13 }}> /100</span></Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {patients.length === 0 && <Typography color="text.secondary">Nenhum perfil cadastrado.</Typography>}

      {/* CARDS dos membros */}
      <Grid container spacing={2}>
        {patients.map((p) => (
          <Grid key={p.id} size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Avatar src={p.photoUrl ? photoUrlFor(p.id) : undefined} sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontSize: 20 }}>{p.fullName.charAt(0).toUpperCase()}</Avatar>
                  <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
                    <Typography variant="h6" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fullName}</Typography>
                    {p.relationship && <Chip size="small" label={p.relationship} variant="outlined" />}
                  </Box>
                  <Box sx={{ textAlign: 'center', ml: 'auto' }}>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: scoreColor(p.score), lineHeight: 1 }}>{p.score ?? '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">/100</Typography>
                  </Box>
                </Stack>
                {p.score != null && (
                  <Box sx={{ height: 8, borderRadius: 4, bgcolor: '#e2e8f0', mt: 1.5, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${p.score}%`, background: scoreColor(p.score), borderRadius: 4 }} />
                  </Box>
                )}
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {p.abnormalCount > 0 ? `⚠️ ${p.abnormalCount} valor(es) alterado(s)` : '✅ Tudo dentro da faixa'}
                  {p.performedAt && ` • ${new Date(p.performedAt).toLocaleDateString('pt-BR')}`}
                </Typography>
                {p.score == null && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Sem exame enviado.</Typography>}
                {p.topAbnormal.length > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    {p.topAbnormal.map((a, i) => <Chip key={i} size="small" color="error" variant="outlined" label={a.name} />)}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        *Scores baseados no último exame de cada um. Análise educativa, não substitui o médico.
      </Typography>
    </Box>
  );
};
