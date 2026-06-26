import { Box, Typography } from '@mui/material';

// Header compacto do dashboard. (Redesign visual = task #10; aqui é só extração do JSX original.)
export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Box sx={{ mb: 0.5 }}>
    <Typography variant="h5" sx={{ fontWeight: 800 }}>Olá, {firstName || 'tudo bem?'} 👋</Typography>
    <Typography variant="body2" color="text.secondary">Seu painel de saúde — educativo, não substitui o médico.</Typography>
  </Box>
);
