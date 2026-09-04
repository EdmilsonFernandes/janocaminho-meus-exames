import { Box, Stack, Typography, Chip } from '@mui/material';

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Box sx={{ mb: 1.5 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
      <Box>
        <Typography sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: { xs: '1.5rem', sm: '1.9rem' }, lineHeight: 1.15, textWrap: 'balance' }}>{saudacao()}, {firstName || 'tudo bem?'} 👋</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', textWrap: 'pretty', mt: 0.25, display: 'block' }}>Seu painel de saúde — educativo, não substitui o médico.</Typography>
      </Box>
      <Chip label="● Sincronizado" size="small" sx={{ bgcolor: 'rgba(32,178,170,0.1)', color: '#0f6e68', fontWeight: 700, fontSize: 11, height: 22, display: { xs: 'none', sm: 'inline-flex' } }} />
    </Stack>
  </Box>
);
