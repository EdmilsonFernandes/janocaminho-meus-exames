import { useEffect, useState } from 'react';
import { Box, Avatar, Select, MenuItem, FormControl, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, InputLabel, Typography } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { API_URL, token } from '../config';
import { useSelectedPatient, setSelectedPatient } from '../patient-context';

const RELACOES = ['Titular', 'Cônjuge', 'Filho(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó/Avô', 'Outro'];

export const PatientSwitcher = () => {
  const [pid, setSel] = useSelectedPatient();
  const [patients, setPatients] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Filho(a)');

  const load = async () => {
    const r = await fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) {
      const list = await r.json();
      setPatients(list);
      if (list.length && !pid) setSelectedPatient(list[0].id);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const add = async () => {
    if (!name.trim()) return;
    const r = await fetch(`${API_URL}/patients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ fullName: name.trim(), relationship: rel }),
    });
    if (r.ok) {
      const p = await r.json();
      setOpen(false); setName(''); setRel('Filho(a)');
      await load();
      setSel(p.id);
      window.location.href = '/';
    }
  };

  return (
    <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e2e8f0', mb: 1 }}>
      <FormControl fullWidth size="small">
        <InputLabel sx={{ fontSize: 13 }}>Paciente</InputLabel>
        <Select
          value={pid ?? ''}
          label="Paciente"
          onChange={(e) => { setSel(e.target.value as string); window.location.href = '/'; }}
          sx={{ fontSize: 13 }}
        >
          {patients.map((p) => (
            <MenuItem key={p.id} value={p.id} sx={{ py: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar src={p.photoUrl ? `${API_URL.replace('/api', '')}${p.photoUrl}?t=${Date.now()}` : undefined} sx={{ width: 28, height: 28, fontSize: 12, bgcolor: '#336886' }}>
                  {p.fullName?.charAt(0)?.toUpperCase()}
                </Avatar>
                <Typography component="span" sx={{ fontSize: 13 }}>{p.fullName}</Typography>
                {p.relationship && <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary' }}>({p.relationship})</Typography>}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <IconButton size="small" title="Adicionar dependente" onClick={() => setOpen(true)} sx={{ mt: 0.5 }}>
        <PersonAddIcon fontSize="small" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Adicionar dependente</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nome" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <FormControl fullWidth size="small">
            <InputLabel>Parentesco</InputLabel>
            <Select label="Parentesco" value={rel} onChange={(e) => setRel(e.target.value)}>
              {RELACOES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={add} disabled={!name.trim()}>Adicionar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
