import { useState, useRef, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, CircularProgress, Paper, Stack } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { Title, useNotify } from 'react-admin';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';

interface Msg { role: 'user' | 'assistant'; text: string }

export const ChatPage = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pid] = useSelectedPatient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const notify = useNotify();

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
      notify('Erro ao conversar com a IA.', { type: 'error' });
    } finally {
      setBusy(false);
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

          {/* área de mensagens (rolável) */}
          <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1, background: '#f3f6fb', borderRadius: 2 }}>
            {messages.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                Ex.: “Como está minha saúde no geral?” ou “O que mudou no meu colesterol?”
              </Typography>
            )}
            <Stack spacing={1.5}>
              {messages.map((m, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Paper elevation={0} sx={{
                    maxWidth: '85%', px: 1.5, py: 1, borderRadius: 2,
                    bgcolor: m.role === 'user' ? 'primary.main' : '#ffffff',
                    color: m.role === 'user' ? '#fff' : 'text.primary',
                    border: m.role === 'user' ? 'none' : '1px solid #e0e6f0',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.text || (busy && m.role === 'assistant' ? '…' : '')}
                  </Paper>
                </Box>
              ))}
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
