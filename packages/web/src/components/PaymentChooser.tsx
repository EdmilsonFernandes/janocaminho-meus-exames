import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button, Typography, Stack, CircularProgress, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { API_URL, token } from '../config';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** Seletor de forma de pagamento: PIX (QR inline) | Cartão | Débito (Checkout Pro do MP). */
export const PaymentChooser = ({ packId, packLabel, onClose, onPix }: {
  packId: string | null; packLabel: string; onClose: () => void; onPix: () => void;
}) => {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const payRedirect = async (method: 'card' | 'debit') => {
    if (!packId) return;
    setErr(''); setBusy(method);
    try {
      const r = await fetch(`${API_URL}/billing/buy-credits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ pack: packId, method }),
      });
      const d = await r.json();
      if (!r.ok || !d.init_point) throw new Error(d.error || 'Falha');
      if (Capacitor.isNativePlatform()) await Browser.open({ url: d.init_point });
      else window.location.href = d.init_point;
    } catch (e: any) { setErr(e.message || 'Falha ao abrir pagamento'); setBusy(''); }
  };

  const Opt = ({ icon, title, sub, onClick, busyKey, color }: any) => (
    <Button fullWidth variant="outlined" onClick={onClick} disabled={!!busy}
      sx={{ justifyContent: 'flex-start', py: 1.5, px: 2, borderColor: 'divider', '&:hover': { borderColor: color, bgcolor: `${color}0a` } }}>
      <Box sx={{ mr: 1.5, color }}>{icon}</Box>
      <Box sx={{ textAlign: 'left', flex: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{sub}</Typography>
      </Box>
      {busy === busyKey && <CircularProgress size={18} sx={{ ml: 1 }} />}
    </Button>
  );

  return (
    <Dialog open={!!packId} onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 400, width: '100%' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        Forma de pagamento
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{packLabel}</Typography>
        <Stack spacing={1.5}>
          <Opt icon={<QrCode2Icon />} title="PIX" sub="Instantâneo • QR code" busyKey="pix" color="#20b2aa"
            onClick={() => { onPix(); onClose(); }} />
          <Opt icon={<CreditCardIcon />} title="Cartão de crédito" sub="Até 12x • via Mercado Pago" busyKey="card" color="#0b5cab"
            onClick={() => payRedirect('card')} />
          <Opt icon={<AccountBalanceIcon />} title="Débito" sub="À vista • via Mercado Pago" busyKey="debit" color="#178f89"
            onClick={() => payRedirect('debit')} />
        </Stack>
        {err && <Typography color="error" variant="body2" sx={{ mt: 2 }}>{err}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
          🔒 Pagamento processado pelo Mercado Pago.
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
