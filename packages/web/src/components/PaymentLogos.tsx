import { Box, Chip } from '@mui/material';

/** Fileira de logos dos providers de pagamento (multi-provider 03/10: OpenPix PIX +
 *  Asaas PIX/cartão + Mercado Pago standby). "MP" = chip de texto (sem logo local).
 *  Path via BASE_URL — APK usa base relativa './'. Alt 20px, opacity .8, gap 8px, wrap. */
export const PaymentLogos = ({ showMp = false, height = 20 }: { showMp?: boolean; height?: number }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
    <Box component="img" src={`${import.meta.env.BASE_URL}logo-openpix.webp`} alt="OpenPix (Woovi)" sx={{ height, width: 'auto', display: 'block', opacity: 0.8 }} />
    <Box component="img" src={`${import.meta.env.BASE_URL}logo-asaas.webp`} alt="Asaas" sx={{ height, width: 'auto', display: 'block', opacity: 0.8 }} />
    {showMp && (
      <Chip label="MP" aria-label="Mercado Pago" sx={{ height, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', borderRadius: '6px', color: 'text.secondary', bgcolor: 'transparent', border: '1px solid', borderColor: 'divider', opacity: 0.8, '& .MuiChip-label': { px: 0.75 } }} />
    )}
  </Box>
);
