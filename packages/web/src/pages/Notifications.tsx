import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import { Box, Card, CardContent, Typography, Button, Stack, List, ListItemButton, Divider, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { API_URL, token } from '../config';
import { notifRoute } from '../utils/notifRoute';
import { DrExame } from '../components/DrExame';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';

const TYPE_META: Record<string, { emoji: string; color: string }> = {
  alert: { emoji: '🔴', color: '#ef4444' },
  trend: { emoji: '📈', color: '#f59e0b' },
  reminder: { emoji: '📅', color: '#0ea5e9' },
  info: { emoji: '✨', color: '#20b2aa' },
  ticket: { emoji: '💬', color: '#178f89' },
};
const fmtDt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const [view, setView] = useState<any | null>(null);
  const [data, setData] = useState<{ items: any[]; unread: number } | null>(null);
  const load = () => fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.json()).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  const markAll = async () => {
    await fetch(`${API_URL}/notifications/read-all`, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } });
    window.dispatchEvent(new Event('notificationsRead'));
    load();
  };
  // Marca UMA notificação como lida ao clicar nela (antes só "marcar todas" fazia isso — clicar
  // deixava ela "nova" e o badge não baixava). Atualiza o estado local + avisa o badge do header.
  const markOne = (id: string) => {
    fetch(`${API_URL}/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
    setData((d) => d ? { ...d, items: d.items.map((n) => (n.id === id ? { ...n, read: true } : n)), unread: Math.max(0, d.unread - 1) } : d);
    window.dispatchEvent(new Event('notificationsRead'));
  };
  const items = data?.items ?? [];
  return (
    <PageContainer width="content">
      <PageHeader
        icon={<NotificationsIcon />}
        title={translate('page.notifications')}
        actions={!!data?.unread ? <Button size="small" variant="outlined" onClick={markAll}>{translate('notif.mark_all')}</Button> : undefined}
      />
      {!data && <ListSkeleton count={4} />}
      {data && items.length === 0 && (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>{translate('notif.empty')}</Typography></CardContent></Card>
      )}
      {data && items.length > 0 && (
        /* Lista LEVE (audit Onda A): era 1 Card por notificação (36 cards + 36 sombras +
           borderLeft 4px = side-tab "tell de UI de IA"). Agora: linha + divisor + ícone tonal.
           Não-lida = dot colorido + opacidade cheia (não chip). Mesmo clique/comportamento. */
        <List disablePadding>
          {items.map((n, i) => {
            const m = TYPE_META[n.type] ?? TYPE_META.info;
            return (
              <React.Fragment key={n.id}>
                <ListItemButton alignItems="flex-start" onClick={() => { if (!n.read) markOne(n.id); const r = notifRoute(n); if (r) navigate(r); else setView(n); }}
                  sx={{ py: 1.5, px: 1, borderRadius: '12px', opacity: n.read ? 0.66 : 1, '&:hover': { bgcolor: 'action.hover' } }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'grid', placeItems: 'center', fontSize: 18, bgcolor: `${m.color}14`, color: m.color, mr: 1.5, mt: 0.25, flexShrink: 0 }}>{m.emoji}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      {!n.read && <Box aria-label="não lida" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.color, flexShrink: 0 }} />}
                      <Typography sx={{ fontWeight: n.read ? 700 : 800, fontSize: 15, flex: 1, minWidth: 0 }}>{n.title}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.5 }}>{n.body}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDt(n.createdAt)}</Typography>
                  </Box>
                </ListItemButton>
                {i < items.length - 1 && <Divider component="li" />}
              </React.Fragment>
            );
          })}
        </List>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
        Conteúdo educativo — não substitui o médico.
      </Typography>

      {/* Popup p/ notificações PURAMENTE informativas (sem tela pra levar): mostra o texto maior/fácil de ler. */}
      <Dialog open={!!view} onClose={() => setView(null)} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 400 } }}>
        <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
          <Stack alignItems="center" spacing={1}>
            <DrExame size={48} sx={{ borderRadius: '50%' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: '"Poppins",sans-serif' }}>{view?.title}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{view?.body}</Typography>
          {view?.createdAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1.5 }}>{fmtDt(view.createdAt)}</Typography>}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button variant="contained" onClick={() => setView(null)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa' }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
