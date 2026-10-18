import { useEffect, useState } from 'react';
import { Dialog, DialogContent, Box, Typography, Button, Chip, useTheme, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { CREDITS_INSUFFICIENT_EVENT } from '../utils/credits-events';
import { usePlanInfo, fmtBRL } from '../utils/planInfo';
import { useCredits } from '../hooks/useCredits';
import { PixModal } from './PixModal';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../config';
import { bumpCredits } from '../utils/credits-events';

/**
 * Dialog global de CRÉDITOS INSUFICIENTES (402 de qualquer feature de IA).
 * Escuta o evento `creditsInsufficient` (credits-events.ts) disparado pelos callers.
 *
 * UX (auditoria de monetização 18/10 — a hora mais valiosa do app): a oferta agora é
 * ESCALONADA por intenção, em vez de só "o pack mais barato":
 *   1. TRIAL 7 dias Premium grátis (+créditos) — p/ quem JÁ provou o valor (3+ usos de IA);
 *   2. RELATÓRIO AVULSO R$9,90 — quando o bloqueio foi no consolidado (produto mais usado):
 *      compra única, sem pensar em créditos;
 *   3. PACK mais barato (compra em 1 toque PIX, sem sair da tela);
 *   + comparativo honesto com o MENSAL ("R$X = N créditos" — o pack pequeno evapora em
 *     2 relatórios; o mensal é a economia real p/ quem consome).
 */
export const InsufficientCreditsDialog = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const notify = useNotify();
  const { credits } = useCredits();
  const plans = usePlanInfo();
  const [detail, setDetail] = useState<{ cost?: number; message?: string; feature?: string } | null>(null);
  const [pixPack, setPixPack] = useState<string | null>(null);
  const [pixReport, setPixReport] = useState(false);
  // Trial de resgate: elegibilidade vem do server (1x na vida, ≥3 usos de IA, não-premium).
  const [trialAvailable, setTrialAvailable] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);

  useEffect(() => {
    const onInsufficient = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setDetail({ cost: typeof d.cost === 'number' ? d.cost : undefined, message: typeof d.message === 'string' ? d.message : undefined, feature: typeof d.feature === 'string' ? d.feature : undefined });
      // Elegibilidade do trial junto com o 402 (server decide; falha silenciosa = sem trial).
      fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d2) => setTrialAvailable(!!d2?.trialAvailable))
        .catch(() => setTrialAvailable(false));
    };
    window.addEventListener(CREDITS_INSUFFICIENT_EVENT, onInsufficient);
    return () => window.removeEventListener(CREDITS_INSUFFICIENT_EVENT, onInsufficient);
  }, []);

  // Pack mais barato primeiro (entrada mínima — pedido explícito do dono).
  const cheapest = plans?.packs?.length ? [...plans.packs].sort((a, b) => a.price - b.price)[0] : null;
  const monthly = plans?.plan ?? null;
  const showReport = detail?.feature === 'CONSOLIDATED' && !!plans?.reportPack;
  const close = () => { setDetail(null); setTrialAvailable(false); };

  const activateTrial = async () => {
    setTrialBusy(true);
    try {
      const r = await fetch(`${API_URL}/billing/trial`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        bumpCredits();
        notify('🎁 Premium ativado por 7 dias! Tente de novo — agora vai.', { type: 'success' });
        close();
      } else if (r.status === 409) {
        notify(d.error || 'Trial indisponível para esta conta.', { type: 'info' });
        setTrialAvailable(false);
      } else {
        notify(d.error || 'Não foi possível ativar o trial agora.', { type: 'error' });
      }
    } catch { notify('Sem conexão — tente novamente.', { type: 'error' }); }
    setTrialBusy(false);
  };

  return (
    <>
      <Dialog open={!!detail} onClose={close} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', p: 0.5 } } }}
        // Entrada com "pulo" (spring) + ícone tremendo: comunica "travou por saldo" num relance.
        sx={{ '& .MuiDialog-container': { alignItems: 'center' }, '& @keyframes insfPop': { from: { transform: 'scale(.85)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } }, '& .MuiPaper-root': { animation: 'insfPop .28s cubic-bezier(.34,1.56,.64,1)' } }}
      >
        <DialogContent sx={{ textAlign: 'center', px: 2.5, pt: 3, pb: 2.5 }}>
          <Box sx={{
            fontSize: 44, mb: 1, mx: 'auto', width: 'fit-content',
            animation: 'insfShake .5s ease .25s 2',
            '@keyframes insfShake': { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-6px) rotate(-6deg)' }, '75%': { transform: 'translateX(6px) rotate(6deg)' } },
          }} aria-hidden="true">💎</Box>
          <Typography sx={{ fontFamily: '"Poppins", sans-serif', fontWeight: 800, fontSize: 18, mb: 0.5 }}>
            Créditos insuficientes
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.5, mb: 2 }}>
            {detail?.cost != null && credits != null
              ? <>Você tem <b>{credits}</b> · esta ação precisa de <b>{detail.cost}</b>.</>
              : (detail?.message ?? 'Esta ação precisa de mais créditos.')}
          </Typography>

          {/* 1) TRIAL DE RESGATE — quem já provou o valor ganha 7 dias, sem cartão. */}
          {trialAvailable && (
            <Box sx={{
              p: 1.75, mb: 1.5, borderRadius: '14px', textAlign: 'left',
              bgcolor: 'rgba(212,165,116,.12)', border: '1px solid rgba(212,165,116,.35)',
            }}>
              <StackRow label="🎁 7 dias Premium grátis" chip="só desta vez" />
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
                Você já usa o Dr. Exame — experimente o Premium por uma semana (com créditos extra), sem cartão.
              </Typography>
              <Button
                fullWidth variant="contained" disabled={trialBusy} onClick={() => void activateTrial()}
                sx={{
                  mt: 1, minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 15,
                  background: 'linear-gradient(135deg,#d4a574,#b88a54)',
                  '&:hover': { background: 'linear-gradient(135deg,#b88a54,#b88a54)' },
                }}
              >
                {trialBusy ? 'Ativando…' : 'Ativar 7 dias grátis'}
              </Button>
            </Box>
          )}

          {/* 2) RELATÓRIO AVULSO — bloqueou o consolidado: compra o que precisa, 1 uso. */}
          {showReport && (
            <Box sx={{
              p: 1.75, mb: 1.5, borderRadius: '14px', textAlign: 'left',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(32,178,170,.10)' : 'rgba(32,178,170,.06)',
              border: '1px solid rgba(32,178,170,.25)',
            }}>
              <StackRow label={plans!.reportPack!.label} chip="compra única" />
              <Typography sx={{ fontWeight: 800, fontSize: 20, mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
                {fmtBRL(plans!.reportPack!.price)}
              </Typography>
              <Button
                fullWidth variant="outlined" onClick={() => setPixReport(true)}
                sx={{ mt: 0.75, minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 14, borderColor: 'rgba(32,178,170,.5)', color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#178f89') }}
              >
                Comprar 1 relatório · {fmtBRL(plans!.reportPack!.price)}
              </Button>
            </Box>
          )}

          {/* 3) PACK de créditos mais barato — compra em 1 toque PIX (fluxo de sempre). */}
          {cheapest && (
            <Box sx={{
              p: 1.75, mb: 1.5, borderRadius: '14px', textAlign: 'left',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(32,178,170,.10)' : 'rgba(32,178,170,.06)',
              border: '1px solid rgba(32,178,170,.25)',
            }}>
              <StackRow label={`${cheapest.credits} créditos`} chip={cheapest.popular ? 'mais vendido' : 'entrada mais barata'} />
              <Typography sx={{ fontWeight: 800, fontSize: 20, mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
                {fmtBRL(cheapest.price)}
                <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.disabled', ml: 0.75 }}>
                  ≈ {fmtBRL(cheapest.price / cheapest.credits)}/crédito
                </Typography>
              </Typography>
              <Button
                fullWidth variant={trialAvailable || showReport ? 'outlined' : 'contained'} disableElevation onClick={() => setPixPack(cheapest.id)}
                sx={{
                  mt: 0.75, minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 15,
                  ...(trialAvailable || showReport
                    ? { borderColor: 'rgba(32,178,170,.5)', color: (t: any) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#178f89') }
                    : { background: 'linear-gradient(135deg,#20b2aa,#178f89)', '&:hover': { background: 'linear-gradient(135deg,#178f89,#178f89)' } }),
                }}
              >
                Comprar {cheapest.credits} créditos · {fmtBRL(cheapest.price)}
              </Button>
            </Box>
          )}

          {/* Comparativo honesto com o mensal: o pack pequeno evapora; o mensal é a economia. */}
          {monthly && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5, mb: 0.75 }}>
                Usa bastante? O <b>{monthly.label}</b> traz <b>{monthly.monthlyCredits} créditos</b>
                {monthly.founder && <> por <b>{fmtBRL(monthly.effectivePrice)}</b> (Plano Fundador — restam {monthly.founderRemaining})</>}
                {' '}+ família + uploads premium.
              </Typography>
              <Button fullWidth size="small" onClick={() => { close(); navigate('/planos'); }}
                sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
                Comparar todos os planos →
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compra em 1 toque: PIX do pack sugerido sem sair da tela. */}
      {pixPack && (
        <PixModal
          packId={pixPack}
          onClose={() => { setPixPack(null); close(); }}
          onApproved={() => { setPixPack(null); close(); notify('Créditos adicionados! 🎉', { type: 'success' }); }}
        />
      )}
      {/* PIX do relatório avulso (voucher) — mesmo modal, produto diferente. */}
      {pixReport && (
        <PixModal
          packId="report"
          product="report"
          onClose={() => { setPixReport(false); close(); }}
          onApproved={() => { setPixReport(false); close(); notify('Relatório liberado! Gere novamente. 🎉', { type: 'success' }); }}
        />
      )}
    </>
  );
};

const StackRow = ({ label, chip }: { label: string; chip: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{label}</Typography>
    <Chip size="small" label={chip} sx={{ height: 20, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(212,165,116,.18)', color: '#b88a54' }} />
  </Box>
);
