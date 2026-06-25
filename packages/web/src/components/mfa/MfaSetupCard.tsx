import { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Button, Stack, TextField, CircularProgress, Alert, Box, Chip } from '@mui/material';

/** Card de configuração MFA (TOTP 2FA) — reutilizável pra paciente e médico.
 *  apiBase = '/api/auth' (paciente) ou '/api/doctor' (médico). authToken = JWT. */
export const MfaSetupCard = ({ apiBase, authToken }: { apiBase: string; authToken: string }) => {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'overview' | 'setup' | 'disable'>('overview');
  const [setup, setSetup] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` };

  const load = async () => { try { const r = await fetch(`${apiBase}/mfa/status`, { headers: h }); if (r.ok) setEnabled((await r.json()).enabled); } catch {} };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const start = async () => { setLoading(true); setErr(''); try { const r = await fetch(`${apiBase}/mfa/setup/start`, { method: 'POST', headers: h }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setSetup(d); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  const confirm = async () => { setLoading(true); setErr(''); try { const r = await fetch(`${apiBase}/mfa/setup/confirm`, { method: 'POST', headers: h, body: JSON.stringify({ code }) }); if (!r.ok) throw new Error((await r.json()).error); setCode(''); setMode('overview'); void load(); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  const disable = async () => { setLoading(true); setErr(''); try { const r = await fetch(`${apiBase}/mfa/disable`, { method: 'POST', headers: h, body: JSON.stringify({ code }) }); if (!r.ok) throw new Error((await r.json()).error); setCode(''); setMode('overview'); void load(); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };

  return (
    <Card sx={{ borderRadius: 3 }}><CardContent>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>🔐 Segurança (2FA)</Typography>
        {enabled && <Chip size="small" color="success" label="ATIVADO" sx={{ fontWeight: 700 }} />}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 13.5 }}>
        Autenticação em 2 fatores (TOTP). Depois de ativar, todo login pede um código do app autenticador (Google Authenticator, Authy, 1Password).
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 1.5, py: 0.5, borderRadius: 2 }}>{err}</Alert>}
      {mode === 'overview' && (
        <Button variant={enabled ? 'outlined' : 'contained'} color={enabled ? 'error' : 'primary'}
          onClick={() => { setCode(''); setErr(''); if (enabled) setMode('disable'); else { setMode('setup'); void start(); } }}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>
          {enabled ? 'Desativar 2FA' : 'Ativar 2FA'}
        </Button>
      )}
      {mode === 'setup' && (
        <Stack spacing={1.5}>
          {!setup ? <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={28} sx={{ color: '#20b2aa' }} /></Box> : (<>
            <Box sx={{ textAlign: 'center' }}><Box component="img" src={setup.qrCodeDataUrl} alt="QR Code" sx={{ width: 200, height: 200, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} /></Box>
            <Typography variant="caption" color="text.secondary">Ou digite manualmente: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', userSelect: 'all', color: '#178f89' }} onClick={() => { try { navigator.clipboard?.writeText(setup.secret); } catch {} }}>{setup.secret}</Box></Typography>
            <TextField label="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" sx={{ '& input': { textAlign: 'center', fontSize: 22, letterSpacing: 6, fontFamily: 'monospace' } }} />
            <Button variant="contained" onClick={confirm} disabled={loading || code.length !== 6} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Confirmar e ativar'}</Button>
          </>)}
        </Stack>
      )}
      {mode === 'disable' && (
        <Stack spacing={1.5}>
          <Typography variant="body2" sx={{ fontSize: 13.5 }}>Digite o código atual do seu app autenticador pra desativar:</Typography>
          <TextField label="Código" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" sx={{ '& input': { textAlign: 'center', fontSize: 22, letterSpacing: 6, fontFamily: 'monospace' } }} />
          <Button variant="outlined" color="error" onClick={disable} disabled={loading || code.length !== 6} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}>{loading ? <CircularProgress size={22} color="inherit" /> : 'Desativar'}</Button>
        </Stack>
      )}
    </CardContent></Card>
  );
};
