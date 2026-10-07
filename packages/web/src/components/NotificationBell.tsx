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
    <IconButton
      color="inherit"
      onClick={() => navigate('/notificacoes')}
      title={unread > 0 ? `${unread} nova(s) notificação(ões)` : 'Notificações'}
      aria-label="Notificações"
      sx={(t) => ({
        flexShrink: 0,
        p: '9px',
        ml: 0.75,
        borderRadius: '12px',
        border: unread > 0
          ? `1px solid ${t.palette.mode === 'dark' ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.24)'}`
          : '1px solid transparent',
        bgcolor: unread > 0
          ? (t.palette.mode === 'dark' ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)')
          : 'transparent',
        boxShadow: unread > 0
          ? (t.palette.mode === 'dark' ? '0 2px 8px rgba(245,158,11,0.2)' : '0 2px 8px rgba(245,158,11,0.14)')
          : 'none',
        transition: 'all .2s ease',
        '&:hover': {
          bgcolor: unread > 0
            ? (t.palette.mode === 'dark' ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.16)')
            : 'action.hover',
          transform: 'translateY(-1px)',
        },
      })}
    >
      <Badge
        badgeContent={unread > 9 ? '9+' : unread}
        color="error"
        overlap="circular"
        sx={(t) => ({
          '& .MuiBadge-badge': {
            fontSize: 11,
            fontWeight: 800,
            height: 17,
            minWidth: 17,
            padding: '0 4px',
            top: 2,
            right: 2,
            bgcolor: '#dc2626',
            color: '#fff',
            border: `2px solid ${t.palette.mode === 'dark' ? '#162020' : '#ffffff'}`,
            boxShadow: '0 2px 5px rgba(220,38,38,0.35)',
          },
        })}
      >
        <NotificationsNoneIcon
          sx={(t) => ({
            fontSize: 22,
            color: unread > 0
              ? (t.palette.mode === 'dark' ? '#fbbf24' : '#d97706')
              : 'text.primary',
            filter: unread > 0 ? 'drop-shadow(0 1px 2px rgba(217,119,6,0.25))' : 'none',
            transition: 'color .2s ease, transform .2s ease',
          })}
        />
      </Badge>
    </IconButton>
  );
};
