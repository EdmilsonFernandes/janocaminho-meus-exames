import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, Typography, Box, Button, IconButton, CircularProgress, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { API_URL, token } from '../config';

type Phase = 'loading' | 'waiting' | 'approved' | 'expired' | 'error';

/** Modal de pagamento PIX: gera QR + copia-cola, conta regressiva até expirar, faz polling
 *  do status e, ao aprovar, credita automaticamente (via webhook) e avisa o pai. */
export const PixModal = ({ packId, onClose, onApproved }: { packId: string | null; onClose: () => void; onApproved: () => void }) => {
  const [pix, setPix] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [secs, setSecs] = useState(0);
  const pollRef = useRef<any>(null);
  const approvedDone = useRef(false); // garante que onApproved dispara só 1x (evita toast duplicado)

  useEffect(() => {
    if (!packId) return;
    let cancelled = false;
    setPhase('loading'); setPix(null); approvedDone.current = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/billing/buy-credits`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ pack: packId }),
        });
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) { setPhase('error'); return; }
        setPix(d); setPhase('waiting');
        setSecs(Math.max(0, Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 1000)));
      } catch { if (!cancelled) setPhase('error'); }
    })();
    return () => { cancelled = true; };
  }, [packId]);

  useEffect(() => {
    if (phase !== 'waiting' || !pix) return;
    pollRef.current = setInterval(async () => {
      setSecs((s) => Math.max(0, s - 1));
      try {
        const r = await fetch(`${API_URL}/billing/payment-status/${pix.paymentId}`, { headers: { Authorization: `Bearer ${token()}` } });
        const d = await r.json();
        if (d.approved) setPhase('approved');
      } catch { /* ignora falhas pontuais de polling */ }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [phase, pix]);

  useEffect(() => {
    if (secs <= 0 && phase === 'waiting') setPhase('expired');
    if (phase === 'approved' && !approvedDone.current) {
      approvedDone.current = true;
      clearInterval(pollRef.current);
      const t = setTimeout(onApproved, 1800);
      return () => clearTimeout(t);
    }
  }, [secs, phase, onApproved]);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const copy = () => pix?.qrCode && navigator.clipboard?.writeText(pix.qrCode);

  return (
    <Dialog open={!!packId} onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 380, width: '100%', textAlign: 'center' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        Pagamento PIX
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {phase === 'loading' && <CircularProgress sx={{ my: 4 }} />}
        {phase === 'waiting' && pix && (
          <Box>
            <Chip color="primary" label={`${pix.credits} créditos • R$ ${Number(pix.price).toFixed(2).replace('.', ',')}`} sx={{ mb: 1.5 }} />
            {pix.qrBase64 ? (
              <Box component="img" src={pix.qrBase64} alt="QR PIX" sx={{ width: 220, height: 220, borderRadius: 2, border: '1px solid #e2e8f0', display: 'block', mx: 'auto' }} />
            ) : <Typography color="error">QR indisponível</Typography>}
            <Typography variant="body2" sx={{ mt: 1.5 }}>Abra o app do banco e escaneie o QR code.</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ wordBreak: 'break-all', maxWidth: 200, color: 'text.secondary' }}>Pix Copia e Cola</Typography>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy}>Copiar</Button>
            </Stack>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2">Aguardando pagamento… <strong>{mm}:{ss}</strong></Typography>
            </Box>
          </Box>
        )}
        {phase === 'approved' && (
          <Box sx={{ py: 3 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
            <Typography variant="h6" sx={{ mt: 1 }}>Pagamento aprovado!</Typography>
            <Typography color="text.secondary">+{pix?.credits ?? ''} créditos adicionados. 🎉</Typography>
          </Box>
        )}
        {(phase === 'expired' || phase === 'error') && (
          <Box sx={{ py: 3 }}>
            <Typography color="error" sx={{ mb: 1 }}>{phase === 'expired' ? '⏰ O PIX expirou.' : 'Não foi possível gerar o PIX.'}</Typography>
            <Button variant="contained" onClick={onClose}>Fechar e tentar de novo</Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
