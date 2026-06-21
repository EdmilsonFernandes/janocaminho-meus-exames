import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, CircularProgress, Stack, Chip, Avatar, IconButton, Alert, Divider, Switch, FormControlLabel, MenuItem } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { SPECIALTIES, CONVENIOS } from '../utils/medicalData';

const ALL_SCOPES = [
  { key: 'exams', label: 'Exames', icon: '📋' },
  { key: 'evolution', label: 'Evolução', icon: '📈' },
  { key: 'alerts', label: 'Alertas', icon: '🚨' },
  { key: 'summary', label: 'Resumos IA', icon: '🤖' },
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
                {ALL_SCOPES.map((s) => <Chip key={s.key} label={`${s.icon} ${s.label}`} onClick={() => toggleScope(s.key)} color={scopes.includes(s.key) ? 'primary' : 'default'} variant={scopes.includes(s.key) ? 'filled' : 'outlined'} size="small" />)}
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
          <Card key={s.id} sx={{ borderRadius: 4, overflow: 'hidden', position: 'relative', opacity: s.active ? 1 : 0.65, border: '1px solid #e2efec', boxShadow: s.active ? '0 4px 16px rgba(32,178,170,.08)' : 'none', transition: 'all .15s', '&:hover': { boxShadow: '0 8px 24px rgba(32,178,170,.12)' } }}>
            <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: s.active ? 'linear-gradient(180deg,#20b2aa,#178f89)' : '#cbd5e1' }} />
            <CardContent sx={{ pl: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1.75}>
                <Avatar src={s.doctor.id ? `${API_URL}/doctor/photo/${s.doctor.id}` : undefined} sx={{ width: 52, height: 52, fontWeight: 800, fontSize: 20, border: '2px solid #e0f2f1', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>{s.doctor.name?.charAt(0)?.toUpperCase()}</Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75} useFlexGap flexWrap="wrap">
                    <Typography sx={{ fontWeight: 800, color: '#0f3d3a', fontSize: 16 }}>{s.doctor.name}</Typography>
                    {s.doctor.specialty && <Chip size="small" label={s.doctor.specialty} sx={{ height: 20, fontSize: 10, bgcolor: '#e0f2f1', color: '#178f89', fontWeight: 700 }} />}
                    {!s.active && <Chip size="small" label="revogado" sx={{ height: 20, fontSize: 10, bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }} />}
                  </Stack>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25 }}>CRM {s.doctor.crm}{s.convenio ? ` • ${s.convenio}` : ''}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.4, display: 'block', mt: 1 }}>Compartilhando:</Typography>
                  <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {ALL_SCOPES.map((sc) => {
                      const on = s.scopes?.includes(sc.key);
                      return <Chip key={sc.key} size="small" label={`${sc.icon} ${sc.label}`} onClick={() => { const ns = on ? s.scopes.filter((x: string) => x !== sc.key) : [...(s.scopes || []), sc.key]; updateScopes(s.id, ns); }} sx={{ height: 24, fontSize: 11, fontWeight: 600, cursor: 'pointer', bgcolor: on ? '#178f89' : '#f1f5f9', color: on ? '#fff' : '#94a3b8', border: on ? '1px solid #178f89' : '1px solid #e2e8f0', '&:hover': { bgcolor: on ? '#0f7670' : '#e2e8f0' } }} />;
                    })}
                  </Box>
                </Box>
                {s.active && <IconButton color="error" onClick={() => revoke(s.id)} title="Revogar acesso" sx={{ bgcolor: '#fef2f2', '&:hover': { bgcolor: '#fee2e2' } }}><DeleteIcon /></IconButton>}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
};
