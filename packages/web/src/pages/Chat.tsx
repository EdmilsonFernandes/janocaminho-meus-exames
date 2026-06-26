import { useState, useRef, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress, Paper, Stack, IconButton, SwipeableDrawer, Drawer, ListItemButton, ListItemText, ListItemIcon, Menu, MenuItem } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/EditNote';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ChatBubbleIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from 'react-router-dom';
import { useNotify } from 'react-admin';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import { CreditBadge, CREDIT_COSTS } from '../components/CreditBadge';
import { DrExame } from '../components/DrExame';
import ReactMarkdown from 'react-markdown';

const TEAL = '#178f89';

const QUICK_ACTIONS = [
  // Visão geral
  { icon: '📊', title: 'Resumo dos meus exames', prompt: 'Faça um resumo geral dos meus exames mais recentes e destaque o que precisa de atenção.' },
  { icon: '⚠️', title: 'O que está alterado', prompt: 'Liste os valores que estão fora da faixa de referência nos meus exames e explique o que cada um significa.' },
  { icon: '📈', title: 'Minha evolução', prompt: 'Mostre como meus principais exames evoluíram ao longo do tempo e diga se há tendência de melhora ou piora.' },
  { icon: '🔄', title: 'Comparar exames', prompt: 'Compare meus dois exames mais recentes do mesmo tipo e destaque o que mudou.' },
  // Entender
  { icon: '📖', title: 'Explicar termo médico', prompt: 'Quero entender um termo médico do meu exame. Pode explicar de forma simples?' },
  { icon: '🔬', title: 'O que significa meu resultado', prompt: 'Pegue um dos meus resultados, explique o que ele mede e diga se está dentro do esperado.' },
  { icon: '🎯', title: 'Minhas metas e referências', prompt: 'Quais são as faixas de referência saudáveis dos meus principais exames e onde estou em relação a elas?' },
  { icon: '🚨', title: 'O que precisa de atenção urgente', prompt: 'Há algum resultado nos meus exames que precise de atenção médica imediata? Seja honesto e indique urgência.' },
  // Ação
  { icon: '🩺', title: 'O que perguntar ao médico', prompt: 'Quais perguntas devo levar ao médico na próxima consulta com base nos meus resultados?' },
  { icon: '💡', title: 'Como melhorar minha saúde', prompt: 'Quais ações práticas (hábitos, exercício, sono) posso tomar para melhorar meus resultados?' },
  { icon: '🥗', title: 'Alimentação recomendada', prompt: 'Com base nos meus exames, que mudanças na alimentação você recomenda?' },
  // Acompanhamento
  { icon: '📅', title: 'Quando repetir os exames', prompt: 'Com base nos meus exames, quais devo repetir e em quanto tempo?' },
  { icon: '💉', title: 'Vacinas em dia', prompt: 'Verifique meu histórico de vacinas e diga quais estão em atraso ou faltando conforme o calendário.' },
  { icon: '🗓️', title: 'Lembretes pendentes', prompt: 'Quais lembretes e compromissos de saúde eu tenho pendentes agora?' },
];

interface Msg { role: 'user' | 'assistant'; text: string }
interface Conv { id: string; title: string; createdAt: string; updatedAt: string; messages: Msg[] }

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const isoNow = () => new Date().toISOString();
const storageKey = (pid: string) => `dr-chat-${pid}`;
const loadConvs = (pid: string): Conv[] => { try { return JSON.parse(localStorage.getItem(storageKey(pid)) || '[]'); } catch { return []; } };
const saveConvs = (pid: string, convs: Conv[]) => { try { localStorage.setItem(storageKey(pid), JSON.stringify(convs)); } catch {} };

const bucket = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (sameDay) return 'Hoje';
  if (days < 7) return 'Últimos 7 dias';
  if (days < 30) return 'Últimos 30 dias';
  return 'Mais antigas';
};
const BUCKETS = ['Hoje', 'Últimos 7 dias', 'Últimos 30 dias', 'Mais antigas'];

export const ChatPage = () => {
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const navigate = useNavigate();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const firstName = (() => { try { return (JSON.parse(localStorage.getItem('user') || '{}')?.name || '').split(' ')[0]; } catch { return ''; } })();

  useEffect(() => { if (pid) { const loaded = loadConvs(pid); setConvs(loaded); setCurId(loaded[0]?.id ?? null); } }, [pid]);
  const cur = convs.find((c) => c.id === curId) ?? null;
  const messages = cur?.messages ?? [];
  // 'auto' (instantâneo): não "rola" visivelmente ao abrir a tela — só posiciona no fim.
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' }); }, [messages, busy]);

  const startNew = () => { setCurId(null); setInput(''); setHistOpen(false); };

  const send = async (overrideText?: string) => {
    const message = (overrideText ?? input).trim();
    if (!message || busy || !pid) return;
    setInput(''); setBusy(true);

    let cid = curId;
    let work: Conv[] = convs;
    if (!cid) {
      cid = newId();
      work = [{ id: cid, title: message.slice(0, 48), createdAt: isoNow(), updatedAt: isoNow(), messages: [] }, ...convs];
    }
    const baseMsgs: Msg[] = [...(work.find((c) => c.id === cid)!.messages), { role: 'user', text: message }, { role: 'assistant', text: '' }];
    work = work.map((c) => c.id === cid ? { ...c, updatedAt: isoNow(), title: c.messages.length === 0 ? message.slice(0, 48) : c.title, messages: baseMsgs } : c);
    setConvs(work); setCurId(cid);
    const assistantIdx = baseMsgs.length - 1;

    const rollback = () => { work = work.map((c) => c.id === cid ? { ...c, messages: c.messages.slice(0, -2) } : c); setConvs(work); if (pid) saveConvs(pid, work); };
    const persist = () => { if (pid) saveConvs(pid, work); };

    try {
      const r = await fetch(`${API_URL}/chat`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ message, patientId: pid }) });
      if (r.status === 402) { const e = await r.json().catch(() => ({})); notify(e.message || 'Sem créditos para conversar.', { type: 'warning' }); rollback(); return; }
      if (!r.ok || !r.body) throw new Error('falha no chat');
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.startsWith('data: ') ? p.slice(6) : p;
          try { const evt = JSON.parse(line); if (evt.delta) { work = work.map((c) => c.id === cid ? { ...c, messages: c.messages.map((m, i) => i === assistantIdx ? { ...m, text: (m.text ?? '') + evt.delta } : m) } : c); setConvs(work); } } catch { /* pacote parcial */ }
        }
      }
      persist();
    } catch { rollback(); notify('A IA não respondeu agora. Tente novamente em instantes.', { type: 'error' }); }
    finally { setBusy(false); window.dispatchEvent(new Event('creditsChanged')); }
  };

  const renameConv = (id: string, title: string) => { const next = convs.map((c) => c.id === id ? { ...c, title } : c); setConvs(next); if (pid) saveConvs(pid, next); };
  const deleteConv = (id: string) => { const next = convs.filter((c) => c.id !== id); setConvs(next); if (pid) saveConvs(pid, next); if (curId === id) setCurId(next[0]?.id ?? null); };

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', display: 'flex', flexDirection: 'column',
      // Preenche do app bar até encostar no bottom nav — sem gap, sem scroll.
      // dvh = viewport dinâmico (não salta c/ teclado/toolbar no mobile).
      height: { xs: 'calc(100dvh - 116px - env(safe-area-inset-bottom))', sm: 'calc(100dvh - 84px)' },
      // Cancela o padding-bottom global do content (72px+safe) que, somado à altura cheia,
      // fazia a área rolar e aparecia um espaço vazio feio entre o input e o rodapé.
      mb: { xs: 'calc(-72px - env(safe-area-inset-bottom))', sm: -28 },
      p: { xs: 1, md: 2 } }}>
      {/* HEADER estilo Mercado Pago: voltar · título · nova conversa · histórico */}
      <Paper elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 3, mb: 1, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
        <IconButton size="small" onClick={() => navigate('/')} sx={{ color: '#fff' }}>←</IconButton>
        <DrExame size={30} sx={{ borderRadius: '50%' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.1, fontFamily: 'Poppins, sans-serif' }}>Dr. Exame</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.9 }}>Assistente de saúde</Typography>
        </Box>
        <IconButton size="small" onClick={startNew} title="Nova conversa" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.15)', '&:hover': { bgcolor: 'rgba(255,255,255,.25)' } }}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={() => setHistOpen(true)} title="Histórico" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.15)', '&:hover': { bgcolor: 'rgba(255,255,255,.25)' } }}><HistoryIcon fontSize="small" /></IconButton>
      </Paper>

      {/* mensagens */}
      <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1, background: 'background.default', borderRadius: 3 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: { xs: 2, md: 4 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}><DrExame size={64} sx={{ borderRadius: '22%' }} /></Box>
            <Typography sx={{ fontWeight: 800, fontSize: 18, color: TEAL }}>{firstName ? `Oi, ${firstName}! 👋` : 'Olá! 👋'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 0.5 }}>Sou o Dr. Exame. Pergunte sobre seus exames ou toque em <strong>+</strong> pra ver o que posso fazer.</Typography>
            <Stack spacing={0.75} sx={{ maxWidth: 460, mx: 'auto' }}>
              {QUICK_ACTIONS.slice(0, 6).map((a) => (
                <Paper key={a.title} elevation={0} onClick={() => send(a.prompt)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, px: 1.5, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', textAlign: 'left', '&:hover': { bgcolor: '#eefaf8', borderColor: TEAL, transform: 'translateY(-1px)' }, transition: 'all .15s' }}>
                  <Box sx={{ fontSize: 20 }}>{a.icon}</Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>{a.title}</Typography>
                </Paper>
              ))}
            </Stack>
            <Box sx={{ mt: 2, display: 'inline-block' }}><CreditBadge amount={CREDIT_COSTS.chat} label={`${CREDIT_COSTS.chat} crédito por pergunta`} /></Box>
          </Box>
        )}
        <Stack spacing={1.5}>
          {messages.map((m, i) => {
            const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && busy && !m.text;
            return (
              <Box key={i} sx={{ display: 'flex', gap: 0.75, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
                {m.role === 'assistant' && (
                  <Box sx={{ position: 'relative', flexShrink: 0, mb: 0.25 }}>
                    <DrExame size={28} sx={{ borderRadius: '50%' }} />
                    {/* Estrela ✨ (IA) no avatar do Dr. Exame em cada resposta */}
                    <Box sx={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: '50%', bgcolor: '#f59e0b', border: '1.2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AutoAwesomeIcon sx={{ fontSize: 7, color: '#fff' }} />
                    </Box>
                  </Box>
                )}
                <Paper elevation={0} sx={{
                  maxWidth: '82%', px: 1.5, py: 1, borderRadius: 2,
                  bgcolor: m.role === 'user' ? TEAL : 'background.paper',
                  color: m.role === 'user' ? '#fff' : 'text.primary',
                  border: m.role === 'user' ? 'none' : '1px solid',
                  borderColor: m.role === 'user' ? 'none' : 'divider',
                  wordBreak: 'break-word',
                  '& p': { margin: '0.3em 0' }, '& h3': { fontSize: '0.95rem', fontWeight: 800, margin: '0.6em 0 0.2em', color: TEAL },
                  '& ul, & ol': { margin: '0.3em 0', paddingLeft: '1.2em' }, '& li': { margin: '0.15em 0' },
                  '& strong': { fontWeight: 700 }, '& code': { bgcolor: 'rgba(0,0,0,.06)', px: 0.4, borderRadius: 0.5, fontSize: '0.9em' },
                }}>
                  {m.text
                    ? (m.role === 'assistant' ? <ReactMarkdown>{m.text}</ReactMarkdown> : <Box sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Box>)
                    : (isLastAssistant ? <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', color: 'text.secondary' }}><CircularProgress size={14} /> Dr. Exame está escrevendo…</Box> : '')}
                </Paper>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* INPUT com botão "+" (bottom sheet de ações) — estilo Mercado Pago */}
      <Box component="form" onSubmit={(e: any) => { e.preventDefault(); send(); }} sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mt: 1, p: 0.5, pl: 1, borderRadius: 99, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 2px 12px rgba(32,178,170,.08)' }}>
        <IconButton onClick={() => setSheetOpen(true)} title="Ações rápidas" sx={{ color: TEAL, '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }}><AddIcon /></IconButton>
        <Box component="input" value={input} disabled={busy} placeholder="Pergunte sobre seus exames…"
          onChange={(e: any) => setInput(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, padding: '10px 4px', fontSize: 16, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
        <Button type="submit" variant="contained" disabled={busy || !input.trim()} sx={{ minWidth: 0, borderRadius: 99, px: 1.5, py: 1, bgcolor: TEAL, '&:hover': { bgcolor: '#0f7670' } }}>
          {busy ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
        </Button>
      </Box>

      {/* BOTTOM SHEET — ações rápidas (swipe-down p/ fechar) */}
      <SwipeableDrawer anchor="bottom" open={sheetOpen} onClose={() => setSheetOpen(false)} onOpen={() => setSheetOpen(true)}
        PaperProps={{ sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, p: 2, pb: 3, maxWidth: 520, mx: 'auto' } }}>
        <Box sx={{ width: 36, height: 4, bgcolor: 'action.selected', borderRadius: 99, mx: 'auto', mb: 2 }} />
        <Typography sx={{ fontWeight: 800, mb: 0.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>Como posso te ajudar? 🤖</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Toque numa opção pra começar.</Typography>
        <Box sx={{ maxHeight: '68vh', overflowY: 'auto' }}>
        <Stack spacing={0.75}>
          {QUICK_ACTIONS.map((a) => (
            <Paper key={a.title} elevation={0} onClick={() => { setSheetOpen(false); send(a.prompt); }} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.1, px: 1.5, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover', borderColor: TEAL } }}>
              <Box sx={{ fontSize: 20, width: 34, height: 34, borderRadius: 1.5, bgcolor: 'rgba(32,178,170,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</Box>
              <Typography sx={{ flex: 1, fontWeight: 700, color: 'text.primary', fontSize: 14.5 }}>{a.title}</Typography>
              <Typography sx={{ color: TEAL, fontWeight: 800 }}>›</Typography>
            </Paper>
          ))}
        </Stack>
        </Box>
      </SwipeableDrawer>

      {/* HISTÓRICO — conversas agrupadas por período */}
      <Drawer anchor="right" open={histOpen} onClose={() => setHistOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 370 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid', borderBottomColor: 'divider', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>🕒 Histórico</Typography>
          <Button size="small" startIcon={<EditIcon />} onClick={startNew} sx={{ color: '#fff', textTransform: 'none', fontWeight: 700, bgcolor: 'rgba(255,255,255,.15)', borderRadius: 99, '&:hover': { bgcolor: 'rgba(255,255,255,.25)' } }}>Nova</Button>
        </Box>
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {convs.length === 0 && <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Nenhuma conversa ainda.<br />Comece a conversar com o Dr. Exame! 💬</Typography>}
          {BUCKETS.map((bk) => {
            const items = convs.filter((c) => bucket(c.updatedAt) === bk);
            if (!items.length) return null;
            return (
              <Box key={bk}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, px: 2, pt: 1.5, pb: 0.5 }}>{bk}</Typography>
                {items.map((c) => <HistoryRow key={c.id} conv={c} active={c.id === curId} onOpen={() => { setCurId(c.id); setHistOpen(false); }} onRename={(t) => renameConv(c.id, t)} onDelete={() => deleteConv(c.id)} />)}
              </Box>
            );
          })}
        </Box>
      </Drawer>
    </Box>
  );
};

const HistoryRow = ({ conv, active, onOpen, onRename, onDelete }: { conv: Conv; active: boolean; onOpen: () => void; onRename: (t: string) => void; onDelete: () => void }) => {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  return (
    <ListItemButton selected={active} onClick={onOpen} sx={{ py: 1, px: 2, '&.Mui-selected': { bgcolor: 'rgba(32,178,170,.08)' }, '&.Mui-selected:hover': { bgcolor: 'rgba(32,178,170,.12)' } }}>
      <ListItemIcon sx={{ minWidth: 34 }}><ChatBubbleIcon sx={{ color: active ? TEAL : 'text.secondary', fontSize: 18 }} /></ListItemIcon>
      <ListItemText primary={conv.title || 'Sem título'} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: 'text.primary', noWrap: true }} secondary={new Date(conv.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} secondaryTypographyProps={{ fontSize: 11 }} />
      <IconButton size="small" edge="end" onClick={(e) => { e.stopPropagation(); setMenu(e.currentTarget); }}><MoreVertIcon fontSize="small" sx={{ color: 'text.secondary' }} /></IconButton>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { borderRadius: 2 } } }}>
        <MenuItem onClick={() => { setMenu(null); const t = window.prompt('Título da conversa:', conv.title); if (t != null) onRename(t.trim() || conv.title); }}>✏️ Renomear</MenuItem>
        <MenuItem onClick={() => { setMenu(null); if (window.confirm('Excluir esta conversa?')) onDelete(); }} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Excluir</MenuItem>
      </Menu>
    </ListItemButton>
  );
};
