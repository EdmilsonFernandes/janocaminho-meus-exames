import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography, Stack, Chip, TextField, InputLabel, FormControl, Select, MenuItem, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Link } from '@mui/material';
import { Title, useTranslate } from 'react-admin';
import { PageContainer } from '../components/layout/PageContainer';
import { ListSkeleton } from '../components/Skeleton';
import { API_URL, token } from '../config';
import { DrExame } from '../components/DrExame';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import GavelIcon from '@mui/icons-material/Gavel';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WalletIcon from '@mui/icons-material/AccountBalanceWallet';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

const authH = () => ({ Authorization: `Bearer ${token()}` });
const STATUS_META: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'default' }> = {
  open: { label: 'Em andamento', color: 'warning' },
  pending: { label: 'Aguardando você', color: 'info' },
  closed: { label: 'Resolvido', color: 'success' },
};
const CATS = ['Dúvida sobre um exame', 'Exame rejeitado (CPF divergente)', 'Erro no app', 'Cobrança / Planos', 'Compartilhamento com médico', 'Sugestão', 'Outro'];
/** Ícone por categoria — o card fica escaneável sem ler texto (padrão Zendesk/Intercom). */
const CAT_ICON: Record<string, React.ReactNode> = {
  'Dúvida sobre um exame': <QuestionAnswerIcon sx={{ fontSize: 17, color: '#178f89' }} />,
  'Exame rejeitado (CPF divergente)': <GavelIcon sx={{ fontSize: 17, color: '#b45309' }} />,
  'Erro no app': <SupportAgentIcon sx={{ fontSize: 17, color: '#b91c1c' }} />,
  'Cobrança / Planos': <WalletIcon sx={{ fontSize: 17, color: '#0f6e68' }} />,
  'Compartilhamento com médico': <MedicalServicesIcon sx={{ fontSize: 17, color: '#178f89' }} />,
};

/** Prefill de apelação (?exam=<id>): contexto do exame rejeitado é anexado pelo SERVER
 *  (examId no form → ticket inclui status/CPF mascarados/motivo — nada de CPF integral). */
export type TicketPrefill = { category?: string; subject?: string; message?: string; examId?: string };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
/** Tempo relativo ("há 5 min") — mantém a fila viva; data completa no title/tooltip. */
const timeAgo = (d: string | null) => {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return 'agora';
  if (ms < 3_600_000) return `há ${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `há ${Math.floor(ms / 3_600_000)} h`;
  if (ms < 7 * 86_400_000) return `há ${Math.floor(ms / 86_400_000)} d`;
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

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
const CreateTicketDialog = ({ open, onClose, onCreated, prefill }: { open: boolean; onClose: () => void; onCreated: () => void; prefill?: TicketPrefill | null }) => {
  const [category, setCategory] = useState(CATS[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Apelação de exame rejeitado: chega com campos prontos (o usuário só confere e envia).
  const [appliedPrefill, setAppliedPrefill] = useState(false);
  useEffect(() => {
    if (open && prefill && !appliedPrefill) {
      if (prefill.category) setCategory(prefill.category);
      if (prefill.subject) setSubject(prefill.subject);
      if (prefill.message) setMessage(prefill.message);
      setAppliedPrefill(true);
    }
    if (!open) setAppliedPrefill(false);
  }, [open, prefill, appliedPrefill]);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { setErr('Assunto e descrição são obrigatórios.'); return; }
    setSending(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('category', category); fd.append('subject', subject.trim()); fd.append('message', message.trim());
      if (prefill?.examId) fd.append('examId', prefill.examId);
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Novo chamado</DialogTitle>
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
          {prefill?.examId && <Typography variant="caption" sx={{ color: '#178f89', fontWeight: 600 }}>📎 O contexto do exame (identificação, CPFs mascarados e motivo da rejeição) será anexado automaticamente ao chamado.</Typography>}
          <Typography variant="caption" color="text.secondary">Resposta em até 1 dia útil. Para urgências, <Box component="a" href="mailto:contato@janocaminho.com.br" sx={{ fontWeight: 700, color: 'primary.dark', textDecoration: 'underline' }}>contato@janocaminho.com.br</Box>.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancelar</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={sending} startIcon={sending ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>{sending ? 'Enviando…' : 'Abrir chamado'}</Button>
      </DialogActions>
    </Dialog>
  );
};

/** Auto-ajuda (deflection — o padrão Zendesk/Intercom): resposta imediata PRIMEIRO,
 *  chamado só quando não resolve. 4 dúvidas que resolvem sozinhas. */
const SELF_HELP = [
  { Icon: GavelIcon, t: 'Exame não apareceu?', d: 'CPF diferente no documento trava o exame (proteção contra exame de outra pessoa). Veja como apelar.', faq: 'CPF divergente', tone: '#b45309' },
  { Icon: UploadFileIcon, t: 'Como enviar seu exame', d: 'PDF do laboratório ou foto — com vários exames no mesmo arquivo, dividimos por data sozinhos.', faq: 'Como envio meu exame', tone: '#178f89' },
  { Icon: WalletIcon, t: 'Créditos e planos', d: 'Como funcionam os créditos de IA, o plano mensal e os bônus de indicação.', faq: 'créditos', tone: '#0f6e68' },
  { Icon: MedicalServicesIcon, t: 'Compartilhar com médico', d: 'Indique pelo CRM, escolha o escopo e revogue quando quiser.', faq: 'compartilhar', tone: '#178f89' },
];

const TicketList = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const [params] = useSearchParams();
  const appealExamId = params.get('exam'); // /suporte?exam=<id> → apelação de exame rejeitado
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [err, setErr] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<TicketPrefill | null>(null);
  const load = () => { fetch(`${API_URL}/tickets`, { headers: authH() }).then((r) => r.ok ? r.json() : null).then((d) => { setTickets(d ?? []); setErr(d == null); }).catch(() => { setErr(true); setTickets([]); }); };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (appealExamId) setCreateOpen(true); }, [appealExamId]);

  const appealPrefill: TicketPrefill | null = appealExamId ? {
    category: 'Exame rejeitado (CPF divergente)',
    subject: 'Este exame é meu — rejeição por CPF',
    message: 'Enviei um exame e ele não foi adicionado porque o CPF do documento é diferente do CPF da minha conta. O documento é meu e gostaria que vocês conferissem. Obrigado!',
    examId: appealExamId,
  } : null;

  const openCreate = (prefill?: TicketPrefill | null) => { setCreatePrefill(prefill ?? null); setCreateOpen(true); };
  const openCount = (tickets ?? []).filter((t) => t.status !== 'closed').length;

  return (
    <PageContainer>
      <Title title={translate('page.support')} />

      {/* HERO — "Como podemos ajudar?" (padrão visual do FAQ: gradiente + mascote) */}
      <Box sx={{
        position: 'relative', overflow: 'hidden', mb: 3,
        borderRadius: '16px', p: { xs: 2.5, md: 3.5 },
        background: 'linear-gradient(135deg,#20b2aa,#178f89)',
        color: '#fff',
        '&::after': {
          content: '""', position: 'absolute', inset: 0,
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.14) 50%, transparent 60%)',
          pointerEvents: 'none',
        },
      }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ position: 'relative' }}>
          <Box sx={{ width: 68, height: 68, flexShrink: 0, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.35)', display: 'grid', placeItems: 'center' }}>
            <DrExame size={44} sx={{ borderRadius: '50%' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 21, md: 25 }, lineHeight: 1.15 }}>Como podemos ajudar?</Typography>
            <Typography sx={{ fontSize: 14, opacity: 0.92, mt: 0.5 }}>Resposta em até 1 dia útil · urgências: <Box component="a" href="mailto:contato@janocaminho.com.br" sx={{ fontWeight: 700, color: 'inherit', textDecoration: 'underline' }}>contato@janocaminho.com.br</Box></Typography>
          </Box>
          <Button
            variant="contained" onClick={() => openCreate()} startIcon={<AddIcon />}
            sx={{ flexShrink: 0, bgcolor: '#fff', color: '#178f89', borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: { xs: 2, sm: 3 }, '&:hover': { bgcolor: '#f0fafa' }, boxShadow: '0 10px 24px rgba(0,0,0,.15)' }}
          >
            Novo chamado
          </Button>
        </Stack>
      </Box>

      {/* AUTO-AJUDA — resolve na hora, sem esperar (deflection) */}
      <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 1.5 }}>Resposta na hora</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 4 }}>
        {SELF_HELP.map(({ Icon, t, d, faq, tone }) => (
          <Card key={t} variant="outlined" onClick={() => navigate(`/faq?q=${encodeURIComponent(faq)}`)} sx={{ cursor: 'pointer', borderRadius: '12px', transition: 'all .2s ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 16px 36px rgba(15,61,58,.10)', borderColor: '#20b2aa' }, height: '100%' }}>
            <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(32,178,170,.10)' }}>
                <Icon sx={{ fontSize: 21, color: tone }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{t}</Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mt: 0.25 }}>{d}</Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* FILA DE CHAMADOS */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 15 }}>Seus chamados</Typography>
        {openCount > 0 && <Chip size="small" label={`${openCount} em aberto`} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(180,83,9,.12)', color: '#b45309' }} />}
      </Stack>

      {tickets == null ? <ListSkeleton count={4} /> :
        err ? <Typography color="error">Não foi possível carregar seus chamados.</Typography> :
        tickets.length === 0 ? (
          <Card variant="outlined" sx={{ borderRadius: '12px' }}>
            <CardContent sx={{ textAlign: 'center', py: 5 }}>
              <Box sx={{ width: 84, height: 84, mx: 'auto', mb: 2, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.10)', display: 'grid', placeItems: 'center', animation: 'onbFloat 2.6s ease-in-out infinite' }}>
                <DrExame size={54} sx={{ borderRadius: '50%' }} />
              </Box>
              <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 18 }}>Nada pendente por aqui</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.5, mb: 2.5, maxWidth: 340, mx: 'auto' }}>
                Você não tem chamados abertos. Se algo travou, a resposta na hora acima resolve a maioria — ou abra um chamado e a gente responde em até 1 dia útil.
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreate()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}>Abrir chamado</Button>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {tickets.map((t) => {
              const st = STATUS_META[t.status] ?? STATUS_META.open;
              return (
                <Card key={t.id} variant="outlined" onClick={() => navigate(`/suporte/${t.id}`)} sx={{ cursor: 'pointer', borderRadius: '12px', transition: 'all .2s ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 16px 36px rgba(15,61,58,.10)', borderColor: '#20b2aa' }, ...(t.unreadByUser ? { borderColor: '#20b2aa', borderWidth: 1.5 } : {}) }}>
                  <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
                    <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                      {CAT_ICON[t.category] ?? <QuestionAnswerIcon sx={{ fontSize: 17, color: 'text.disabled' }} />}
                      <Typography sx={{ fontWeight: 800, color: '#178f89' }}>#{t.number}</Typography>
                      {t.category && <Chip size="small" label={t.category} variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
                      <Box sx={{ flex: 1 }} />
                      <Chip size="small" color={st.color as any} label={st.label} sx={{ fontWeight: 700, height: 22 }} />
                      {t.unreadByUser && <Chip size="small" color="error" label="novidade" sx={{ height: 20, fontSize: 11 }} />}
                    </Stack>
                    <Typography sx={{ fontWeight: 700, mt: 0.5, wordBreak: 'break-word' }}>{t.subject}</Typography>
                    <Typography variant="caption" color="text.secondary" title={fmtDate(t.lastMessageAt ?? t.createdAt)}>
                      {t.lastMessageAt ? `Última atualização ${timeAgo(t.lastMessageAt)}` : `Aberto ${timeAgo(t.createdAt)}`}
                    </Typography>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      <CreateTicketDialog open={createOpen} onClose={() => { setCreateOpen(false); setCreatePrefill(null); }} onCreated={load} prefill={createPrefill ?? appealPrefill} />
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

  if (!data) return <PageContainer><ListSkeleton count={6} /></PageContainer>;
  const st = STATUS_META[data.status] ?? STATUS_META.open;

  return (
    <PageContainer>
      <Title title={`Chamado #${data.number}`} />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={() => navigate('/suporte')} title="Voltar"><ArrowBackIcon /></IconButton>
        <Typography sx={{ fontWeight: 800, color: '#178f89' }}>#{data.number}</Typography>
        <Chip size="small" color={st.color as any} label={st.label} sx={{ fontWeight: 700 }} />
        <Box sx={{ flex: 1 }} />
        {data.status === 'closed' && <Chip size="small" variant="outlined" label="Reabrir respondendo" sx={{ fontSize: 11 }} />}
      </Stack>
      <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 19, mb: 0.5 }}>{data.subject}</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2.5 }}>
        {data.category && <Chip size="small" label={data.category} variant="outlined" sx={{ height: 22, fontSize: 11 }} />}
        <Typography variant="caption" color="text.secondary">aberto {fmtDate(data.createdAt)}</Typography>
      </Stack>

      {/* Thread — bubbles do DS: suporte com avatar Dr. Exame; suas em teal */}
      <Stack spacing={1.25} sx={{ mb: 2 }}>
        {(data.messages ?? []).map((m: any) => {
          const mine = m.authorRole === 'user';
          const atts = m.attachments ?? [];
          return (
            <Box key={m.id} sx={{ display: 'flex', gap: 1, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
              {!mine && (
                <Box sx={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, bgcolor: 'rgba(32,178,170,.12)', display: 'grid', placeItems: 'center' }}>
                  <DrExame size={24} sx={{ borderRadius: '50%' }} />
                </Box>
              )}
              <Box sx={{ maxWidth: { xs: '82%', sm: '70%' }, bgcolor: mine ? 'transparent' : 'action.hover', color: 'text.primary', px: mine ? 0 : 1.5, py: mine ? 0 : 1.25, borderRadius: '12px', borderBottomRightRadius: mine ? 14 : 4, borderBottomLeftRadius: mine ? 4 : 14, ...(mine ? { background: 'linear-gradient(135deg,#20b2aa,#178f89)', px: 1.5, py: 1.25, color: '#fff' } : {}) }}>
                {!mine && <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#178f89' }}>Dr. Suporte</Typography>}
                <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 15, lineHeight: 1.55 }}>{m.body}</Typography>
                {atts.length > 0 && (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {atts.map((a: any, i: number) => (
                      <Link key={i} component="button" sx={{ color: mine ? '#fff' : '#178f89', fontSize: 13, textAlign: 'left', fontWeight: 700 }} onClick={() => void downloadAtt(a.url, a.name)}>📎 {a.name}</Link>
                    ))}
                  </Stack>
                )}
                <Typography sx={{ fontSize: 10, opacity: 0.65, textAlign: mine ? 'right' : 'left', mt: 0.4 }}>{fmtDate(m.createdAt)}</Typography>
              </Box>
            </Box>
          );
        })}
        <div ref={endRef} />
      </Stack>

      {/* Resposta */}
      <Card variant="outlined" sx={{ borderRadius: '12px' }}>
        <CardContent>
          <Stack spacing={1}>
            <TextField size="small" multiline minRows={2} placeholder={data.status === 'closed' ? 'Escreva para reabrir o chamado…' : 'Escreva uma mensagem…'} value={reply} onChange={(e) => setReply(e.target.value)} fullWidth
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Button size="small" startIcon={<AttachFileIcon />} onClick={() => fileRef.current?.click()}>Anexar ({files.length}/5)</Button>
              {files.map((f, i) => <Chip key={i} size="small" label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />)}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" endIcon={<SendIcon />} disabled={sending || (!reply.trim() && !files.length)} onClick={() => void send()} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>{sending ? 'Enviando…' : 'Enviar'}</Button>
            </Stack>
            <Typography variant="caption" color="text.disabled">Ctrl+Enter envia · anexe prints pra agilizar</Typography>
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
