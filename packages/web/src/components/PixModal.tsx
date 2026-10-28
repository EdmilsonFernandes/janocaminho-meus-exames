import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, Typography, Box, Button, IconButton, CircularProgress, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { API_URL, token } from '../config';
import { tealText } from '../theme';
import { copyText } from '../utils/copyText';
import { snackbar } from './ConfirmDialog';
import { readsOf } from '../utils/creditsLabel';
import { bumpCredits } from '../utils/credits-events';
import { celebrate } from '../hooks/useCelebrate';
import { ConfettiCanvas } from './Celebration';
import { PaymentLogos } from './PaymentLogos';

type Phase = 'loading' | 'waiting' | 'approved' | 'expired' | 'error';

/** Modal de pagamento PIX (tela principal de compra desde 02/10 — OpenPix):
 *  gera QR + copia-cola, conta regressiva até expirar, faz polling do status e,
 *  ao aprovar, credita automaticamente (via webhook) e avisa o pai. */
/** `plan` (05/10): cobra o PLANO MENSAL ({plan:'monthly'}) em vez de pack de créditos —
 *  o redirect do MP saiu do ar. packId continua sendo o gatilho de abertura (use
 *  '__plan__' como sentinel no caller).
 *  `product='report'` (18/10): RELATÓRIO AVULSO — compra única de 1 voucher, não é pack
 *  de créditos. Mesmo fluxo PIX/lock; chip e confirmação falam "relatório". */
export const PixModal = ({ packId, plan, product, couponCode, onClose, onApproved, existingPix }: { packId: string | null; plan?: boolean; product?: 'report'; couponCode?: string; onClose: () => void; onApproved: () => void; existingPix?: any }) => {
  const [pix, setPix] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [secs, setSecs] = useState(0);
  const [copied, setCopied] = useState(false);
  // "Gerar novo PIX" (expired): nonce que força NOVA charge mesmo vindo de existingPix.
  const [regen, setRegen] = useState(0);
  const copyTimer = useRef<any>(null);
  const approvedDone = useRef(false); // garante que onApproved dispara só 1x (evita toast duplicado)

  // Celebração pós-aprovação (useCelebrate): dispara quando o modal SAI da tela — no X,
  // backdrop/Escape ou quando o pai fecha após o onApproved. Nunca DURANTE o dialog: a
  // tela "aprovado" já tem confetti próprio (Celebration.ConfettiCanvas), pill em cima
  // seria celebração dupla. Refs porque o cleanup roda com o closure do 1º render.
  const pixRef = useRef<any>(null);
  useEffect(() => { pixRef.current = pix; }, [pix]);
  useEffect(() => () => {
    if (!approvedDone.current) return;
    if (plan) celebrate('premium_activated');
    else {
      const amount = Number(pixRef.current?.credits ?? 0);
      if (amount > 0) celebrate('credits_earned', { amount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          body: JSON.stringify(product === 'report' ? { product: 'report' } : plan ? { plan: 'monthly', ...(couponCode ? { couponCode } : {}) } : { pack: packId, ...(couponCode ? { couponCode } : {}) }),
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
        // Aprovado: o webhook já creditou server-side → avisa o chip na HORA (poll 30s
        // cobriria, mas o usuário está OLHANDO pra esta tela — feedback instantâneo).
        if (d.approved) { bumpCredits(); setPhase('approved'); }
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

  /** Copy do PIX à prova de WebView (24/10): navigator.clipboard falha no APK → helper
   *  copyText (Clipboard API → execCommand). Falhou tudo → avisa honesto + toque-e-segure;
   *  antes o botão ficava mudo como se tivesse copiado. */
  const copyPix = async () => {
    const code = String(pix?.qrCode || '');
    if (!code) return;
    if (await copyText(code)) {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } else {
      snackbar({ message: 'Não deu pra copiar automático. Toque e segure o código PIX acima para copiar.', severity: 'info' });
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
              <Chip size="small" label={product === 'report' ? 'Relatório completo' : `${readsOf(pix.credits)} ${readsOf(pix.credits) === 1 ? 'leitura' : 'leituras'}`} sx={{ mb: 0.75, fontWeight: 700, bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode) }} />
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

            {/* Selo de confiança — mesmo padrão do PaymentChooser. Logos multi-provider
                (OpenPix + Asaas; MP é fallback invisível, fica fora do selo). */}
            <Stack justifyContent="center" sx={{ mt: 2.5 }} spacing={0.5}>
              <Stack direction="row" spacing={0.75} justifyContent="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>🔒 Ambiente seguro</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>·</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Dr. Exame</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>·</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Processado via:</Typography>
              </Stack>
              <PaymentLogos />
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
              <Typography color="text.secondary">{plan ? '👑 Premium ativo por 30 dias!' : product === 'report' ? '📄 Relatório completo liberado! Volte e gere novamente. 🎉' : `+${pix?.credits ?? ''} créditos adicionados. 🎉`}</Typography>
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
