import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Grid, Stack, Chip, Avatar, Alert, AlertTitle } from '@mui/material';
import { Title } from 'react-admin';
import { API_URL, token } from '../config';

interface FamPatient {
  id: string; fullName: string; relationship: string | null; photoUrl: string | null;
  score: number | null; abnormalCount: number; examTitle: string | null; performedAt: string | null;
  topAbnormal: { name: string; value: string | null; flag: string }[];
}
interface CrossAlert { analyte: string; patients: string[]; }

const scoreColor = (s: number | null) => (s == null ? '#9e9e9e' : s >= 80 ? '#2e7d32' : s >= 60 ? '#e65100' : '#c62828');

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

  if (loading) return <CircularProgress />;

  const patients = data?.patients ?? [];
  const ranked = [...patients].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return (
    <Box>
      <Title title="Saúde da Família" />
      <Typography variant="h5" gutterBottom>👨‍👩‍👧‍👦 Visão da família</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Score de cada dependente (último exame) e alertas que aparecem em mais de uma pessoa.
      </Typography>

      {(data?.crossAlerts ?? []).length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Padrão familiar detectado</AlertTitle>
          <Stack spacing={0.5}>
            {data!.crossAlerts.map((c) => (
              <Typography key={c.analyte} variant="body2">
                <strong>{c.analyte}</strong> alterado em: {c.patients.join(', ')}.
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {patients.length === 0 && <Typography color="text.secondary">Nenhum perfil cadastrado.</Typography>}

      <Grid container spacing={2}>
        {ranked.map((p, idx) => (
          <Grid key={p.id} size={{ xs: 12, md: 6 }}>
            <Card variant="outlined"><CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar src={p.photoUrl ?? undefined}>{p.fullName.charAt(0).toUpperCase()}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6">{p.fullName}</Typography>
                  {p.relationship && <Chip size="small" label={p.relationship} variant="outlined" />}
                </Box>
                {idx === 0 && ranked.length > 1 && p.score != null && (
                  <Chip size="small" color="success" label="🏆 Melhor" />
                )}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: scoreColor(p.score) }}>{p.score ?? '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">/100</Typography>
                </Box>
              </Stack>
              {p.score != null && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {p.abnormalCount > 0 ? `${p.abnormalCount} valor(es) alterado(s)` : 'Tudo dentro da faixa'}
                  {p.performedAt && ` • ${new Date(p.performedAt).toLocaleDateString('pt-BR')}`}.
                </Typography>
              )}
              {p.score == null && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Sem exame laboratorial enviado.</Typography>
              )}
              {p.topAbnormal.length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  {p.topAbnormal.map((a, i) => <Chip key={i} size="small" color="error" variant="outlined" label={a.name} />)}
                </Stack>
              )}
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        *Scores comparativos baseados no último exame laboratorial de cada um. Análise educativa, não substitui o médico.
      </Typography>
    </Box>
  );
};
