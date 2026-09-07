import { useState } from 'react';
import { Box, Stack, Typography, Button, Card, CardContent, TextField, MenuItem, Divider, Alert, CircularProgress, IconButton } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { API_URL, doctorPhotoUrl } from '../../../config';
import { PhotoUpload } from '../../PhotoUpload';
import { MfaSetupCard } from '../../mfa/MfaSetupCard';
import { SPECIALTIES } from '../../../utils/medicalData';

/** Empty state compacto das views do portal. */
export const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
    <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
    <Typography color="text.secondary">{label}</Typography>
  </Box></CardContent></Card>
);

/** Formulário "Meu perfil" do médico (dados profissionais + perfil público + foto + MFA). */
export const DoctorProfileForm = ({ token, doctor, onBack, onSaved, onPhoto, photoVer }: { token: string; doctor: any; onBack: () => void; onSaved: (d: any) => void; onPhoto: () => void; photoVer: number }) => {
  const [name, setName] = useState(doctor?.name ?? '');
  const [spec, setSpec] = useState(doctor?.specialty ?? '');
  const [email, setEmail] = useState(doctor?.email ?? '');
  // Perfil público (visto pelo paciente ao abrir o médico na lista dele)
  const [phone, setPhone] = useState(doctor?.phone ?? '');
  const [clinicName, setClinicName] = useState(doctor?.clinicName ?? '');
  const [clinicCity, setClinicCity] = useState(doctor?.clinicCity ?? '');
  const [bio, setBio] = useState(doctor?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/doctor/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, specialty: spec, email }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      // Perfil público (telefone/consultório/cidade/bio) — endpoint dedicado, visto pelo paciente.
      const r2 = await fetch(`${API_URL}/doctor/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phone, clinicName, clinicCity, bio }) });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || 'Falha ao salvar perfil público');
      onSaved(d2.doctor); setMsg({ type: 'ok', text: 'Perfil atualizado!' });
    } catch (e: any) { setMsg({ type: 'err', text: e.message }); } finally { setSaving(false); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Button size="small" onClick={onBack} sx={{ color: 'primary.dark', textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>Meu perfil</Typography>
      </Stack>

      <Card sx={{ borderRadius: '20px', mb: 2.5, background: 'radial-gradient(circle at 10% 20%, rgba(32,178,170,0.12) 0%, rgba(32,178,170,0.03) 100%)', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={2.5} alignItems="center">
            <PhotoUpload endpoint={`${API_URL}/doctor/me/photo`} authToken={token} fallback={doctor?.name?.charAt(0)} src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined} onUploaded={onPhoto} size={84} hideLabel />
            <Box>
              <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '1.1rem' }}>{name || 'Médico'}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mt: 0.25 }}>CRM {doctor?.crm}{spec ? ` • ${spec}` : ''}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>Toque na câmera pra trocar a foto.</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ mt: 2 }}>
        <MfaSetupCard apiBase={`${API_URL}/doctor`} authToken={token} />
      </Box>

      <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', mt: 2 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 800, color: 'primary.dark', letterSpacing: '0.03em' }}>DADOS PROFISSIONAIS</Typography>
          <Stack spacing={2}>
            <TextField label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <TextField label="CPF" value={doctor?.cpfMasked ?? 'Não cadastrado'} disabled size="small" fullWidth helperText="CPF fica bloqueado após verificação. Correção somente via suporte auditado." sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <TextField label="CRM" value={doctor?.crm ?? ''} disabled size="small" fullWidth helperText="O CRM não pode ser alterado (identidade profissional)." sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <TextField select label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}>
              <MenuItem value=""><em>Selecione…</em></MenuItem>
              {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <Divider sx={{ my: 0.5 }}><Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>PERFIL PÚBLICO (visto pelo paciente)</Typography></Divider>
            <TextField label="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} size="small" fullWidth helperText="Vira o botão 'Agendar no WhatsApp' para o paciente." inputProps={{ inputMode: 'tel' }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <TextField label="Consultório / Clínica" value={clinicName} onChange={(e) => setClinicName(e.target.value)} size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <TextField label="Cidade - UF" value={clinicCity} onChange={(e) => setClinicCity(e.target.value)} size="small" fullWidth placeholder="Ex.: São Paulo - SP" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
            <TextField label="Apresentação / referências" value={bio} onChange={(e) => setBio(e.target.value)} size="small" fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
          </Stack>
          {msg && <Alert severity={msg.type === 'ok' ? 'success' : 'error'} sx={{ mt: 2, py: 0.5, borderRadius: '14px' }}>{msg.text}</Alert>}
          <Button variant="contained" color="primary" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined} sx={{ mt: 2.5, borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3, py: 1, boxShadow: 'none' }}>{saving ? 'Salvando…' : 'Salvar perfil'}</Button>
        </CardContent>
      </Card>
    </Box>
  );
};
