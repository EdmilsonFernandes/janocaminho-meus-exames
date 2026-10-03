import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, Typography, Box, Button, IconButton, CircularProgress, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { API_URL, token } from '../config';
import { tealText } from '../theme';
import { ConfettiCanvas } from './Celebration';

type Phase = 'loading' | 'waiting' | 'approved' | 'expired' | 'error';

/** Modal de pagamento PIX (tela principal de compra desde 02/10 — OpenPix/Woovi):
 *  gera QR + copia-cola, conta regressiva até expirar, faz polling do status e,
 *  ao aprovar, credita automaticamente (via webhook) e avisa o pai. */
export const PixModal = ({ packId, onClose, onApproved, existingPix }: { packId: string | null; onClose: () => void; onApproved: () => void; existingPix?: any }) => {
  const [pix, setPix] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [secs, setSecs] = useState(0);
  const [copied, setCopied] = useState(false);
  // "Gerar novo PIX" (expired): nonce que força NOVA charge mesmo vindo de existingPix.
  const [regen, setRegen] = useState(0);
  const copyTimer = useRef<any>(null);
  const approvedDone = useRef(false); // garante que onApproved dispara só 1x (evita toast duplicado)

  useEffect(() => {
    if (!packId) return;
    let cancelled = false;
    setPhase('loading'); setPix(null); setCopied(false); approvedDone.current = false;

    // RETOMADO (padrão gateway): usa o PIX existente — SEM chamar a API de novo.
    // (regen > 0 = usuário pediu código novo → ignora o PIX retomado/expirado.)
    const resume = regen === 0 ? existingPix : undefined;
    if (resume) {
      setPix(resume); setPhase('waiting');
      setSecs(Math.max(0, Math.floor((new Date(resume.expiresAt).getTime() - Date.now()) / 1000)));
      return;
    }

    (async () => {
      try {
        const r = await fetch(`${API_URL}/billing/buy-credits`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ pack: packId }),
        });
        const d = await r.json();
        if (cancelled) return;
        // 409 = LOCK 1-POR-VEZ (dono 03/10): já existe PIX vivo (outro pack, mesmo).
        // Reabre com o MESMO QR/timer — não deixa trocar de pack enquanto o atual vive.
        if (r.status === 409 && d?.pendingPix?.qrCode) {
          setPix(d.pendingPix); setPhase('waiting');
          setSecs(Math.max(0, Math.floor((new Date(d.pendingPix.expiresAt).getTime() - Date.now()) / 1000)));
          return;
        }
        if (!r.ok) { setErrMsg(d?.error || ''); setPhase('error'); return; }
        setPix(d); setPhase('waiting');
        setSecs(Math.max(0, Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 1000)));
      } catch { if (!cancelled) { setErrMsg(''); setPhase('error'); } }
    })();
    return () => { cancelled = true; };
  }, [packId, existingPix, regen]);

  // Fechou o modal → zera o regen (próxima abertura pode retomar pending normalmente).
  useEffect(() => { if (!packId) setRegen(0); }, [packId]);

  // Timer 1s (countdown fluido) + polling 3s (status) — separados p/ o chip não "pular" de 3 em 3s.
  useEffect(() => {
    if (phase !== 'waiting' || !pix) return;
    const tick = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/billing/payment-status/${pix.paymentId}`, { headers: { Authorization: `Bearer ${token()}` } });
        const d = await r.json();
        if (d.approved) setPhase('approved');
      } catch { /* ignora falhas pontuais de polling */ }
    }, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [phase, pix]);

  useEffect(() => {
    if (secs <= 0 && phase === 'waiting') setPhase('expired');
    if (phase === 'approved' && !approvedDone.current) {
      approvedDone.current = true;
      const t = setTimeout(onApproved, 1800);
      return () => clearTimeout(t);
    }
  }, [secs, phase, onApproved]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const price = pix ? `R$ ${Number(pix.price).toFixed(2).replace('.', ',')}` : '';

  /** navigator.clipboard + fallback execCommand (WebView antiga / contexto não seguro). */
  const copyPix = async () => {
    const code = String(pix?.qrCode || '');
    if (!code) return;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (ok) {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    }
  };

  const regenPix = () => {
    setPix(null); setErrMsg(''); setCopied(false); setPhase('loading');
    setRegen((r) => r + 1);
  };

  return (
    <Dialog open={!!packId} onClose={onClose} PaperProps={{ sx: { borderRadius: '16px', maxWidth: 380, width: '100%', textAlign: 'center' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0.5 }}>
        Pague com PIX
        <IconButton onClick={onClose} size="small" aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3, px: { xs: 2, sm: 3 } }}>
        {phase === 'loading' && (
          <Box sx={{ py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress sx={{ color: '#20b2aa' }} />
            <Typography variant="body2" color="text.secondary">Gerando seu PIX…</Typography>
          </Box>
        )}

        {phase === 'waiting' && pix && (
          <Box>
            {/* Valor + créditos — herói do header (o que o usuário mais precisa confirmar) */}
            <Box sx={{ mb: 1.5 }}>
              <Chip size="small" label={`${pix.credits} créditos`} sx={{ mb: 0.75, fontWeight: 700, bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode) }} />
              <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 'clamp(2rem, 8vw, 2.5rem)', lineHeight: 1.05, letterSpacing: '-0.02em', color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                {price}
              </Typography>
            </Box>

            {/* Countdown — chip pill discreto, sempre visível */}
            <Chip size="small" icon={<ScheduleIcon sx={{ fontSize: '16px !important' }} />} label={`Expira em ${mm}:${ss}`}
              sx={{ borderRadius: '999px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), border: '1px solid rgba(32,178,170,.25)', mb: 2 }} />

            {/* QR em destaque — card branco (legível no dark mode), cantos suaves.
                Sem qrBase64 → box some SEM mensagem feia: o copia-e-cola vira o herói. */}
            {pix.qrBase64 ? (
              <Box sx={{ width: 'min(248px, 72vw)', mx: 'auto', p: 1.5, bgcolor: '#fff', borderRadius: '18px', border: '1px solid', borderColor: 'divider', boxShadow: '0 10px 30px rgba(15,61,58,.12)' }}>
                <Box component="img" src={pix.qrBase64} alt="QR Code PIX" sx={{ width: '100%', aspectRatio: '1 / 1', height: 'auto', display: 'block', borderRadius: '10px' }} />
              </Box>
            ) : null}

            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: 13.5 }}>
              {pix.qrBase64 ? 'Abra o app do banco e escaneie o QR code.' : 'Abra o app do banco e cole o código PIX abaixo.'}
            </Typography>

            {/* PIX copia e cola — código truncado + cópia com feedback */}
            <Box sx={{ mt: 1.5, textAlign: 'left', border: '1px solid', borderColor: 'divider', borderRadius: '16px', p: 1.5, bgcolor: 'rgba(32,178,170,.04)' }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'text.secondary' }}>PIX copia e cola</Typography>
              <Typography aria-label="Código PIX copia e cola" sx={{ fontFamily: 'monospace', fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'ltr' }}>
                {pix.qrCode}
              </Typography>
              <Button fullWidth variant="contained" onClick={copyPix}
                startIcon={copied ? <CheckCircleIcon /> : <ContentCopyIcon />}
                aria-label={copied ? 'Código copiado' : 'Copiar código PIX'}
                sx={{ mt: 1.25, minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, ...(copied ? { bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } } : {}) }}>
                {copied ? 'Copiado!' : 'Copiar código PIX'}
              </Button>
            </Box>

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <CircularProgress size={14} sx={{ color: '#20b2aa' }} />
              <Typography variant="body2" color="text.secondary">Aguardando confirmação do pagamento…</Typography>
            </Box>

            {/* Selo de confiança — mesmo padrão do PaymentChooser */}
            <Stack direction="row" spacing={0.75} justifyContent="center" sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>🔒 Ambiente seguro</Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>·</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Dr. Exame</Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>·</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Processado via OpenPix (Woovi)</Typography>
            </Stack>
          </Box>
        )}

        {phase === 'approved' && (
          <Box sx={{ py: 3, position: 'relative', overflow: 'hidden', borderRadius: '16px' }}>
            {/* Confetti leve (mesmo canvas do Celebration, cores da marca) por trás do check */}
            <ConfettiCanvas />
            <Box sx={{
              position: 'relative',
              animation: 'dxPixOk .5s cubic-bezier(.34,1.56,.64,1) both',
              '@keyframes dxPixOk': { from: { opacity: 0, transform: 'scale(.6)' }, to: { opacity: 1, transform: 'scale(1)' } },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 800 }}>Pagamento aprovado!</Typography>
              <Typography color="text.secondary">+{pix?.credits ?? ''} créditos adicionados. 🎉</Typography>
            </Box>
          </Box>
        )}

        {phase === 'expired' && (
          <Box sx={{ py: 2.5 }}>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>⏰ O tempo deste PIX acabou. Gere um novo código para concluir a compra.</Typography>
            <Stack spacing={1}>
              <Button variant="contained" onClick={regenPix} startIcon={<QrCode2Icon />}
                sx={{ minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 800 }}>
                Gerar novo PIX
              </Button>
              <Button size="small" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>Fechar</Button>
            </Stack>
          </Box>
        )}

        {phase === 'error' && (
          <Box sx={{ py: 2.5 }}>
            <Typography color="error" sx={{ mb: 1.5 }}>{errMsg || 'Pagamento indisponível no momento — tente novamente em alguns minutos.'}</Typography>
            <Button variant="contained" onClick={onClose}>Fechar e tentar de novo</Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
