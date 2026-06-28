import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** IA & Alertas — volume (ai_analyses) + custo/latência (AiUsageLog, quando populado). */
export const IaTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/ia-usage`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar o uso de IA." onRetry={load} />;
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
        {[
          { l: 'Análises IA', v: String(d.analysesCount ?? 0) },
          { l: 'Custo total (R$)', v: (d.totalCost ?? 0).toFixed(2), sub: d.totalLogs ? `${d.totalLogs} logs` : 'sem logs' },
          { l: 'Tokens', v: String(d.totalTokens ?? 0) },
          { l: 'Latência média', v: `${d.avgLatency ?? 0}ms` },
        ].map((k) => (
          <Card key={k.l} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#178f89' }}>{k.v}</Typography>
            <Typography variant="caption" color="text.secondary">{k.l}{k.sub ? ` (${k.sub})` : ''}</Typography>
          </CardContent></Card>
        ))}
      </Box>
      {d.totalLogs === 0 && <Alert severity="info" sx={{ mb: 2 }}>Custo/latência exigem logar cada chamada de IA no <strong>AiUsageLog</strong> (próximo passo). Hoje: volume.</Alert>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {d.byModel?.map((m: any) => <Chip key={m.modelUsed} size="small" variant="outlined" label={`${m.modelUsed ?? '?'}: ${m._count}`} />)}
      </Stack>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Análises recentes</Typography>
      <Stack spacing={1}>
        {d.recent?.map((a: any) => (
          <Card key={a.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Chip size="small" label={a.type} variant="outlined" />
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{a.exam?.title ?? 'Chat/relatório'}</Typography>
              <Typography variant="caption" color="text.secondary">{a.modelUsed ?? '?'} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}</Typography>
            </Stack>
          </CardContent></Card>
        ))}
      </Stack>
    </Box>
  );
};
