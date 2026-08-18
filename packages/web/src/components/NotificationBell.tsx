import { useEffect, useState } from 'react';
import { IconButton, Badge } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { API_URL, token } from '../config';

/** Sino de notificações no AppBar — badge com nº de não lidas. */
export const NotificationBell = () => {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const load = () => {
    // Anônimo na landing: NÃO dispara (era 1 dos 21 requests 401 do boot anônimo — auditoria)
    if (!token()) return;
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUnread(d?.unread ?? 0))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 60000); // atualiza a cada 60s
    const onRead = () => setUnread(0);
    // Refresh quando uma notificação pode ter chegado (ex.: bônus de 1º exame ao concluir extração)
    // ou quando o usuário volta pro app (focus/visibility) — antes só aparecia no re-login.
    const onChange = () => load();
    window.addEventListener('notificationsRead', onRead);
    window.addEventListener('notificationsChanged', onChange);
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      clearInterval(iv);
      window.removeEventListener('notificationsRead', onRead);
      window.removeEventListener('notificationsChanged', onChange);
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, []);
  return (
    <IconButton color="inherit" onClick={() => navigate('/notificacoes')} title="Notificações" aria-label="Notificações"
      sx={{
        flexShrink: 0, p: 1, ml: 1, borderRadius: '12px', // respiro — não fica espremido ao lado do switcher
        transition: 'background-color .18s ease',
        '&:hover': { bgcolor: 'action.hover' },
      }}>
      {/* Cap "9+": contador cru ("36") é manchete de e-mail, não sinal clínico — em app de saúde,
          badge gigante dessensibiliza p/ o dia em que a notificação IMPORTA (resultado novo).
          Vermelho #d32f2f: branco sobre ele = ~5:1 (o #ef4444 padrão dava 3,8:1 — reprovar AA). */}
      <Badge badgeContent={unread > 9 ? '9+' : unread} color="error" overlap="circular"
        sx={{ '& .MuiBadge-badge': { fontSize: 11, fontWeight: 700, height: 18, minWidth: 18, padding: '0 4px', top: 3, right: 3, bgcolor: '#d32f2f', color: '#fff' } }}>
        <NotificationsNoneIcon sx={{ fontSize: 22 }} />
      </Badge>
    </IconButton>
  );
};
