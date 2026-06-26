import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Avatar, Button, Menu, MenuItem, ListItemIcon, ListItemText, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, Divider, Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { API_URL, token, photoUrlFor } from '../config';
import { useSelectedPatient, setSelectedPatient } from '../patient-context';

const RELACOES = ['Titular', 'Cônjuge', 'Filho(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó/Avô', 'Outro'];

/** Seletor de paciente em "pill" premium (avatar + nome + seta) com menu dropdown. */
export const PatientSwitcher = () => {
  const navigate = useNavigate();
  const [pid, setSel] = useSelectedPatient();
  const [patients, setPatients] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Filho(a)');

  const photoFor = (p?: any) => (p?.photoUrl ? photoUrlFor(p.id) : undefined);

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) {
          setPatients(list);
          if (list.length && !pid) setSelectedPatient(list[0].id);
        }
      }
    } catch { /* offline/falha de rede — mantém lista vazia, não derruba o app */ }
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
      navigate('/'); // fica no app (router) — não recarrega pra janocaminho.com.br
    }
  };

  const current = patients.find((p) => p.id === pid);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        disableElevation
        sx={{
          borderRadius: 99, pl: 0.5, pr: 1, py: 0.3, color: 'inherit', textTransform: 'none',
          bgcolor: 'rgba(32,178,170,0.08)',
          '&:hover': { bgcolor: 'rgba(32,178,170,0.16)' },
          maxWidth: { xs: 190, sm: 280 },
        }}
        startIcon={
          <Avatar src={photoFor(current)} sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 15, border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.15)' }}>
            {current?.fullName?.charAt(0)?.toUpperCase()}
          </Avatar>
        }
        endIcon={<KeyboardArrowDownIcon sx={{ opacity: 0.6, display: { xs: 'none', sm: 'block' } }} />}
      >
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15, overflow: 'hidden' }}>
          <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current?.fullName ?? 'Selecionar'}
          </Typography>
          {current?.relationship && (
            <Typography component="span" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 10, color: 'text.secondary' }}>{current.relationship}</Typography>
          )}
        </Box>
      </Button>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { mt: 1, minWidth: 260, borderRadius: 2, boxShadow: '0 8px 28px rgba(0,0,0,0.14)' } } }}>
        {patients.map((p) => (
          <MenuItem key={p.id} sx={{ py: 1, borderRadius: 1, m: 0.5 }} onClick={() => { setSel(p.id); setAnchor(null); navigate('/'); }}>
            <Avatar src={photoFor(p)} sx={{ width: 36, height: 36, mr: 1.5, bgcolor: 'primary.main', fontSize: 14 }}>{p.fullName?.charAt(0)?.toUpperCase()}</Avatar>
            <ListItemText primary={p.fullName} secondary={p.relationship} primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} secondaryTypographyProps={{ fontSize: 11 }} />
            {p.id === pid && <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />}
          </MenuItem>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem sx={{ py: 1, borderRadius: 1, m: 0.5, color: 'primary.main' }} onClick={() => { setAnchor(null); setOpen(true); }}>
          <ListItemIcon sx={{ color: 'primary.main' }}><PersonAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}>Adicionar dependente</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
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
