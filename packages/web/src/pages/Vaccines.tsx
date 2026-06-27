import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, TextField, List, ListItem, ListItemText, IconButton, Stack, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

export const VaccinesPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextDate, setNextDate] = useState('');
  const [lot, setLot] = useState('');

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/vaccines?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const add = async () => {
    if (!name.trim() || !date) return;
    await fetch(`${API_URL}/vaccines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, name: name.trim(), dateApplied: date, nextDoseDate: nextDate || null, lot: lot || null }),
    });
    setName(''); setNextDate(''); setLot(''); load();
  };
  const del = async (id: string) => {
    await fetch(`${API_URL}/vaccines/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const overdue = (d: string) => new Date(d) < new Date();

  return (
    <PageContainer width="content">
      <PageHeader icon={<VaccinesIcon />} title="Carteira de Vacinação" />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Registrar vacina</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
            <TextField size="small" label="Vacina" placeholder="Influenza, COVID-19..." value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
            <TextField size="small" type="date" label="Aplicada em" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="Próxima dose" value={nextDate} onChange={(e) => setNextDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="Lote" value={lot} onChange={(e) => setLot(e.target.value)} sx={{ width: 100 }} />
            <Button variant="contained" onClick={add} disabled={!name.trim()}>Adicionar</Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Histórico de vacinas</Typography>
          {items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma vacina registrada. Cadastre suas vacinas aqui.</Typography>
          ) : (
            <List>
              {items.map((v) => (
                <ListItem key={v.id} sx={{ px: 0, borderBottom: '1px solid', borderColor: 'divider' }}
                  secondaryAction={<IconButton edge="end" onClick={() => del(v.id)}><DeleteIcon /></IconButton>}>
                  <ListItemText
                    primary={<span style={{ fontWeight: 600 }}><VaccinesIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />{v.name}</span>}
                    secondary={<span>Aplicada: {fmt(v.dateApplied)}{v.lot ? ` • Lote: ${v.lot}` : ''}
                      {v.nextDoseDate && <Chip size="small" sx={{ ml: 1 }} color={overdue(v.nextDoseDate) ? 'error' : 'warning'} label={`Próxima: ${fmt(v.nextDoseDate)}${overdue(v.nextDoseDate) ? ' (vencida)' : ''}`} />}</span>}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};
