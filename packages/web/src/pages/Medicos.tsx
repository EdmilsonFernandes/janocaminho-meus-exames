import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, CircularProgress, Stack, Chip, Avatar, IconButton, Alert, Divider, Switch, FormControlLabel, MenuItem } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { SPECIALTIES, CONVENIOS } from '../utils/medicalData';

const ALL_SCOPES = [
  { key: 'exams', label: 'Exames' },
  { key: 'evolution', label: 'Evolucao' },
  { key: 'alerts', label: 'Alertas' },
  { key: 'summary', label: 'Resumos IA' },
];

export const MedicosPage = () => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(''); const [crm, setCrm] = useState(''); const [spec, setSpec] = useState(''); const [email, setEmail] = useState('');
  const [scopes, setScopes] = useState<string[]>(['exams']);
  const [convenio, setConvenio] = useState('Particular');
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`${API_URL}/doctor-shares`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => { setShares(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleScope = (k: string) => setScopes((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !crm) { notify('Nome e CRM do medico sao obrigatorios.', { type: 'error' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/doctor-shares`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doctorName: name, doctorCrm: crm, doctorSpecialty: spec, doctorEmail: email, scopes, convenio, patientId: pid }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      notify('Compartilhamento criado! O medico foi avisado por e-mail.', { type: 'success' });
      setShowForm(false); setName(''); setCrm(''); setSpec(''); setEmail(''); setScopes(['exams']); setConvenio('Particular');
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); } finally { setSaving(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revogar compartilhamento? O medico perdera acesso aos seus dados.')) return;
    await fetch(`${API_URL}/doctor-shares/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ active: false }) });
    notify('Acesso revogado.', { type: 'success' }); load();
  };

  const updateScopes = async (id: string, newScopes: string[]) => {
    await fetch(`${API_URL}/doctor-shares/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ scopes: newScopes }) });
    load();
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
      <Title title="Meus Medicos" />
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>🩺 Meus Médicos</Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setShowForm(!showForm)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>
          {showForm ? 'Cancelar' : 'Compartilhar'}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Controle quem ve seus dados de saude. Voce escolhe o que compartilhar e pode revogar a qualquer momento.</Typography>

      {showForm && (
        <Card sx={{ mb: 2, borderRadius: 4, border: '2px solid #20b2aa' }}><CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 800, color: '#178f89' }}>Compartilhar com um medico</Typography>
          <Box component="form" onSubmit={add} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField label="Nome do medico" required value={name} onChange={(e) => setName(e.target.value)} size="small" sx={{ flex: '1 1 200px' }} />
              <TextField label="CRM (ex: 12345-SP)" required value={crm} onChange={(e) => setCrm(e.target.value)} size="small" sx={{ width: 150 }} />
            </Stack>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField select label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} size="small" sx={{ flex: '1 1 200px' }}>
                <MenuItem value=""><em>Selecione…</em></MenuItem>
                {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} size="small" sx={{ flex: '1 1 200px' }} />
            </Stack>
            <TextField select label="Convênio" value={convenio} onChange={(e) => setConvenio(e.target.value)} size="small" sx={{ width: 220 }}>
              {CONVENIOS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>O que compartilhar:</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {ALL_SCOPES.map((s) => <Chip key={s.key} label={s.label} onClick={() => toggleScope(s.key)} color={scopes.includes(s.key) ? 'primary' : 'default'} variant={scopes.includes(s.key) ? 'filled' : 'outlined'} size="small" />)}
              </Stack>
            </Box>
            <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>
              {saving ? <CircularProgress size={20} /> : 'Compartilhar dados'}
            </Button>
          </Box>
        </CardContent></Card>
      )}

      {loading && <CircularProgress />}
      {!loading && shares.length === 0 && (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Voce nao compartilhou dados com nenhum medico ainda. Clique em "Compartilhar" pra comecar.</Typography></CardContent></Card>
      )}
      <Stack spacing={1.5}>
        {shares.map((s) => (
          <Card key={s.id} variant="outlined" sx={{ borderRadius: 3, opacity: s.active ? 1 : 0.6, borderLeft: s.active ? '4px solid #20b2aa' : '4px solid #ccc' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: s.doctor.specialty ? '#0b5cab' : '#757575' }}>{s.doctor.name?.charAt(0)}</Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800 }}>{s.doctor.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.doctor.specialty || 'Medico'} | CRM {s.doctor.crm}{s.convenio ? ` | ${s.convenio}` : ''}</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    {ALL_SCOPES.map((sc) => {
                      const on = s.scopes?.includes(sc.key);
                      return <Chip key={sc.key} size="small" label={sc.label} onClick={() => { const ns = on ? s.scopes.filter((x: string) => x !== sc.key) : [...(s.scopes || []), sc.key]; updateScopes(s.id, ns); }} sx={{ mr: 0.5, height: 20, fontSize: 10, bgcolor: on ? 'rgba(32,178,170,.14)' : 'transparent', color: on ? '#178f89' : '#aaa', border: on ? '1px solid rgba(32,178,170,.3)' : '1px solid #e0e0e0' }} />;
                    })}
                  </Box>
                </Box>
                {s.active ? <IconButton color="error" onClick={() => revoke(s.id)} title="Revogar acesso"><DeleteIcon /></IconButton> : <Chip size="small" label="revogado" color="default" />}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
};
