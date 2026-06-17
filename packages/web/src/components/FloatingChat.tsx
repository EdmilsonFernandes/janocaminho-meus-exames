import { Fab } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { DrExame } from './DrExame';

/** Dr. Exame flutuante (FAB) — abre o chat em qualquer página (menos no próprio chat). */
export const FloatingChat = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (pathname.startsWith('/chat')) return null;
  return (
    <Fab
      onClick={() => navigate('/chat')}
      title="Falar com o Dr. Exame"
      sx={{
        position: 'fixed', bottom: { xs: 16, md: 24 }, right: { xs: 16, md: 24 }, zIndex: 1300,
        width: 60, height: 60, bgcolor: 'transparent', boxShadow: '0 6px 18px rgba(32,178,170,.4)',
        '&:hover': { bgcolor: 'transparent', transform: 'scale(1.06)' }, transition: 'transform .15s', overflow: 'hidden',
      }}
    >
      <DrExame size={60} sx={{ borderRadius: '50%', position: 'absolute', width: '100%', height: '100%' }} />
    </Fab>
  );
};
