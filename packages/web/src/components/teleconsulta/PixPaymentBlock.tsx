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

  // Regra de ouro do pagamento (26/10): nenhum caminho do copy derruba a tela —
  // snackbar em try/catch; falha de copy → seleção manual + info (nunca vermelho).
  const doCopy = async () => {
    const code = String(charge?.qrCode ?? '');
    if (!code) return;
    try {
      if (await copyText(code)) {
        setCopied(true);
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 2500);
        try { snackbar({ message: 'Código PIX copiado!', severity: 'success' }); } catch { /* toast nunca derruba o pagamento */ }
      } else {
        pixCodeRef.current?.focus();
        pixCodeRef.current?.select();
        hapticLight();
        try { snackbar({ message: 'Não deu pra copiar automático. Toque e segure o código acima para copiar.', severity: 'info' }); } catch { /* idem */ }
      }
    } catch { /* copyText nunca lança; defesa extra p/ nenhum path quebrar o card */ }
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

  const emeraldBtn = {
    minHeight: 46,
    borderRadius: '12px',
    textTransform: 'none' as const,
    fontWeight: 800,
    fontSize: 14.5,
    background: 'linear-gradient(135deg, #178f89 0%, #0d5f5a 100%)',
    color: '#fff',
    boxShadow: '0 4px 14px rgba(23, 143, 137, 0.3)',
    transition: 'all .2s ease',
    '&:hover': {
      background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
      boxShadow: '0 6px 18px rgba(23, 143, 137, 0.4)',
    },
  };

  return (
    <Box sx={{
      mt: 1.5,
      p: 2,
      borderRadius: '16px',
      border: '1px solid',
      borderColor: expired ? 'rgba(239,68,68,.3)' : 'rgba(23,143,137,.25)',
      background: isDark
        ? 'linear-gradient(135deg, rgba(23,143,137,0.08), rgba(13,95,90,0.04))'
        : 'linear-gradient(135deg, rgba(23,143,137,0.05), rgba(240,253,250,0.8))',
    }}>
      {!charge ? (
        <Button
          fullWidth
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <PaymentsRoundedIcon />}
          onClick={() => void createCharge()}
          sx={emeraldBtn}
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
            sx={{ ...emeraldBtn, mt: 1.5 }}
            onClick={() => void createCharge()}
          >
            {busy ? 'Gerando novo PIX…' : 'Gerar novo PIX'}
          </Button>
        </Box>
      ) : (
        <>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
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
              sx={{ borderRadius: '999px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', bgcolor: 'rgba(23,143,137,.12)', color: isDark ? '#20b2aa' : '#0d5f5a', border: '1px solid rgba(23,143,137,.3)' }}
            />
          </Stack>

          {charge.qrBase64 && (
            <Box
              component="img"
              src={charge.qrBase64}
              alt="QR Code PIX da consulta"
              sx={{ width: 190, height: 190, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: '#fff', p: 1, mx: 'auto', display: 'block', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
            />
          )}

          {charge.qrCode && (
            <Box sx={{ mt: 1.75 }}>
              <Box
                onClick={() => void doCopy()}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.25,
                  px: 1.5,
                  borderRadius: '10px',
                  bgcolor: 'action.hover',
                  border: '1px dashed',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                  '&:hover': { bgcolor: 'action.selected', borderColor: '#178f89' },
                }}
              >
                <Typography
                  noWrap
                  sx={{
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                    color: 'text.secondary',
                    maxWidth: '85%',
                  }}
                >
                  {charge.qrCode.slice(0, 24)}…{charge.qrCode.slice(-12)}
                </Typography>
                <ContentCopyRoundedIcon sx={{ fontSize: 16, color: '#178f89' }} />
              </Box>

              {/* Accessible input for WebView fallback copy */}
              <input
                ref={pixCodeRef}
                value={charge.qrCode}
                readOnly
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0 }}
              />

              <Button
                fullWidth
                size="large"
                variant="contained"
                startIcon={copied ? <CheckCircleOutlineRoundedIcon /> : <ContentCopyRoundedIcon />}
                onClick={() => void doCopy()}
                sx={{
                  ...emeraldBtn,
                  mt: 1.25,
                  ...(copied ? { background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', '&:hover': { background: '#16a34a' } } : {}),
                }}
              >
                {copied ? 'Código PIX Copiado!' : 'Copiar Código PIX'}
              </Button>
            </Box>
          )}

          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 2 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#22c55e',
                animation: 'radarPing 1.6s infinite ease-in-out',
                '@keyframes radarPing': {
                  '0%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
                  '50%': { opacity: 1, transform: 'scale(1.2)' },
                },
              }}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, fontWeight: 500 }}>
              Aguardando confirmação bancária…
            </Typography>
          </Stack>
        </>
      )}
    </Box>
  );
};
