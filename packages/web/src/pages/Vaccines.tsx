import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, TextField, List, ListItem, ListItemText, IconButton, Stack, Chip, Box, Collapse } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { confirmDialog } from '../components/ConfirmDialog';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
  const [formOpen, setFormOpen] = useState(false); // colapsado: a CARTEIRA é a protagonista

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
  // Carteira de vacinação: exclusão confirmada (dado de saúde — sem delete de 1 toque).
  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir vacina', message: 'Apagar este registro da carteira de vacinação?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/vaccines/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const overdue = (d: string) => new Date(d) < new Date();

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<VaccinesIcon />} title="Carteira de Vacinação" />
      {/* CARTEIRA primeiro (consulta > cadastro — audit: form-first dava cara de planilha). */}
      <Card sx={{ mb: 2, borderRadius: '20px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }} gutterBottom>Histórico de vacinas</Typography>
          {items.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ fontSize: 40, mb: 1, opacity: 0.5 }}>💉</Box>
              <Typography color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>Sua carteira de vacinas fica aqui — útil na consulta e na viagem.</Typography>
              <Button size="small" variant="outlined" onClick={() => setFormOpen(true)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Registrar primeira vacina</Button>
            </Box>
          ) : (
            <List>
              {items.map((v) => (
                <ListItem key={v.id} sx={{ px: 0, borderBottom: '1px solid', borderColor: 'divider' }}
                  secondaryAction={<IconButton edge="end" aria-label={`Excluir vacina ${v.name}`} onClick={() => del(v.id)}><DeleteIcon /></IconButton>}>
                  {/* secondary vira <div> (não <p>): Chip (div) dentro de <p> = DOM inválido (console). */}
                  <ListItemText
                    slotProps={{ secondary: { component: 'div' } }}
                    primary={<span style={{ fontWeight: 700 }}><VaccinesIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5, color: '#178f89' }} />{v.name}</span>}
                    secondary={<span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>Aplicada: {fmt(v.dateApplied)}{v.lot ? ` • Lote: ${v.lot}` : ''}
                      {v.nextDoseDate && <Chip size="small" sx={{ ml: 0.5, fontWeight: 800 }} color={overdue(v.nextDoseDate) ? 'error' : 'warning'} label={`Próxima: ${fmt(v.nextDoseDate)}${overdue(v.nextDoseDate) ? ' (vencida)' : ''}`} />}</span>}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* REGISTRAR — colapsado, embaixo (ferramenta, não protagonista) */}
      <Card sx={{ borderRadius: '20px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Registrar vacina</Typography>
            <Button size="small" onClick={() => setFormOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>{formOpen ? 'Fechar' : 'Registrar'}</Button>
          </Stack>
          <Collapse in={formOpen}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField size="small" label="Vacina" placeholder="Influenza, COVID-19..." value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
              <TextField size="small" type="date" label="Aplicada em" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
              <TextField size="small" type="date" label="Próxima dose" value={nextDate} onChange={(e) => setNextDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
              <TextField size="small" label="Lote" value={lot} onChange={(e) => setLot(e.target.value)} sx={{ width: { xs: '100%', sm: 100 } }} />
              <Button variant="contained" onClick={add} disabled={!name.trim()} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>
    </PageContainer>
  );
};
