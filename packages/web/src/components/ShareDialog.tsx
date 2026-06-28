import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, IconButton, TextField, Stack, Alert, CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import LockIcon from '@mui/icons-material/Lock';
import { API_URL, token } from '../config';

/**
 * Gera e mostra um link seguro (12h) + PIN + QR p/ compartilhar com o médico.
 * QR é gerado CLIENT-SIDE (lib qrcode) — o link contém um token que dá acesso a dados de
 * saúde, então NÃO mandamos pra serviço externo de QR (vazaria o token). PIN segue separado.
 * Permite REVOGAR o acesso (limpa token+PIN → corte imediato).
 */
export const ShareDialog = ({ analysisId, open, onClose }: { analysisId?: string; open: boolean; onClose: () => void }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ link: string; pin: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!analysisId) return;
    setLoading(true); setError(''); setData(null); setQr(null); setRevoked(false);
    try {
      const r = await fetch(`${API_URL}/analyses/${analysisId}/share`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error('Falha ao gerar link');
      const d = await r.json();
      const SHARE_BASE = 'https://janocaminho.com.br/minhasaude';
      const link = `${SHARE_BASE}/api/public/shared/${d.token}`;
      setData({ link, pin: d.pin });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  // QR client-side (não vaza o token p/ terceiros).
  useEffect(() => {
    if (!data?.link) { setQr(null); return; }
    QRCode.toDataURL(data.link, { margin: 1, width: 240, color: { dark: '#0f3d3a', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(null));
  }, [data]);

  useEffect(() => { if (open) generate(); /* eslint-disable-next-line */ }, [open, analysisId]);

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  const revoke = async () => {
    if (!analysisId || revoked) return;
    if (!window.confirm('Revogar este link de acesso? O médico perde o acesso na mesma hora.')) return;
    setRevoking(true);
    try {
      const r = await fetch(`${API_URL}/analyses/${analysisId}/share`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { setRevoked(true); setData(null); setQr(null); }
      else setError('Falha ao revogar');
    } catch { setError('Falha de conexão ao revogar.'); }
    setRevoking(false);
  };

  const whats = data
    ? `https://wa.me/?text=${encodeURIComponent(`Olá! Compartilho meu resumo de saúde (Meus Exames):\n${data.link}\n\n🔑 Senha de acesso: ${data.pin}\n(Válido por 12 horas)`)}`
    : '';

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3, minWidth: { xs: 320, sm: 440 } } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        🔗 Compartilhar com o médico
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {loading && <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={26} /></Box>}
        {error && <Alert severity="error">{error}</Alert>}

        {revoked && (
          <Alert severity="info" sx={{ borderRadius: 2 }} icon={<LockIcon />}>Acesso revogado. O link e o QR não funcionam mais. Gere um novo se precisar.</Alert>
        )}

        {data && (
          <Box>
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>✅ Link seguro gerado! Válido por <b>12 horas</b>.</Alert>

            {/* QR — médico escaneia presencialmente (recepcionista, consulta) */}
            {qr && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
                <Box component="img" src={qr} alt="QR de acesso" sx={{ width: 168, height: 168, borderRadius: 3, p: 1, bgcolor: '#fff', border: '1px solid #e2e8f0' }} />
                <Typography variant="caption" sx={{ mt: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}><QrCode2Icon sx={{ fontSize: 14 }} /> Mostre este QR — o médico escaneia e digita a senha.</Typography>
              </Box>
            )}

            <Typography variant="subtitle2" sx={{ color: '#336886' }}>Link de acesso</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
              <TextField value={data.link} size="small" fullWidth InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-input': { fontSize: 11 } }} />
              <IconButton onClick={() => copy(data.link)} color="primary" title="Copiar link"><ContentCopyIcon /></IconButton>
            </Stack>
            <Typography variant="subtitle2" sx={{ color: '#336886' }}>🔑 Senha (envie ao médico separadamente do link)</Typography>
            <Typography sx={{ fontSize: 30, fontWeight: 800, letterSpacing: 8, color: '#2a93b8', textAlign: 'center', py: 1, my: 0.5, bgcolor: '#f0f8fc', borderRadius: 2, border: '1px dashed #2a93b8' }}>
              {data.pin}
            </Typography>
            <Typography variant="caption" color="text.secondary">Dica: mande o link por um canal e a senha por outro (mais seguro).</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {data && (
          <>
            <Button variant="contained" startIcon={<WhatsAppIcon sx={{ color: '#25D366' }} />} onClick={() => window.open(whats, '_blank')} sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' } }}>
              WhatsApp
            </Button>
            <Button disabled={revoking} startIcon={<LockIcon />} onClick={revoke} sx={{ color: '#b91c1c', textTransform: 'none', fontWeight: 700 }}>
              {revoking ? 'Revogando…' : 'Revogar acesso'}
            </Button>
          </>
        )}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};
