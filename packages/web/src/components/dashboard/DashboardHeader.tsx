import { Box, Typography } from '@mui/material';

// Saudação por horário do dia. Compacto (header visual = task #10).
// Computada NO RENDER (era const de módulo: congelava na 1ª carga — app aberto
// pela madrugada saudava "Boa tarde" às 23h59... e "Bom dia" eterno após reload às 6h).
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Box sx={{ mb: 1 }}>
    <Typography sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: { xs: '1.5rem', sm: '1.9rem' }, lineHeight: 1.15, textWrap: 'balance' }}>{saudacao()}, {firstName || 'tudo bem?'} 👋</Typography>
    <Typography variant="caption" sx={{ color: 'text.secondary', textWrap: 'pretty' }}>Seu painel de saúde — educativo, não substitui o médico.</Typography>
  </Box>
);
