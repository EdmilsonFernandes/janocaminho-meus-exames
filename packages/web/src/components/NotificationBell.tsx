import { useEffect, useRef, useState } from 'react';
import { IconButton, Badge } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { API_URL, token } from '../config';
import { snackbar } from './ConfirmDialog';

/** Sino de notificações no AppBar — badge com nº de não lidas + TOAST quando chega
 *  NOVA notificação com o app aberto (dono/Heloisa 19/10: "não recebi nada na tela,
 *  tive que abrir o sininho" — web não tem push FCM; o toast dá o toque em tempo real). */
export const NotificationBell = () => {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [pulse, setPulse] = useState(false);
  // 1ª carga é silenciosa (marca o que já existe como visto) — toast só no NOVO.
  const initialized = useRef(false);
  const lastSeenId = useRef<string | null>(null);
  try { lastSeenId.current = lastSeenId.current ?? localStorage.getItem('dx_last_notif_id'); } catch { /* noop */ }

  const load = () => {
    // Anônimo na landing: NÃO dispara (era 1 dos 21 requests 401 do boot anônimo — auditoria)
    if (!token()) return;
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setUnread(d?.unread ?? 0);
        const newest: any = d?.items?.[0];
        if (!newest?.id) return;
        if (!initialized.current) {
          initialized.current = true;
          lastSeenId.current = newest.id;
          try { localStorage.setItem('dx_last_notif_id', newest.id); } catch { /* noop */ }
          return;
        }
        if (newest.id !== lastSeenId.current && document.visibilityState === 'visible') {
          lastSeenId.current = newest.id;
          try { localStorage.setItem('dx_last_notif_id', newest.id); } catch { /* noop */ }
          // Toast com o título da notificação; teleconsulta ganha atalho direto.
          const isTele = /teleconsulta/i.test(`${newest.title ?? ''} ${newest.body ?? ''}`);
          snackbar({
            message: `🔔 ${newest.title ?? 'Nova notificação'}${newest.body ? ` — ${String(newest.body).slice(0, 90)}` : ''}${isTele ? ' · Veja em Lembretes' : ''}`,
            severity: 'info',
          });
          setPulse(true);
          setTimeout(() => setPulse(false), 3600);
        } else if (newest.id !== lastSeenId.current) {
          lastSeenId.current = newest.id;
          try { localStorage.setItem('dx_last_notif_id', newest.id); } catch { /* noop */ }
        }
      })
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000); // 30s: toast de nova notificação chega rápido (web não tem push FCM)
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
        // Pulso quando a notificação NOVA chega (toast + sino chama atenção)
        ...(pulse && {
          animation: 'dxBellRing 1.1s ease-in-out 3',
          '@keyframes dxBellRing': {
            '0%, 100%': { transform: 'rotate(0deg) scale(1)' },
            '20%': { transform: 'rotate(-14deg) scale(1.08)' },
            '40%': { transform: 'rotate(12deg) scale(1.06)' },
            '60%': { transform: 'rotate(-8deg) scale(1.04)' },
            '80%': { transform: 'rotate(6deg) scale(1.02)' },
          },
        }),
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
