import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Stack, Typography, CircularProgress, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslate } from 'react-admin';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import { DateFieldBR } from './DateFieldBR';

const ETH = [
  { value: 'branca', label: 'Branca' },
  { value: 'preta', label: 'Preta' },
  { value: 'parda', label: 'Parda' },
  { value: 'amarela', label: 'Amarela' },
  { value: 'indigena', label: 'Indígena' },
];

const FLAG = 'profileCompleted';

/**
 * Modal progressivo (estilo BloodGPT): mostra UMA vez se o paciente ainda não tem
 * sexo/altura. Esses dados personalizam a leitura dos exames — hemoglobina gender-aware
 * (M1) e os índices derivados do M2 (IMC, eGFR, HOMA-IR). Dispensável: seta o flag p/ não
 * perturbar de novo. Auto-gerenciado — basta montar como irmão do <Onboarding /> no AppLayout.
 */
export const CompleteProfileModal = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gender, setGender] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [dob, setDob] = useState('');

  useEffect(() => {
    if (!pid) return;
    if (localStorage.getItem(FLAG) === '1') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/patients/${pid}`, { headers: apiHeaders() });
        if (!r.ok) return;
        const p = await r.json();
        if (cancelled) return;
        setGender(p.gender ?? '');
        setHeightCm(p.heightCm != null ? String(p.heightCm) : '');
        setEthnicity(p.ethnicity ?? '');
        setDob(p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '');
        // Mostra só se faltar algo relevante (sexo/altura). Etnia é opcional.
        if (!p.gender || p.heightCm == null) setOpen(true);
        else localStorage.setItem(FLAG, '1'); // já completo — não perturba
      } catch {
        // best-effort: se falhar (offline), simplesmente não mostra — não bloqueia o app.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pid]);

  const close = () => { localStorage.setItem(FLAG, '1'); setOpen(false); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/patients/${pid}`, {
        method: 'PUT',
        headers: apiHeaders(true),
        body: JSON.stringify({
          gender,
          heightCm: heightCm ? Number(heightCm) : null,
          ethnicity,
          dateOfBirth: dob || null,
        }),
      });
      if (r.ok) { localStorage.setItem(FLAG, '1'); setOpen(false); }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !open) return null;

  return (
    <Dialog open onClose={close} PaperProps={{ sx: { borderRadius: 4, maxWidth: 440, width: '100%' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <span>{translate('profile.complete.title')}</span>
        <IconButton size="small" onClick={close} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {translate('profile.complete.subtitle')}
        </Typography>
        <Stack spacing={2}>
          <TextField select label={translate('profile.complete.gender')} value={gender} onChange={(e) => setGender(e.target.value)} fullWidth size="small">
            <MenuItem value="male">Masculino</MenuItem>
            <MenuItem value="female">Feminino</MenuItem>
          </TextField>
          <TextField type="number" label={translate('profile.complete.height')} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} fullWidth size="small" />
          <TextField select label={translate('profile.complete.ethnicity')} value={ethnicity} onChange={(e) => setEthnicity(e.target.value)} fullWidth size="small">
            <MenuItem value="">{translate('profile.complete.ethnicityPreferNot')}</MenuItem>
            {ETH.map((e) => <MenuItem key={e.value} value={e.value}>{e.label}</MenuItem>)}
          </TextField>
          <DateFieldBR label={translate('profile.complete.dob')} value={dob} onChange={setDob} fullWidth size="small" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 2 }}>
        <Button onClick={close} variant="outlined">{translate('profile.complete.skip')}</Button>
        <Button onClick={save} variant="contained" disabled={saving}>
          {saving ? <CircularProgress size={20} /> : translate('profile.complete.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
