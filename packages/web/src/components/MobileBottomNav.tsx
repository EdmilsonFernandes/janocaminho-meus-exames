import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

/** Menu rodapé fixo (só mobile) — acesso rápido às funções principais.
 *  Resolve o "precisa rolar pra ver o menu" no chat e dá navegação sempre à mão. */
const ITEMS = [
  { icon: '🏠', label: 'Início', to: '/' },
  { icon: '📋', label: 'Exames', to: '/exams' },
  { icon: '🤖', label: 'Dr. Exame', to: '/chat' },
  { icon: '📈', label: 'Evolução', to: '/evolucao' },
  { icon: '👤', label: 'Perfil', to: '/perfil' },
];

export const MobileBottomNav = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!isMobile) return null;
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  return (
    <Box component="nav" sx={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100,
      display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
      bgcolor: 'rgba(255,255,255,.97)', backdropFilter: 'blur(14px)',
      borderTop: '1px solid #dceaea', pb: 'env(safe-area-inset-bottom)',
      boxShadow: '0 -6px 24px rgba(32,178,170,.10)',
    }}>
      {ITEMS.map((it) => {
        const on = active(it.to);
        return (
          <Box key={it.to} onClick={() => navigate(it.to)} sx={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            py: 0.6, cursor: 'pointer', userSelect: 'none', color: on ? '#178f89' : '#8a979c',
            transition: 'color .15s, transform .1s', '&:active': { transform: 'scale(.92)' },
          }}>
            <Box sx={{ fontSize: 21, lineHeight: 1, filter: on ? 'none' : 'grayscale(.2)', transform: on ? 'translateY(-1px)' : 'none', transition: 'transform .15s' }}>{it.icon}</Box>
            <Typography sx={{ fontSize: 10, fontWeight: on ? 800 : 600, mt: 0.25, fontFamily: 'Poppins, sans-serif' }}>{it.label}</Typography>
            <Box sx={{ height: 3, width: on ? 22 : 0, borderRadius: 9, bgcolor: '#20b2aa', mt: 0.3, transition: 'width .2s' }} />
          </Box>
        );
      })}
    </Box>
  );
};
