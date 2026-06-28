import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });
const TYPE_COLOR: Record<string, any> = { alert: 'error', tip: 'info', achievement: 'success', reminder: 'warning', trend: 'secondary' };

/** Auditoria — proxy (notificações) enquanto AuditLog dedicado não existe. Próx: modelar AuditLog. */
export const AuditTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/audit`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar a auditoria." onRetry={load} />;
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>⚠️ Auditoria dedicada (quem bloqueou quem, quem acessou dados sensíveis) exige um modelo <strong>AuditLog</strong> append-only — próxima fase essencial (LGPD). Hoje: proxy via notificações do sistema.</Alert>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {d.byType.map((t: any) => <Chip key={t.type} size="small" color={TYPE_COLOR[t.type] ?? 'default'} label={`${t.type}: ${t._count}`} />)}
      </Stack>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Atividade recente (proxy)</Typography>
      <Stack spacing={1}>
        {d.recent.map((n: any) => (
          <Card key={n.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Chip size="small" label={n.type} variant="outlined" />
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{n.title}</Typography>
              <Typography variant="caption" color="text.secondary">{n.user?.email ?? '—'} · {new Date(n.createdAt).toLocaleString('pt-BR')}</Typography>
            </Stack>
          </CardContent></Card>
        ))}
      </Stack>
    </Box>
  );
};
