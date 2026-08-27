import { Box, Typography, Button, Stack, Card } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';
import HomeIcon from '@mui/icons-material/Home';
import ScienceIcon from '@mui/icons-material/Science';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import DiamondIcon from '@mui/icons-material/Diamond';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';

const float = keyframes`0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}`;
const fadeUp = keyframes`from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}`;

const SHORTCUTS = [
  { label: 'Meus exames', hint: 'Histórico e laudos', to: '/exams', icon: <ScienceIcon fontSize="small" />, color: '#178f89' },
  { label: 'Evolução', hint: 'Gráficos ao longo do tempo', to: '/evolucao', icon: <ShowChartIcon fontSize="small" />, color: '#f59e0b' },
  { label: 'Planos', hint: 'Créditos e assinatura', to: '/planos', icon: <DiamondIcon fontSize="small" />, color: '#6366f1' },
  { label: 'Suporte', hint: 'Abra um chamado', to: '/suporte', icon: <SupportAgentIcon fontSize="small" />, color: '#ef4444' },
];

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{
      minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', p: 3, textAlign: 'center',
    }}>
      {/* Mascote flutuando */}
      <Box sx={{ animation: `${float} 3s ease-in-out infinite`, mb: 2 }}>
        <DrExame size={90} sx={{ borderRadius: '22%', opacity: 0.85, boxShadow: '0 16px 40px rgba(0,0,0,.12)' }} />
      </Box>

      {/* 404 com estilo */}
      <Typography sx={{
        fontWeight: 900, fontSize: { xs: 64, sm: 80 }, lineHeight: 1,
        fontFamily: 'Poppins, sans-serif',
        background: 'linear-gradient(135deg, #20b2aa, #178f89, #0c4a46)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.04em', mb: 0.5,
        animation: `${fadeUp} .5s ease both`,
      }}>404</Typography>

      <Typography variant="h5" sx={{
        fontWeight: 800, mb: 1, fontFamily: 'Poppins, sans-serif',
        animation: `${fadeUp} .5s ease both`, animationDelay: '.1s',
      }}>Página não encontrada</Typography>

      <Typography color="text.secondary" sx={{
        mb: 3.5, maxWidth: 400, lineHeight: 1.6,
        animation: `${fadeUp} .5s ease both`, animationDelay: '.15s',
      }}>
        O endereço pode estar incorreto ou a página foi movida. Vamos te colocar de volta nos trilhos.
      </Typography>

      <Button
        variant="contained" size="large"
        startIcon={<HomeIcon />}
        onClick={() => navigate('/')}
        sx={{
          borderRadius: '999px', px: 4.5, py: 1.5, textTransform: 'none',
          fontWeight: 800, fontSize: 16,
          bgcolor: '#20b2aa',
          boxShadow: '0 8px 24px rgba(32,178,170,.3)',
          '&:hover': { bgcolor: '#178f89', boxShadow: '0 12px 32px rgba(32,178,170,.35)' },
          mb: 4.5,
          animation: `${fadeUp} .5s ease both`, animationDelay: '.2s',
        }}
      >
        Voltar ao início
      </Button>

      <Typography variant="overline" sx={{
        color: 'text.secondary', letterSpacing: '0.12em', mb: 2, fontWeight: 700,
        animation: `${fadeUp} .5s ease both`, animationDelay: '.25s',
      }}>Ou tente por aqui</Typography>

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
        gap: 1.5, maxWidth: 560, width: '100%',
        animation: `${fadeUp} .5s ease both`, animationDelay: '.3s',
      }}>
        {SHORTCUTS.map(({ label, hint, to, icon, color }) => (
          <Card
            key={to}
            onClick={() => navigate(to)}
            variant="outlined"
            sx={{
              cursor: 'pointer', p: 2, borderRadius: '16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', gap: 0.75,
              transition: 'all .25s ease',
              '&:hover': {
                borderColor: color, transform: 'translateY(-3px)',
                boxShadow: `0 8px 24px ${color}22`,
              },
            }}
          >
            <Box sx={{
              width: 40, height: 40, borderRadius: '12px',
              display: 'grid', placeItems: 'center',
              bgcolor: `${color}14`, color,
            }}>{icon}</Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{hint}</Typography>
          </Card>
        ))}
      </Box>
    </Box>
  );
};
