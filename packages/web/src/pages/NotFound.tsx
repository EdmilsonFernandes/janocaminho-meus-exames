import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
      <DrExame size={80} sx={{ borderRadius: '18%', mb: 2, opacity: 0.6 }} />
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, fontFamily: 'Poppins, sans-serif' }}>Página não encontrada</Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 360 }}>
        O endereço pode estar incorrito ou a página foi movida. Que tal voltar pro painel?
      </Typography>
      <Button variant="contained" size="large" onClick={() => navigate('/')} sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 700 }}>
        ← Voltar ao início
      </Button>
    </Box>
  );
};
