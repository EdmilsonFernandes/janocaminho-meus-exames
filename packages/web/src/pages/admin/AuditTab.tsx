import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, TextField, MenuItem, Button } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

const KINDS = [
  { v: '', l: 'Tudo' },
  { v: 'logins', l: 'Logins' },
  { v: 'access', l: 'Acessos' },
  { v: 'admin', l: 'Ações admin' },
];
const TAKE = 50;

/** Auditoria — login/acesso do usuário + ações admin/doctor (tabela audit_logs, LGPD). */
export const AuditTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [kind, setKind] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);

  const load = useCallback(() => {
    setErr(false);
    const p = new URLSearchParams();
    if (kind) p.set('kind', kind);
    if (userId.trim()) p.set('userId', userId.trim());
    if (from) p.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) p.set('to', new Date(to + 'T23:59:59').toISOString());
    p.set('take', String(TAKE));
    p.set('skip', String(skip));
    fetch(`${API_URL}/admin/audit?${p.toString()}`, { headers: H() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, [kind, userId, from, to, skip]);

  useEffect(() => { load(); }, [load]);

  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar a auditoria." onRetry={load} />;

  const color = (a: string): any =>
    a.startsWith('LOGIN_SUCCESS') ? 'success'
    : a.startsWith('LOGIN_FAILED') ? 'warning'
    : a === 'ACCESS' ? 'info'
    : a.includes('BLOCK') ? 'error'
    : a.includes('UNBLOCK') ? 'success' : 'default';

  // Para ACCESS, lê method/path/status/ms do after (objeto JSON do Prisma).
  const accessInfo = (l: any): string | null => {
    if (!l.after) return null;
    try {
      const a = typeof l.after === 'string' ? JSON.parse(l.after) : l.after;
      if (a && a.method && a.path) return `${a.method} ${a.path} · ${a.status} · ${a.ms ?? '?'}ms`;
    } catch { /* after malformado — ignora */ }
    return null;
  };

  const hasPrev = skip > 0;
  const hasNext = (d.auditLogs?.length ?? 0) >= TAKE;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>🛡️ {d.count} evento(s) auditado(s)</Typography>

      {/* Filtros */}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5, alignItems: 'center' }}>
        <TextField select size="small" label="Tipo" value={kind} onChange={(e) => { setKind(e.target.value); setSkip(0); }} sx={{ minWidth: 140 }}>
          {KINDS.map((k) => <MenuItem key={k.v} value={k.v}>{k.l}</MenuItem>)}
        </TextField>
        <TextField size="small" label="ID do usuário" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="cuid..." sx={{ minWidth: 200 }} />
        <TextField size="small" type="date" label="De" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="Até" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button size="small" variant="contained" onClick={() => { setSkip(0); load(); }}>Aplicar</Button>
      </Stack>

      {/* Resumo por ação */}
      {d.byAction?.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {d.byAction.map((a: any) => <Chip key={a.action} size="small" variant="outlined" color={color(a.action)} label={`${a.action}: ${a._count}`} />)}
        </Stack>
      )}

      {/* Lista */}
      <Stack spacing={1}>
        {d.auditLogs?.map((l: any) => {
          const info = accessInfo(l);
          return (
            <Card key={l.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Chip size="small" color={color(l.action)} label={l.action} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}><strong>{l.actorType}</strong>{l.targetType ? ` → ${l.targetType}:${(l.targetId || '').slice(-6)}` : ''}</Typography>
                <Typography variant="caption" color="text.secondary">{new Date(l.createdAt).toLocaleString('pt-BR')}{l.ip ? ` · ${l.ip}` : ''}</Typography>
              </Stack>
              {info && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>{info}</Typography>}
            </CardContent></Card>
          );
        })}
        {d.auditLogs?.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Nenhum evento com esses filtros.</Typography>}
      </Stack>

      {/* Paginação */}
      <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" sx={{ mt: 2 }}>
        <Button size="small" disabled={!hasPrev} onClick={() => setSkip(Math.max(0, skip - TAKE))}>← Anterior</Button>
        <Typography variant="caption" color="text.secondary">{skip + 1}–{skip + (d.auditLogs?.length ?? 0)} de {d.count}</Typography>
        <Button size="small" disabled={!hasNext} onClick={() => setSkip(skip + TAKE)}>Próximo →</Button>
      </Stack>
    </Box>
  );
};
