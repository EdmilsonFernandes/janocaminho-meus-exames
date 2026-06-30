import { useEffect, useState, useRef } from 'react';
import { Box, Typography, Stack, Chip, Card, CardContent, CircularProgress, IconButton, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Link } from '@mui/material';
import { useNotify } from 'react-admin';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const H = () => ({ Authorization: `Bearer ${token()}` });
const STATUS_META: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'default' }> = {
  open: { label: 'Em andamento', color: 'warning' },
  pending: { label: 'Aguardando usuário', color: 'info' },
  closed: { label: 'Resolvido', color: 'success' },
};
const FILTERS: { id: string; label: string }[] = [
  { id: 'open', label: 'Em andamento' },
  { id: 'pending', label: 'Aguardando' },
  { id: 'closed', label: 'Resolvidos' },
];

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

async function downloadAtt(url: string, name: string) {
  try {
    const r = await fetch(`${API_URL}/${url}`, { headers: H() });
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name || 'anexo';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { /* ignora */ }
}

export const SupportTab = () => {
  const notify = useNotify();
  const [data, setData] = useState<{ tickets: any[]; openCount: number; unreadByAdmin: number } | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/tickets?status=${filter}`, { headers: H() });
      if (r.ok) setData(await r.json()); else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [filter]);

  const tickets = (data?.tickets ?? []).filter((t) => {
    if (!q.trim()) return true;
    const s = `${t.number} ${t.subject} ${t.category ?? ''} ${t.user?.name ?? ''} ${t.user?.email ?? ''}`.toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
        <Typography sx={{ fontWeight: 800 }}>🎟️ Fila de suporte</Typography>
        {!!data?.unreadByAdmin && <Chip size="small" color="error" label={`${data.unreadByAdmin} não lido(s)`} />}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="Buscar (nº, assunto, usuário)…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 260 } }} />
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
        {FILTERS.map((f) => <Chip key={f.id} size="small" label={f.label} color={filter === f.id ? 'primary' : 'default'} variant={filter === f.id ? 'filled' : 'outlined'} onClick={() => setFilter(f.id)} />)}
      </Stack>

      {loading ? <TabLoader /> : error ? <SectionError message="Não foi possível carregar os chamados." onRetry={() => void load()} /> : tickets.length === 0 ? (
        <Card variant="outlined"><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>Nenhum chamado neste filtro.</Typography></CardContent></Card>
      ) : (
        <Stack spacing={1}>
          {tickets.map((t) => {
            const st = STATUS_META[t.status] ?? STATUS_META.open;
            return (
              <Card key={t.id} variant="outlined" onClick={() => setSelId(t.id)} sx={{ cursor: 'pointer', borderRadius: 2, '&:hover': { boxShadow: 2 }, borderLeft: t.unreadByAdmin ? '4px solid #ef4444' : undefined }}>
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                    <Typography sx={{ fontWeight: 800, color: '#178f89' }}>#{t.number}</Typography>
                    {t.category && <Chip size="small" label={t.category} variant="outlined" sx={{ height: 20 }} />}
                    <Box sx={{ flex: 1 }} />
                    <Chip size="small" color={st.color as any} label={st.label} sx={{ fontWeight: 700 }} />
                  </Stack>
                  <Typography sx={{ fontWeight: 700, mt: 0.25, wordBreak: 'break-word' }}>{t.subject}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.user?.name ?? '—'} · {t.user?.email ?? ''} · {fmt(t.lastMessageAt)}</Typography>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {selId && <Conversation ticketId={selId} onClose={() => { setSelId(null); void load(); }} onNotify={notify} />}
    </Box>
  );
};

// ── Conversa (Dialog): thread + resposta + status ──
const Conversation = ({ ticketId, onClose, onNotify }: { ticketId: string; onClose: () => void; onNotify: (m: string, o?: any) => void }) => {
  const [data, setData] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => { fetch(`${API_URL}/admin/tickets/${ticketId}`, { headers: H() }).then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}); };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [ticketId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  const send = async () => {
    if (!reply.trim() && !files.length) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('message', reply.trim() || '(anexo)');
      for (const f of files.slice(0, 5)) fd.append('files', f, f.name);
      const r = await fetch(`${API_URL}/admin/tickets/${ticketId}/messages`, { method: 'POST', headers: H(), body: fd });
      if (r.ok) { setReply(''); setFiles([]); onNotify('Resposta enviada — usuário notificado.', { type: 'success' }); void load(); }
      else onNotify('Erro ao enviar.', { type: 'error' });
    } catch { onNotify('Falha de rede.', { type: 'error' }); }
    setSending(false);
  };

  const setStatus = async (status: string) => {
    const r = await fetch(`${API_URL}/admin/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...H() }, body: JSON.stringify({ status }) });
    if (r.ok) { onNotify(status === 'closed' ? 'Chamado resolvido.' : 'Status atualizado.', { type: 'success' }); void load(); }
  };

  if (!data) return <Dialog open onClose={onClose} fullWidth><DialogContent><CircularProgress size={24} /></DialogContent></Dialog>;
  const st = STATUS_META[data.status] ?? STATUS_META.open;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 5 }}>
        <Typography sx={{ fontWeight: 800, color: '#178f89' }}>#{data.number}</Typography>
        <Chip size="small" color={st.color as any} label={st.label} />
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontWeight: 700 }}>{data.subject}</Typography>
        <Typography variant="caption" color="text.secondary">👤 {data.user?.name ?? '—'} · {data.user?.email ?? ''}</Typography>
        {data.category && <Box sx={{ mt: 0.5 }}><Chip size="small" label={data.category} variant="outlined" /></Box>}
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {(data.messages ?? []).map((m: any) => {
            const mine = m.authorRole === 'admin';
            const atts = m.attachments ?? [];
            return (
              <Box key={m.id} sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <Box sx={{ maxWidth: { xs: '85%', sm: '70%' }, bgcolor: mine ? '#178f89' : 'action.hover', color: mine ? '#fff' : 'text.primary', px: 1.5, py: 1, borderRadius: 2 }}>
                  {!mine && <Typography sx={{ fontSize: 11, fontWeight: 800, opacity: 0.7 }}>Usuário</Typography>}
                  <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</Typography>
                  {atts.length > 0 && (
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {atts.map((a: any, i: number) => <Link key={i} component="button" sx={{ color: mine ? '#fff' : 'primary.main', fontSize: 13, textAlign: 'left' }} onClick={() => void downloadAtt(a.url, a.name)}>📎 {a.name}</Link>)}
                    </Stack>
                  )}
                  <Typography sx={{ fontSize: 10, opacity: 0.7, textAlign: mine ? 'right' : 'left', mt: 0.25 }}>{fmt(m.createdAt)}</Typography>
                </Box>
              </Box>
            );
          })}
          <div ref={endRef} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, p: 2 }}>
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <TextField size="small" multiline minRows={2} placeholder="Responder… pedir mais informações, anexar print…" value={reply} onChange={(e) => setReply(e.target.value)} fullWidth />
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          <Button size="small" startIcon={<AttachFileIcon />} onClick={() => fileRef.current?.click()}>Anexar ({files.length}/5)</Button>
          {files.map((f, i) => <Chip key={i} size="small" label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />)}
          <Box sx={{ flex: 1 }} />
          {data.status !== 'closed' && <Button size="small" color="success" startIcon={<MarkEmailReadIcon />} onClick={() => void setStatus('closed')}>Resolver</Button>}
          <Button variant="contained" endIcon={<SendIcon />} disabled={sending || (!reply.trim() && !files.length)} onClick={() => void send()}>{sending ? 'Enviando…' : 'Responder'}</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
