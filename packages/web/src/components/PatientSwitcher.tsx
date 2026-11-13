import { useEffect, useState } from 'react';
import { UserTrigger, useOnline } from '@/components/reui/app-header';
import { useNavigate } from 'react-router-dom';
import { useLogout, useLocale, useSetLocale, useStore, useNotify } from 'react-admin';
import {
  Box, Avatar, Button, Menu, MenuItem, ListItemIcon, ListItemText, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, Divider, Typography,
  Alert, CircularProgress,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonIcon from '@mui/icons-material/Person';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import LogoutIcon from '@mui/icons-material/Logout';
import { API_URL, token, photoUrlFor } from '../config';
import { useSelectedPatient, setSelectedPatient } from '../patient-context';
import { formatCpf, isValidCpf, normalizeCpf } from '../utils/cpf';

// 28/09 (bug bash do dono): faltava Neto(a)/Neta — cobertura familiar completa.
const RELACOES = ['Titular', 'Cônjuge', 'Filho(a)', 'Neto(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó/Avô', 'Sobrinho(a)', 'Outro'];

/** Avatar = MENU ÚNICO do AppBar: trocar dependente + tema + idioma + sair. Pill "frosted"
 *  premium que lê bem sobre o AppBar teal (antes era teal-sobre-teal, sumia). */
export const PatientSwitcher = () => {
  const navigate = useNavigate();
  const logout = useLogout();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const notify = useNotify();
  const [themeMode, setThemeMode] = useStore<'light' | 'dark'>('theme', 'light');
  const [pid, setSel] = useSelectedPatient();
  const [patients, setPatients] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Filho(a)');
  const [cpf, setCpf] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const close = () => setAnchor(null);
  const toggleLang = () => { const l = locale === 'pt' ? 'en' : 'pt'; setLocale(l); try { localStorage.setItem('lang', l); } catch {} close(); };
  const toggleTheme = () => { setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); close(); };

  const photoFor = (p?: any) => (p?.photoUrl ? photoUrlFor(p.id) : undefined);

  const load = async () => {
    try {
      // Anônimo na landing: não busca (boot anônimo disparava /patients sem sessão — 401)
      if (!token()) return;
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

  // 'patients-changed': criação/edição/exclusão de dependente em QUALQUER tela (ex.:
  // /patients/create) avisa o switcher do AppBar pra recarregar a lista na hora.
  // Antes o componente ficava stale (montado no AppBar, persiste entre rotas) e o
  // dependente novo só aparecia depois de navegar pra fora e voltar.
  useEffect(() => {
    const h = () => load();
    window.addEventListener('patients-changed', h);
    return () => window.removeEventListener('patients-changed', h);
    /* eslint-disable-next-line */
  }, []);

  const add = async () => {
    if (!name.trim() || !isValidCpf(cpf)) return;
    setAdding(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/patients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ fullName: name.trim(), relationship: rel, cpf: normalizeCpf(cpf) }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({} as any));
        throw new Error(e.error || e.message || `Falha ao salvar (HTTP ${r.status})`);
      }
      const p = await r.json();
      setOpen(false); setName(''); setRel('Filho(a)'); setCpf('');
      window.dispatchEvent(new Event('patients-changed')); // lista do avatar atualiza na hora
      setSel(p.id);
      navigate('/'); // fica no app (router) — não recarrega pra janocaminho.com.br
    } catch (e: any) {
      // Bug do dono: POST sem CPF → 400 silencioso (if (r.ok) sem else) — parecia "não funciona".
      // Agora todo erro aparece (inline + toast) e vai pro console.
      console.error('[PatientSwitcher] falha ao adicionar dependente:', e);
      setErr(e?.message || 'Não foi possível adicionar. Tente novamente.');
      notify('Não foi possível adicionar o dependente.', { type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const current = patients.find((p) => p.id === pid);
  const online = useOnline();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <UserTrigger
        name={current?.fullName}
        detail={current?.relationship}
        photo={photoFor(current)}
        online={online}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
      />

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { mt: 1, minWidth: 260, borderRadius: '12px', boxShadow: '0 8px 28px rgba(0,0,0,0.14)' } } }}>
        {patients.map((p) => (
          <MenuItem key={p.id} sx={{ py: 1, borderRadius: '8px', m: 0.5 }} onClick={() => { setSel(p.id); setAnchor(null); navigate('/'); }}>
            <Avatar src={photoFor(p)} sx={{ width: 36, height: 36, mr: 1.5, bgcolor: 'primary.main', fontSize: 14 }}>{p.fullName?.charAt(0)?.toUpperCase()}</Avatar>
            <ListItemText primary={p.fullName} secondary={p.relationship} primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} secondaryTypographyProps={{ fontSize: 12 }} />
            {p.id === pid && <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />}
          </MenuItem>
        ))}
        <Divider sx={{ my: 0.5 }} />
        {/* Delay ao abrir o dialog: fechar o Menu (overlay/backdrop) e montar o Dialog no
            MESMO tick briga no mobile/APK — o dialog abre atrás do backdrop que ainda está
            saindo. 100ms deixa o menu terminar de fechar antes. */}
        <MenuItem sx={{ py: 1, borderRadius: '8px', m: 0.5, color: 'primary.main' }} onClick={() => { setAnchor(null); setTimeout(() => setOpen(true), 100); }}>
          <ListItemIcon sx={{ color: 'primary.main' }}><PersonAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}>Adicionar dependente</ListItemText>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        {/* Configurações da conta (antes num menu ⋮ separado — agora unified no avatar). */}
        <MenuItem sx={{ py: 1, borderRadius: '8px', m: 0.5 }} onClick={toggleTheme}>
          <ListItemIcon>{themeMode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}</ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{themeMode === 'dark' ? 'Modo claro' : 'Modo escuro'}</ListItemText>
        </MenuItem>
        <MenuItem sx={{ py: 1, borderRadius: '8px', m: 0.5 }} onClick={toggleLang}>
          <ListItemIcon><LanguageIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{locale === 'pt' ? 'Mudar para English' : 'Switch to Português'}</ListItemText>
        </MenuItem>
        <MenuItem sx={{ py: 1, borderRadius: '8px', m: 0.5, color: 'error.main' }} onClick={() => { setAnchor(null); logout('/entrar'); }}>
          <ListItemIcon sx={{ color: 'error.main' }}><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}>Sair</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={open} onClose={() => { setOpen(false); setErr(''); }} PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle>Adicionar dependente</DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" onClose={() => setErr('')} sx={{ mb: 1.5, borderRadius: '10px' }}>{err}</Alert>}
          <TextField autoFocus fullWidth label="Nome" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          {/* CPF OBRIGATÓRIO: o server faz dedup por cpfHash e REJEITA (400 "CPF inválido.")
              o POST /patients sem CPF — era exatamente o bug do "adicionar não funciona". */}
          <TextField
            fullWidth label="CPF do dependente" value={cpf} inputProps={{ inputMode: 'numeric' }}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            error={!!cpf && !isValidCpf(cpf)}
            helperText={cpf && !isValidCpf(cpf) ? 'CPF inválido.' : 'Obrigatório — confirma a titularidade dos exames.'}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Parentesco</InputLabel>
            <Select label="Parentesco" value={rel} onChange={(e) => setRel(e.target.value)}>
              {RELACOES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setErr(''); }}>Cancelar</Button>
          <Button variant="contained" onClick={add} disabled={!name.trim() || !isValidCpf(cpf) || adding}>
            {adding ? <CircularProgress size={20} color="inherit" /> : 'Adicionar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
