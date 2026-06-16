import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Avatar, Select, MenuItem, FormControl, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, InputLabel, Typography } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { API_URL, token } from '../config';
import { useSelectedPatient, setSelectedPatient } from '../patient-context';

const RELACOES = ['Titular', 'Cônjuge', 'Filho(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó/Avô', 'Outro'];

export const PatientSwitcher = () => {
  const [pid, setSel] = useSelectedPatient();
  const navigate = useNavigate();
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

  const current = patients.find((p) => p.id === pid);

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {current && (
          <Avatar
            src={current.photoUrl ? `${API_URL.replace('/api', '')}${current.photoUrl}` : undefined}
            sx={{ width: 36, height: 36, bgcolor: '#336886', fontSize: 14, flexShrink: 0 }}
          >
            {current.fullName?.charAt(0)?.toUpperCase()}
          </Avatar>
        )}
        <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
          <Select
            value={pid ?? ''}
            onChange={(e) => { setSel(e.target.value as string); window.location.href = '/'; }}
            displayEmpty
            sx={{ fontSize: 13 }}
          >
            {patients.map((p) => (
              <MenuItem key={p.id} value={p.id} sx={{ py: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    src={p.photoUrl ? `${API_URL.replace('/api', '')}${p.photoUrl}?t=${Date.now()}` : undefined}
                    sx={{ width: 24, height: 24, fontSize: 11, bgcolor: '#336886' }}
                  >
                    {p.fullName?.charAt(0)?.toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography component="span" sx={{ fontSize: 13 }}>{p.fullName}</Typography>
                    {p.relationship && <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', ml: 0.5 }}>({p.relationship})</Typography>}
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <IconButton size="small" title="Adicionar dependente" onClick={() => setOpen(true)} sx={{ flexShrink: 0 }}>
          <PersonAddIcon fontSize="small" />
        </IconButton>
      </Box>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Adicionar dependente</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nome" placeholder="Nome da pessoa" value={name}
            onChange={(e) => setName(e.target.value)} sx={{ mt: 1, mb: 2 }} />
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
