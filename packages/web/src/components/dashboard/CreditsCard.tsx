import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';

// Card de créditos — elegante, horizontal, ícone + número grande + botão "Comprar" visível.
export const CreditsCard = ({ credits, onClick }: { credits: number | null; onClick: () => void }) => {
  if (credits == null) return null;
  return (
    <Card sx={{ mt: 2, mb: 2, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.03))', border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2.5, background: 'rgba(32,178,170,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BoltIcon sx={{ color: 'primary.dark', fontSize: 26 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 26, color: 'primary.dark', lineHeight: 1 }}>{credits.toLocaleString('pt-BR')}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>créditos disponíveis</Typography>
        </Box>
        <Button variant="contained" color="primary" size="small" onClick={onClick} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 1.1, flexShrink: 0 }}>Comprar</Button>
      </CardContent>
    </Card>
  );
};
