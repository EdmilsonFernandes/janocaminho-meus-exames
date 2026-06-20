import { useState, useRef, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, CircularProgress, Paper, Stack, Chip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { Title, useNotify } from 'react-admin';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import { CreditBadge, CREDIT_COSTS } from '../components/CreditBadge';
import { DrExame } from '../components/DrExame';
import ReactMarkdown from 'react-markdown';

const SUGGESTIONS = [
  'Como está minha saúde no geral?',
  'O que mudou no meu colesterol?',
  'Quais valores devo preocupar?',
  'O que perguntar pro médico?',
];

interface Msg { role: 'user' | 'assistant'; text: string }

export const ChatPage = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pid] = useSelectedPatient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const notify = useNotify();
  // Saudação dinâmica por horário + gancho variado (engaja, faz voltar)
  const firstName = (JSON.parse(localStorage.getItem('user') || '{}')?.name || '').split(' ')[0];
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();
  const HOOKS = ['Bora dar uma olhada nos seus exames hoje? 🩺', 'Tem dúvida sobre algum resultado? Manda ver 👇', 'Seus exames tão aqui, organizados. O que quer saber?', 'Posso resumir, comparar ou explicar qualquer valor. Pergunta!'];
  const hook = HOOKS[new Date().getDate() % HOOKS.length];

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  // carrega a conversa anterior do paciente (persiste entre sessões/reload)
  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/chat?patientId=${pid}`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((turns: any[]) => {
        const msgs = (turns ?? []).flatMap((t) => [
          ...(t.userMessage ? [{ role: 'user' as const, text: t.userMessage }] : []),
          ...(t.contentMd ? [{ role: 'assistant' as const, text: t.contentMd }] : []),
        ]);
        setMessages(msgs);
      })
      .catch(() => {});
  }, [pid]);

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    const assistantIdx = messages.length + 1;
    setMessages((m) => [...m, { role: 'user', text: message }, { role: 'assistant', text: '' }]);
    try {
      const r = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ message, patientId: pid }),
      });
      if (r.status === 402) { setMessages((m) => m.slice(0, -2)); const e = await r.json().catch(() => ({})); notify(e.message || 'Sem créditos para conversar.', { type: 'warning' }); return; }
      if (!r.ok || !r.body) throw new Error('falha no chat');
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.startsWith('data: ') ? p.slice(6) : p;
          try {
            const evt = JSON.parse(line);
            if (evt.delta) {
              setMessages((m) => {
                const copy = [...m];
                copy[assistantIdx] = { role: 'assistant', text: (copy[assistantIdx]?.text ?? '') + evt.delta };
                return copy;
              });
            }
          } catch { /* pacote parcial */ }
        }
      }
    } catch {
      setMessages((m) => m.slice(0, -2)); // limpa placeholders (sua pergunta + resposta vazia)
      notify('A IA não respondeu agora. Tente novamente em instantes.', { type: 'error' });
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event('creditsChanged'));
    }
  };

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', p: { xs: 1, md: 2 }, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)' }}>
      <Title title="Assistente de saúde" />
      <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, p: { xs: 1.5, md: 2 } }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            🤖 Pergunte sobre seus exames. Respostas educativas — não substituem o médico.
          </Typography>
          <Box sx={{ mb: 1 }}><CreditBadge amount={CREDIT_COSTS.chat} label={`${CREDIT_COSTS.chat} crédito por pergunta`} /></Box>

          {/* Sugestões sempre visíveis (barra horizontal) — não perde o usuário no histórico */}
          <Stack direction="row" spacing={0.75} sx={{ mb: 1, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' }, '& > *': { flexShrink: 0 } }}>
            {SUGGESTIONS.map((s) => <Chip key={s} size="small" label={s} onClick={() => setInput(s)} sx={{ maxWidth: 240, bgcolor: 'rgba(32,178,170,.08)', color: '#178f89', fontWeight: 600, '&:hover': { bgcolor: 'rgba(32,178,170,.16)' } }} />)}
          </Stack>

          {/* área de mensagens (rolável) */}
          <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1, background: '#f3f6fb', borderRadius: 2 }}>
            {messages.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}><DrExame size={56} sx={{ borderRadius: '18%' }} /></Box>
                <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#178f89' }}>{greeting}, {firstName || 'tudo bem'}! 👋</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.25 }}>{hook}</Typography>
                <Stack spacing={0.75} sx={{ maxWidth: 460, mx: 'auto' }}>
                  {SUGGESTIONS.map((s) => (
                    <Paper key={s} elevation={0} onClick={() => setInput(s)} sx={{ cursor: 'pointer', p: 1, px: 1.5, borderRadius: 2, border: '1px solid #d6e4ee', bgcolor: '#fff', textAlign: 'left', fontSize: 14, '&:hover': { bgcolor: '#eef7f6', borderColor: 'primary.main' } }}>
                      💬 {s}
                    </Paper>
                  ))}
                </Stack>
              </Box>
            )}
            <Stack spacing={1.5}>
              {messages.map((m, i) => {
                const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && busy && !m.text;
                return (
                  <Box key={i} sx={{ display: 'flex', gap: 0.75, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
                    {m.role === 'assistant' && <DrExame size={28} sx={{ borderRadius: '50%', flexShrink: 0, mb: 0.25 }} />}
                    <Paper elevation={0} sx={{
                      maxWidth: '82%', px: 1.5, py: 1, borderRadius: 2,
                      bgcolor: m.role === 'user' ? 'primary.main' : '#ffffff',
                      color: m.role === 'user' ? '#fff' : 'text.primary',
                      border: m.role === 'user' ? 'none' : '1px solid #e0e6f0',
                      wordBreak: 'break-word',
                      '& p': { margin: '0.3em 0' }, '& h3': { fontSize: '0.95rem', fontWeight: 800, margin: '0.6em 0 0.2em', color: '#178f89' },
                      '& ul, & ol': { margin: '0.3em 0', paddingLeft: '1.2em' }, '& li': { margin: '0.15em 0' },
                      '& strong': { fontWeight: 700 }, '& code': { bgcolor: 'rgba(0,0,0,.06)', px: 0.4, borderRadius: 0.5, fontSize: '0.9em' },
                    }}>
                      {m.text
                        ? (m.role === 'assistant'
                          ? <ReactMarkdown>{m.text}</ReactMarkdown>
                          : <Box sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Box>)
                        : (isLastAssistant ? <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', color: '#94a3b8' }}><CircularProgress size={14} /> Dr. Exame está escrevendo…</Box> : '')}
                    </Paper>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          {/* entrada */}
          <Box component="form" sx={{ display: 'flex', gap: 1, mt: 1.5 }} onSubmit={(e: any) => { e.preventDefault(); send(); }}>
            <Box component="input" value={input} disabled={busy} placeholder="Pergunte sobre seus exames…"
              onChange={(e: any) => setInput(e.target.value)}
              style={{ flex: 1, padding: '12px 14px', fontSize: 16, borderRadius: 10, border: '1px solid #c4d0e0', outline: 'none' }} />
            <Button type="submit" variant="contained" size="large" disabled={busy || !input.trim()} sx={{ px: 3, minWidth: 0 }}>
              {busy ? <CircularProgress size={22} color="inherit" /> : <SendIcon />}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
