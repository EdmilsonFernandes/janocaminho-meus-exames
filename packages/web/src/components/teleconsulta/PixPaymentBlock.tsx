import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { API_URL, token } from '../../config';
import { copyText } from '../../utils/copyText';
import { hapticLight, hapticSuccess, hapticError } from '../../utils/haptic';
import { snackbar } from '../ConfirmDialog';

/** centavos → "X,XX" (pt-BR, sem Intl currency — mesmo padrão do Reminders). */
const fmtBrl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PixCharge {
  reminderId: string;
  paymentId: string;
  qrCode: string;
  qrBase64?: string;
  expiresAt?: string;
  priceCents?: number;
}

/**
 * PixPaymentBlock — bloco PIX reutilizável da teleconsulta particular.
 * Mesmo contrato do dialog do Reminders.tsx (NÃO mexemos ali; este é o componente
 * novo p/ tela Minhas Consultas — swap no Reminders fica a cargo do coordinator):
 *  - POST /api/billing/teleconsulta/:id → { paymentId, qrCode, qrBase64, expiresAt, priceCents }
 *    409 + pendingPix → retoma o MESMO QR vivo; 409 + paidAt → já pago.
 *  - poll GET /api/billing/payment-status/:paymentId → { approved } (3s).
 *  - expiração → "Gerar novo" (POST de novo: PIX expirado gera charge nova).
 *  - copy via utils/copyText (WebView-safe; falha → seleciona campo readOnly).
 */
export const PixPaymentBlock = ({
  reminderId,
  priceCents,
  paidAt,
  onPaid,
}: {
  reminderId: string;
  priceCents: number;
  paidAt?: string | null;
  /** Callback quando a aprovação chega (caller atualiza a lista/card). */
  onPaid?: () => void;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [copied, setCopied] = useState(false);
  const pixCodeRef = useRef<HTMLInputElement | null>(null);
  const copyTimer = useRef<any>(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const createCharge = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/billing/teleconsulta/${reminderId}`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      const d: any = await res.json().catch(() => ({}));
      if (res.status === 409 && d.pendingPix) {
        hapticLight();
        setCharge({ ...d.pendingPix, reminderId });
        return;
      }
      if (res.status === 409 && d.paidAt) {
        snackbar({ message: '✓ Consulta paga! Pagamento confirmado.', severity: 'success' });
        onPaid?.();
        return;
      }
      if (!res.ok) throw new Error(d.error || 'Falha ao gerar a cobrança.');
      hapticLight();
      setCharge({ reminderId, paymentId: d.paymentId, qrCode: d.qrCode, qrBase64: d.qrBase64, expiresAt: d.expiresAt, priceCents: d.priceCents });
    } catch (e: any) {
      hapticError();
      snackbar({ message: e?.message || 'Falha ao gerar a cobrança.', severity: 'error' });
    } finally { setBusy(false); }
  };

  // Poll de aprovação (3s) — fecha sozinho quando o webhook aprova.
  useEffect(() => {
    if (!charge?.paymentId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/billing/payment-status/${charge.paymentId}`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (d?.approved) {
          clearInterval(iv);
          setCharge(null);
          hapticSuccess();
          snackbar({ message: '✓ Consulta paga! Pagamento confirmado.', severity: 'success' });
          onPaid?.();
        }
      } catch { /* offline: próximo tick tenta de novo */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [charge?.paymentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown MM:SS a partir do expiresAt do server.
  useEffect(() => {
    const ms = charge?.expiresAt ? new Date(charge.expiresAt).getTime() : NaN;
    if (!ms || isNaN(ms)) { setSecs(0); return; }
    setSecs(Math.max(0, Math.floor((ms - Date.now()) / 1000)));
    const tick = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, [charge?.paymentId, charge?.expiresAt]);

  const doCopy = async () => {
    const code = String(charge?.qrCode ?? '');
    if (!code) return;
    if (await copyText(code)) {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
      snackbar({ message: 'Código PIX copiado!', severity: 'success' });
    } else {
      pixCodeRef.current?.focus();
      pixCodeRef.current?.select();
      hapticLight();
      snackbar({ message: 'Não deu pra copiar automático. Toque e segure o código acima para copiar.', severity: 'info' });
    }
  };

  if (paidAt) {
    return (
      <Chip
        size="small"
        icon={<CheckCircleOutlineRoundedIcon />}
        label={`✅ Pago — R$ ${fmtBrl(priceCents)}`}
        sx={{ height: 28, fontSize: 12.5, fontWeight: 800, borderRadius: '999px', bgcolor: 'rgba(16,185,129,.14)', color: isDark ? '#34d399' : '#059669', border: '1px solid rgba(52,211,153,.3)', justifyContent: 'center' }}
      />
    );
  }

  const expired = !!charge?.expiresAt && secs <= 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  const copperBtn = {
    minHeight: 44,
    borderRadius: '12px',
    textTransform: 'none' as const,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #d4a574 0%, #b88a54 100%)',
    color: '#fff',
    '&:hover': { background: 'linear-gradient(135deg, #e0b183 0%, #c49260 100%)' },
  };

  return (
    <Box sx={{
      mt: 1.5,
      p: 1.75,
      borderRadius: '14px',
      border: '1px solid',
      borderColor: expired ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)',
      background: isDark
        ? 'linear-gradient(135deg, rgba(245,158,11,0.07), rgba(217,119,6,0.04))'
        : 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(255,251,235,0.6))',
    }}>
      {!charge ? (
        <Button
          fullWidth
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <PaymentsRoundedIcon />}
          onClick={() => void createCharge()}
          sx={copperBtn}
        >
          {busy ? 'Gerando PIX…' : `Gerar PIX — R$ ${fmtBrl(priceCents)}`}
        </Button>
      ) : expired ? (
        <Box>
          <Alert severity="warning" icon={<HourglassEmptyRoundedIcon fontSize="small" />} sx={{ borderRadius: '12px', textAlign: 'left', fontSize: 13 }}>
            O tempo deste PIX acabou e ele não pode mais ser pago. Gere um novo código para concluir.
          </Alert>
          <Button
            fullWidth
            variant="contained"
            disabled={busy}
            sx={{ ...copperBtn, mt: 1.5 }}
            onClick={() => void createCharge()}
          >
            {busy ? 'Gerando novo PIX…' : 'Gerar novo PIX'}
          </Button>
        </Box>
      ) : (
        <>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
            <Stack direction="row" alignItems="baseline" spacing={0.5}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary' }}>R$</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: 'text.primary', letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>
                {fmtBrl(Number(charge.priceCents ?? priceCents))}
              </Typography>
            </Stack>
            <Chip
              size="small"
              icon={<HourglassEmptyRoundedIcon sx={{ fontSize: '15px !important' }} />}
              label={`Vence em ${mm}:${ss}`}
              sx={{ borderRadius: '999px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', bgcolor: 'rgba(245,158,11,.14)', color: isDark ? '#fbbf24' : '#b45309', border: '1px solid rgba(245,158,11,.3)' }}
            />
          </Stack>

          {charge.qrBase64 && (
            <Box
              component="img"
              src={charge.qrBase64}
              alt="QR Code PIX da consulta"
              sx={{ width: 190, height: 190, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: '#fff', p: 1, mx: 'auto', display: 'block' }}
            />
          )}

          {charge.qrCode && (
            <>
              <TextField
                inputRef={pixCodeRef}
                value={charge.qrCode}
                multiline
                size="small"
                inputProps={{ readOnly: true, 'aria-label': 'Código PIX copia e cola' }}
                onFocus={(e) => e.target.select()}
                sx={{ mt: 1.5, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 11, fontFamily: 'monospace' } }}
              />
              <Button
                size="small"
                fullWidth
                variant="contained"
                startIcon={copied ? <CheckCircleOutlineRoundedIcon /> : <ContentCopyRoundedIcon />}
                onClick={() => void doCopy()}
                sx={{ ...copperBtn, mt: 1, ...(copied ? { background: 'success.main', '&:hover': { background: 'success.dark' } } : {}) }}
              >
                {copied ? 'Copiado!' : 'Copiar código PIX'}
              </Button>
            </>
          )}

          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1.5 }}>
            <CircularProgress size={13} sx={{ color: '#d4a574' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12.5 }}>Aguardando pagamento…</Typography>
          </Stack>
        </>
      )}
    </Box>
  );
};
