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
import { confirmDialog } from './ConfirmDialog';

/**
 * Gera e mostra um link seguro (12h) + PIN + QR p/ compartilhar com o médico.
 * QR é gerado CLIENT-SIDE (lib qrcode) — o link contém um token que dá acesso a dados de
 * saúde, então NÃO mandamos pra serviço externo de QR (vazaria o token). PIN segue separado.
 * Permite REVOGAR o acesso (limpa token+PIN → corte imediato).
 */
export const ShareDialog = ({ analysisId, patientId, open, onClose }: { analysisId?: string; patientId?: string; open: boolean; onClose: () => void }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [shareMode, setShareMode] = useState<'magic' | 'pin'>('magic');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ link: string; pin: string } | null>(null);
  const [magicData, setMagicData] = useState<{ token: string; inviteUrl: string; message: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState('');

  const generatePinShare = async () => {
    if (!analysisId) return;
    setLoading(true); setError(''); setData(null); setQr(null); setRevoked(false);
    try {
      const r = await fetch(`${API_URL}/analyses/${analysisId}/share`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error('Falha ao gerar link');
      const d = await r.json();
      const SHARE_BASE = 'https://drexame.janocaminho.com.br';
      const link = `${SHARE_BASE}/api/public/shared/${d.token}`;
      setData({ link, pin: d.pin });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const generateMagicInvite = async () => {
    setLoading(true); setError(''); setMagicData(null);
    try {
      const r = await fetch(`${API_URL}/doctor-shares/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId }),
      });
      if (!r.ok) throw new Error('Falha ao gerar convite mágico');
      const d = await r.json();
      setMagicData(d);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      if (shareMode === 'magic') void generateMagicInvite();
      else void generatePinShare();
    }
  }, [open, shareMode, analysisId, patientId]);

  // QR client-side (não vaza o token p/ terceiros).
  useEffect(() => {
    if (!data?.link) { setQr(null); return; }
    QRCode.toDataURL(data.link, { margin: 1, width: 240, color: { dark: '#0f5f5a', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(null));
  }, [data]);

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  const revoke = async () => {
    if (!analysisId || revoked) return;
    if (!(await confirmDialog({ title: 'Revogar link', message: 'O médico perde o acesso na mesma hora.', confirmLabel: 'Revogar' }))) return;
    setRevoking(true);
    try {
      const r = await fetch(`${API_URL}/analyses/${analysisId}/share`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { setRevoked(true); setData(null); setQr(null); }
      else setError('Falha ao revogar');
    } catch { setError('Falha de conexão ao revogar.'); }
    setRevoking(false);
  };

  const whatsPin = data
    ? `https://wa.me/?text=${encodeURIComponent(`Olá, Doutor(a)! 👋\n\nOrganizei todo o meu histórico de exames laboratoriais na plataforma Dr. Exame com linha do tempo e inteligência clínica para facilitar nossa consulta.\n\n🔗 Acesse meu resumo seguro aqui:\n${data.link}\n\n🔑 Senha de acesso (PIN): ${data.pin}\n(Link criptografado válido por 12 horas)\n\n👨‍⚕️ Médico: você também pode acompanhar meus próximos exames gratuitamente criando sua conta no Portal do Médico Dr. Exame (drexame.janocaminho.com.br/doctor).`)}`
    : '';

  const whatsMagic = magicData
    ? `https://wa.me/?text=${encodeURIComponent(magicData.message)}`
    : '';

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3, minWidth: { xs: 320, sm: 480 } } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
          <span>📲</span> Compartilhar com o Médico
        </Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Seletor de Modo */}
        <Stack direction="row" spacing={1} sx={{ mb: 2.5, p: 0.5, bgcolor: 'action.hover', borderRadius: '12px' }}>
          <Button
            fullWidth
            size="small"
            onClick={() => setShareMode('magic')}
            sx={{
              borderRadius: '8px',
              py: 0.75,
              fontSize: 12.5,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: shareMode === 'magic' ? 'background.paper' : 'transparent',
              color: shareMode === 'magic' ? '#0f766e' : 'text.secondary',
              boxShadow: shareMode === 'magic' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              '&:hover': { bgcolor: shareMode === 'magic' ? 'background.paper' : 'transparent' },
            }}
          >
            🚀 WhatsApp (Sem CRM)
          </Button>
          <Button
            fullWidth
            size="small"
            onClick={() => setShareMode('pin')}
            sx={{
              borderRadius: '8px',
              py: 0.75,
              fontSize: 12.5,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: shareMode === 'pin' ? 'background.paper' : 'transparent',
              color: shareMode === 'pin' ? '#0f766e' : 'text.secondary',
              boxShadow: shareMode === 'pin' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              '&:hover': { bgcolor: shareMode === 'pin' ? 'background.paper' : 'transparent' },
            }}
          >
            🔑 Laudo com PIN (12h)
          </Button>
        </Stack>

        {loading && <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={28} sx={{ color: '#0f766e' }} /></Box>}
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }}>{error}</Alert>}

        {/* MODO 1: CONVITE VIRAL WHATSAPP (SEM CRM) */}
        {shareMode === 'magic' && magicData && !loading && (
          <Box>
            <Alert severity="success" sx={{ mb: 2, borderRadius: '12px', fontSize: 13 }}>
              ✨ <b>Zero fricção:</b> Você não precisa saber o CRM do médico! Ele clica no link, preenche os dados profissionais e já se conecta direto ao seu prontuário.
            </Alert>

            <Typography variant="subtitle2" sx={{ color: '#0f766e', fontWeight: 800, mb: 0.5 }}>Link exclusivo do seu prontuário</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
              <TextField value={magicData.inviteUrl} size="small" fullWidth InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
              <IconButton onClick={() => copy(magicData.inviteUrl)} color="primary" title="Copiar link"><ContentCopyIcon /></IconButton>
            </Stack>

            <Box sx={{ p: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                Mensagem que será enviada no WhatsApp:
              </Typography>
              <Typography variant="body2" sx={{ color: '#14532d', fontSize: 12.5, fontStyle: 'italic', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                {magicData.message}
              </Typography>
            </Box>

            <Button
              variant="contained"
              fullWidth
              startIcon={<WhatsAppIcon sx={{ color: '#fff' }} />}
              onClick={() => window.open(whatsMagic, '_blank')}
              sx={{
                py: 1.25,
                bgcolor: '#25D366',
                color: '#fff',
                fontWeight: 800,
                fontSize: 14,
                textTransform: 'none',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)',
                '&:hover': { bgcolor: '#128C7E' },
              }}
            >
              Abrir WhatsApp e Enviar ao Médico
            </Button>
          </Box>
        )}

        {/* MODO 2: LINK COM PIN (12 HORAS) */}
        {shareMode === 'pin' && (
          <>
            {revoked && (
              <Alert severity="info" sx={{ borderRadius: '12px' }} icon={<LockIcon />}>Acesso revogado. O link e o QR não funcionam mais.</Alert>
            )}

            {data && !loading && (
              <Box>
                <Alert severity="success" sx={{ mb: 2, borderRadius: '12px' }}>✅ Link seguro gerado! Válido por <b>12 horas</b>.</Alert>

                {qr && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
                    <Box component="img" src={qr} alt="QR de acesso" sx={{ width: 140, height: 140, borderRadius: '12px', p: 1, bgcolor: '#fff', border: '1px solid #e2e8f0' }} />
                    <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>Mostre este QR no consultório</Typography>
                  </Box>
                )}

                <Typography variant="subtitle2" sx={{ color: '#0369a1' }}>Link de acesso</Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                  <TextField value={data.link} size="small" fullWidth InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
                  <IconButton onClick={() => copy(data.link)} color="primary" title="Copiar link"><ContentCopyIcon /></IconButton>
                </Stack>
                <Typography variant="subtitle2" sx={{ color: '#0369a1' }}>🔑 Senha (PIN de 6 dígitos)</Typography>
                <Typography sx={{ fontSize: 26, fontWeight: 800, letterSpacing: 6, color: '#0369a1', textAlign: 'center', py: 0.75, my: 0.5, bgcolor: '#f0f8fc', borderRadius: '10px', border: '1px dashed #0369a1' }}>
                  {data.pin}
                </Typography>

                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Button variant="contained" fullWidth startIcon={<WhatsAppIcon sx={{ color: '#fff' }} />} onClick={() => window.open(whatsPin, '_blank')} sx={{ bgcolor: '#25D366', color: '#fff', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#128C7E' } }}>
                    Enviar no WhatsApp
                  </Button>
                  <Button disabled={revoking} startIcon={<LockIcon />} onClick={revoke} sx={{ color: '#ef4444', textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {revoking ? 'Revogando…' : 'Revogar'}
                  </Button>
                </Stack>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};

