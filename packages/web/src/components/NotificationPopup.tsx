import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { DrExame } from './DrExame';

export const NotificationPopup = () => {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState<{ title: string; body: string } | null>(null);
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
          setNotif({ title: d.items[0].title, body: d.items[0].body });
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
      setNotif({ title: (e.detail && e.detail.title) || 'Nova notificacao', body: (e.detail && e.detail.body) || '' });
      setOpen(true);
    };
    const onTapped = () => navigate('/notificacoes');
    window.addEventListener('pushReceived', onReceived);
    window.addEventListener('pushTapped', onTapped);
    return () => {
      window.removeEventListener('pushReceived', onReceived);
      window.removeEventListener('pushTapped', onTapped);
    };
  }, [navigate]);

  if (!notif) return null;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 380 } }}>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Stack alignItems="center" spacing={1}>
          <DrExame size={44} sx={{ borderRadius: '50%' }} />
          <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{notif.title}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>{notif.body}</Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 3, gap: 1 }}>
        <Button variant="outlined" onClick={() => setOpen(false)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Depois</Button>
        <Button variant="contained" onClick={() => { setOpen(false); navigate('/notificacoes'); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa' }}>Ver notificacoes</Button>
      </DialogActions>
    </Dialog>
  );
};
