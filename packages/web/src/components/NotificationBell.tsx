import { useEffect, useState } from 'react';
import { IconButton, Badge } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import NotificationsIcon from '@mui/icons-material/Notifications';
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
    <IconButton color="inherit" onClick={() => navigate('/notificacoes')} title="Notificações" size="small" sx={{ flexShrink: 0 }}>
      <Badge badgeContent={unread} color="error" overlap="circular">
        <NotificationsIcon fontSize="small" />
      </Badge>
    </IconButton>
  );
};
