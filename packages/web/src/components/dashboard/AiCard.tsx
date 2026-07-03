import type { ReactNode } from 'react';
import { Box, Button, Card, CardContent, Stack } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

// Card hero da IA (Dr. Exame): robô + estrela + dica (tip) + CTA "Conversar com a IA".
// `tip` é o nó <AiTip/> (robô DrExame + ✨ + texto da dica). IA = diferencial do app.
export const AiCard = ({ tip, onChat }: { tip: ReactNode; onChat: () => void }) => (
  <Card sx={{ mt: 2, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(32,178,170,.12), rgba(212,165,116,.08))', border: '1px solid', borderColor: 'rgba(32,178,170,.25)' }}>
    <AutoAwesomeIcon sx={{ position: 'absolute', right: -10, bottom: -16, fontSize: 130, color: '#d4a574', opacity: 0.12, pointerEvents: 'none' }} />
    <CardContent sx={{ position: 'relative' }}>
      <Stack spacing={1.5}>
        {tip}
        <Box>
          <Button variant="contained" size="small" startIcon={<AutoAwesomeIcon />} onClick={onChat} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: '0 4px 12px rgba(32,178,170,.30)' }}>Conversar com a IA</Button>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);
