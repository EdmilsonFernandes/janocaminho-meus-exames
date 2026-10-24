import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, TextField, MenuItem, Button, Collapse, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
/** Tradução das ações de auditoria → rótulo pt-BR */
const ACTION_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: 'Login OK',
  LOGIN_FAILED: 'Login falhou',
  SIGNUP: 'Cadastro',
  SIGNUP_BLOCKED: 'Cadastro bloqueado',
  BOT_BLOCKED: 'Bot bloqueado',
  LOGOUT: 'Logout',
  PASSWORD_RESET_REQUEST: 'Reset de senha',
  PASSWORD_RESET_SUCCESS: 'Senha redefinida',
  MFA_CHALLENGE: 'Desafio MFA',
  MFA_SUCCESS: 'MFA OK',
  MFA_FAILED: 'MFA falhou',
  DATA_EXPORT: 'Export de dados',
  ACCOUNT_DELETED: 'Conta excluída',
  PII_VIEWED: 'PII visualizado',
  ADMIN_ACTION: 'Ação admin',
  DOCTOR_REGISTER: 'Médico registrou',
  DOCTOR_LOGIN: 'Médico logou',
  CREDITS_GRANTED: 'Créditos concedidos',
  CREDITS_REVOKED: 'Créditos revogados',
  EXAM_DELETED: 'Exame excluído',
};
const actionLabel = (a: string | null | undefined) => {
  if (!a) return '—';
  if (ACTION_LABEL[a]) return ACTION_LABEL[a];
  if (a.startsWith('LOGIN_SUCCESS')) return 'Login OK';
  if (a.startsWith('LOGIN_FAILED')) return 'Login falhou';
  return a.replace(/_/g, ' ').toLowerCase();
};

export const AuditTab = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [kind, setKind] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  // §5 (dono 24/10): grupos consecutivos do mesmo ator abertos/fechados pelo admin.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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
    : a === 'EXAM_DELETED' ? 'warning'
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

  // EXAM_DELETED: tombstone com metadados do exame (título, data, extração) — sem dado de saúde.
  const examInfo = (l: any): string | null => {
    if (l.action !== 'EXAM_DELETED' || !l.before) return null;
    try {
      const b = typeof l.before === 'string' ? JSON.parse(l.before) : l.before;
      if (!b?.title) return null;
      const parts = [`Exame: ${b.title}`];
      if (b.performedAt) parts.push(`realizado ${new Date(b.performedAt).toLocaleDateString('pt-BR')}`);
      if (b.extractedAt) parts.push(`extraído ${new Date(b.extractedAt).toLocaleDateString('pt-BR')}`);
      return parts.join(' · ');
    } catch { /* before malformado — ignora */ }
    return null;
  };

  const hasPrev = skip > 0;
  const hasNext = (d.auditLogs?.length ?? 0) >= TAKE;

  /** Linha de UM evento (mesmo conteúdo de antes — chip + ator + data/ip + detalhe). */
  const logRow = (l: any) => {
    const info = accessInfo(l) ?? examInfo(l);
    return (
      <Box>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Chip size="small" color={color(l.action)} label={actionLabel(l.action)} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            <strong>{d.actors?.[l.actorId]?.name ?? l.actorType}</strong>{d.actors?.[l.actorId]?.email ? ` · ${d.actors[l.actorId].email}` : (l.targetType && l.targetType !== 'USER' && l.targetType !== 'DOCTOR' ? ` → ${l.targetType}` : '')}
          </Typography>
          <Typography variant="caption" color="text.secondary">{new Date(l.createdAt).toLocaleString('pt-BR')}{l.ip ? ` · ${l.ip}` : ''}</Typography>
        </Stack>
        {info && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>{info}</Typography>}
      </Box>
    );
  };

  /** §5 (dono 24/10, "mesmo usuário agrupar pra não poluir"): entradas CONSECUTIVAS do
   *  mesmo ator (actorType+actorId) viram UM item expansível; o histórico completo fica
   *  visível dentro do Collapse (nenhum evento some — só deixa de repetir o ator N vezes). */
  const groups: { key: string; actorLabel: string; logs: any[] }[] = [];
  for (const l of d.auditLogs ?? []) {
    const key = `${l.actorType}:${l.actorId ?? ''}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.logs.push(l);
    else groups.push({ key, actorLabel: d.actors?.[l.actorId]?.name ?? l.actorType, logs: [l] });
  }

  /** Rótulo do intervalo da rajada ("últimas 2 h") — lista vem newest-first. */
  const spanLabel = (logs: any[]): string => {
    const span = Math.max(0, new Date(logs[0].createdAt).getTime() - new Date(logs[logs.length - 1].createdAt).getTime());
    if (span < 60_000) return 'no mesmo minuto';
    if (span < 3_600_000) return `últimos ${Math.max(1, Math.round(span / 60_000))} min`;
    if (span < 86_400_000) return `últimas ${Math.max(1, Math.round(span / 3_600_000))} h`;
    return `últimos ${Math.max(1, Math.round(span / 86_400_000))} d`;
  };

  const toggleGroup = (gk: string) => setOpenGroups((s) => ({ ...s, [gk]: !s[gk] }));

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
          {d.byAction.map((a: any) => <Chip key={a.action} size="small" variant="outlined" color={color(a.action)} label={`${actionLabel(a.action)}: ${a._count}`} />)}
        </Stack>
      )}

      {/* Lista — ator consecutivo agrupado em item expansível (§5) */}
      <Stack spacing={1}>
        {groups.map((g, gi) => {
          const gk = `${gi}:${g.key}`;
          const open = !!openGroups[gk];
          if (g.logs.length === 1) {
            return (
              <Card key={g.logs[0].id} variant="outlined" sx={{ borderRadius: '12px' }}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                {logRow(g.logs[0])}
              </CardContent></Card>
            );
          }
          const first = g.logs[0];
          return (
            <Card key={gk} variant="outlined" sx={{ borderRadius: '12px' }}>
              <CardContent
                sx={{ py: 1.25, '&:last-child': { pb: 1.25 }, cursor: 'pointer' }}
                onClick={() => toggleGroup(gk)}
              >
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <Chip size="small" color={color(first.action)} label={actionLabel(first.action)} />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                    <strong>{g.actorLabel}</strong> · {g.logs.length} ações · {spanLabel(g.logs)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{new Date(first.createdAt).toLocaleString('pt-BR')}</Typography>
                  <IconButton
                    size="small"
                    aria-label={open ? `Recolher ${g.logs.length} ações de ${g.actorLabel}` : `Expandir ${g.logs.length} ações de ${g.actorLabel}`}
                    aria-expanded={open}
                    onClick={(e) => { e.stopPropagation(); toggleGroup(gk); }}
                    sx={{ p: 0.5 }}
                  >
                    <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </IconButton>
                </Stack>
              </CardContent>
              <Collapse in={open} timeout="auto" unmountOnExit>
                <Stack spacing={1} sx={{ px: 2, pb: 1.5 }}>
                  {g.logs.map((l: any) => (
                    <Box key={l.id} sx={{ pl: 1.25, borderLeft: '2px solid', borderColor: 'divider' }}>
                      {logRow(l)}
                    </Box>
                  ))}
                </Stack>
              </Collapse>
            </Card>
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
