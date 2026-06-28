import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });
const STATUS_COLOR: Record<string, any> = { EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info' };

/** Gestão de exames — por status, falhas de OCR, reprocessar (link pro exame). */
export const ExamsTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/exams`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar os exames." onRetry={load} />;
  return (
    <Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {d.byStatus.map((s: any) => <Chip key={s.status} size="small" color={STATUS_COLOR[s.status] ?? 'default'} label={`${s.status}: ${s._count}`} />)}
      </Stack>
      {d.recentFailed?.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>⚠️ {d.recentFailed.length} exame(s) com falha de leitura recente — pode precisar reprocessar.</Alert>
      )}
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Últimos exames ({d.exams.length})</Typography>
      <Stack spacing={1}>
        {d.exams.map((e: any) => (
          <Card key={e.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Chip size="small" color={STATUS_COLOR[e.status] ?? 'default'} label={e.status} />
                <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{e.title || 'Sem título'}</Typography>
                <Typography variant="caption" color="text.secondary">{e._count?.items ?? 0} itens</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">{e.patient?.fullName ?? '—'} · {new Date(e.createdAt).toLocaleDateString('pt-BR')}</Typography>
              {e.extractionError && <Typography variant="caption" sx={{ display: 'block', color: 'error.main' }}>⚠️ {e.extractionError.slice(0, 120)}</Typography>}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
};
