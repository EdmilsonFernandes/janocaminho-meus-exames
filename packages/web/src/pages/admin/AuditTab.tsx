import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** Auditoria — lê o AuditLog dedicado (LGPD): quem fez o quê, quando. */
export const AuditTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/audit`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar a auditoria." onRetry={load} />;
  const color = (a: string) => a.includes('BLOCK') ? 'error' : a.includes('UNBLOCK') ? 'success' : 'default';
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 800 }}>🛡️ {d.count} evento(s) auditado(s)</Typography>
      {d.byAction?.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {d.byAction.map((a: any) => <Chip key={a.action} size="small" variant="outlined" color={color(a.action)} label={`${a.action}: ${a._count}`} />)}
        </Stack>
      )}
      <Stack spacing={1}>
        {d.auditLogs?.map((l: any) => (
          <Card key={l.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Chip size="small" color={color(l.action)} label={l.action} />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}><strong>{l.actorType}</strong>{l.targetType ? ` → ${l.targetType}:${(l.targetId || '').slice(-6)}` : ''}</Typography>
              <Typography variant="caption" color="text.secondary">{new Date(l.createdAt).toLocaleString('pt-BR')}{l.ip ? ` · ${l.ip}` : ''}</Typography>
            </Stack>
          </CardContent></Card>
        ))}
        {d.auditLogs?.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Nenhum evento ainda — bloqueie/libere um usuário p/ gerar registro.</Typography>}
      </Stack>
    </Box>
  );
};
