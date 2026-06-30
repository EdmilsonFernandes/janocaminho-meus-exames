import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Button, CircularProgress, Stack, Chip } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { API_URL, token } from '../config';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

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
  const [data, setData] = useState<{ items: any[]; unread: number } | null>(null);
  const load = () => fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.json()).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  const markAll = async () => {
    await fetch(`${API_URL}/notifications/read-all`, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } });
    window.dispatchEvent(new Event('notificationsRead'));
    load();
  };
  const items = data?.items ?? [];
  return (
    <PageContainer width="content">
      <PageHeader
        icon={<NotificationsIcon />}
        title="Notificações"
        actions={!!data?.unread ? <Button size="small" variant="outlined" onClick={markAll}>Marcar todas como lidas</Button> : undefined}
      />
      {!data && <CircularProgress />}
      {data && items.length === 0 && (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Sem notificações. O Dr. Exame vai te avisar sobre seus exames por aqui. 🔔</Typography></CardContent></Card>
      )}
      {data && items.length > 0 && (
        <Stack spacing={1.25}>
          {items.map((n) => {
            const m = TYPE_META[n.type] ?? TYPE_META.info;
            return (
              <Card key={n.id} variant="outlined" onClick={() => { if (n.data?.examId) navigate(`/exams/${n.data.examId}/show`); else if (n.data?.ticketId) navigate(`/suporte/${n.data.ticketId}`); }} sx={{ cursor: (n.data?.examId || n.data?.ticketId) ? 'pointer' : 'default', borderColor: n.read ? 'divider' : `${m.color}55`, borderLeft: `4px solid ${m.color}`, opacity: n.read ? 0.7 : 1 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ fontSize: 18 }}>{m.emoji}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{n.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.5 }}>{n.body}</Typography>
                      <Typography variant="caption" color="text.secondary">{fmtDt(n.createdAt)}</Typography>
                    </Box>
                    {!n.read && <Chip size="small" label="nova" sx={{ height: 20, bgcolor: `${m.color}1a`, color: m.color, fontWeight: 700 }} />}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
        Conteúdo educativo — não substitui o médico.
      </Typography>
    </PageContainer>
  );
};
