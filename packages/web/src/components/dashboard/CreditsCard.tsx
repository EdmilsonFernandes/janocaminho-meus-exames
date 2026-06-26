import { Box, Card, CardContent, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';

// Card de créditos (verde premium). (Refinamento visual = task #13; aqui extração do JSX original.)
export const CreditsCard = ({ credits, onClick }: { credits: number | null; onClick: () => void }) => {
  if (credits == null) return null;
  return (
    <Card onClick={onClick} sx={{ mt: 2, mb: 2, cursor: 'pointer', borderRadius: 4, background: 'linear-gradient(135deg, rgba(16,185,129,.10), rgba(16,185,129,.04))', border: '1px solid #6ee7b7', boxShadow: '0 4px 14px rgba(16,185,129,.12)', '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 8px 20px rgba(16,185,129,.2)' }, transition: 'all .15s' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Box sx={{ width: 46, height: 46, borderRadius: 2.5, background: 'rgba(16,185,129,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BoltIcon sx={{ color: '#059669', fontSize: 26 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#065f46', lineHeight: 1.1 }}>{credits.toLocaleString('pt-BR')} <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: '#047857' }}>créditos disponíveis</Box></Typography>
          <Typography variant="caption" sx={{ color: '#047857' }}>Toque para comprar mais ou ver o extrato</Typography>
        </Box>
        <Typography variant="button" sx={{ color: '#059669', fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>Planos →</Typography>
      </CardContent>
    </Card>
  );
};
