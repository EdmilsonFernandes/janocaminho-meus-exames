import { Box, Typography } from '@mui/material';

// Saudação por horário do dia. Compacto (header visual = task #10).
const hr = new Date().getHours();
const SAUDACAO = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';

export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Box sx={{ mb: 0.5 }}>
    <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>{SAUDACAO}, {firstName || 'tudo bem?'} 👋</Typography>
    <Typography variant="body2" color="text.secondary">Seu painel de saúde — educativo, não substitui o médico.</Typography>
  </Box>
);
