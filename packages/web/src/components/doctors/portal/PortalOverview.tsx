import { useState, useMemo, type ReactNode } from 'react';
import { Box, Stack, Typography, Button, CardContent, Avatar, LinearProgress, Chip, useTheme } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { AppCard } from '../../AppCard';
import { photoUrlFor } from '../../../config';
import { CalendarBlank, ChatCircle, Stethoscope, ChartLineUp, Lightning, Diamond } from '@phosphor-icons/react';
import VideocamIcon from '@mui/icons-material/Videocam';
import { a11yClick, focusRingSx, COPPER, statusDot, inlineStat, premiumText } from './shared';
import { tealText } from '../../../theme';
import { openTelemedicinaRoom } from '../../../utils/telemedicina';

interface PortalOverviewProps {
  patients: any[];
  invites: any[];
  teleconsultas?: any[];
  doctorName?: string;
  planInfo?: any;
  onStartCheckout?: (method: 'pix' | 'card') => void;
  payLoading?: boolean;
  onOpenPatient: (p: any, tab?: string) => void;
  onSetView: (v: string) => void;
  onLoadAllQ: () => void;
  onNewInvite: () => void;
  onSetPatAlertOnly: (v: boolean) => void;
  onCancelTele?: (reminderId: string, patientId?: string) => void;
  onEnterTele?: (tc: any, patientName?: string) => void;
  onViewTeleconsultas?: () => void;
}

/**
 * View PAINEL (overview) do portal médico.
 * Inspirado no design system hospitalar moderno:
 * - Hero acolhedor com resumo do dia
 * - 4 Cards de KPIs com soft badges coloridos (estilo SaaS)
 * - Layout em 2 colunas: Fila Clínica à esquerda (65%) e Panorama da Carteira + Ações à direita (35%)
 */
export const PortalOverview = ({
  patients,
  invites,
  teleconsultas,
  doctorName,
  planInfo,
  onStartCheckout,
  payLoading,
  onOpenPatient,
  onSetView,
  onLoadAllQ,
  onNewInvite,
  onSetPatAlertOnly,
  onCancelTele,
  onEnterTele,
  onViewTeleconsultas,
}: PortalOverviewProps) => {
  const t = useTheme();
  const premium = premiumText(t.palette.mode); // indigo AA no modo atual (dark usa o claro)

  const [queueFilter, setQueueFilter] = useState<'all' | 'tele' | 'alerts' | 'questions' | 'stale'>('all');

  // Alfabética: organização previsível pro médico
  const alerts = useMemo(() => [...patients]
    .filter((p) => p.hasAlerts)
    .sort((a, b) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' })),
    [patients]
  );

  // Mais perguntas primeiro; desempate alfabético
  const openQP = useMemo(() => [...patients]
    .filter((p) => (p.openQuestions ?? 0) > 0)
    .sort((a, b) => (b.openQuestions ?? 0) - (a.openQuestions ?? 0) || (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' })),
    [patients]
  );

  const pendingInv = invites.filter((i) => i.status === 'pending');
  const openQCount = patients.reduce((n, p) => n + (p.openQuestions ?? 0), 0);

  const PRIORITY_LABEL: Record<string, string> = {
    importante: 'Prioridade alta',
    moderada: 'Alterações moderadas',
    leve: 'Alterações leves',
  };

  const relDays = (d?: string | null) => {
    if (!d) return null;
    const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return n < 1 ? 'hoje' : n < 30 ? `há ${n} ${n === 1 ? 'dia' : 'dias'}` : n < 365 ? `há ${Math.floor(n / 30)} ${Math.floor(n / 30) === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(n / 365)} ${Math.floor(n / 365) === 1 ? 'ano' : 'anos'}`;
  };

  // Renovação: exame antigo (>1 ano) ou nenhum exame compartilhado
  const stale = useMemo(() => patients
    .filter((p) => !p.hasAlerts && ((p.examsCount ?? 0) === 0 || (p.lastExamAt && Date.now() - new Date(p.lastExamAt).getTime() > 365 * 86400000)))
    .sort((a, b) => new Date(a.lastExamAt ?? 0).getTime() - new Date(b.lastExamAt ?? 0).getTime()),
    [patients]
  );

  // CONSOLIDAÇÃO INTELIGENTE: cada paciente aparece EXATAMENTE UMA VEZ na Fila Clínica Unificada
  const unifiedList = useMemo(() => {
    const teleMap = new Map<string, any>();
    for (const tc of (teleconsultas ?? [])) {
      const pid = tc.patientId || tc.patient?.id;
      if (pid && !teleMap.has(pid)) {
        teleMap.set(pid, tc);
      }
    }

    const list = patients.map((p) => {
      const pid = p.patient?.id;
      const tele = pid ? teleMap.get(pid) : null;
      const hasTele = !!tele;
      const hasAlert = !!p.hasAlerts;
      const hasQuestions = (p.openQuestions ?? 0) > 0;
      const isStale = !hasAlert && ((p.examsCount ?? 0) === 0 || (p.lastExamAt && Date.now() - new Date(p.lastExamAt).getTime() > 365 * 86400000));

      let priorityWeight = 0;
      if (hasTele) priorityWeight += 1000;
      if (p.maxPriority === 'importante') priorityWeight += 800;
      else if (p.maxPriority === 'moderada') priorityWeight += 500;
      else if (p.maxPriority === 'leve') priorityWeight += 300;
      if (hasQuestions) priorityWeight += 400 + Math.min((p.openQuestions ?? 0) * 20, 200);
      if (isStale) priorityWeight += 100;

      return {
        ...p,
        tele,
        hasTele,
        hasAlert,
        hasQuestions,
        isStale,
        priorityWeight,
      };
    });

    // Inclui teleconsultas que porventura não estejam no array patients
    for (const tc of (teleconsultas ?? [])) {
      const pid = tc.patientId || tc.patient?.id;
      if (pid && !list.some((item) => item.patient?.id === pid)) {
        list.push({
          shareId: `tele-${tc.id}`,
          patient: tc.patient,
          tele: tc,
          hasTele: true,
          hasAlert: false,
          maxPriority: null,
          hasQuestions: false,
          openQuestions: 0,
          isStale: false,
          examsCount: 0,
          lastExamAt: null,
          priorityWeight: 1000,
        });
      }
    }

    return list.sort((a, b) => b.priorityWeight - a.priorityWeight);
  }, [patients, teleconsultas]);

  const teleCount = useMemo(() => unifiedList.filter((p) => p.hasTele).length, [unifiedList]);
  const alertCount = alerts.length;
  const questionCount = openQCount;
  const staleCount = stale.length;
  const totalActionCount = useMemo(() => unifiedList.filter((p) => p.hasTele || p.hasAlert || p.hasQuestions || p.isStale).length, [unifiedList]);

  const filteredList = useMemo(() => {
    if (queueFilter === 'tele') return unifiedList.filter((p) => p.hasTele);
    if (queueFilter === 'alerts') return unifiedList.filter((p) => p.hasAlert);
    if (queueFilter === 'questions') return unifiedList.filter((p) => p.hasQuestions);
    if (queueFilter === 'stale') return unifiedList.filter((p) => p.isStale);
    const actionable = unifiedList.filter((p) => p.hasTele || p.hasAlert || p.hasQuestions || p.isStale);
    return actionable.length > 0 ? actionable : unifiedList;
  }, [unifiedList, queueFilter]);

  // Métricas para as barras de progresso (Panorama da Carteira)
  const totalPatients = patients.length;
  const upToDateCount = Math.max(0, totalPatients - alertCount - staleCount);
  const upToDatePct = totalPatients > 0 ? Math.round((upToDateCount / totalPatients) * 100) : 0;
  const alertPct = totalPatients > 0 ? Math.round((alertCount / totalPatients) * 100) : 0;
  const stalePct = totalPatients > 0 ? Math.round((staleCount / totalPatients) * 100) : 0;

  const firstName = (doctorName || 'Doutor(a)').replace(/^Dr[aº.]*\s+/i, '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  // Configuração dos 4 KPIs com títulos objetivos e sem corte de texto no mobile
  const kpis = [
    {
      label: 'Pacientes',
      value: patients.length,
      sub: 'carteira ativa',
      color: '#0d9488',
      bg: 'rgba(13, 148, 136, 0.12)',
      icon: <GroupsIcon sx={{ fontSize: 26, color: '#0d9488' }} />,
      onClick: () => onSetView('patients'),
    },
    {
      label: 'Alertas',
      value: alerts.length,
      sub: alerts.length === 1 ? '1 em atenção' : `${alerts.length} em atenção`,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      icon: <WarningAmberIcon sx={{ fontSize: 26, color: '#ef4444' }} />,
      onClick: () => {
        onSetPatAlertOnly(true);
        onSetView('patients');
      },
    },
    {
      label: 'Dúvidas',
      value: openQCount,
      sub: openQCount === 1 ? '1 pendente' : `${openQCount} pendentes`,
      color: '#d97706',
      bg: 'rgba(245, 158, 11, 0.12)',
      icon: <QuestionAnswerIcon sx={{ fontSize: 26, color: '#d97706' }} />,
      onClick: () => {
        onSetView('questions');
        onLoadAllQ();
      },
    },
    {
      label: 'Convites',
      value: pendingInv.length,
      sub: pendingInv.length === 1 ? '1 aguardando' : `${pendingInv.length} aguardando`,
      color: premium,
      bg: 'rgba(99, 102, 241, 0.12)',
      icon: <PersonAddAlt1Icon sx={{ fontSize: 26, color: premium } as any} />,
      onClick: () => onSetView('invites'),
    },
  ];

  return (
    <Stack spacing={2.5}>
      {/* HERO BANNER: Saudação & Resumo Clínico do Dia */}
      <Box
        sx={(t) => ({
          borderRadius: '20px',
          position: 'relative',
          overflow: 'hidden',
          background:
            t.palette.mode === 'dark'
              ? 'radial-gradient(ellipse 95% 85% at 0% 0%, #0d9488 0%, #0f544f 45%, #082827 100%)'
              : 'radial-gradient(ellipse 95% 85% at 0% 0%, #20B2AA 0%, #0d9488 50%, #065f57 100%)',
          color: '#ffffff',
          p: { xs: 2.25, md: 3 },
          boxShadow: '0 12px 32px rgba(13,148,136,0.22)',
          border: '1px solid rgba(255,255,255,0.15)',
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
          },
        })}
      >
        <Typography component="h1" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 20, md: 24 }, lineHeight: 1.2 }}>
          {greet}, Dr(a). {firstName} 👋
        </Typography>
        <Typography sx={{ opacity: 0.95, fontSize: 14.5, mt: 0.75, fontWeight: 500 }}>
          {alerts.length > 0
            ? `${alerts.length} ${alerts.length === 1 ? 'paciente com valores alterados precisando de atenção' : 'pacientes com valores alterados precisando de atenção'}${openQP.length ? ` · ${openQP.length} ${openQP.length === 1 ? 'dúvida em aberto' : 'dúvidas em aberto'}` : ''}`
            : openQP.length > 0
              ? `${openQP.length} ${openQP.length === 1 ? 'pergunta aguardando resposta' : 'perguntas aguardando resposta'}`
              : 'Tudo em ordem — nenhum alerta crítico no momento ✅'}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mt: 0.75, textTransform: 'capitalize', fontWeight: 600 }}>
          {today}
        </Typography>
      </Box>

      {/* 4 CARDS DE KPI (Estilo SaaS / Hospital Management com Soft Badges) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.75 }}>
        {kpis.map((kpi) => (
          <AppCard
            kind="interactive"
            key={kpi.label}
            role="button"
            tabIndex={0}
            {...a11yClick(kpi.onClick)}
            sx={{
              ...focusRingSx,
              p: { xs: 1.75, sm: 2 },
              borderRadius: '18px',
              border: '1px solid',
              borderColor: 'divider',
              transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
              },
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontSize: { xs: 11, sm: 11.5 },
                    display: 'block',
                    mb: 0.25,
                    lineHeight: 1.2,
                  }}
                >
                  {kpi.label}
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, sm: 28 }, color: 'text.primary', lineHeight: 1.1 }}>
                  {kpi.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: kpi.value > 0 && kpi.color === '#ef4444' ? 'error.main' : 'text.secondary',
                    fontWeight: 600,
                    mt: 0.5,
                    display: 'block',
                    fontSize: { xs: 11, sm: 11.5 },
                    lineHeight: 1.2,
                  }}
                >
                  {kpi.sub}
                </Typography>
              </Box>
              <Box
                sx={{
                  width: { xs: 42, sm: 48 },
                  height: { xs: 42, sm: 48 },
                  borderRadius: '14px',
                  bgcolor: kpi.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {kpi.icon}
              </Box>
            </Stack>
          </AppCard>
        ))}
      </Box>

      {/* LAYOUT ASSIMÉTRICO EM 2 COLUNAS (DESKTOP) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 2.5, alignItems: 'flex-start' }}>
        {/* COLUNA PRINCIPAL (65%) — FILA CLÍNICA */}
        <Stack spacing={2.5}>
          {/* FILA DE ATENDIMENTO PRIORITÁRIO (UNIFICADA - ZERO DUPLICAÇÃO DE PACIENTES) */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }} flexWrap="wrap" gap={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Stethoscope size={22} weight="duotone" color={COPPER.deep} />
                <Typography component="h2" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 16, sm: 17 }, color: 'text.primary' }}>
                  Fila de Atendimento Prioritário
                </Typography>
                <Chip
                  size="small"
                  label={`${totalActionCount} paciente${totalActionCount === 1 ? '' : 's'}`}
                  sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.12)', color: '#178f89', borderRadius: '8px' }}
                />
              </Stack>
              {onViewTeleconsultas && (
                <Button size="small" onClick={onViewTeleconsultas} sx={{ textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode), borderRadius: '999px', fontSize: 12.5 }}>
                  Ver agenda completa ›
                </Button>
              )}
            </Stack>

            {/* Filtros Rápidos da Fila Clínica */}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
              <Chip
                clickable
                label={`Todos com ação (${totalActionCount})`}
                onClick={() => setQueueFilter('all')}
                sx={{
                  fontWeight: 700, fontSize: 12, borderRadius: '999px',
                  bgcolor: queueFilter === 'all' ? '#178f89' : 'action.hover',
                  color: queueFilter === 'all' ? '#ffffff' : 'text.primary',
                  '&:hover': { bgcolor: queueFilter === 'all' ? '#137a74' : 'action.selected' },
                }}
              />
              {teleCount > 0 && (
                <Chip
                  clickable
                  icon={<VideocamIcon sx={{ fontSize: 15, color: queueFilter === 'tele' ? '#fff !important' : '#178f89 !important' }} />}
                  label={`Teleconsultas (${teleCount})`}
                  onClick={() => setQueueFilter('tele')}
                  sx={{
                    fontWeight: 700, fontSize: 12, borderRadius: '999px',
                    bgcolor: queueFilter === 'tele' ? '#178f89' : 'rgba(15,118,110,0.1)',
                    color: queueFilter === 'tele' ? '#ffffff' : '#178f89',
                    '&:hover': { bgcolor: queueFilter === 'tele' ? '#137a74' : 'rgba(15,118,110,0.2)' },
                  }}
                />
              )}
              {alertCount > 0 && (
                <Chip
                  clickable
                  icon={<WarningAmberIcon sx={{ fontSize: 15, color: queueFilter === 'alerts' ? '#fff !important' : '#ef4444 !important' }} />}
                  label={`Alertas (${alertCount})`}
                  onClick={() => setQueueFilter('alerts')}
                  sx={{
                    fontWeight: 700, fontSize: 12, borderRadius: '999px',
                    bgcolor: queueFilter === 'alerts' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                    color: queueFilter === 'alerts' ? '#ffffff' : '#ef4444',
                    '&:hover': { bgcolor: queueFilter === 'alerts' ? '#dc2626' : 'rgba(239,68,68,0.2)' },
                  }}
                />
              )}
              {questionCount > 0 && (
                <Chip
                  clickable
                  icon={<QuestionAnswerIcon sx={{ fontSize: 15, color: queueFilter === 'questions' ? '#fff !important' : '#d97706 !important' }} />}
                  label={`Dúvidas (${questionCount})`}
                  onClick={() => setQueueFilter('questions')}
                  sx={{
                    fontWeight: 700, fontSize: 12, borderRadius: '999px',
                    bgcolor: queueFilter === 'questions' ? '#d97706' : 'rgba(245,158,11,0.12)',
                    color: queueFilter === 'questions' ? '#ffffff' : '#d97706',
                    '&:hover': { bgcolor: queueFilter === 'questions' ? '#b45309' : 'rgba(245,158,11,0.2)' },
                  }}
                />
              )}
              {staleCount > 0 && (
                <Chip
                  clickable
                  icon={<CalendarBlank size={14} color={queueFilter === 'stale' ? '#fff' : '#64748b'} />}
                  label={`Renovar (${staleCount})`}
                  onClick={() => setQueueFilter('stale')}
                  sx={{
                    fontWeight: 700, fontSize: 12, borderRadius: '999px',
                    bgcolor: queueFilter === 'stale' ? '#475569' : 'rgba(100,116,139,0.1)',
                    color: queueFilter === 'stale' ? '#ffffff' : 'text.secondary',
                    '&:hover': { bgcolor: queueFilter === 'stale' ? '#334155' : 'rgba(100,116,139,0.2)' },
                  }}
                />
              )}
            </Stack>

            {/* Lista Unificada: 1 Card Rico por Paciente */}
            <Stack spacing={1.5}>
              {filteredList.map((p: any) => {
                const who = [p.age != null ? `${p.age}a` : null, p.sex === 'female' ? 'F' : p.sex === 'male' ? 'M' : null].filter(Boolean).join(' · ');
                const patName = p.patient?.fullName ?? 'Paciente';
                const teleDt = p.tele?.dueDate
                  ? new Date(p.tele.dueDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' })
                  : null;

                return (
                  <AppCard
                    key={p.patient?.id || p.shareId}
                    kind="interactive"
                    onClick={() => p.patient && onOpenPatient(p)}
                    sx={{
                      borderRadius: '18px',
                      border: '1.5px solid',
                      borderColor: p.hasTele
                        ? 'rgba(15,118,110,0.35)'
                        : p.maxPriority === 'importante'
                        ? 'rgba(239,68,68,0.35)'
                        : p.hasQuestions
                        ? 'rgba(245,158,11,0.35)'
                        : 'divider',
                      boxShadow: p.hasTele ? '0 4px 18px rgba(15,118,110,0.08)' : '0 2px 10px rgba(0,0,0,0.03)',
                      p: { xs: 1.75, sm: 2 },
                      transition: 'transform 0.16s ease, box-shadow 0.16s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                      },
                    }}
                  >
                    {/* Topo do Card: Avatar, Identidade e Indicador Principal */}
                    <Stack direction="row" spacing={1.75} alignItems="center" sx={{ mb: 1.25 }}>
                      <Box sx={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar
                          src={p.patient?.id ? photoUrlFor(p.patient.id) : undefined}
                          sx={{
                            width: 48,
                            height: 48,
                            fontSize: 18,
                            fontWeight: 800,
                            bgcolor: 'rgba(32,178,170,.1)',
                            color: (t) => tealText(t.palette.mode),
                            border: '2px solid',
                            borderColor: p.hasTele
                              ? '#178f89'
                              : p.maxPriority === 'importante'
                              ? '#ef4444'
                              : p.hasQuestions
                              ? '#d97706'
                              : 'rgba(32,178,170,.3)',
                            borderRadius: '14px',
                          }}
                        >
                          {patName.charAt(0)}
                        </Avatar>
                        {p.hasTele ? (
                          <Box
                            sx={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              bgcolor: '#178f89',
                              color: '#fff',
                              display: 'grid',
                              placeItems: 'center',
                              border: '2px solid #fff',
                            }}
                          >
                            <VideocamIcon sx={{ fontSize: 11 }} />
                          </Box>
                        ) : p.hasAlert ? (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: -2,
                              right: -2,
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              bgcolor: '#ef4444',
                              border: '2px solid #fff',
                            }}
                          />
                        ) : p.hasQuestions ? (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: -2,
                              right: -2,
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              bgcolor: '#d97706',
                              border: '2px solid #fff',
                            }}
                          />
                        ) : null}
                      </Box>

                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                          <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif', lineHeight: 1.25 }}>
                            {patName}
                          </Typography>
                          {p.code && (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                              {p.code}
                            </Typography>
                          )}
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: 12.5, fontWeight: 500 }}>
                          {who || 'Paciente acompanhado'}
                          {p.lastExamAt ? ` · último exame ${relDays(p.lastExamAt)}` : ''}
                        </Typography>
                      </Box>

                      {/* Chip de Destaque Clínico no Topo à Direita */}
                      {p.hasTele ? (
                        <Chip
                          size="small"
                          icon={<VideocamIcon sx={{ fontSize: 14 }} />}
                          label="Teleconsulta"
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 800,
                            bgcolor: 'rgba(15,118,110,0.12)', color: '#178f89',
                            '& .MuiChip-icon': { color: '#178f89' }, borderRadius: '8px',
                          }}
                        />
                      ) : p.hasAlert ? (
                        <Chip
                          size="small"
                          label={p.maxPriority === 'importante' ? 'Alta Prioridade' : p.maxPriority === 'moderada' ? 'Alerta Médio' : 'Alerta Leve'}
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 800,
                            bgcolor: p.maxPriority === 'importante' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: p.maxPriority === 'importante' ? '#ef4444' : '#d97706',
                            borderRadius: '8px',
                          }}
                        />
                      ) : p.hasQuestions ? (
                        <Chip
                          size="small"
                          label="Dúvidas abertas"
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 800,
                            bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706',
                            borderRadius: '8px',
                          }}
                        />
                      ) : null}
                    </Stack>

                    {/* Dossiê Consolidado do Paciente (Chips informativos sem repetição) */}
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                      {p.hasTele && (
                        <Chip
                          size="small"
                          icon={<VideocamIcon sx={{ fontSize: 13 }} />}
                          label={`📅 ${teleDt} ${p.tele?.consentAt ? '• Paciente autorizou' : '• Aguardando'}`}
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 700,
                            bgcolor: 'rgba(15,118,110,0.08)', color: '#178f89',
                            '& .MuiChip-icon': { color: '#178f89' }, borderRadius: '8px',
                          }}
                        />
                      )}
                      {p.hasAlert && (
                        <Chip
                          size="small"
                          icon={<WarningAmberIcon sx={{ fontSize: 13 }} />}
                          label={`Exames alterados (${PRIORITY_LABEL[p.maxPriority] ?? 'Alerta'})`}
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 700,
                            bgcolor: p.maxPriority === 'importante' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                            color: p.maxPriority === 'importante' ? '#ef4444' : '#d97706',
                            '& .MuiChip-icon': { color: p.maxPriority === 'importante' ? '#ef4444' : '#d97706' },
                            borderRadius: '8px',
                          }}
                        />
                      )}
                      {p.hasQuestions && (
                        <Chip
                          size="small"
                          icon={<QuestionAnswerIcon sx={{ fontSize: 13 }} />}
                          label={`${p.openQuestions} dúvida${p.openQuestions > 1 ? 's' : ''} aguardando`}
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 700,
                            bgcolor: 'rgba(245,158,11,0.08)', color: '#d97706',
                            '& .MuiChip-icon': { color: '#d97706' }, borderRadius: '8px',
                          }}
                        />
                      )}
                      {p.isStale && !p.hasAlert && (
                        <Chip
                          size="small"
                          icon={<CalendarBlank size={13} />}
                          label={(p.examsCount ?? 0) === 0 ? 'Sem exames compartilhados' : 'Exames > 1 ano para renovar'}
                          sx={{
                            height: 24, fontSize: 12, fontWeight: 600,
                            bgcolor: 'action.hover', color: 'text.secondary',
                            borderRadius: '8px',
                          }}
                        />
                      )}
                    </Stack>

                    {/* Ações Rápidas: O que o médico deve fazer (1 toque) */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                      {p.hasTele ? (
                        <>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<VideocamIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onEnterTele) onEnterTele(p.tele, patName);
                              else void openTelemedicinaRoom(p.tele.linkUrl);
                            }}
                            sx={{
                              borderRadius: '999px',
                              textTransform: 'none',
                              fontWeight: 800,
                              fontSize: 13,
                              bgcolor: '#178f89',
                              '&:hover': { bgcolor: '#137a74' },
                              px: 2.25,
                              boxShadow: '0 3px 10px rgba(15,118,110,0.3)',
                            }}
                          >
                            Entrar na consulta
                          </Button>
                          {p.hasQuestions && (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<ChatCircle size={15} weight="bold" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPatient(p, 'questions');
                              }}
                              sx={{
                                borderRadius: '999px',
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: 12,
                                color: '#d97706',
                                borderColor: 'rgba(245,158,11,0.4)',
                                '&:hover': { borderColor: '#d97706', bgcolor: 'rgba(245,158,11,0.06)' },
                              }}
                            >
                              Ver {p.openQuestions} dúvida{p.openQuestions > 1 ? 's' : ''}
                            </Button>
                          )}
                          {onCancelTele && (
                            <Button
                              variant="text"
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCancelTele(p.tele.id, p.tele.patientId || p.patient?.id);
                              }}
                              sx={{
                                borderRadius: '999px',
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              Cancelar consulta
                            </Button>
                          )}
                        </>
                      ) : p.hasQuestions ? (
                        <>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<ChatCircle size={16} weight="bold" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPatient(p, 'questions');
                            }}
                            sx={{
                              borderRadius: '999px',
                              textTransform: 'none',
                              fontWeight: 800,
                              fontSize: 13,
                              bgcolor: '#d97706',
                              '&:hover': { bgcolor: '#b45309' },
                              px: 2.25,
                              boxShadow: '0 3px 10px rgba(217,119,6,0.3)',
                            }}
                          >
                            Responder dúvidas ({p.openQuestions})
                          </Button>
                          {p.hasAlert && (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Stethoscope size={15} weight="bold" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPatient(p, 'alterados');
                              }}
                              sx={{
                                borderRadius: '999px',
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: 12,
                                color: '#ef4444',
                                borderColor: 'rgba(239,68,68,0.4)',
                                '&:hover': { borderColor: '#ef4444', bgcolor: 'rgba(239,68,68,0.06)' },
                              }}
                            >
                              Ver exames alterados
                            </Button>
                          )}
                        </>
                      ) : p.hasAlert ? (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Stethoscope size={16} weight="bold" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPatient(p, 'alterados');
                          }}
                          sx={{
                            borderRadius: '999px',
                            textTransform: 'none',
                            fontWeight: 800,
                            fontSize: 13,
                            bgcolor: '#178f89',
                            '&:hover': { bgcolor: '#137a74' },
                            px: 2.25,
                            boxShadow: '0 3px 10px rgba(15,118,110,0.3)',
                          }}
                        >
                          Ver exames alterados
                        </Button>
                      ) : p.isStale ? (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<CalendarBlank size={16} weight="bold" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPatient(p);
                          }}
                          sx={{
                            borderRadius: '999px',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: 12.5,
                            bgcolor: '#178f89',
                            '&:hover': { bgcolor: '#137a74' },
                            px: 2,
                          }}
                        >
                          Solicitar atualização de exames
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPatient(p);
                          }}
                          sx={{
                            borderRadius: '999px',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: 12.5,
                            bgcolor: '#178f89',
                            '&:hover': { bgcolor: '#137a74' },
                            px: 2,
                          }}
                        >
                          Abrir prontuário
                        </Button>
                      )}

                      <Button
                        variant="text"
                        size="small"
                        endIcon={<ChevronRightIcon sx={{ fontSize: 16 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPatient(p);
                        }}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: 'text.secondary',
                          borderRadius: '999px',
                          ml: 'auto',
                        }}
                      >
                        Prontuário completo
                      </Button>
                    </Stack>
                  </AppCard>
                );
              })}

              {filteredList.length === 0 && (
                <AppCard sx={{ p: 4, textAlign: 'center', borderRadius: '18px' }}>
                  <Typography sx={{ fontWeight: 700, color: 'text.secondary', fontSize: 14 }}>
                    Nenhum paciente pendente nesta categoria ✅
                  </Typography>
                </AppCard>
              )}
            </Stack>
          </Box>

          {/* EMPTY STATE (quando não há pacientes ainda) */}
          {patients.length === 0 && (
            <AppCard sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>🩺</Box>
                <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 18, mb: 0.5, color: 'text.primary' }}>
                  Seu painel começa com seu primeiro paciente
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 2.5, maxWidth: 420, mx: 'auto', fontSize: 14 }}>
                  Envie o convite pelo WhatsApp — o paciente instala o app, sincroniza os laudos e você acompanha exames alterados e tendências clínicas por aqui.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<WhatsAppIcon />}
                  onClick={onNewInvite}
                  sx={{
                    borderRadius: '999px',
                    textTransform: 'none',
                    fontWeight: 700,
                    bgcolor: '#25D366',
                    color: '#fff',
                    px: 3,
                    py: 1,
                    '&:hover': { bgcolor: '#1ea952' },
                  }}
                >
                  Convidar paciente pelo WhatsApp
                </Button>
              </CardContent>
            </AppCard>
          )}
        </Stack>

        {/* COLUNA LATERAL (35%) — PANORAMA DA CARTEIRA & AÇÕES */}
        <Stack spacing={2.5}>
          {/* CARD: PANORAMA DA CARTEIRA (Inspirado no Department Occupancy do Figma) */}
          <AppCard sx={{ p: 2.25, borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '10px',
                  bgcolor: 'rgba(32,178,170,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChartLineUp size={20} weight="bold" color="#178f89" />
              </Box>
              <Box>
                <Typography component="h2" sx={{ fontWeight: 800, fontSize: 15, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1.2 }}>
                  Panorama da Carteira
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                  Distribuição clínica dos pacientes
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={2}>
              {/* Exames em dia */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                    Exames em dia
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#10b981' }}>
                    {upToDateCount}/{totalPatients} ({upToDatePct}%)
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={upToDatePct}
                  sx={{
                    height: 7,
                    borderRadius: 4,
                    bgcolor: 'rgba(16, 185, 129, 0.12)',
                    '& .MuiLinearProgress-bar': { bgcolor: '#10b981', borderRadius: 4 },
                  }}
                />
              </Box>

              {/* Com alterações */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                    Valores alterados
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#ef4444' }}>
                    {alertCount}/{totalPatients} ({alertPct}%)
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={alertPct}
                  sx={{
                    height: 7,
                    borderRadius: 4,
                    bgcolor: 'rgba(239, 68, 68, 0.12)',
                    '& .MuiLinearProgress-bar': { bgcolor: '#ef4444', borderRadius: 4 },
                  }}
                />
              </Box>

              {/* A renovar */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                    A renovar (&gt;1 ano)
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#f59e0b' }}>
                    {staleCount}/{totalPatients} ({stalePct}%)
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={stalePct}
                  sx={{
                    height: 7,
                    borderRadius: 4,
                    bgcolor: 'rgba(245, 158, 11, 0.12)',
                    '& .MuiLinearProgress-bar': { bgcolor: '#f59e0b', borderRadius: 4 },
                  }}
                />
              </Box>
            </Stack>

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 2, fontSize: 12, lineHeight: 1.4 }}>
              💡 Dados alimentados automaticamente pelos exames autorizados que os pacientes sobem no app.
            </Typography>
          </AppCard>

          {/* CARD: AÇÕES RÁPIDAS DO CONSULTÓRIO */}
          <AppCard sx={{ p: 2.25, borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.75 }}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '10px',
                  bgcolor: 'rgba(245,158,11,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Lightning size={20} weight="fill" color="#d97706" />
              </Box>
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: 15, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}>
                Ações Rápidas
              </Typography>
            </Stack>

            <Stack spacing={1.25}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<WhatsAppIcon />}
                onClick={onNewInvite}
                sx={{
                  borderRadius: '12px',
                  textTransform: 'none',
                  fontWeight: 700,
                  bgcolor: '#25D366',
                  color: '#fff',
                  py: 1.1,
                  boxShadow: '0 4px 12px rgba(37,211,102,0.25)',
                  '&:hover': { bgcolor: '#1ea952' },
                }}
              >
                Convidar Paciente WhatsApp
              </Button>

              <Button
                fullWidth
                variant="outlined"
                startIcon={<QuestionAnswerIcon />}
                onClick={() => {
                  onSetView('questions');
                  onLoadAllQ();
                }}
                sx={{
                  borderRadius: '12px',
                  textTransform: 'none',
                  fontWeight: 700,
                  py: 1,
                  justifyContent: 'flex-start',
                }}
              >
                Inbox de Dúvidas {openQCount > 0 ? `(${openQCount})` : ''}
              </Button>

              <Button
                fullWidth
                variant="outlined"
                startIcon={<GroupsIcon />}
                onClick={() => onSetView('patients')}
                sx={{
                  borderRadius: '12px',
                  textTransform: 'none',
                  fontWeight: 700,
                  py: 1,
                  justifyContent: 'flex-start',
                }}
              >
                Todos os Pacientes ({totalPatients})
              </Button>
            </Stack>
          </AppCard>

          {/* CARD: STATUS PRO / PRÉ-CONSULTAS (se não for premium) */}
          {planInfo && !planInfo.isPremium && (
            <Box
              sx={{
                p: 2,
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(99,102,241,.12), rgba(99,102,241,.03))',
                border: '1px solid rgba(99,102,241,.25)',
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Diamond size={16} weight="fill" color={premium} />
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: premium }}>
                  Dr. Exame Pro
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12.5, mb: 1.5 }}>
                {planInfo.freeUsed >= planInfo.freeLimit
                  ? '🔒 Pré-consultas gratuitas esgotadas este mês.'
                  : `${planInfo.freeUsed} de ${planInfo.freeLimit} pré-consultas gratuitas usadas.`}
              </Typography>
              <Button
                fullWidth
                size="small"
                variant="contained"
                onClick={() => onStartCheckout?.('pix')}
                disabled={payLoading}
                sx={{
                  bgcolor: '#6366f1',
                  textTransform: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  '&:hover': { bgcolor: '#4f46e5' },
                }}
              >
                {payLoading ? 'Gerando...' : 'Assinar R$29,90/mês'}
              </Button>
            </Box>
          )}
        </Stack>
      </Box>
    </Stack>
  );
};
