import { useEffect, useState } from 'react';
import { Dialog, DialogContent, IconButton, Typography, Stack, Box, Button, Fade, alpha } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BoltIcon from '@mui/icons-material/Bolt';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { fetchPublicConfig } from '../config';
import { CreditCardForm } from './CreditCardForm';

/** Seletor de forma de pagamento premium (padrão Revolut/Nubank bottom-sheet):
 *  PIX (QR inline) | Cartão | Débito — cartão/débito são INLINE via Asaas
 *  (form próprio, POST /billing/pay-card). O redirect do Checkout Pro (MP)
 *  saiu do fluxo de créditos em 04/10.
 *
 *  Redesenhado em 05/10: radio cards com seleção animada, CTA dinâmico,
 *  trust badges profissionais (sem logos de processador), order summary
 *  com tradução de valor, bottom-sheet layout no mobile. */

type PayMethod = 'pix' | 'card' | 'debit';
const METHODS: Record<PayMethod, { title: string; sub: string; trust: string; ctaVerb: string; color: string; bgLight: string }> = {
  pix:   { title: 'PIX',               sub: 'Aprovação em segundos · QR Code ou copia-e-cola',       trust: 'Criptografia de ponta a ponta',              ctaVerb: 'PIX',    color: '#20b2aa', bgLight: 'rgba(32,178,170,.08)' },
  card:  { title: 'Cartão de crédito',  sub: 'Visa, Mastercard, Elo, Amex · à vista',                trust: 'Dados vão direto ao processador — não são salvos', ctaVerb: 'cartão',  color: '#2563eb', bgLight: 'rgba(37,99,235,.07)' },
  debit: { title: 'Cartão de débito',   sub: 'Débito à vista · sai direto da conta',                 trust: 'Dados vão direto ao processador — não são salvos', ctaVerb: 'débito',  color: '#7c3aed', bgLight: 'rgba(124,58,237,.07)' },
};
const METHOD_ICON: Record<PayMethod, React.ReactNode> = {
  pix:   <QrCode2Icon />,
  card:  <CreditCardIcon />,
  debit: <AccountBalanceIcon />,
};

/** Extrai créditos numéricos do packLabel ("140 créditos • R$ 24,90" → 140). */
const extractCredits = (label: string): number => {
  const m = label.match(/(\d+)\s*cr[eé]ditos?/i);
  return m ? Number(m[1]) : 0;
};

export const PaymentChooser = ({ packId, packLabel, packPrice, onClose, onPix, onCardApproved }: {
  packId: string | null; packLabel: string; packPrice: number; onClose: () => void; onPix: () => void; onCardApproved: () => void;
}) => {
  // Kill-switch payments.cardEnabled (AppSetting) — default ligado (form Asaas no ar).
  const [cardEnabled, setCardEnabled] = useState(true);
  useEffect(() => { fetchPublicConfig().then((c) => setCardEnabled(c.cardEnabled)).catch(() => {}); }, []);

  // Seleção de método (radio card) + form de cartão inline (Asaas).
  const [selected, setSelected] = useState<PayMethod>('pix');
  const [cardMethod, setCardMethod] = useState<null | 'card' | 'debit'>(null);

  const credits = extractCredits(packLabel);
  const fmtPrice = `R$ ${packPrice.toFixed(2).replace('.', ',')}`;
  const m = METHODS[selected];

  const confirm = () => {
    if (selected === 'pix') { onPix(); onClose(); }
    else setCardMethod(selected);
  };

  // Form de cartão assumiu o diálogo (mesma modal, sem empilhar duas).
  if (cardMethod) {
    return (
      <CreditCardForm
        open={!!packId} packId={packId} packLabel={packLabel} price={packPrice} method={cardMethod}
        onClose={() => setCardMethod(null)}          /* X = volta pra escolha */
        onApproved={onCardApproved}                   /* aprovado: pai notifica/recarrega já */
        onFinished={() => { setCardMethod(null); onClose(); }} /* Concluir: fecha tudo */
        onSwitchToPix={() => { setCardMethod(null); onPix(); onClose(); }}
      />
    );
  }

  return (
    <Dialog
      open={!!packId} onClose={onClose}
      PaperProps={{ sx: {
        borderRadius: { xs: '24px 24px 0 0', sm: '20px' },
        maxWidth: 420, width: '100%', m: { xs: 0, sm: 3 },
        position: { xs: 'fixed', sm: 'relative' },
        bottom: { xs: 0, sm: 'auto' },
        maxHeight: { xs: '90dvh', sm: '88vh' },
        // Slide-up feel on mobile via transition override
        '@keyframes dxSlideUp': { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        animation: 'dxSlideUp .35s cubic-bezier(.22,1,.36,1)',
      } }}
      slotProps={{ backdrop: { sx: { backdropFilter: 'blur(4px)', bgcolor: 'rgba(0,0,0,.35)' } } }}
    >
      <DialogContent sx={{ p: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {/* ── Drag handle (mobile affordance) ── */}
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 99, bgcolor: (t) => alpha(t.palette.divider, 0.6) }} />
        </Box>

        {/* ── Header ── */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, pt: { xs: 1, sm: 2.5 }, pb: 0.5 }}>
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 18 }}>
            Como quer pagar?
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ bgcolor: (t) => alpha(t.palette.divider, 0.15), '&:hover': { bgcolor: (t) => alpha(t.palette.divider, 0.3) } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>

        {/* ── Order summary ── */}
        <Box sx={{
          mx: 2.5, mt: 1.5, p: 1.75, borderRadius: '14px',
          background: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,.08)' : 'linear-gradient(135deg, rgba(32,178,170,.06), rgba(32,178,170,.02))',
          border: '1px solid', borderColor: (t) => alpha('#20b2aa', t.palette.mode === 'dark' ? 0.2 : 0.12),
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <Box sx={{
            width: 42, height: 42, borderRadius: '12px', flexShrink: 0,
            background: 'linear-gradient(135deg,#20b2aa,#178f89)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(32,178,170,.25)',
          }}>
            <BoltIcon sx={{ color: '#fff', fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
              {credits > 0 ? `${credits} créditos de IA` : packLabel}
            </Typography>
            {credits > 0 && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                ~{Math.floor(credits / 10)} resumos · ~{Math.floor(credits / 2)} perguntas
              </Typography>
            )}
          </Box>
          <Typography sx={{
            fontFamily: '"Poppins",sans-serif', fontWeight: 900, fontSize: 18,
            color: (t) => t.palette.mode === 'dark' ? '#5fc9c3' : '#0f6e68',
            letterSpacing: '-0.02em', whiteSpace: 'nowrap',
          }}>
            {fmtPrice}
          </Typography>
        </Box>

        {/* ── Section label ── */}
        <Typography sx={{
          px: 2.5, pt: 2.25, pb: 1, fontSize: 11.5, fontWeight: 700,
          color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Escolha a forma
        </Typography>

        {/* ── Payment options (radio cards) ── */}
        <Stack spacing={1.25} sx={{ px: 2.5 }} role="radiogroup" aria-label="Forma de pagamento">
          {(['pix', ...(cardEnabled ? ['card', 'debit'] as const : [])] as PayMethod[]).map((key) => {
            const opt = METHODS[key];
            const on = selected === key;
            return (
              <Box
                key={key}
                component="button"
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSelected(key)}
                onDoubleClick={confirm}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
                  p: 1.75, borderRadius: '14px', cursor: 'pointer',
                  border: '2px solid', fontFamily: 'inherit', textAlign: 'left',
                  borderColor: on ? opt.color : 'divider',
                  bgcolor: on ? (t) => alpha(opt.color, t.palette.mode === 'dark' ? 0.12 : 0.03) : 'transparent',
                  boxShadow: on ? `0 0 0 1px ${alpha(opt.color, 0.12)}` : 'none',
                  transition: 'all .2s ease',
                  color: 'text.primary',
                  '&:hover': { borderColor: on ? opt.color : (t) => alpha(t.palette.divider, 1), bgcolor: on ? undefined : (t) => alpha(t.palette.divider, 0.06) },
                  '&:active': { transform: 'scale(.99)' },
                }}
              >
                {/* Radio dot */}
                <Box sx={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  border: '2px solid', borderColor: on ? opt.color : 'divider',
                  bgcolor: on ? opt.color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .2s ease',
                }}>
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#fff',
                    transform: on ? 'scale(1)' : 'scale(0)',
                    transition: 'transform .2s cubic-bezier(.2,1.4,.4,1)',
                  }} />
                </Box>

                {/* Icon */}
                <Box sx={{
                  width: 44, height: 44, borderRadius: '13px', flexShrink: 0,
                  background: opt.bgLight, color: opt.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  '& svg': { fontSize: 22 },
                  transition: 'background-color .2s ease',
                }}>
                  {METHOD_ICON[key]}
                </Box>

                {/* Text */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{opt.title}</Typography>
                    {key === 'pix' && (
                      <Box sx={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        fontSize: 10, fontWeight: 800, color: (t) => t.palette.mode === 'dark' ? '#5fc9c3' : '#0f6e68',
                        bgcolor: (t) => alpha('#20b2aa', t.palette.mode === 'dark' ? 0.18 : 0.10), px: 1, py: '2px',
                        borderRadius: 99, letterSpacing: '.02em', lineHeight: 1.4,
                      }}>
                        ⚡ Instantâneo
                      </Box>
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: '1px', lineHeight: 1.35 }}>
                    {opt.sub}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.75 }}>
                    <ShieldOutlinedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                    <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontWeight: 500 }}>
                      {opt.trust}
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            );
          })}
        </Stack>

        {/* ── CTA dinâmico ── */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Button
            fullWidth variant="contained" onClick={confirm}
            endIcon={<ArrowForwardIcon sx={{ fontSize: 18, transition: 'transform .2s ease' }} />}
            sx={{
              fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15,
              textTransform: 'none', borderRadius: 99, py: 1.6,
              bgcolor: m.color, color: '#fff',
              boxShadow: `0 6px 20px ${alpha(m.color, 0.3)}`,
              transition: 'background-color .25s ease, box-shadow .25s ease, transform .15s ease',
              position: 'relative', overflow: 'hidden',
              '&::before': {
                content: '""', position: 'absolute', inset: 0,
                background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,.12) 50%, transparent 60%)',
                transform: 'translateX(-120%)', transition: 'transform .55s ease',
              },
              '&:hover': {
                bgcolor: m.color, filter: 'brightness(1.08)',
                boxShadow: `0 8px 28px ${alpha(m.color, 0.4)}`,
                transform: 'translateY(-1px)',
                '&::before': { transform: 'translateX(120%)' },
                '& .MuiButton-endIcon': { transform: 'translateX(3px)' },
              },
              '&:active': { transform: 'scale(.98)' },
            }}
          >
            Pagar com {m.ctaVerb} · {fmtPrice}
          </Button>
        </Box>

        {/* ── Trust footer (05/10 v2): uma linha, sem quebrar palavra; atributos reais
             de segurança (não logo de processador, não selo vazio). ── */}
        <Box sx={{ px: 2.5, pt: 0.5, pb: 2.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.75} sx={{ mb: 0.75 }}>
            <Box sx={{
              width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: (t) => alpha('#16a34a', t.palette.mode === 'dark' ? 0.2 : 0.1),
            }}>
              <LockOutlinedIcon sx={{ fontSize: 11, color: '#16a34a' }} />
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Pagamento 100% seguro
            </Typography>
          </Stack>
          <Stack
            direction="row" justifyContent="center" alignItems="center" flexWrap="wrap" useFlexGap
            columnGap={1.25} rowGap={0.5}
            sx={{ '& svg': { fontSize: 13, color: 'text.disabled' } }}
          >
            {([
              { icon: <VerifiedUserOutlinedIcon />, label: 'Criptografia SSL' },
              { icon: <ShieldOutlinedIcon />, label: 'Cartão não fica salvo' },
              { icon: <LockOutlinedIcon />, label: 'LGPD' },
            ]).map((b, i) => (
              <Stack key={b.label} direction="row" alignItems="center" spacing={0.4} sx={{ whiteSpace: 'nowrap' }}>
                {i > 0 && <Box component="span" sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled', opacity: 0.6, mr: 0.85 }} />}
                {b.icon}
                <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: 'text.disabled' }}>{b.label}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
