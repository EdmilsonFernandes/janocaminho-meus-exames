import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, ListItem, ListItemIcon, ListItemText, IconButton, Checkbox, TextField, Stack, Chip, List } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { Title } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

export const RemindersPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const add = async () => {
    if (!title.trim() || !date) return;
    await fetch(`${API_URL}/reminders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, title: title.trim(), dueDate: date }),
    });
    setTitle(''); setDate(''); load();
  };
  const toggle = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ done: !r.done }),
    });
    load();
  };
  const del = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const overdue = (d: string) => new Date(d) < new Date(new Date().toDateString());

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title="Lembretes" />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Novo lembrete</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="O que (ex.: Refazer hemograma)" value={title} onChange={(e) => setTitle(e.target.value)} sx={{ flex: 1 }} />
            <TextField type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <Button variant="contained" onClick={add} disabled={!title.trim() || !date}>Adicionar</Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ pb: '8px !important' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Próximos lembretes</Typography>
          {items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Nenhum lembrete ainda. Crie um acima (ex.: "Refazer hemograma em 6 meses").</Typography>
          ) : (
            <List>
              {items.map((r) => (
                <ListItem key={r.id} sx={{ px: 0, borderBottom: '1px solid #eee', opacity: r.done ? 0.55 : 1 }}>
                  <ListItemIcon><Checkbox checked={r.done} onChange={() => toggle(r)} /></ListItemIcon>
                  <ListItemText
                    primary={<span style={{ textDecoration: r.done ? 'line-through' : 'none', fontWeight: 600 }}>{r.title}</span>}
                    secondary={<span><EventAvailableIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />{fmtDate(r.dueDate)} {overdue(r.dueDate) && !r.done && <Chip size="small" color="error" label="vencido" sx={{ ml: 1 }} />}</span>}
                  />
                  <IconButton edge="end" onClick={() => del(r)}><DeleteIcon /></IconButton>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
