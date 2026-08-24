import type { ReactNode } from 'react';
import { Box, Button, CardContent, Stack } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { AppCard } from '../AppCard';

// Card hero da IA (Dr. Exame): robô + estrela + dica (tip) + CTA "Conversar com a IA".
// `tip` é o nó <AiTip/> (robô DrExame + ✨ + texto da dica). IA = diferencial do app.
// overflow:hidden corta a estrela decorativa (right:-10) sem estourar o scrollWidth (fix 360px).
export const AiCard = ({ tip, onChat }: { tip: ReactNode; onChat: () => void }) => (
  <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{ mt: 2, position: 'relative', overflow: 'hidden' }}>
    <AutoAwesomeIcon sx={{ position: 'absolute', right: -10, bottom: -16, fontSize: 130, color: '#d4a574', opacity: 0.12, pointerEvents: 'none' }} />
    <CardContent sx={{ position: 'relative' }}>
      <Stack spacing={1.5}>
        {tip}
        <Box>
          <Button variant="contained" size="small" startIcon={<AutoAwesomeIcon />} onClick={onChat} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, py: { xs: 0.9, sm: 1.1 }, px: { xs: 2, sm: 3 }, width: { xs: '100%', sm: 'auto' }, background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: '0 4px 12px rgba(32,178,170,.30)' }}>Conversar com a IA</Button>
        </Box>
      </Stack>
    </CardContent>
  </AppCard>
);
