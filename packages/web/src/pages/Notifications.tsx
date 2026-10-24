import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import { Box, Card, CardContent, Typography, Button, Stack, List, ListItemButton, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Chip, alpha } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { API_URL, token } from '../config';
import { notifRoute } from '../utils/notifRoute';
import { DrExame } from '../components/DrExame';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { tealText } from '../theme';

const TYPE_META: Record<string, { emoji: string; color: string }> = {
  alert: { emoji: '🔴', color: '#ef4444' },
  trend: { emoji: '📈', color: '#f59e0b' },
  reminder: { emoji: '📅', color: '#0ea5e9' },
  info: { emoji: '✨', color: '#20b2aa' },
  ticket: { emoji: '💬', color: '#20b2aa' },
  share_exam_prompt: { emoji: '🩺', color: '#20b2aa' },
};
const fmtDt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const [view, setView] = useState<any | null>(null);
  const [data, setData] = useState<{ items: any[]; unread: number } | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'info' | 'alert' | 'ticket'>('all');
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
  // §4 (spec teleconsulta): 1 toque da notificação "compartilhar com Dr. X?" adiciona
  // só ESTE exame ao share por-exame (POST /doctor-shares/:id/exams) — sem re-compartilhar.
  const [shared, setShared] = useState<Record<string, boolean>>({});
  const [sharingId, setSharingId] = useState<string | null>(null);
  const shareExamFromPrompt = async (n: any) => {
    const shareId = n?.data?.shareId;
    const examId = n?.data?.examId;
    if (!shareId || !examId || sharingId || shared[n.id]) return;
    setSharingId(n.id);
    try {
      const r = await fetch(`${API_URL}/doctor-shares/${shareId}/exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ examId }),
      });
      if (r.ok) { setShared((s) => ({ ...s, [n.id]: true })); markOne(n.id); }
    } catch { /* offline: botão continua — retry manual */ }
    setSharingId(null);
  };
  const items = data?.items ?? [];
  const displayedItems = items.filter((n) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'info') return n.type === 'info' || n.type === 'trend' || n.type === 'share_exam_prompt' || !n.type;
    if (filterTab === 'alert') return n.type === 'alert' || n.type === 'reminder';
    if (filterTab === 'ticket') return n.type === 'ticket';
    return true;
  });
  return (
    <PageContainer width="content">
      <PageHeader
        icon={<NotificationsIcon />}
        title={translate('page.notifications')}
        actions={!!data?.unread ? <Button size="small" variant="outlined" onClick={markAll}>{translate('notif.mark_all')}</Button> : undefined}
      />

      {/* Filtros de categoria */}
      {data && items.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: 'auto', py: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
          {[
            { key: 'all', label: 'Todas' },
            { key: 'info', label: '💡 Dicas & IA' },
            { key: 'alert', label: '⚠️ Alertas' },
            { key: 'ticket', label: '💬 Chamados' },
          ].map((c) => {
            const active = filterTab === c.key;
            return (
              <Chip
                key={c.key}
                size="small"
                label={c.label}
                onClick={() => setFilterTab(c.key as any)}
                sx={{
                  height: 30,
                  fontWeight: active ? 800 : 600,
                  fontSize: 12,
                  bgcolor: active ? '#20b2aa' : (t: Theme) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  color: active ? '#ffffff' : 'text.primary',
                  border: '1px solid',
                  borderColor: active ? '#20b2aa' : 'transparent',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: active ? '#178f89' : 'rgba(32,178,170,0.12)' },
                }}
              />
            );
          })}
        </Stack>
      )}

      {!data && <ListSkeleton count={4} />}
      {data && displayedItems.length === 0 && (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>{translate('notif.empty')}</Typography></CardContent></Card>
      )}
      {data && displayedItems.length > 0 && (
        <Stack spacing={1.25}>
          {displayedItems.map((n) => {
            const m = TYPE_META[n.type] ?? TYPE_META.info;
            const r = notifRoute(n);
            const praMatch = n.title?.match(/pra\s+([A-Za-zÀ-ÿ]+)/i);
            const targetPerson = praMatch ? praMatch[1] : null;

            return (
              <Box
                key={n.id}
                component="button"
                onClick={() => {
                  if (!n.read) markOne(n.id);
                  if (r) navigate(r);
                  else setView(n);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                  p: 2,
                  borderRadius: '18px',
                  border: '1px solid',
                  borderColor: (t) => !n.read
                    ? alpha(m.color, t.palette.mode === 'dark' ? 0.35 : 0.25)
                    : (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                  borderLeft: (t) => !n.read ? `4px solid ${m.color}` : undefined,
                  bgcolor: (t) => !n.read
                    ? (t.palette.mode === 'dark' ? alpha(m.color, 0.08) : alpha(m.color, 0.04))
                    : (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                  boxShadow: !n.read
                    ? `0 6px 20px -6px ${alpha(m.color, 0.18)}`
                    : 'none',
                  transition: 'all .2s ease',
                  '&:hover': {
                    borderColor: m.color,
                    transform: 'translateY(-1px)',
                    boxShadow: `0 8px 24px -4px ${alpha(m.color, 0.22)}`,
                  },
                  '&:active': { transform: 'scale(0.995)' },
                }}
              >
                <Box sx={{
                  width: 42,
                  height: 42,
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 20,
                  bgcolor: `${m.color}15`,
                  color: m.color,
                  mr: 1.75,
                  mt: 0.25,
                  flexShrink: 0,
                  boxShadow: `0 2px 10px ${alpha(m.color, 0.15)}`,
                }}>
                  {m.emoji}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25, flexWrap: 'wrap', gap: 0.5 }}>
                    {!n.read && (
                      <Chip
                        size="small"
                        label="Nova"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 800,
                          bgcolor: m.color,
                          color: '#ffffff',
                          borderRadius: '6px',
                        }}
                      />
                    )}
                    {targetPerson && (
                      <Chip
                        size="small"
                        label={`👤 ${targetPerson}`}
                        sx={{
                          height: 18,
                          fontSize: 10.5,
                          fontWeight: 700,
                          bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12),
                          color: 'primary.main',
                          borderRadius: '6px',
                        }}
                      />
                    )}
                    <Typography sx={{
                      fontWeight: n.read ? 700 : 800,
                      fontSize: 15,
                      color: 'text.primary',
                      flex: 1,
                      minWidth: 0,
                      lineHeight: 1.25,
                    }}>
                      {n.title}
                    </Typography>
                  </Stack>
                  <Typography sx={{
                    fontSize: 13.5,
                    color: 'text.secondary',
                    mt: 0.5,
                    lineHeight: 1.5,
                  }}>
                    {n.body}
                  </Typography>
              {n.type === 'share_exam_prompt' && !!n.data?.shareId && !!n.data?.examId && (
                <Button
                  size="small"
                  disableElevation
                  variant={shared[n.id] ? 'outlined' : 'contained'}
                  disabled={!!shared[n.id] || sharingId === n.id}
                  onClick={(e) => { e.stopPropagation(); void shareExamFromPrompt(n); }}
                  sx={{ mt: 1, borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: 12.5, alignSelf: 'flex-start' }}
                >
                  {shared[n.id] ? 'Compartilhado ✓' : sharingId === n.id ? 'Compartilhando…' : 'Compartilhar agora'}
                </Button>
              )}
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                    <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontWeight: 600 }}>
                      {fmtDt(n.createdAt)}
                    </Typography>
                    <Typography sx={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: m.color,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.25,
                    }}>
                      {r ? 'Ver →' : 'Ler completo →'}
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
        Conteúdo educativo — não substitui o médico.
      </Typography>

      {/* Popup p/ notificações PURAMENTE informativas (sem tela pra levar): visual ultra-premium */}
      <Dialog
        open={!!view}
        onClose={() => setView(null)}
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
              fontSize: 18,
              fontFamily: '"Poppins",sans-serif',
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
            }}>
              {view?.title}
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
            {view?.body}
          </Typography>
          {view?.createdAt && (
            <Typography sx={{
              fontSize: 12,
              fontWeight: 600,
              color: 'text.disabled',
              textAlign: 'center',
              mt: 2,
            }}>
              {fmtDt(view.createdAt)}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', p: 0, mt: 2.5 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setView(null)}
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
              }
            }}
          >
            Entendido
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
