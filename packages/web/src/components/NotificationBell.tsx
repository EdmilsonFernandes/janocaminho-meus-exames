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
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUnread(d?.unread ?? 0))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 60000); // atualiza a cada 60s
    const onRead = () => setUnread(0);
    window.addEventListener('notificationsRead', onRead);
    return () => { clearInterval(iv); window.removeEventListener('notificationsRead', onRead); };
  }, []);
  return (
    <IconButton color="inherit" onClick={() => navigate('/notificacoes')} title="Notificações" aria-label="Notificações"
      sx={{
        flexShrink: 0, p: 1, ml: 0.5, borderRadius: 2, // respiro — não fica espremido ao lado do switcher
        transition: 'background-color .18s ease',
        '&:hover': { bgcolor: 'action.hover' },
      }}>
      <Badge badgeContent={unread} color="error" overlap="circular"
        sx={{ '& .MuiBadge-badge': { fontSize: 10.5, fontWeight: 700, height: 18, minWidth: 18, padding: '0 4px', top: 3, right: 3 } }}>
        <NotificationsNoneIcon sx={{ fontSize: 22 }} />
      </Badge>
    </IconButton>
  );
};
