import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { Box, Card, CardContent, Typography, CircularProgress, Grid, Stack, Chip, Avatar, Alert, AlertTitle } from '@mui/material';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import { API_URL, token, photoUrlFor } from '../config';
import { ExplainButton } from '../components/ExplainItem';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

interface FamPatient {
  id: string; fullName: string; relationship: string | null; photoUrl: string | null;
  score: number | null; abnormalCount: number; examTitle: string | null; performedAt: string | null;
  topAbnormal: { name: string; value: string | null; flag: string }[];
}
interface CrossAlert { analyte: string; patients: string[]; }

const scoreColor = (s: number | null) => (s == null ? '#9e9e9e' : s >= 80 ? '#059669' : s >= 60 ? '#f59e0b' : '#ef4444');
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : null);

export const FamilyPage = () => {
  const translate = useTranslate();
  const [data, setData] = useState<{ patients: FamPatient[]; crossAlerts: CrossAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmp, setCmp] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/patients/family-overview`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    fetch(`${API_URL}/patients/family-compare`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setCmp(d.rows ?? []))
      .catch(() => {});
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const patients = data?.patients ?? [];
  const ranked = [...patients].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)); // 1º = maior score

  return (
    <PageContainer width={980}>
      <PageHeader icon={<Diversity3Icon />} title={translate('page.family')} accent="#d4a574"
        subtitle={translate('page.family_sub')} />

      {(data?.crossAlerts ?? []).length > 0 && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
          <AlertTitle>🧬 Padrão familiar detectado</AlertTitle>
          <Stack spacing={0.5}>
            {data!.crossAlerts.map((c) => (
              <Typography key={c.analyte} variant="body2"><strong>{c.analyte}</strong> alterado em: {c.patients.join(', ')}.</Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {patients.length === 0 && <Typography color="text.secondary">Nenhum perfil cadastrado.</Typography>}

      {/* Cards dos membros (sem pódio redundante — 🥇 no 1º lugar) */}
      <Grid container spacing={2}>
        {ranked.map((p, idx) => (
          <Grid key={p.id} size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ borderRadius: 4, height: '100%', ...(idx === 0 && p.score != null ? { borderColor: '#d4a574', borderWidth: 2 } : {}) }}>
              <CardContent>
                {idx === 0 && p.score != null && (
                  <Chip size="small" label="🥇 Melhor score da família" sx={{ mb: 1, bgcolor: 'rgba(212,165,116,.2)', color: '#b88a54', fontWeight: 700 }} />
                )}
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
                  <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'divider', mt: 1.5, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${p.score}%`, background: scoreColor(p.score), borderRadius: 4 }} />
                  </Box>
                )}
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {p.abnormalCount > 0 ? `⚠️ ${p.abnormalCount} valor(es) alterado(s)` : '✅ Tudo dentro da faixa'}
                  {fmtDate(p.performedAt) && ` • ${fmtDate(p.performedAt)}`}
                </Typography>
                {p.score == null && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Sem exame enviado.</Typography>}
                {p.topAbnormal.length > 0 && (
                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {p.topAbnormal.map((a, i) => <Chip key={i} size="small" color="error" variant="outlined" label={a.name} />)}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        *Score de cada um (últimos 12 meses) — o mesmo do seu painel e do portal do médico. Análise educativa, não substitui o médico.
      </Typography>

      {/* COMPARATIVO por analito (último valor de cada membro) */}
      {cmp.length > 0 && (
        <Box sx={{ mt: 5, pt: 3, borderTop: '1px dashed', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>🧬 Comparativo por analito</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Último valor de cada membro nos analitos em comum (verde = na faixa, vermelho = alterado).</Typography>
          <Stack spacing={1}>
            {cmp.map((row) => (
              <Card key={row.analyte} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography component="span" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{row.analyte}</Typography>
                    {row.unit ? <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 13 }}>({row.unit})</Typography> : null}
                    <ExplainButton name={row.analyte} />
                  </Box>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {row.members.map((m: any, i: number) => (
                      <Chip key={i} size="small" variant="outlined" label={`${(m.name ?? '').split(' ')[0]}: ${m.value}`}
                        color={m.flag === 'NORMAL' ? 'success' : (['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag) ? 'error' : 'default')} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}
    </PageContainer>
  );
};
