import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText, IconButton, Stack, Collapse } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Title } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

const TYPES = [
  { v: 'BLOOD_PRESSURE', l: 'Pressão arterial', u: 'mmHg', dual: true },
  { v: 'WEIGHT', l: 'Peso', u: 'kg' },
  { v: 'GLUCOSE', l: 'Glicose', u: 'mg/dL' },
  { v: 'HEART_RATE', l: 'Frequência cardíaca', u: 'bpm' },
  { v: 'OTHER', l: 'Outro', u: '' },
];

export const MeasurementsPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState('WEIGHT');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false); // formulário colapsável (usuário não quer preencher nada por padrão)

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/measurements?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const add = async () => {
    if (!value || !date) return;
    const t = TYPES.find((x) => x.v === type)!;
    await fetch(`${API_URL}/measurements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, type, value: Number(value), valueSecondary: t.dual && value2 ? Number(value2) : null, unit: t.u, measuredAt: date }),
    });
    setValue(''); setValue2(''); load();
  };
  const del = async (id: string) => {
    await fetch(`${API_URL}/measurements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const fmtVal = (m: any) => m.valueSecondary != null ? `${m.value}/${m.valueSecondary}` : `${m.value}`;

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title="Medições" />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Nova medição</Typography>
            <Button size="small" onClick={() => setOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>{open ? 'Fechar' : 'Registrar'}</Button>
          </Stack>
          <Collapse in={open}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Tipo</InputLabel>
                <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => <MenuItem key={t.v} value={t.v}>{t.l}</MenuItem>)}
                </Select>
              </FormControl>
              {TYPES.find((t) => t.v === type)?.dual ? (
                <>
                  <TextField size="small" label="Sistólica" type="number" value={value} onChange={(e) => setValue(e.target.value)} sx={{ width: 110 }} />
                  <TextField size="small" label="Diastólica" type="number" value={value2} onChange={(e) => setValue2(e.target.value)} sx={{ width: 110 }} />
                </>
              ) : (
                <TextField size="small" label="Valor" type="number" value={value} onChange={(e) => setValue(e.target.value)} sx={{ width: 130 }} />
              )}
              <TextField size="small" type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <Button variant="contained" onClick={add} disabled={!value}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Histórico de medições</Typography>
          {items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma medição ainda. Registre seu peso, pressão, glicose...</Typography>
          ) : (
            <List>
              {items.map((m) => (
                <ListItem key={m.id} sx={{ px: 0, borderBottom: '1px solid #eee' }}
                  secondaryAction={<IconButton edge="end" onClick={() => del(m.id)}><DeleteIcon /></IconButton>}>
                  <ListItemText primary={`${TYPES.find((t) => t.v === m.type)?.l ?? m.type}: ${fmtVal(m)} ${m.unit}`}
                    secondary={`${fmtDate(m.measuredAt)}${m.note ? ` — ${m.note}` : ''}`} />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
