import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { DrExame } from './DrExame';
import { notifRoute } from '../utils/notifRoute';
import { claimColdDialog } from '../utils/coldDialog';

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
          // Não surfar notificação VELHA: nudges de engajamento antigos (ex.: "envie seu 1º exame"
          // numa conta que JÁ tem exames) pipocavam como dialog na entrada, meses depois, em estado
          // mentiroso. Só notificação recente (<7d) e que não seja nudge de 1º exame vira popup.
          const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
          const item = d.items.find((n: any) => n.type !== 'first_exam' && Date.now() - new Date(n.createdAt).getTime() < FRESH_MS);
          if (!item) return;
          // Não reabre notificação já dispensada: o "Depois" persiste o id. Sem isto, todo boot
          // com unread>0 reinterpõe o modal (irritante — sempre há não-lidas no app de saúde).
          let dismissedId: string | null = null;
          try { dismissedId = localStorage.getItem('meDismissedNotif'); } catch { /* ignore */ }
          if (dismissedId != null && String(item.id) === String(dismissedId)) return;
          setNotif({ id: item.id, title: item.title, body: item.body });
          // Só abre se o app tá visível — evita dialog fantasma pipocando depois
          // de voltar do background (parecia "app travado" após ocioso).
          // + Máx 1 diálogo de cold-load por SESSÃO (P1 bateria 2026-09): se WhatsNew/GoalQuiz
          // já abriram nesta sessão, a notificação fica pro badge/bell, não vira modal.
          timer = setTimeout(() => { if (!document.hidden && claimColdDialog('notif')) setOpen(true); }, 2500);
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
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(15, 24, 24, 0.45)',
          }
        }
      }}
      PaperProps={{
        sx: {
          borderRadius: '24px',
          maxWidth: 420,
          width: '92%',
          p: { xs: 2.5, sm: 3 },
          position: 'relative',
          overflow: 'hidden',
          background: (t) => t.palette.mode === 'dark'
            ? 'radial-gradient(ellipse at 50% -20%, rgba(32,178,170,0.22), transparent 70%), #131d1d'
            : 'radial-gradient(ellipse at 50% -20%, rgba(32,178,170,0.18), transparent 70%), #ffffff',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(32,178,170,0.2)',
        }
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', p: 0, mb: 1.5 }}>
        <Stack alignItems="center" spacing={1.5}>
          <Box sx={{
            p: 0.5,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(32,178,170,0.3), rgba(212,165,116,0.3))',
            boxShadow: '0 8px 24px rgba(32,178,170,0.25)',
          }}>
            <DrExame size={52} sx={{ borderRadius: '50%' }} />
          </Box>
          <Typography sx={{
            fontWeight: 800,
            fontSize: 19,
            fontFamily: '"Poppins",sans-serif',
            color: 'text.primary',
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
          }}>
            {notif.title}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: 0, my: 1 }}>
        <Typography sx={{
          textAlign: 'center',
          lineHeight: 1.6,
          fontSize: 14.5,
          color: 'text.secondary',
          whiteSpace: 'pre-wrap',
        }}>
          {notif.body}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', p: 0, mt: 2.5, gap: 1.25, width: '100%' }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={() => {
            try { if (notif?.id != null) localStorage.setItem('meDismissedNotif', String(notif.id)); } catch {}
            setOpen(false);
          }}
          sx={{
            borderRadius: '999px',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: 14,
            py: 1.2,
            borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
            color: 'text.secondary',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            }
          }}
        >
          Ver depois
        </Button>
        <Button
          fullWidth
          variant="contained"
          onClick={() => {
            if (notif?.id) {
              fetch(`${API_URL}/notifications/${notif.id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
              window.dispatchEvent(new Event('notificationsRead'));
            }
            setOpen(false);
            navigate(notifRoute(notif) || '/notificacoes');
          }}
          sx={{
            borderRadius: '999px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: 14,
            py: 1.2,
            background: 'linear-gradient(135deg, #20b2aa, #178f89)',
            boxShadow: '0 6px 18px rgba(32,178,170,0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1ea39b, #137772)',
              boxShadow: '0 8px 24px rgba(32,178,170,0.45)',
            }
          }}
        >
          {notifRoute(notif) ? 'Ver agora' : 'Ver detalhes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
