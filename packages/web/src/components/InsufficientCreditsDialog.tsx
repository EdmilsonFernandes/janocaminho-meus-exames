import { useEffect, useState } from 'react';
import { Dialog, DialogContent, Box, Typography, Button, Chip, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { CREDITS_INSUFFICIENT_EVENT } from '../utils/credits-events';
import { usePlanInfo, fmtBRL } from '../utils/planInfo';
import { useCredits } from '../hooks/useCredits';
import { PixModal } from './PixModal';
import { useNotify } from 'react-admin';

/**
 * Dialog global de CRÉDITOS INSUFICIENTES (402 de qualquer feature de IA).
 * Escuta o evento `creditsInsufficient` (credits-events.ts) disparado pelos callers.
 *
 * UX (pedido do dono 14/10): animação + sugestão de compra do pack MAIS BARATO —
 * compra em 1 toque (PixModal embutido), sem sair da tela em que o usuário estava.
 */
export const InsufficientCreditsDialog = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const notify = useNotify();
  const { credits } = useCredits();
  const plans = usePlanInfo();
  const [detail, setDetail] = useState<{ cost?: number; message?: string } | null>(null);
  const [pixPack, setPixPack] = useState<string | null>(null);

  useEffect(() => {
    const onInsufficient = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setDetail({ cost: typeof d.cost === 'number' ? d.cost : undefined, message: typeof d.message === 'string' ? d.message : undefined });
    };
    window.addEventListener(CREDITS_INSUFFICIENT_EVENT, onInsufficient);
    return () => window.removeEventListener(CREDITS_INSUFFICIENT_EVENT, onInsufficient);
  }, []);

  // Pack mais barato primeiro (entrada mínima — pedido explícito do dono).
  const cheapest = plans?.packs?.length ? [...plans.packs].sort((a, b) => a.price - b.price)[0] : null;
  const close = () => { setDetail(null); };

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

          {cheapest && (
            <Box sx={{
              p: 1.75, mb: 2, borderRadius: '14px', textAlign: 'left',
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
            </Box>
          )}

          {cheapest ? (
            <Button
              fullWidth variant="contained" disableElevation
              onClick={() => setPixPack(cheapest.id)}
              sx={{
                minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 15,
                background: 'linear-gradient(135deg,#20b2aa,#178f89)',
                '&:hover': { background: 'linear-gradient(135deg,#178f89,#178f89)' },
              }}
            >
              Comprar {cheapest.credits} créditos · {fmtBRL(cheapest.price)}
            </Button>
          ) : (
            <Button fullWidth variant="contained" onClick={() => { close(); navigate('/planos'); }} sx={{ minHeight: 46, borderRadius: 12, textTransform: 'none', fontWeight: 800 }}>
              Ver pacotes
            </Button>
          )}
          <Button fullWidth size="small" onClick={() => { close(); navigate('/planos'); }}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
            Comparar todos os planos →
          </Button>
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
    </>
  );
};

const StackRow = ({ label, chip }: { label: string; chip: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{label}</Typography>
    <Chip size="small" label={chip} sx={{ height: 20, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(212,165,116,.18)', color: '#b88a54' }} />
  </Box>
);
