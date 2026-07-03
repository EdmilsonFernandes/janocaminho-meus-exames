import { Box, Typography } from '@mui/material';

// Saudação por horário do dia. Compacto (header visual = task #10).
const hr = new Date().getHours();
const SAUDACAO = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';

export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Box sx={{ mb: 1 }}>
    <Typography sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: { xs: '1.5rem', sm: '1.9rem' }, lineHeight: 1.15 }}>{SAUDACAO}, {firstName || 'tudo bem?'} 👋</Typography>
    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Seu painel de saúde — educativo, não substitui o médico.</Typography>
  </Box>
);
