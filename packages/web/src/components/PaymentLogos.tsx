import { Box } from '@mui/material';

/** Fileira de logos dos providers de pagamento (multi-provider 03/10: OpenPix PIX +
 *  Asaas PIX/cartão). Mercado Pago NÃO aparece aqui: só é fallback invisível —
 *  o selo reflete quem processa de verdade (Asaas/OpenPix geram o PIX).
 *  Path via BASE_URL — APK usa base relativa './'. Alt 20px, opacity .8, gap 8px, wrap. */
export const PaymentLogos = ({ height = 20 }: { height?: number }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
    <Box component="img" src={`${import.meta.env.BASE_URL}logo-openpix.webp`} alt="OpenPix" sx={{ height, width: 'auto', display: 'block', opacity: 0.8 }} />
    <Box component="img" src={`${import.meta.env.BASE_URL}logo-asaas.webp`} alt="Asaas" sx={{ height, width: 'auto', display: 'block', opacity: 0.8 }} />
  </Box>
);
