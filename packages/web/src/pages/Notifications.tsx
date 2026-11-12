import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import { API_URL, token } from '../config';
import { notifRoute } from '../utils/notifRoute';
import { DrExame } from '../components/DrExame';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { CrossInsightBottomSheet, type CrossInsightData } from '../components/clinical/CrossInsightBottomSheet';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { IconTile, type ReuiTone } from '@/components/reui/patterns';
import {
  BellNotificationIcon,
  SirenEmergencyIcon,
  PulseIcon,
  MessageTextIcon,
  FirstAidKitIcon,
  MessageQuestionIcon,
} from '@/components/reui/icons';

const TYPE_META: Record<
  string,
  {
    tone: ReuiTone;
    badgeVariant: 'default' | 'destructive' | 'warning' | 'info' | 'success';
    categoryLabel: string;
    icon: (size?: number) => React.ReactNode;
  }
> = {
  alert: {
    tone: 'destructive',
    badgeVariant: 'destructive',
    categoryLabel: 'Alerta clínico',
    icon: (size = 18) => <SirenEmergencyIcon size={size} />,
  },
  trend: {
    tone: 'warning',
    badgeVariant: 'warning',
    categoryLabel: 'Tendência',
    icon: (size = 18) => <PulseIcon size={size} />,
  },
  reminder: {
    tone: 'info',
    badgeVariant: 'info',
    categoryLabel: 'Lembrete',
    icon: (size = 18) => <BellNotificationIcon size={size} />,
  },
  info: {
    tone: 'primary',
    badgeVariant: 'default',
    categoryLabel: 'Dica & IA',
    icon: (size = 18) => <MessageQuestionIcon size={size} />,
  },
  ticket: {
    tone: 'primary',
    badgeVariant: 'info',
    categoryLabel: 'Suporte',
    icon: (size = 18) => <MessageTextIcon size={size} />,
  },
  share_exam_prompt: {
    tone: 'success',
    badgeVariant: 'success',
    categoryLabel: 'Médico',
    icon: (size = 18) => <FirstAidKitIcon size={size} />,
  },
};

const fmtDt = (d: string) =>
  new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const themeClass = useReuiThemeSync();
  const [view, setView] = useState<any | null>(null);
  const [crossInsightView, setCrossInsightView] = useState<CrossInsightData | null>(null);
  const [data, setData] = useState<{ items: any[]; unread: number } | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'info' | 'alert' | 'ticket'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  useEffect(() => {
    const handleCustomInsight = (e: any) => {
      if (e.detail) setCrossInsightView(e.detail);
    };
    window.addEventListener('openCrossInsight', handleCustomInsight);
    return () => window.removeEventListener('openCrossInsight', handleCustomInsight);
  }, []);

  const load = () =>
    fetch(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const markAll = async () => {
    await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}` },
    });
    window.dispatchEvent(new Event('notificationsRead'));
    load();
  };

  // Marca UMA notificação como lida ao clicar nela (atualiza estado local + avisa o badge do header).
  const markOne = (id: string) => {
    fetch(`${API_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}` },
    }).catch(() => {});
    setData((d) =>
      d
        ? {
            ...d,
            items: d.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
            unread: Math.max(0, d.unread - 1),
          }
        : d
    );
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ examId }),
      });
      if (r.ok) {
        setShared((s) => ({ ...s, [n.id]: true }));
        markOne(n.id);
      }
    } catch {
      /* offline: botão continua — retry manual */
    }
    setSharingId(null);
  };

  const items = data?.items ?? [];

  const matchesCategory = (n: any, cat: 'all' | 'info' | 'alert' | 'ticket') => {
    if (cat === 'all') return true;
    if (cat === 'info')
      return (
        n.type === 'info' ||
        n.type === 'trend' ||
        n.type === 'share_exam_prompt' ||
        !n.type
      );
    if (cat === 'alert') return n.type === 'alert' || n.type === 'reminder';
    if (cat === 'ticket') return n.type === 'ticket';
    return true;
  };

  const countUnreadInCategory = (cat: 'all' | 'info' | 'alert' | 'ticket') =>
    items.filter((n) => !n.read && matchesCategory(n, cat)).length;

  const displayedItems = items.filter((n) => {
    if (unreadOnly && n.read) return false;
    return matchesCategory(n, filterTab);
  });

  const categories: Array<{
    key: 'all' | 'info' | 'alert' | 'ticket';
    label: string;
    unread: number;
  }> = [
    { key: 'all', label: 'Todas', unread: countUnreadInCategory('all') },
    { key: 'info', label: 'Dicas & IA', unread: countUnreadInCategory('info') },
    { key: 'alert', label: 'Alertas', unread: countUnreadInCategory('alert') },
    { key: 'ticket', label: 'Chamados', unread: countUnreadInCategory('ticket') },
  ];

  return (
    <PageContainer width="content">
      <div className={`reui-scope ${themeClass}`}>
        <PageHeader
          icon={<BellNotificationIcon size={24} />}
          title={translate('page.notifications')}
          subtitle="Acompanhe alertas clínicos, respostas médicas, lembretes de exames e dicas personalizadas."
          actions={
            !!data?.unread ? (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-solid border-primary/30 bg-primary/10 px-3.5 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-primary/20 cursor-pointer"
              >
                <DoneAllRoundedIcon sx={{ fontSize: 15 }} />
                {translate('notif.mark_all')}
              </button>
            ) : undefined
          }
        />

        {/* Barra de filtros ReUI (c-toggle-7 pattern com contadores Badge + toggle não lidas) */}
        {data && items.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((c) => {
                const active = filterTab === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFilterTab(c.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <span>{c.label}</span>
                    {c.unread > 0 && (
                      <span
                        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-extrabold tabular-nums ${
                          active
                            ? 'bg-white/25 text-white'
                            : 'bg-primary/15 text-primary'
                        }`}
                      >
                        {c.unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {data.unread > 0 && (
              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  unreadOnly
                    ? 'border-primary/40 bg-primary/12 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    unreadOnly ? 'bg-primary' : 'bg-muted-foreground/50'
                  }`}
                />
                Apenas não lidas ({data.unread})
              </button>
            )}
          </div>
        )}

        {!data && <ListSkeleton count={4} />}

        {data && displayedItems.length === 0 && (
          <Frame>
            <FramePanel className="p-6">
              <Empty className="border-0 p-4 md:p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BellNotificationIcon size={22} />
                  </EmptyMedia>
                  <EmptyTitle>
                    {unreadOnly
                      ? 'Nenhuma notificação não lida nesta categoria'
                      : translate('notif.empty')}
                  </EmptyTitle>
                  <EmptyDescription>
                    {unreadOnly
                      ? 'Você está em dia! Desative o filtro "Apenas não lidas" para rever o histórico.'
                      : 'Quando seus exames forem analisados ou houver lembretes de saúde, eles aparecerão aqui.'}
                  </EmptyDescription>
                </EmptyHeader>
                {unreadOnly && (
                  <button
                    type="button"
                    onClick={() => setUnreadOnly(false)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted cursor-pointer"
                  >
                    Mostrar todas as notificações
                  </button>
                )}
              </Empty>
            </FramePanel>
          </Frame>
        )}

        {data && displayedItems.length > 0 && (
          <Frame spacing="sm">
            <FrameHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <FrameTitle className="flex items-center gap-2">
                  Central de avisos
                  {data.unread > 0 && (
                    <ReuiBadge variant="primary-light" size="sm">
                      {data.unread} {data.unread === 1 ? 'nova' : 'novas'}
                    </ReuiBadge>
                  )}
                </FrameTitle>
                <FrameDescription>
                  Toque em qualquer aviso para abrir o exame correspondente ou ler a orientação completa
                </FrameDescription>
              </div>
            </FrameHeader>

            {displayedItems.map((n) => {
              const m = TYPE_META[n.type] ?? TYPE_META.info;
              const r = notifRoute(n);
              const praMatch = n.title?.match(/pra\s+([A-Za-zÀ-ÿ]+)/i);
              const targetPerson = praMatch ? praMatch[1] : null;

              return (
                <FramePanel
                  key={n.id}
                  className={`p-0 overflow-hidden transition-all ${
                    !n.read
                      ? 'ring-1 ring-primary/30 bg-primary/[0.03]'
                      : 'opacity-95 hover:opacity-100'
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!n.read) markOne(n.id);
                      if (n.data?.crossInsight) setCrossInsightView(n.data.crossInsight);
                      else if (n.data?.insight_id) setCrossInsightView(n.data as CrossInsightData);
                      else if (r) navigate(r);
                      else setView(n);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!n.read) markOne(n.id);
                        if (n.data?.crossInsight) setCrossInsightView(n.data.crossInsight);
                        else if (n.data?.insight_id) setCrossInsightView(n.data as CrossInsightData);
                        else if (r) navigate(r);
                        else setView(n);
                      }
                    }}
                    className="group flex w-full items-start gap-3.5 p-4 text-left transition hover:bg-muted/30 cursor-pointer"
                  >
                    <IconTile tone={m.tone} size="md" className="mt-0.5">
                      {m.icon(20)}
                    </IconTile>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {!n.read && (
                          <ReuiBadge variant={m.badgeVariant} size="xs">
                            Nova
                          </ReuiBadge>
                        )}
                        <ReuiBadge variant="outline" size="xs">
                          {m.categoryLabel}
                        </ReuiBadge>
                        {targetPerson && (
                          <ReuiBadge variant="primary-light" size="xs">
                            <PersonRoundedIcon sx={{ fontSize: 12 }} />
                            {targetPerson}
                          </ReuiBadge>
                        )}
                        <span className="ml-auto text-xs font-semibold text-muted-foreground tabular-nums">
                          {fmtDt(n.createdAt)}
                        </span>
                      </div>

                      <div
                        className={`text-sm leading-snug text-foreground ${
                          n.read ? 'font-bold' : 'font-extrabold'
                        }`}
                      >
                        {n.title}
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {n.body}
                      </p>

                      {n.type === 'share_exam_prompt' &&
                        !!n.data?.shareId &&
                        !!n.data?.examId && (
                          <div className="mt-2.5">
                            <button
                              type="button"
                              disabled={!!shared[n.id] || sharingId === n.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void shareExamFromPrompt(n);
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                                shared[n.id]
                                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-primary text-primary-foreground shadow-sm hover:opacity-95'
                              }`}
                            >
                              {shared[n.id] ? (
                                <>
                                  <CheckRoundedIcon sx={{ fontSize: 14 }} />
                                  Compartilhado com o médico
                                </>
                              ) : sharingId === n.id ? (
                                'Compartilhando…'
                              ) : (
                                <>
                                  <ShareRoundedIcon sx={{ fontSize: 14 }} />
                                  Compartilhar agora
                                </>
                              )}
                            </button>
                          </div>
                        )}

                      <div className="mt-2 flex items-center justify-end">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-transform group-hover:translate-x-0.5">
                          {r ? 'Abrir seção' : 'Ler orientação completa'}
                          <ArrowForwardRoundedIcon sx={{ fontSize: 13 }} />
                        </span>
                      </div>
                    </div>
                  </div>
                </FramePanel>
              );
            })}
          </Frame>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 3 }}
        >
          Conteúdo educativo — não substitui o médico.
        </Typography>
      </div>

      {/* Popup p/ notificações PURAMENTE informativas (sem tela pra levar) */}
      <Dialog
        open={!!view}
        onClose={() => setView(null)}
        slotProps={{
          backdrop: {
            sx: {
              backdropFilter: 'blur(10px)',
              backgroundColor: 'rgba(15, 24, 24, 0.45)',
            },
          },
        }}
        PaperProps={{
          sx: {
            borderRadius: '24px',
            maxWidth: 420,
            width: '92%',
            p: { xs: 2.5, sm: 3 },
            background: (t) =>
              t.palette.mode === 'dark'
                ? 'radial-gradient(ellipse at 50% -20%, rgba(32,178,170,0.22), transparent 70%), #131d1d'
                : 'radial-gradient(ellipse at 50% -20%, rgba(32,178,170,0.18), transparent 70%), #ffffff',
            boxShadow:
              '0 24px 60px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(32,178,170,0.2)',
          },
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', p: 0, mb: 1.5 }}>
          <Stack alignItems="center" spacing={1.5}>
            <Box
              sx={{
                p: 0.5,
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, rgba(32,178,170,0.3), rgba(212,165,116,0.3))',
                boxShadow: '0 8px 24px rgba(32,178,170,0.25)',
              }}
            >
              <DrExame size={52} sx={{ borderRadius: '50%' }} />
            </Box>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: 18,
                fontFamily: '"Poppins",sans-serif',
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              {view?.title}
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0, my: 1 }}>
          <Typography
            sx={{
              textAlign: 'center',
              lineHeight: 1.6,
              fontSize: 14.5,
              color: 'text.secondary',
              whiteSpace: 'pre-wrap',
            }}
          >
            {view?.body}
          </Typography>
          {view?.createdAt && (
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: 'text.disabled',
                textAlign: 'center',
                mt: 2,
              }}
            >
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
              },
            }}
          >
            Entendido
          </Button>
        </DialogActions>
      </Dialog>

      {/* BottomSheet ReUI para Cruzamentos Clínicos Determinísticos */}
      <CrossInsightBottomSheet
        open={!!crossInsightView}
        insight={crossInsightView}
        onClose={() => setCrossInsightView(null)}
        onAddQuestion={(q) => {
          navigate('/minhas-perguntas');
        }}
      />
    </PageContainer>
  );
};
