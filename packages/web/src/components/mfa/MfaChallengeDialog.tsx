import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Stack, Typography, TextField, Button, CircularProgress } from '@mui/material';

/** Dialog do desafio MFA no login (6 dígitos TOTP). Auto-verifica no 6º dígito.
 *  verifyUrl = '/api/auth/mfa/verify' (paciente) ou '/api/doctor/mfa/verify' (médico). */
export const MfaChallengeDialog = ({ open, challengeToken, account, verifyUrl, onSuccess, onClose }: {
  open: boolean; challengeToken: string; account?: string; verifyUrl: string;
  onSuccess: (data: any) => void; onClose: () => void;
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);

  const verify = async (c?: string) => {
    const val = (c ?? code).replace(/\D/g, '');
    if (val.length !== 6) return;
    setLoading(true); setErr('');
    try {
      const r = await fetch(verifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: val }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Código inválido');
      onSuccess(d); setCode('');
    } catch (e: any) { setErr(e.message); setCode(''); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: 3, maxWidth: 380 } }}>
      <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>🔐 Verificação em 2 etapas</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2, color: 'text.secondary', fontSize: 14 }}>
          Digite o código de 6 dígitos do seu app autenticador{account ? ` (${account})` : ''}.
        </Typography>
        <TextField autoFocus fullWidth value={code}
          onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6 && !loading) void verify(c); }}
          placeholder="000000" inputMode="numeric"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 }, '& input': { textAlign: 'center', fontSize: 28, letterSpacing: 8, fontWeight: 800, fontFamily: 'monospace', py: 1.5 } }}
          error={!!err} helperText={err || ' '}
        />
        <Button fullWidth variant="contained" onClick={() => verify()} disabled={loading || code.length !== 6}
          sx={{ mt: 1, borderRadius: 2, textTransform: 'none', fontWeight: 800, py: 1.3 }}>
          {loading ? <CircularProgress size={22} color="inherit" /> : 'Verificar'}
        </Button>
        {/* Recuperação de MFA — usuário perdeu o dispositivo */}
        {!showRecovery ? (
          <Button fullWidth size="small" onClick={() => setShowRecovery(true)} sx={{ mt: 1.5, textTransform: 'none', color: 'text.secondary', fontSize: 12 }}>
            Perdeu seu dispositivo MFA?
          </Button>
        ) : (
          <Stack spacing={1} sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
              📸 Envie uma <b>foto segurando seu documento</b> (RG ou CPF) para:
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'primary.main' }}>
              📧 contato@janocaminho.com.br
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              Após verificação, desativamos seu MFA. Você volta a logar com senha e reconfigura.
            </Typography>
            <Button size="small" onClick={() => setShowRecovery(false)} sx={{ textTransform: 'none', fontSize: 12 }}>Voltar</Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};
