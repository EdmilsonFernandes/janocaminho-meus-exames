import { useState, useRef, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress, Paper, Stack, IconButton, SwipeableDrawer, Drawer, ListItemButton, ListItemText, ListItemIcon, Menu, MenuItem, Badge } from '@mui/material';
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
import { confirmDialog, promptDialog } from '../components/ConfirmDialog';
import { useSelectedPatient } from '../patient-context';
import { CREDIT_COSTS } from '../components/CreditBadge';
import { DrExame } from '../components/DrExame';
import ReactMarkdown from 'react-markdown';
import { keyframes } from '@mui/material';

const TEAL = '#178f89';

// 3 pontinhos pulsantes (estilo WhatsApp) — substitui o "escrevendo…" com spinner.
const dotPulse = keyframes`
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
`;
// Aura/badge animados do mascote no hero (mesma identidade do FAB Dr. Exame).
const drAura = keyframes`0%,100%{opacity:.4;transform:scale(.92)}50%{opacity:.72;transform:scale(1.14)}`;
const drBob = keyframes`0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}`;
const drSpark = keyframes`0%,100%{opacity:.65;transform:scale(.82) rotate(0deg)}45%{opacity:1;transform:scale(1.18) rotate(18deg)}70%{opacity:.9;transform:scale(1) rotate(8deg)}`;
const TypingDots = () => (
  <Box sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center', py: 0.5 }} aria-label="digitando">
    {[0, 1, 2].map((i) => (
      <Box key={i} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'text.secondary', animation: `${dotPulse} 1.2s ${i * 0.18}s infinite ease-in-out` }} />
    ))}
  </Box>
);

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
  // Extras
  { icon: '🫀', title: 'Meu risco cardíaco', prompt: 'Avalie meu risco cardiovascular (colesterol, pressão, glicemia) com base nos meus exames e diga como reduzir.' },
  { icon: '🧾', title: 'Resumo para o médico', prompt: 'Monte um resumo curto e organizado dos meus exames para eu levar na consulta médica.' },
  { icon: '🧠', title: 'Sinais de alerta', prompt: 'Há sinais nos meus exames ligados a cansaço, sono, estresse ou saúde mental que eu devia observar?' },
  { icon: '🏋️', title: 'Exercício pra mim', prompt: 'Com base no meu perfil e exames, que tipo e quantidade de exercício você recomenda?' },
  { icon: '🧬', title: 'Exames que faltam', prompt: 'Quais exames de rotina estão faltando no meu histórico conforme minha idade e perfil?' },
  { icon: '💊', title: 'Vitamina D e nutrientes', prompt: 'Como estão meus níveis de vitamina D, ferro e outros nutrientes? O que ajustar na dieta?' },
  { icon: '🩻', title: 'Entender meu exame de imagem', prompt: 'Tenho um exame de imagem (ultrassom, raio-x, tomografia). Pode explicar o laudo de forma simples?' },
  { icon: '🎯', title: 'Minhas metas do ano', prompt: 'Com base nos meus exames, sugira metas de saúde realistas para os próximos meses.' },
];

interface Msg { role: 'user' | 'assistant'; text: string; ts?: string }
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
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

  const [patientName, setPatientName] = useState('');

  // Sempre abre nas OPÇÕES (quick actions), não no histórico. Histórico fica no ícone do relógio.
  // + busca o nome do PACIENTE SELECIONADO (não do titular) pra saudar/titular pelo nome certo
  //   (antes usava localStorage.user.name = dono da conta → "Oi, Edmilson" no perfil da Heloisa).
  useEffect(() => {
    if (!pid) { setPatientName(''); return; }
    setConvs(loadConvs(pid)); setCurId(null);
    fetch(`${API_URL}/patients`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: any[]) => setPatientName(ps.find((x) => x.id === pid)?.fullName ?? ''))
      .catch(() => setPatientName(''));
  }, [pid]);
  const firstName = patientName.trim().split(/\s+/)[0];
  const cur = convs.find((c) => c.id === curId) ?? null;
  const messages = cur?.messages ?? [];
  // Autoscroll: rola SÓ o container de mensagens (não a página) pro fim a cada delta do streaming.
  // rAF garante que o novo texto já pintou antes de medir o scrollHeight (antes pulava o último).
  useEffect(() => {
    const id = requestAnimationFrame(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' }); });
    return () => cancelAnimationFrame(id);
  }, [messages, busy]);

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
    const now = isoNow();
    const baseMsgs: Msg[] = [...(work.find((c) => c.id === cid)!.messages), { role: 'user', text: message, ts: now }, { role: 'assistant', text: '', ts: now }];
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
      // Cancela o padding-bottom do content do shell (var --me-bottom-nav-h + 14px) p/ o
      // input encostar no rodapé sem gap. Usa a var (igual o FAB) — nunca px fixo (shell mudou
      // de 72px p/ var+14 e o -72px tinha ficado stale, ~18px de gap sobrando).
      mb: { xs: 'calc(-1 * (var(--me-bottom-nav-h, 76px) + 14px))', sm: -28 },
      p: { xs: 1, md: 2 },
      // INPUT acima do menu rodapé (mobile): o container preenche até o fim do viewport (negative mb)
      // e antes o input ficava POR TRÁS do MobileBottomNav fixo → usuário rolava pra achar onde digitar.
      pb: { xs: 'calc(var(--me-bottom-nav-h, 76px) + 6px)', md: 2 } }}>
      {/* HEADER estilo Mercado Pago: voltar · título · nova conversa · histórico */}
      <Paper elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: '12px', mb: 1, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
        <IconButton size="small" onClick={() => navigate('/')} sx={{ color: '#fff' }}>←</IconButton>
        <DrExame size={36} sx={{ borderRadius: '50%', flexShrink: 0, bgcolor: '#fff', p: '3px', boxShadow: '0 0 0 2px rgba(255,255,255,.45)' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.1, fontFamily: 'Poppins, sans-serif', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            Dr. Exame
            <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80', display: 'inline-block', boxShadow: '0 0 6px #4ade80' }} />
          </Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.9 }}>Assistente de saúde com IA{firstName ? ` · ${firstName}` : ''}</Typography>
        </Box>
        <IconButton size="small" onClick={() => setHistOpen(true)} title="Histórico de conversas" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.15)', '&:hover': { bgcolor: 'rgba(255,255,255,.25)' } }}>
          <Badge badgeContent={convs.length} color="warning" overlap="circular" sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16, top: 3, right: 3 } }}><HistoryIcon fontSize="small" /></Badge>
        </IconButton>
      </Paper>

      {/* mensagens */}
      <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1, background: 'background.default', borderRadius: '12px' }}>
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: { xs: 2, md: 4 }, gap: 1.5 }}>
            {/* Mascote Dr. Exame com aura teal pulsante + badge ✨ (IA) — convite à conversa, estilo Itaú */}
            <Box sx={{ position: 'relative', width: 84, height: 84, display: 'grid', placeItems: 'center', animation: `${drBob} 3.4s ease-in-out infinite` }}>
              <Box sx={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'radial-gradient(circle, rgba(32,178,170,.30) 0%, rgba(32,178,170,.10) 45%, transparent 72%)', filter: 'blur(4px)', animation: `${drAura} 2.6s ease-in-out infinite` }} />
              <DrExame size={64} sx={{ position: 'relative', borderRadius: '28%', filter: 'drop-shadow(0 2px 6px rgba(15,61,58,.25))' }} />
              <Box sx={{ position: 'absolute', top: 2, right: 0, width: 24, height: 24, borderRadius: '50%', bgcolor: '#178f89', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.22)', animation: `${drSpark} 2.2s ease-in-out infinite` }}>
                <AutoAwesomeIcon sx={{ fontSize: 13, color: '#fff' }} />
              </Box>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 19, md: 22 }, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>{firstName ? `Como posso te ajudar, ${firstName}?` : 'Como posso te ajudar?'}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Toque numa sugestão ou escreva sua dúvida sobre seus exames.</Typography>
            </Box>
            <Stack spacing={0.75} sx={{ width: '100%', maxWidth: 460, mt: 0.5 }}>
              {QUICK_ACTIONS.slice(0, 6).map((a) => (
                <Paper key={a.title} elevation={0} onClick={() => send(a.prompt)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, px: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', textAlign: 'left', '&:hover': { bgcolor: 'rgba(32,178,170,.08)', borderColor: TEAL, transform: 'translateY(-1px)' }, transition: 'all .15s' }}>
                  <Box sx={{ fontSize: 20 }}>{a.icon}</Box>
                  <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'text.primary' }}>{a.title}</Typography>
                  <Box component="span" sx={{ color: TEAL, fontWeight: 800, fontSize: 18, lineHeight: 1 }}>›</Box>
                </Paper>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7 }}>{CREDIT_COSTS.chat} crédito por pergunta · a IA não substitui seu médico</Typography>
          </Box>
        )}
        <Stack spacing={1.5}>
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && busy && !m.text;
            return (
              <Box key={i} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                {/* Avatar do Dr. Exame + ✨ em CADA resposta da IA (estilo Itaú: você conversa COM o assistente) */}
                {!isUser && (
                  <Box sx={{ position: 'relative', width: 30, height: 30, flexShrink: 0, mb: 0.25 }}>
                    <DrExame size={30} sx={{ borderRadius: '28%' }} />
                    <Box sx={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%', bgcolor: '#178f89', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AutoAwesomeIcon sx={{ fontSize: 8, color: '#fff' }} />
                    </Box>
                  </Box>
                )}
                <Paper elevation={0} sx={{
                  maxWidth: isUser ? '85%' : '78%', px: 1.75, py: 1.25,
                  borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  bgcolor: isUser ? TEAL : 'background.paper',
                  color: isUser ? '#fff' : 'text.primary',
                  border: isUser ? 'none' : '1px solid',
                  borderColor: 'divider',
                  wordBreak: 'break-word',
                  boxShadow: isUser ? '0 2px 10px rgba(32,178,170,.22)' : '0 1px 4px rgba(0,0,0,.05)',
                  '& p': { margin: '0.3em 0', fontSize: 15, lineHeight: 1.55 }, '& h3': { fontSize: '0.95rem', fontWeight: 800, margin: '0.6em 0 0.2em', color: TEAL },
                  '& ul, & ol': { margin: '0.3em 0', paddingLeft: '1.2em' }, '& li': { margin: '0.15em 0' },
                  '& strong': { fontWeight: 700 }, '& code': { bgcolor: 'rgba(128,128,128,.15)', px: 0.4, borderRadius: 0.5, fontSize: '0.9em' },
                }}>
                  {m.text
                    ? (m.role === 'assistant' ? <ReactMarkdown>{m.text}</ReactMarkdown> : <Box sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Box>)
                    : (isLastAssistant ? <TypingDots /> : null)}
                  {m.ts && <Typography sx={{ display: 'block', fontSize: 10, mt: 0.4, opacity: 0.6, textAlign: isUser ? 'right' : 'left' }}>{fmtTime(m.ts)}</Typography>}
                </Paper>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* INPUT com botão "+" (bottom sheet de ações) — estilo Mercado Pago */}
      <Box component="form" onSubmit={(e: any) => { e.preventDefault(); send(); }} sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mt: 1, p: 0.5, pl: 1, borderRadius: '999px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 2px 12px rgba(32,178,170,.08)' }}>
        <IconButton onClick={() => setSheetOpen(true)} title="Ações rápidas" sx={{ color: TEAL, '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }}><AddIcon /></IconButton>
        <Box component="input" value={input} disabled={busy} placeholder="Pergunte sobre seus exames…"
          onChange={(e: any) => setInput(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, padding: '10px 4px', fontSize: 16, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
        <Button type="submit" variant="contained" disabled={busy || !input.trim()} sx={{ minWidth: 0, borderRadius: '999px', px: 1.5, py: 1, bgcolor: TEAL, '&:hover': { bgcolor: '#0f7670' } }}>
          {busy ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
        </Button>
      </Box>

      {/* BOTTOM SHEET — ações rápidas (swipe-down p/ fechar) */}
      <SwipeableDrawer anchor="bottom" open={sheetOpen} onClose={() => setSheetOpen(false)} onOpen={() => setSheetOpen(true)}
        PaperProps={{ sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, p: 2, pb: 3, maxWidth: 520, mx: 'auto' } }}>
        <Box sx={{ width: 36, height: 4, bgcolor: 'action.selected', borderRadius: '999px', mx: 'auto', mb: 2 }} />
        <Typography sx={{ fontWeight: 800, mb: 0.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>Como posso te ajudar? 🤖</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Toque numa opção pra começar.</Typography>
        <Box sx={{ maxHeight: '68vh', overflowY: 'auto' }}>
        <Stack spacing={0.75}>
          {QUICK_ACTIONS.map((a) => (
            <Paper key={a.title} elevation={0} onClick={() => { setSheetOpen(false); send(a.prompt); }} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.1, px: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover', borderColor: TEAL } }}>
              <Box sx={{ fontSize: 20, width: 34, height: 34, borderRadius: '8px', bgcolor: 'rgba(32,178,170,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</Box>
              <Typography sx={{ flex: 1, fontWeight: 700, color: 'text.primary', fontSize: 15 }}>{a.title}</Typography>
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
          <Button size="small" startIcon={<EditIcon />} onClick={startNew} sx={{ color: '#fff', textTransform: 'none', fontWeight: 700, bgcolor: 'rgba(255,255,255,.15)', borderRadius: '999px', '&:hover': { bgcolor: 'rgba(255,255,255,.25)' } }}>Nova</Button>
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
      <ListItemText primary={conv.title || 'Sem título'} primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 500, color: 'text.primary', noWrap: true }} secondary={new Date(conv.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} secondaryTypographyProps={{ fontSize: 11 }} />
      <IconButton size="small" edge="end" onClick={(e) => { e.stopPropagation(); setMenu(e.currentTarget); }}><MoreVertIcon fontSize="small" sx={{ color: 'text.secondary' }} /></IconButton>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
        <MenuItem onClick={async () => { setMenu(null); const t = await promptDialog({ title: 'Renomear conversa', label: 'Título', defaultValue: conv.title, confirmLabel: 'Salvar' }); if (t != null) onRename(t.trim() || conv.title); }}>✏️ Renomear</MenuItem>
        <MenuItem onClick={async () => { setMenu(null); if (await confirmDialog({ title: 'Excluir conversa', message: 'Excluir esta conversa?', confirmLabel: 'Excluir' })) onDelete(); }} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Excluir</MenuItem>
      </Menu>
    </ListItemButton>
  );
};
