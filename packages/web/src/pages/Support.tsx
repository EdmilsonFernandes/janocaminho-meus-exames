import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography, Stack, Chip, TextField, InputLabel, FormControl, Select, MenuItem, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Link } from '@mui/material';
import { Title, useTranslate } from 'react-admin';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { API_URL, token } from '../config';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';

const authH = () => ({ Authorization: `Bearer ${token()}` });
const STATUS_META: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'default' }> = {
  open: { label: 'Em andamento', color: 'warning' },
  pending: { label: 'Aguardando você', color: 'info' },
  closed: { label: 'Resolvido', color: 'success' },
};
const CATS = ['Dúvida sobre um exame', 'Erro no app', 'Cobrança / Planos', 'Compartilhamento com médico', 'Sugestão', 'Outro'];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/** Download de anexo (com auth header → fetch+blob). */
async function downloadAtt(url: string, name: string) {
  try {
    const r = await fetch(`${API_URL}/${url}`, { headers: authH() });
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'anexo';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { /* ignora */ }
}

// ───────────────────────────────────────────────────────────────────────────
// Lista de chamados + criação
// ───────────────────────────────────────────────────────────────────────────
const CreateTicketDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) => {
  const [category, setCategory] = useState(CATS[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { setErr('Assunto e descrição são obrigatórios.'); return; }
    setSending(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('category', category); fd.append('subject', subject.trim()); fd.append('message', message.trim());
      for (const f of files.slice(0, 5)) fd.append('files', f, f.name);
      const r = await fetch(`${API_URL}/tickets`, { method: 'POST', headers: authH(), body: fd });
      if (r.status === 429) { setErr('Você tem chamados demais abertos. Aguarde resolver um.'); setSending(false); return; }
      if (!r.ok) throw new Error();
      setSubject(''); setMessage(''); setFiles([]); setCategory(CATS[0]);
      onCreated(); onClose();
    } catch { setErr('Falha ao enviar. Tente novamente.'); }
    setSending(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Novo chamado</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Assunto</InputLabel>
            <Select value={category} label="Assunto" onChange={(e) => setCategory(e.target.value)}>
              {CATS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Título resumido" size="small" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: Não consigo anexar exame" fullWidth />
          <TextField label="Descreva o que aconteceu" size="small" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={3} fullWidth />
          <Box>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Button size="small" startIcon={<AttachFileIcon />} onClick={() => fileRef.current?.click()}>Anexar prints ({files.length}/5)</Button>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {files.map((f, i) => <Chip key={i} size="small" label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />)}
            </Stack>
          </Box>
          {err && <Typography color="error" variant="body2">{err}</Typography>}
          <Typography variant="caption" color="text.secondary">Resposta em até 1 dia útil. Para urgências, contato@janocaminho.com.br.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={sending} startIcon={sending ? <CircularProgress size={16} color="inherit" /> : undefined}>{sending ? 'Enviando…' : 'Abrir chamado'}</Button>
      </DialogActions>
    </Dialog>
  );
};

const TicketList = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [err, setErr] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const load = () => { fetch(`${API_URL}/tickets`, { headers: authH() }).then((r) => r.ok ? r.json() : null).then((d) => { setTickets(d ?? []); setErr(d == null); }).catch(() => { setErr(true); setTickets([]); }); };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  return (
    <PageContainer>
      <Title title={translate('page.support')} />
      <PageHeader icon={<SupportAgentIcon />} title={translate('page.support')} accent="#178f89"
        subtitle={translate('page.support_sub')} />
      <Button variant="contained" startIcon={<AddIcon />} sx={{ mb: 2, borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }} onClick={() => setCreateOpen(true)}>Novo chamado</Button>

      {tickets == null ? <CircularProgress size={24} /> :
        err ? <Typography color="error">Não foi possível carregar seus chamados.</Typography> :
        tickets.length === 0 ? (
          <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent><Typography color="text.secondary">Você ainda não abriu chamados. Precisa de ajuda? Toque em “Novo chamado”.</Typography></CardContent></Card>
        ) : (
          <Stack spacing={1.5}>
            {tickets.map((t) => {
              const st = STATUS_META[t.status] ?? STATUS_META.open;
              return (
                <Card key={t.id} variant="outlined" onClick={() => navigate(`/suporte/${t.id}`)} sx={{ cursor: 'pointer', borderRadius: 2.5, '&:hover': { boxShadow: 2 } }}>
                  <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                      <Typography sx={{ fontWeight: 800, color: '#178f89' }}>#{t.number}</Typography>
                      {t.category && <Chip size="small" label={t.category} variant="outlined" sx={{ height: 20 }} />}
                      <Box sx={{ flex: 1 }} />
                      <Chip size="small" color={st.color as any} label={st.label} sx={{ fontWeight: 700 }} />
                      {t.unreadByUser && <Chip size="small" color="error" label="novidade" sx={{ height: 20 }} />}
                    </Stack>
                    <Typography sx={{ fontWeight: 700, mt: 0.5, wordBreak: 'break-word' }}>{t.subject}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.lastMessageAt ? `Última atualização ${fmtDate(t.lastMessageAt)}` : `Aberto ${fmtDate(t.createdAt)}`}</Typography>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      <CreateTicketDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </PageContainer>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Conversa (thread + resposta)
// ───────────────────────────────────────────────────────────────────────────
const TicketThread = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => { fetch(`${API_URL}/tickets/${id}`, { headers: authH() }).then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}); };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  const send = async () => {
    if (!reply.trim() && !files.length) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('message', reply.trim() || '(anexo)');
      for (const f of files.slice(0, 5)) fd.append('files', f, f.name);
      const r = await fetch(`${API_URL}/tickets/${id}/messages`, { method: 'POST', headers: authH(), body: fd });
      if (r.ok) { setReply(''); setFiles([]); void load(); }
    } catch { /* ignora */ }
    setSending(false);
  };

  if (!data) return <PageContainer><CircularProgress size={24} /></PageContainer>;
  const st = STATUS_META[data.status] ?? STATUS_META.open;

  return (
    <PageContainer>
      <Title title={`Chamado #${data.number}`} />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={() => navigate('/suporte')} title="Voltar"><ArrowBackIcon /></IconButton>
        <Typography sx={{ fontWeight: 800, color: '#178f89' }}>#{data.number}</Typography>
        <Chip size="small" color={st.color as any} label={st.label} sx={{ fontWeight: 700 }} />
        <Box sx={{ flex: 1 }} />
        {data.status === 'closed' && <Chip size="small" variant="outlined" label="Reabrir respondendo" />}
      </Stack>
      <Typography sx={{ fontWeight: 700, mb: 2 }}>{data.subject}</Typography>
      {data.category && <Chip size="small" label={data.category} variant="outlined" sx={{ mb: 2 }} />}

      {/* Thread */}
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {(data.messages ?? []).map((m: any) => {
          const mine = m.authorRole === 'user';
          const atts = m.attachments ?? [];
          return (
            <Box key={m.id} sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <Box sx={{ maxWidth: { xs: '85%', sm: '70%' }, bgcolor: mine ? '#178f89' : 'action.hover', color: mine ? '#fff' : 'text.primary', px: 1.5, py: 1, borderRadius: 2, borderBottomRightRadius: mine ? 4 : 2, borderBottomLeftRadius: mine ? 2 : 4 }}>
                {!mine && <Typography sx={{ fontSize: 11, fontWeight: 800, opacity: 0.8 }}>Dr. Suporte</Typography>}
                <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</Typography>
                {atts.length > 0 && (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {atts.map((a: any, i: number) => (
                      <Link key={i} component="button" sx={{ color: mine ? '#fff' : 'primary.main', fontSize: 13, textAlign: 'left' }} onClick={() => void downloadAtt(a.url, a.name)}>📎 {a.name}</Link>
                    ))}
                  </Stack>
                )}
                <Typography sx={{ fontSize: 10, opacity: 0.7, textAlign: mine ? 'right' : 'left', mt: 0.25 }}>{fmtDate(m.createdAt)}</Typography>
              </Box>
            </Box>
          );
        })}
        <div ref={endRef} />
      </Stack>

      {/* Resposta */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={1}>
            <TextField size="small" multiline minRows={2} placeholder="Escreva uma mensagem…" value={reply} onChange={(e) => setReply(e.target.value)} fullWidth
              disabled={false} />
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Button size="small" startIcon={<AttachFileIcon />} onClick={() => fileRef.current?.click()}>Anexar ({files.length}/5)</Button>
              {files.map((f, i) => <Chip key={i} size="small" label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />)}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" endIcon={<SendIcon />} disabled={sending || (!reply.trim() && !files.length)} onClick={() => void send()}>{sending ? 'Enviando…' : 'Enviar'}</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export const SupportPage = () => {
  const { id } = useParams();
  return id ? <TicketThread id={id} /> : <TicketList />;
};
