import { Fab } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';

/** Dr. Exame flutuante (FAB) — abre o chat em qualquer página (menos no próprio chat). */
export const FloatingChat = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (pathname.startsWith('/chat')) return null;
  return (
    <Fab
      onClick={() => navigate('/chat')}
      title="Falar com o Dr. Exame"
      color="primary"
      sx={{
        position: 'fixed', bottom: { xs: 16, md: 24 }, right: { xs: 16, md: 24 }, zIndex: 1300,
        boxShadow: '0 6px 18px rgba(32,178,170,.4)', '&:hover': { transform: 'scale(1.06)' }, transition: 'transform .15s',
      }}
    >
      <ChatBubbleIcon />
    </Fab>
  );
};
