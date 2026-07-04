import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });
const ok = (v: boolean) => (v ? '#059669' : '#ef4444');

/** Saúde técnica — status do sistema: DB, extração (jobs presos/falhas), IA, devices. */
export const TechTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/tech`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível checar a saúde do sistema." onRetry={load} />;
  const stuck = d.stuck ?? 0;
  const failed24 = d.failed24h ?? 0;
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
        {[
          { l: 'Banco de dados', v: d.db, ok: d.db === 'ok' },
          { l: 'Exames processados', v: String(d.examStatus.find((s: any) => s.status === 'EXTRACTED')?._count ?? 0) },
          { l: 'Jobs presos (EXTRACTING)', v: String(stuck), alert: stuck > 0 },
          { l: 'Falhas nas últimas 24h', v: String(failed24), alert: failed24 > 0 },
          { l: 'Análises IA (total)', v: String(d.aiCount) },
          { l: 'Devices c/ push', v: String(d.devices) },
        ].map((k) => (
          <Card key={k.l} variant="outlined" sx={{ borderRadius: 2, borderColor: k.alert ? 'error.main' : 'divider' }}><CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 22, color: k.ok !== undefined ? ok(k.ok) : k.alert ? '#ef4444' : 'text.primary' }}>{String(k.v)}</Typography>
            <Typography variant="caption" color="text.secondary">{k.l}</Typography>
          </CardContent></Card>
        ))}
      </Box>
      {(stuck > 0 || failed24 > 0) && <Alert severity={failed24 > 0 ? 'error' : 'warning'} sx={{ mb: 2 }}>{failed24 > 0 ? `${failed24} exame(s) falharam nas últimas 24h (revisar OCR/extração).` : ''} {stuck > 0 ? `${stuck} exame(s) presos em EXTRACTING (worker travado?).` : ''}</Alert>}
      <Typography variant="caption" color="text.secondary">Monitoramento detalhado (CPU/memória/fila/latência IA) exige <strong>ProcessingJob</strong> + <strong>AiUsageLog</strong> + <strong>SystemHealthCheck</strong> (próxima fase). Última checagem: {new Date(d.ts).toLocaleString('pt-BR')}.</Typography>
    </Box>
  );
};
