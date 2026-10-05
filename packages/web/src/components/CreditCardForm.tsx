import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Button, Typography, Stack, Box,
  CircularProgress, TextField, InputAdornment, Collapse,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/CheckCircle';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LockIcon from '@mui/icons-material/Lock';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { API_URL, token } from '../config';
import { PaymentLogos } from './PaymentLogos';

/**
 * Form de cartão INLINE (Asaas direto — POST /billing/pay-card). Sem redirect.
 *
 * PCI one-shot: os dados do cartão existem SÓ no estado React desta tela e vão
 * direto pro nosso backend (que repassa ao Asaas e descarta). Nada em localStorage,
 * nada em cache do SW, nada persistido no banco (regra espelhada no server).
 *
 * Bandeiras: Visa/Mastercard/Amex/Elo detectadas por BIN (marca tipográfica, sem
 * asset de marca). CVV focado → cartão vira (frente/verso premium em CSS 3D).
 * CEP → ViaCEP autocompleta o logradouro (só exibição — o Asaas pede CEP + número).
 */

type Brand = 'visa' | 'mastercard' | 'amex' | 'elo' | null;

const BRAND_LABEL: Record<Exclude<Brand, null>, string> = {
  visa: 'VISA', mastercard: 'mastercard', amex: 'AMEX', elo: 'elo',
};

// BINs Elo (prefixos principais — não exaustivo, fallback = ícone genérico)
const ELO_BINS = ['4011', '4312', '4389', '4514', '4576', '5041', '5066', '5067', '5090', '6277', '6362', '6363', '6500', '6516', '6550'];

const digits = (v: string) => v.replace(/\D/g, '');

const detectBrand = (num: string): Brand => {
  const n = digits(num);
  if (!n) return null;
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|71|720))/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (ELO_BINS.some((b) => n.startsWith(b))) return 'elo';
  return null;
};

/** Luhn client-side (mesma regra do server — o server revalida, nunca confia). */
const luhnOk = (num: string): boolean => {
  const n = digits(num);
  if (n.length < 13 || n.length > 19) return false;
  let sum = 0, dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
};

const maskCardNumber = (v: string): string => {
  const brand = detectBrand(v);
  const n = digits(v).slice(0, brand === 'amex' ? 15 : 16);
  if (brand === 'amex') return n.replace(/^(\d{4})(\d{0,6})(\d{0,5})$/, (_m, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  return n.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};

const maskExpiry = (v: string): string => {
  const n = digits(v).slice(0, 4);
  if (n.length <= 2) return n;
  return `${n.slice(0, 2)}/${n.slice(2)}`;
};

const maskCpf = (v: string): string => {
  const n = digits(v).slice(0, 11);
  const p = [n.slice(0, 3), n.slice(3, 6), n.slice(6, 9)].filter(Boolean).join('.');
  const dv = n.slice(9);
  return dv ? `${p}-${dv}` : p;
};

const maskCep = (v: string) => digits(v).slice(0, 8).replace(/^(\d{5})(\d{0,3})$/, (_m, a, b) => (b ? `${a}-${b}` : a));

const cpfOk = (v: string): boolean => {
  const n = digits(v);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = (base: string) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (base.length + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return dv(n.slice(0, 9)) === Number(n[9]) && dv(n.slice(0, 10)) === Number(n[10]);
};

const expiryOk = (mm: string, yy: string): boolean => {
  const m = Number(mm), yRaw = digits(yy);
  if (!m || m < 1 || m > 12 || yRaw.length !== 2) return false;
  const y = 2000 + Number(yRaw);
  return new Date(y, m, 1) > new Date(); // vence no fim do mês
};

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

export const CreditCardForm = ({ open, packId, packLabel, price, method, onClose, onApproved, onFinished, onSwitchToPix }: {
  open: boolean;
  packId: string | null;
  packLabel: string;
  price: number;
  /** card = crédito · debit = débito à vista (mesmo form, billingType muda no server) */
  method: 'card' | 'debit';
  /** X/ESC — cancelar (volta pra escolha de forma de pagamento) */
  onClose: () => void;
  /** pagamento aprovado (tela de sucesso pode ainda estar aberta — pai já pode dar notify) */
  onApproved: () => void;
  /** "Concluir" na tela de sucesso — fecha o fluxo inteiro */
  onFinished: () => void;
  /** Alternar direto para PIX caso o cartão seja recusado */
  onSwitchToPix?: () => void;
}) => {
  const [number, setNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState(''); // MM/AA
  const [ccv, setCcv] = useState('');
  const [cpf, setCpf] = useState('');
  const [cep, setCep] = useState('');
  const [cepStreet, setCepStreet] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [addressNumber, setAddressNumber] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [flip, setFlip] = useState(false); // cartão vira no foco do CVV (só visual)
  const [submitting, setSubmitting] = useState(false);
  const [apiErr, setApiErr] = useState('');
  const [result, setResult] = useState<null | { status: string; paymentId: string; threeDSUrl?: string | null }>(null);
  const [approved, setApproved] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const brand = useMemo(() => detectBrand(number), [number]);
  const cvvLen = brand === 'amex' ? 4 : 3;
  const mm = expiry.slice(0, 2);
  const yy = expiry.slice(3, 5);

  // validação em tempo real — erro só depois de tocar no campo (border vermelha + helper)
  const f = {
    number: digits(number).length >= 13 && luhnOk(number),
    holderName: holderName.trim().length >= 3,
    expiry: expiryOk(mm, yy),
    ccv: digits(ccv).length === cvvLen,
    cpf: cpfOk(cpf),
    cep: digits(cep).length === 8,
    addressNumber: addressNumber.trim().length > 0,
  };
  const allOk = Object.values(f).every(Boolean);

  const err = (k: keyof typeof f) => (touched[k] && !f[k]);
  const helper = (k: keyof typeof f, msg: string) => (err(k) ? msg : ' ');

  const onCepBlur = async () => {
    const n = digits(cep);
    if (n.length !== 8 || !/^\d{8}$/.test(n)) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
      const d = await r.json();
      setCepStreet(d?.erro ? '' : `${d.logradouro ?? ''}${d.bairro ? ` — ${d.bairro}` : ''}${d.localidade ? `, ${d.localidade}` : ''}`.trim());
    } catch { setCepStreet(''); }
    setCepLoading(false);
  };

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // desmontou (troca de tela/dialog fechou por fora) → mata o poll (sem zombie).
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPoll = (paymentId: string) => {
    stopPoll();
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(`${API_URL}/billing/payment-status/${paymentId}`, { headers: { Authorization: `Bearer ${token()}` } });
        const d = await r.json();
        if (d?.approved) { stopPoll(); setApproved(true); onApproved(); }
      } catch { /* rede oscilou — segue tentando */ }
      if (tries >= 40) stopPoll(); // ~2min: usuário pode reabrir o app depois (webhook credita igual)
    }, 3000);
  };

  const submit = async () => {
    if (!packId || !allOk || submitting) return;
    setSubmitting(true); setApiErr('');
    try {
      const r = await fetch(`${API_URL}/billing/pay-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          pack: packId, method,
          card: { number: digits(number), holderName: holderName.trim().toUpperCase(), expiryMonth: mm, expiryYear: yy, ccv: digits(ccv) },
          holder: { name: holderName.trim(), cpf: digits(cpf), postalCode: digits(cep), addressNumber: addressNumber.trim() },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Falha ao processar o pagamento.');
      if (d.approved) { setApproved(true); onApproved(); }
      else { setResult({ status: d.status ?? 'PENDING', paymentId: d.paymentId, threeDSUrl: d.threeDSUrl }); startPoll(d.paymentId); }
    } catch (e: any) { setApiErr(e.message || 'Falha ao processar o pagamento.'); }
    setSubmitting(false);
  };

  const close = () => { stopPoll(); onClose(); };

  // ===== telas de resultado =====
  if (approved) {
    return (
      <Dialog open={open} onClose={close} PaperProps={{ sx: { borderRadius: '16px', maxWidth: 400, width: '100%', '@keyframes popIn': { from: { transform: 'scale(.4)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } } } }}>
        <DialogContent sx={{ textAlign: 'center', py: 5, px: 3 }}>
          <CheckIcon sx={{ fontSize: 64, color: 'success.main', animation: 'popIn .45s cubic-bezier(.2,1.4,.4,1)', transformOrigin: 'center' }} />
          <Typography sx={{ fontWeight: 800, fontSize: 20, mt: 1.5 }}>Pagamento aprovado!</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>{packLabel}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Os créditos já estão na sua conta.</Typography>
          <Button variant="contained" fullWidth onClick={() => { stopPoll(); onFinished(); }} sx={{ mt: 3, minHeight: 48, borderRadius: '12px', fontWeight: 800 }}>
            Concluir
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (result) {
    return (
      <Dialog open={open} onClose={close} PaperProps={{ sx: { borderRadius: '16px', maxWidth: 480, width: '100%' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          Autenticação do banco
          <IconButton onClick={close} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 3 }}>
          {result.threeDSUrl ? (
            <Box
              component="iframe" src={result.threeDSUrl} title="Autenticação 3D Secure"
              sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation-by-user-activation"
              sx={{ width: '100%', height: 420, border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper' }}
            />
          ) : (
            <Stack alignItems="center" sx={{ py: 4 }} spacing={2}>
              <CircularProgress size={36} />
              <Typography sx={{ fontWeight: 700 }}>Pagamento em análise…</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                O banco está autorizando a transação. Esta tela fecha sozinha quando confirmar
                (normalmente em segundos).
              </Typography>
            </Stack>
          )}
          <Button variant="outlined" fullWidth onClick={() => { stopPoll(); startPoll(result.paymentId); }} sx={{ mt: 2, minHeight: 44, borderRadius: '12px' }}>
            Já concluí a autenticação
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // ===== form =====
  const t = (k: keyof typeof f) => setTouched((s) => ({ ...s, [k]: true }));

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, extra?: () => void) => {
    if (extra) extra();
    // No Android, o teclado sobe com pequena latência. Scroll suave centraliza o campo visível.
    setTimeout(() => {
      try {
        e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {}
    }, 220);
  };

  const fieldSx = {
    '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper', minHeight: 52 },
    '& .MuiInputBase-input': { fontSize: 16 },
  } as const;

  return (
    <Dialog open={open} onClose={submitting ? () => {} : close} disableEscapeKeyDown={submitting}
      PaperProps={{
        sx: {
          borderRadius: { xs: '24px 24px 0 0', sm: '20px' },
          maxWidth: { xs: '100%', sm: 440 },
          width: '100%',
          m: { xs: 0, sm: 3 },
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          maxHeight: { xs: '90dvh', sm: '92vh' },
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,.28)',
          '@keyframes dxSlideUp': { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
          animation: 'dxSlideUp .32s cubic-bezier(.22,1,.36,1)',
        }
      }}
      slotProps={{ backdrop: { sx: { backdropFilter: 'blur(4px)', bgcolor: 'rgba(0,0,0,.4)' } } }}>
      
      {/* ── Drag handle affordance (mobile) ── */}
      <Box sx={{ display: { xs: 'flex', sm: 'none' }, justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
        <Box sx={{ width: 36, height: 4, borderRadius: 99, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.15)' }} />
      </Box>

      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, px: { xs: 2.5, sm: 3 } }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {method === 'card' ? <CreditCardIcon sx={{ color: '#0369a1' }} /> : <AccountBalanceIcon sx={{ color: '#178f89' }} />}
          <Box>
            <Typography sx={{ fontWeight: 800 }}>{method === 'card' ? 'Cartão de crédito' : 'Cartão de débito'}</Typography>
            <Typography variant="caption" color="text.secondary">{packLabel}</Typography>
          </Box>
        </Stack>
        <IconButton onClick={close} size="small" disabled={submitting}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{
        px: { xs: 2, sm: 3 },
        pt: 1,
        pb: { xs: 'calc(env(safe-area-inset-bottom, 24px) + 72px)', sm: 3 },
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}>
        {/* ===== PREVIEW DO CARTÃO (compacto no mobile para poupar viewport) ===== */}
        <Box sx={{ perspective: 1200, mb: { xs: 1.75, sm: 2.5 }, mt: 0.5 }}>
          <Box sx={{
            position: 'relative', width: '100%', maxWidth: { xs: 270, sm: 330 }, mx: 'auto', aspectRatio: '1.586',
            transformStyle: 'preserve-3d', transition: 'transform .55s cubic-bezier(.2,.8,.3,1)',
            transform: flip ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}>
            {/* FRENTE */}
            <CardFace>
              <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 85% -20%, rgba(255,255,255,.28), transparent 55%)', borderRadius: 'inherit' }} />
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ position: 'relative' }}>
                <Box sx={{
                  width: { xs: 34, sm: 40 }, height: { xs: 24, sm: 28 }, borderRadius: 5, background: 'linear-gradient(135deg,#f5d78e,#c9a24a 60%,#8a6a24)',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.25)',
                }} />
                <Typography sx={{ fontWeight: 900, fontSize: { xs: 13, sm: 15 }, color: '#fff', opacity: 0.95, letterSpacing: 0.5, fontStyle: brand === 'mastercard' ? 'italic' : undefined, textTransform: brand === 'mastercard' ? 'lowercase' : undefined, textShadow: '0 1px 3px rgba(0,0,0,.35)' }}>
                  {brand ? BRAND_LABEL[brand] : '⋯'}
                </Typography>
              </Stack>
              <Typography sx={{ position: 'relative', mt: 'auto', fontFamily: '"Courier New", monospace', fontWeight: 700, fontSize: { xs: 15, sm: 18 }, letterSpacing: 1.5, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.4)' }}>
                {(maskCardNumber(number) || '•••• •••• •••• ••••').padEnd(19, '·')}
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ position: 'relative', mt: 0.5 }}>
                <Box sx={{ minWidth: 0, flex: 1, mr: 1 }}>
                  <Typography sx={{ fontSize: 8, color: 'rgba(255,255,255,.65)', letterSpacing: 1, fontWeight: 700 }}>NOME NO CARTÃO</Typography>
                  <Typography noWrap sx={{ fontSize: { xs: 11, sm: 12 }, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>{holderName || 'SEU NOME'}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 8, color: 'rgba(255,255,255,.65)', letterSpacing: 1, fontWeight: 700 }}>VALIDADE</Typography>
                  <Typography sx={{ fontSize: { xs: 11, sm: 12 }, color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{expiry || 'MM/AA'}</Typography>
                </Box>
              </Stack>
            </CardFace>
            {/* VERSO */}
            <CardFace back>
              <Box sx={{ height: { xs: 34, sm: 42 }, mt: 1.5, bgcolor: 'rgba(10,26,25,.92)', mx: -2.5, boxShadow: 'inset 0 1px 2px rgba(0,0,0,.6)' }} />
              <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ mt: 1.5 }}>
                <Box sx={{ flex: 1, height: 24, bgcolor: 'rgba(255,255,255,.75)', borderRadius: 0.5, mr: 1.5, position: 'relative', overflow: 'hidden' }}>
                  <Typography sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', px: 1, fontSize: 8, color: '#5b6b6a', fontStyle: 'italic' }}>
                    dados impressos no verso do cartão
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 8, color: 'rgba(255,255,255,.65)', fontWeight: 700, letterSpacing: 1, textAlign: 'right' }}>CVV</Typography>
                  <Box sx={{ bgcolor: '#fff', borderRadius: 1, px: 1.25, py: 0.25, minWidth: 46, textAlign: 'right' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14, letterSpacing: 2, color: '#0f1818', fontVariantNumeric: 'tabular-nums' }}>{digits(ccv) || '···'}</Typography>
                  </Box>
                </Box>
              </Stack>
              <Typography sx={{ mt: 'auto', fontSize: 8.5, color: 'rgba(255,255,255,.55)' }}>Processado com segurança pelo Asaas · Dr. Exame</Typography>
            </CardFace>
          </Box>
        </Box>

        <Stack spacing={1.75}>
          <TextField label="Número do cartão" placeholder="0000 0000 0000 0000" fullWidth inputMode="numeric" autoComplete="cc-number"
            value={maskCardNumber(number)} onChange={(e) => setNumber(e.target.value)} onBlur={() => t('number')}
            onFocus={(e) => handleInputFocus(e)}
            error={err('number')} helperText={helper('number', 'Número de cartão inválido — confira os dígitos.')}
            sx={fieldSx} />
          <TextField label="Nome impresso no cartão" placeholder="COMO ESTÁ NO CARTÃO" fullWidth autoComplete="cc-name"
            slotProps={{ htmlInput: { autoCapitalize: 'characters', style: { textTransform: 'uppercase' } } }}
            value={holderName} onChange={(e) => setHolderName(e.target.value.toUpperCase())} onBlur={() => t('holderName')}
            onFocus={(e) => handleInputFocus(e)}
            error={err('holderName')} helperText={helper('holderName', 'Informe o nome impresso no cartão.')} sx={fieldSx} />
          <Stack direction="row" spacing={1.75}>
            <TextField label="Validade" placeholder="MM/AA" inputMode="numeric" fullWidth autoComplete="cc-exp"
              value={expiry} onChange={(e) => setExpiry(maskExpiry(e.target.value))} onBlur={() => t('expiry')}
              onFocus={(e) => handleInputFocus(e)}
              error={err('expiry')} helperText={helper('expiry', 'Validade inválida ou vencida.')} sx={fieldSx} />
            <TextField label="CVV" placeholder={cvvLen === 4 ? '0000' : '000'} inputMode="numeric" type="password" fullWidth autoComplete="cc-csc"
              value={ccv} onChange={(e) => setCcv(digits(e.target.value).slice(0, cvvLen))}
              onFocus={(e) => handleInputFocus(e, () => setFlip(true))}
              onBlur={() => { setFlip(false); t('ccv'); }}
              error={err('ccv')} helperText={helper('ccv', `${cvvLen} dígitos.`)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end"><LockIcon sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment> } }}
              sx={fieldSx} />
          </Stack>

          <TextField label="CPF do titular" placeholder="000.000.000-00" inputMode="numeric" fullWidth
            value={maskCpf(cpf)} onChange={(e) => setCpf(maskCpf(e.target.value))} onBlur={() => t('cpf')}
            onFocus={(e) => handleInputFocus(e)}
            error={err('cpf')} helperText={helper('cpf', 'CPF inválido.')} sx={fieldSx} />
          <Stack direction="row" spacing={1.75}>
            <TextField label="CEP" placeholder="00000-000" inputMode="numeric" sx={{ ...fieldSx, flex: 1 }}
              value={cep} onChange={(e) => setCep(maskCep(e.target.value))} onBlur={() => { t('cep'); void onCepBlur(); }}
              onFocus={(e) => handleInputFocus(e)}
              error={err('cep')} helperText={helper('cep', 'CEP inválido.')}
              slotProps={cepLoading ? { input: { endAdornment: <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment> } } : undefined} />
            <TextField label="Número" placeholder="100" inputMode="numeric" sx={{ ...fieldSx, width: 120 }}
              value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} onBlur={() => t('addressNumber')}
              onFocus={(e) => handleInputFocus(e)}
              error={err('addressNumber')} helperText={helper('addressNumber', 'Obrigatório.')} />
          </Stack>
          <Collapse in={!!cepStreet}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
              📍 {cepStreet}
            </Typography>
          </Collapse>
        </Stack>

        {/* ── ALERTA DE ERRO REDESENHADO: Premium, ultra-legível, com dica e fallback PIX ── */}
        {apiErr && (
          <Box
            role="alert"
            aria-live="assertive"
            sx={{
              mt: 2.5,
              p: 2,
              borderRadius: '14px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 242, 242, 0.96)',
              border: '1px solid',
              borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(248, 113, 113, 0.32)',
              borderLeft: '4px solid #dc2626',
              boxShadow: '0 4px 16px rgba(220, 38, 38, 0.08)',
              animation: 'meShake .35s ease',
              '@keyframes meShake': {
                '0%, 100%': { transform: 'translateX(0)' },
                '20%, 60%': { transform: 'translateX(-4px)' },
                '40%, 80%': { transform: 'translateX(4px)' },
              },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.22)' : 'rgba(254, 226, 226, 0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  mt: 0.2,
                }}
              >
                <ErrorOutlineIcon sx={{ fontSize: 20, color: '#dc2626' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: (t) => t.palette.mode === 'dark' ? '#fca5a5' : '#991b1b', lineHeight: 1.3 }}>
                  Transação não autorizada
                </Typography>
                <Typography sx={{ mt: 0.5, fontSize: 12.5, color: (t) => t.palette.mode === 'dark' ? '#fecaca' : '#7f1d1d', lineHeight: 1.45, fontWeight: 500 }}>
                  {apiErr}
                </Typography>
                <Typography sx={{ mt: 0.75, fontSize: 11.5, color: (t) => t.palette.mode === 'dark' ? '#f87171' : '#b91c1c', lineHeight: 1.4 }}>
                  Dica: Verifique se o cartão está liberado para compras online no app do seu banco ou utilize o PIX instantâneo.
                </Typography>
                {onSwitchToPix && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onSwitchToPix}
                    sx={{
                      mt: 1.25,
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: '8px',
                      textTransform: 'none',
                      color: (t) => t.palette.mode === 'dark' ? '#5fc9c3' : '#0f6e68',
                      borderColor: '#20b2aa',
                      bgcolor: 'rgba(32, 178, 170, 0.08)',
                      '&:hover': {
                        bgcolor: 'rgba(32, 178, 170, 0.16)',
                        borderColor: '#178f89',
                      },
                    }}
                  >
                    Pagar via PIX com aprovação instantânea ⚡
                  </Button>
                )}
              </Box>
            </Stack>
          </Box>
        )}

        <Button variant="contained" fullWidth disabled={!allOk || submitting} onClick={submit}
          sx={{ mt: 2.5, minHeight: 52, borderRadius: '12px', fontWeight: 800, fontSize: 16, textTransform: 'none' }}>
          {submitting ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : <>Pagar {fmtBRL(price)}</>}
        </Button>

        <Stack alignItems="center" sx={{ mt: 1.5 }} spacing={0.5}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <LockIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Seus dados de cartão não são salvos — vão direto ao processador
            </Typography>
          </Stack>
          <PaymentLogos />
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

/** Face do cartão (frente/verso) — gradiente de marca teal, compartilhada. */
const CardFace = ({ children, back }: { children: ReactNode; back?: boolean }) => (
  <Box sx={{
    position: back ? 'absolute' : 'relative', inset: back ? 0 : undefined,
    backfaceVisibility: 'hidden', transform: back ? 'rotateY(180deg)' : undefined,
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    width: '100%', height: '100%', p: 2.5, borderRadius: '18px',
    background: 'linear-gradient(135deg,#0c4a46 0%,#1a9d94 55%,#20b2aa 100%)',
    border: '1px solid rgba(255,255,255,.25)',
    boxShadow: '0 18px 40px rgba(15,61,58,.38), inset 0 1px 0 rgba(255,255,255,.18)',
  }}>
    {children}
  </Box>
);
