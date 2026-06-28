import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** IA & Alertas — uso de IA (análises, modelo, tokens). Custo R$/latência: futuro (AiUsageLog). */
export const IaTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/ia-usage`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar o uso de IA." onRetry={load} />;
  return (
    <Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <Chip size="small" color="primary" label={`🤖 ${d.total} análises IA`} />
        {d.byModel.map((m: any) => <Chip key={m.modelUsed} size="small" variant="outlined" label={`${m.modelUsed ?? '?'}: ${m._count}`} />)}
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>Custo (R$), latência e taxa de sucesso por requisição exigem um modelo <strong>AiUsageLog</strong> dedicado (próxima fase). Hoje vemos volume + tokens.</Alert>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Análises recentes</Typography>
      <Stack spacing={1}>
        {d.recent.map((a: any) => (
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
