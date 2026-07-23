import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogout, useLocale, useSetLocale, useStore } from 'react-admin';
import {
  Box, Avatar, Button, Menu, MenuItem, ListItemIcon, ListItemText, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, Divider, Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import LogoutIcon from '@mui/icons-material/Logout';
import { API_URL, token, photoUrlFor } from '../config';
import { useSelectedPatient, setSelectedPatient } from '../patient-context';

const RELACOES = ['Titular', 'Cônjuge', 'Filho(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó/Avô', 'Outro'];

/** Avatar = MENU ÚNICO do AppBar: trocar dependente + tema + idioma + sair. Pill "frosted"
 *  premium que lê bem sobre o AppBar teal (antes era teal-sobre-teal, sumia). */
export const PatientSwitcher = () => {
  const navigate = useNavigate();
  const logout = useLogout();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [themeMode, setThemeMode] = useStore<'light' | 'dark'>('theme', 'light');
  const [pid, setSel] = useSelectedPatient();
  const [patients, setPatients] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Filho(a)');
  const close = () => setAnchor(null);
  const toggleLang = () => { const l = locale === 'pt' ? 'en' : 'pt'; setLocale(l); try { localStorage.setItem('lang', l); } catch {} close(); };
  const toggleTheme = () => { setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); close(); };

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
          borderRadius: 99, pl: 0.5, pr: { xs: 0.5, sm: 1 }, py: 0.25, color: 'inherit', textTransform: 'none',
          // Sem pill 'frosted' (lavava a foto). Avatar GRANDE c/ anel nítido + sombra = a foto
          // salta visível (antes era pequena/difícil de ver = sem credibilidade).
          bgcolor: 'transparent',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
          maxWidth: { sm: 280 },
          // No mobile (só o avatar, nome oculto) remove o gap do startIcon.
          '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.5 } },
        }}
        startIcon={
          <Avatar src={photoFor(current)} sx={{ width: 44, height: 44, bgcolor: 'primary.main', fontSize: 16, fontWeight: 700, boxShadow: '0 0 0 2px rgba(255,255,255,.95), 0 3px 8px rgba(0,0,0,.28)' }}>
            {current?.fullName?.charAt(0)?.toUpperCase()}
          </Avatar>
        }
        endIcon={<KeyboardArrowDownIcon sx={{ opacity: 0.6 }} />}
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
        <Divider sx={{ my: 0.5 }} />
        {/* Configurações da conta (antes num menu ⋮ separado — agora unified no avatar). */}
        <MenuItem sx={{ py: 1, borderRadius: 1, m: 0.5 }} onClick={toggleTheme}>
          <ListItemIcon>{themeMode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}</ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{themeMode === 'dark' ? 'Modo claro' : 'Modo escuro'}</ListItemText>
        </MenuItem>
        <MenuItem sx={{ py: 1, borderRadius: 1, m: 0.5 }} onClick={toggleLang}>
          <ListItemIcon><LanguageIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{locale === 'pt' ? 'Mudar para English' : 'Switch to Português'}</ListItemText>
        </MenuItem>
        <MenuItem sx={{ py: 1, borderRadius: 1, m: 0.5, color: 'error.main' }} onClick={() => { setAnchor(null); logout('/entrar'); }}>
          <ListItemIcon sx={{ color: 'error.main' }}><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}>Sair</ListItemText>
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
