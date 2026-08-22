import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

const SHORTCUTS = [
  { label: 'Meus exames', hint: 'Histórico e laudos', to: '/exams' },
  { label: 'Evolução', hint: 'Gráficos ao longo do tempo', to: '/evolucao' },
  { label: 'Planos', hint: 'Créditos e assinatura', to: '/planos' },
  { label: 'Suporte', hint: 'Abra um chamado', to: '/suporte' },
];

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '75vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
      <DrExame size={80} sx={{ borderRadius: '18%', mb: 2, opacity: 0.6 }} />
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, fontFamily: 'Poppins, sans-serif' }}>Página não encontrada</Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 380 }}>
        O endereço pode estar incorreto ou a página foi movida. Vamos te colocar de volta nos trilhos.
      </Typography>
      <Button variant="contained" size="large" onClick={() => navigate('/')} sx={{ borderRadius: '999px', px: 4, textTransform: 'none', fontWeight: 700, mb: 4 }}>
        ← Voltar ao início
      </Button>
      <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.08em', mb: 1.5 }}>Tente por aqui</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, maxWidth: 560 }}>
        {SHORTCUTS.map(({ label, hint, to }) => (
          <Box
            key={to}
            onClick={() => navigate(to)}
            sx={{
              cursor: 'pointer', p: 1.75, borderRadius: '14px', border: '1px solid', borderColor: 'divider',
              bgcolor: 'background.paper', transition: 'all .2s',
              '&:hover': { borderColor: '#20b2aa', boxShadow: '0 6px 16px rgba(32,178,170,0.14)', transform: 'translateY(-2px)' },
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{hint}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
