import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, TextField, Button, MenuItem, CircularProgress } from '@mui/material';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** Suporte — lista chamados (SupportTicket) + abrir novo. */
export const SupportTab = () => {
  const notify = useNotify();
  const [d, setD] = useState<{ tickets: any[]; openCount: number } | null>(null);
  const [err, setErr] = useState(false);
  const [userId, setUserId] = useState('');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/tickets`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  const create = async () => {
    if (!userId.trim() || !subject.trim()) { notify('Informe ID do usuário e assunto.', { type: 'warning' }); return; }
    setSaving(true);
    try { const r = await fetch(`${API_URL}/admin/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H() }, body: JSON.stringify({ userId: userId.trim(), subject: subject.trim(), priority }) }); if (r.ok) { notify('Chamado criado.', { type: 'success' }); setUserId(''); setSubject(''); void load(); } else notify('Falha ao criar.', { type: 'error' }); } catch { notify('Falha de conexão.', { type: 'error' }); }
    setSaving(false);
  };
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar os chamados." onRetry={load} />;
  const statusColor: any = { open: 'warning', pending: 'info', closed: 'success' };
  return (
    <Box>
      <Card variant="outlined" sx={{ borderRadius: 2, mb: 2 }}><CardContent>
        <Typography sx={{ fontWeight: 800, mb: 1.5 }}>🎫 Abrir chamado</Typography>
        <Stack spacing={1.5}>
          <TextField label="ID do usuário" value={userId} onChange={(e) => setUserId(e.target.value)} size="small" fullWidth placeholder="cmq..." />
          <TextField label="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} size="small" fullWidth />
          <TextField select label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)} size="small" sx={{ maxWidth: 200 }}>
            <MenuItem value="low">Baixa</MenuItem><MenuItem value="normal">Normal</MenuItem><MenuItem value="high">Alta</MenuItem>
          </TextField>
          <Button variant="contained" size="small" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => void create()} sx={{ alignSelf: 'flex-start', bgcolor: '#20b2aa', textTransform: 'none', fontWeight: 700 }}>Criar chamado</Button>
        </Stack>
      </CardContent></Card>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Chamados ({d!.tickets.length}) · {d!.openCount} aberto(s)</Typography>
      <Stack spacing={1}>
        {d!.tickets.map((t: any) => (
          <Card key={t.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Chip size="small" color={statusColor[t.status] ?? 'default'} label={t.status} />
              <Chip size="small" variant="outlined" label={t.priority} />
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{t.subject}</Typography>
              <Typography variant="caption" color="text.secondary">user:{(t.userId || '').slice(-6)} · {new Date(t.createdAt).toLocaleDateString('pt-BR')}</Typography>
            </Stack>
          </CardContent></Card>
        ))}
        {d!.tickets.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Nenhum chamado.</Typography>}
      </Stack>
    </Box>
  );
};
