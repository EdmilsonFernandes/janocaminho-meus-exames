import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { DrExame } from './DrExame';

/** Popup de notificação: mostra ao entrar (se há não-lidas) + quando push chega (foreground). */
export const NotificationPopup = () => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ title: string; body: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = token();
    if (!t) return;
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.unread > 0 && d.items?.length > 0) {
          setData({ title: d.items[0].title, body: d.items[0].body });
          setTimeout(() => setOpen(true), 2000); // 2s após entrar (deixa o app carregar)
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onReceived = (e: any) => {
      setData({ title: e.detail?.title || 'Nova notificacao', body: e.detail?.body || '' });
      setOpen(true);
    };
    const onTapped = () => navigate('/notificacoes');
    window.addEventListener('pushReceived', onReceived);
    window.addEventListener('pushTapped', onTapped);
    return () => { window.removeEventListener('pushReceived', onReceived); window.removeEventListener('pushTapped', onTapped); };
  }, [navigate]);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 380 } }}>
      {data && (<>
        <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
          <Stack alignItems="center" spacing={1}>
            <DrExame size={44} sx={{ borderRadius: '50%' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{data.title}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>{data.body}</Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3, gap: 1 }}>
          <Button variant="outlined" onClick={() => setOpen(false)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Depois</Button>
          <Button variant="contained" onClick={() => { setOpen(false); navigate('/notificacoes'); }} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' }}>Ver notificacoes</Button>
        </DialogActions>
      </>)}
    </Dialog>
  );
};
