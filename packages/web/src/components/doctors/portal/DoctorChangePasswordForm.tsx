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
  <Card sx={{ borderRadius: '12px' }}><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
    <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
    <Typography color="text.secondary">{label}</Typography>
  </Box></CardContent></Card>
);

/** Trocar senha do médico. */
export const DoctorChangePasswordForm = ({ token, onBack }: { token: string; onBack: () => void }) => {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [cf, setCf] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const save = async () => {
    if (nw !== cf) { setMsg({ type: 'err', text: 'A nova senha e a confirmação não conferem.' }); return; }
    if (nw.length < 6) { setMsg({ type: 'err', text: 'Nova senha mín. 6 caracteres.' }); return; }
    setSaving(true); setMsg(null);
    try { const r = await fetch(`${API_URL}/doctor/me/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Falha'); setMsg({ type: 'ok', text: 'Senha alterada com sucesso!' }); setCur(''); setNw(''); setCf(''); }
    catch (e: any) { setMsg({ type: 'err', text: e.message }); } finally { setSaving(false); }
  };
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Button size="small" onClick={onBack} sx={{ color: 'primary.dark', textTransform: 'none', fontWeight: 700, minWidth: 0 }}>← Voltar</Button>
        <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>🔒 Trocar senha</Typography>
      </Stack>
      <Card sx={{ borderRadius: '12px' }}><CardContent>
        <Stack spacing={2}>
          <TextField type="password" label="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} size="small" fullWidth />
          <TextField type="password" label="Nova senha (mín. 6)" value={nw} onChange={(e) => setNw(e.target.value)} size="small" fullWidth />
          <TextField type="password" label="Confirmar nova senha" value={cf} onChange={(e) => setCf(e.target.value)} size="small" fullWidth />
          {msg && <Alert severity={msg.type === 'ok' ? 'success' : 'error'} sx={{ py: 0.5, borderRadius: '12px' }}>{msg.text}</Alert>}
          <Button variant="contained" color="primary" onClick={save} disabled={saving || !cur || !nw} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <LockIcon />} sx={{ alignSelf: 'flex-start', borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>{saving ? 'Alterando…' : 'Alterar senha'}</Button>
        </Stack>
      </CardContent></Card>
    </Box>
  );
};
