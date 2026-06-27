import { Fab } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Botão flutuante "＋ Enviar exame" — só aparece na lista de exames (/exams).
 *
 * Por que mora no AppLayout (e não dentro do <List>): antes o FAB era renderizado
 * DENTRO do ExamList, onde um ancestor podia ter transform/overflow e quebrar o
 * position:fixed (relativo ao ancestor, não ao viewport) — aí o botão caía ATRÁS
 * do rodapé recorrentemente, e ainda dividia z-index (1100) com o MobileBottomNav.
 * Aqui na raiz ele é fixo ao viewport, lê a altura REAL do nav (--me-bottom-nav-h)
 * e usa z-index 1200 (> 1100 do nav). Definitivo.
 */
export const ExamCreateFab = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname !== '/exams') return null;
  return (
    <Fab color="primary" aria-label="Enviar exame" onClick={() => navigate('/exams/create')}
      sx={{
        position: 'fixed',
        right: { xs: 16, sm: 32 },
        bottom: { xs: 'calc(var(--me-bottom-nav-h, 76px) + 14px)', sm: 24 },
        zIndex: 1200,
        bgcolor: '#20b2aa',
        '&:hover': { bgcolor: '#178f89' },
        boxShadow: '0 6px 20px rgba(32,178,170,.35)',
      }}>
      <AddIcon />
    </Fab>
  );
};
