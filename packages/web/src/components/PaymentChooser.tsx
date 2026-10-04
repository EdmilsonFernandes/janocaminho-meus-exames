import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Typography, Stack, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { fetchPublicConfig } from '../config';
import { PaymentLogos } from './PaymentLogos';
import { CreditCardForm } from './CreditCardForm';

/** Seletor de forma de pagamento: PIX (QR inline) | Cartão | Débito — cartão/débito
 *  agora são INLINE via Asaas (form próprio, POST /billing/pay-card). O redirect do
 *  Checkout Pro (MP) saiu do fluxo de créditos em 04/10. */
export const PaymentChooser = ({ packId, packLabel, packPrice, onClose, onPix, onCardApproved }: {
  packId: string | null; packLabel: string; packPrice: number; onClose: () => void; onPix: () => void; onCardApproved: () => void;
}) => {
  // Kill-switch payments.cardEnabled (AppSetting) — default ligado (form Asaas no ar).
  const [cardEnabled, setCardEnabled] = useState(true);
  useEffect(() => { fetchPublicConfig().then((c) => setCardEnabled(c.cardEnabled)).catch(() => {}); }, []);

  // 'card' | 'debit' escolhido → troca a tela do diálogo pelo form inline (Asaas).
  const [cardMethod, setCardMethod] = useState<null | 'card' | 'debit'>(null);

  const Opt = ({ icon, title, sub, onClick, color }: any) => (
    <Box component="button" onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', gap: 1.5, py: 1.75, px: 2,
        minHeight: 56, cursor: 'pointer', borderRadius: '12px',
        border: '1px solid', borderColor: 'divider', bgcolor: 'transparent', color: 'text.primary',
        fontFamily: 'inherit', transition: 'border-color .15s ease, background-color .15s ease',
        '&:hover': { borderColor: color, bgcolor: `${color}0d` },
        '&:active': { bgcolor: `${color}17` },
      }}>
      <Box sx={{ mr: 0, color, display: 'flex' }}>{icon}</Box>
      <Box sx={{ textAlign: 'left', flex: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{sub}</Typography>
      </Box>
    </Box>
  );

  // Form de cartão assumiu o diálogo (mesma modal, sem empilhar duas).
  if (cardMethod) {
    return (
      <CreditCardForm
        open={!!packId} packId={packId} packLabel={packLabel} price={packPrice} method={cardMethod}
        onClose={() => setCardMethod(null)}          /* X = volta pra escolha */
        onApproved={onCardApproved}                   /* aprovado: pai notifica/recarrega já */
        onFinished={() => { setCardMethod(null); onClose(); }} /* Concluir: fecha tudo */
      />
    );
  }

  return (
    <Dialog open={!!packId} onClose={onClose} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 400, width: '100%' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        Forma de pagamento
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{packLabel}</Typography>
        <Stack spacing={1.5}>
          <Opt icon={<QrCode2Icon />} title="PIX" sub="Instantâneo • via OpenPix" color="#20b2aa"
            onClick={() => { onPix(); onClose(); }} />
          {cardEnabled && (
            <>
              <Opt icon={<CreditCardIcon />} title="Cartão de crédito" sub="À vista • processado com segurança" color="#0369a1"
                onClick={() => setCardMethod('card')} />
              <Opt icon={<AccountBalanceIcon />} title="Débito" sub="À vista • processado com segurança" color="#178f89"
                onClick={() => setCardMethod('debit')} />
            </>
          )}
        </Stack>


        {/* Selo de confiança (padrão checkout premium): reduz abandono e dúvida "quem é o vendedor". */}
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
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, textAlign: 'center', color: 'text.disabled' }}>
          No extrato do cartão aparece o nome do recebedor registrado
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
