import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { DrExame } from './DrExame';
import { notifRoute } from '../utils/notifRoute';

export const NotificationPopup = () => {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState<{ id?: string; title: string; body: string; data?: any } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = token();
    if (!t) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dead = false;
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead) return;
        if (d && d.unread > 0 && d.items && d.items.length > 0) {
          const item = d.items[0];
          // Não reabre notificação já dispensada: o "Depois" persiste o id. Sem isto, todo boot
          // com unread>0 reinterpõe o modal (irritante — sempre há não-lidas no app de saúde).
          let dismissedId: string | null = null;
          try { dismissedId = localStorage.getItem('meDismissedNotif'); } catch { /* ignore */ }
          if (dismissedId != null && String(item.id) === String(dismissedId)) return;
          setNotif({ id: item.id, title: item.title, body: item.body });
          // Só abre se o app tá visível — evita dialog fantasma pipocando depois
          // de voltar do background (parecia "app travado" após ocioso).
          timer = setTimeout(() => { if (!document.hidden) setOpen(true); }, 2500);
        }
      })
      .catch(() => {});
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const onReceived = (e: any) => {
      setNotif({ title: (e.detail && e.detail.title) || 'Nova notificacao', body: (e.detail && e.detail.body) || '', data: (e.detail && e.detail.data) || {} });
      setOpen(true);
    };
    // Toque na notificação (tray): leva direto à tela certa (perguntas/exames/...) — não deixa "morta".
    const onTapped = (e: any) => navigate(notifRoute({ data: e?.detail?.data }) || '/notificacoes');
    window.addEventListener('pushReceived', onReceived);
    window.addEventListener('pushTapped', onTapped);
    return () => {
      window.removeEventListener('pushReceived', onReceived);
      window.removeEventListener('pushTapped', onTapped);
    };
  }, [navigate]);

  if (!notif) return null;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 420 } }}>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Stack alignItems="center" spacing={1}>
          <DrExame size={48} sx={{ borderRadius: '50%' }} />
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{notif.title}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ textAlign: 'center', lineHeight: 1.6, fontSize: 16, whiteSpace: 'pre-wrap' }}>{notif.body}</Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 3, gap: 1 }}>
        <Button variant="outlined" onClick={() => { try { if (notif?.id != null) localStorage.setItem('meDismissedNotif', String(notif.id)); } catch { /* ignore */ } setOpen(false); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Depois</Button>
        <Button variant="contained" onClick={() => { setOpen(false); navigate(notifRoute(notif) || '/notificacoes'); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa' }}>{notifRoute(notif) ? 'Ver agora' : 'Ver notificações'}</Button>
      </DialogActions>
    </Dialog>
  );
};
