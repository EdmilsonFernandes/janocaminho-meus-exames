import { useEffect, useRef, useState } from 'react';
import { BellButton } from '@/components/reui/app-header';
import { useNavigate } from 'react-router-dom';
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
    <BellButton unread={unread} ringing={!!pulse} onClick={() => navigate('/notificacoes')} />
  );
};
