import { Box, Stack, Typography, Button, CardContent, Avatar, LinearProgress, Chip } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { AppCard } from '../../AppCard';
import { photoUrlFor } from '../../../config';
import { CalendarBlank, ChatCircle, Stethoscope, ChartLineUp, Lightning, Diamond } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { a11yClick, focusRingSx, COPPER, statusDot, inlineStat } from './shared';

interface PortalOverviewProps {
  patients: any[];
  invites: any[];
  doctorName?: string;
  planInfo?: any;
  onStartCheckout?: (method: 'pix' | 'card') => void;
  payLoading?: boolean;
  onOpenPatient: (p: any, tab?: string) => void;
  onSetView: (v: string) => void;
  onLoadAllQ: () => void;
  onNewInvite: () => void;
  onSetPatAlertOnly: (v: boolean) => void;
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
  doctorName,
  planInfo,
  onStartCheckout,
  payLoading,
  onOpenPatient,
  onSetView,
  onLoadAllQ,
  onNewInvite,
  onSetPatAlertOnly,
}: PortalOverviewProps) => {
  // Alfabética: organização previsível pro médico
  const alerts = [...patients]
    .filter((p) => p.hasAlerts)
    .sort((a, b) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' }));

  // Mais perguntas primeiro; desempate alfabético
  const openQP = [...patients]
    .filter((p) => (p.openQuestions ?? 0) > 0)
    .sort((a, b) => (b.openQuestions ?? 0) - (a.openQuestions ?? 0) || (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' }));

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
  const stale = patients
    .filter((p) => !p.hasAlerts && ((p.examsCount ?? 0) === 0 || (p.lastExamAt && Date.now() - new Date(p.lastExamAt).getTime() > 365 * 86400000)))
    .sort((a, b) => new Date(a.lastExamAt ?? 0).getTime() - new Date(b.lastExamAt ?? 0).getTime());

  // Métricas para as barras de progresso (Panorama da Carteira)
  const totalPatients = patients.length;
  const staleCount = stale.length;
  const alertCount = alerts.length;
  const upToDateCount = Math.max(0, totalPatients - alertCount - staleCount);
  const upToDatePct = totalPatients > 0 ? Math.round((upToDateCount / totalPatients) * 100) : 0;
  const alertPct = totalPatients > 0 ? Math.round((alertCount / totalPatients) * 100) : 0;
  const stalePct = totalPatients > 0 ? Math.round((staleCount / totalPatients) * 100) : 0;

  const firstName = (doctorName || 'Doutor(a)').replace(/^Dr[aº.]*\s+/i, '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  // Padrão de linha de paciente limpa (estilo Today's Appointments)
  const renderPatientRow = (p: any, statusLine: ReactNode, onClick: () => void, priorityTag?: ReactNode) => {
    const who = [p.age != null ? `${p.age}a` : null, p.sex === 'female' ? 'F' : p.sex === 'male' ? 'M' : null].filter(Boolean).join(' · ');
    return (
      <AppCard
        kind="interactive"
        key={p.shareId}
        role="button"
        tabIndex={0}
        {...a11yClick(onClick)}
        sx={{
          ...focusRingSx,
          borderRadius: '16px',
          border: '1px solid',
          borderColor: 'divider',
          transition: 'transform 0.16s ease, box-shadow 0.16s ease',
          '&:hover': {
            transform: 'translateX(4px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          },
        }}
      >
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Avatar
              src={p.patient?.id ? photoUrlFor(p.patient.id) : undefined}
              sx={{
                bgcolor: 'rgba(32,178,170,.08)',
                color: 'primary.dark',
                fontWeight: 800,
                width: 46,
                height: 46,
                border: '2px solid',
                borderColor: p.hasAlerts ? '#ef4444' : 'rgba(32,178,170,.2)',
              }}
            >
              {p.patient?.fullName?.charAt(0)}
            </Avatar>
            {p.hasAlerts && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: '#ef4444',
                  border: '2px solid #fff',
                }}
              />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontFamily: 'Poppins, sans-serif',
                  fontSize: 14.5,
                  color: 'text.primary',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.patient?.fullName}
              </Typography>
              {priorityTag}
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12.5 }}>
              {who}
              {statusLine ? <>{who ? ' · ' : ''}{statusLine}</> : null}
            </Typography>
          </Box>
          <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
        </CardContent>
      </AppCard>
    );
  };

  // Configuração dos 4 KPIs com soft badges
  const kpis = [
    {
      label: 'Pacientes Ativos',
      value: patients.length,
      sub: 'carteira acompanhada',
      color: '#0d9488',
      bg: 'rgba(13, 148, 136, 0.12)',
      icon: <GroupsIcon sx={{ fontSize: 26, color: '#0d9488' }} />,
      onClick: () => onSetView('patients'),
    },
    {
      label: 'Com Alerta Clínico',
      value: alerts.length,
      sub: alerts.length === 1 ? '1 requer atenção' : `${alerts.length} requerem atenção`,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      icon: <WarningAmberIcon sx={{ fontSize: 26, color: '#ef4444' }} />,
      onClick: () => {
        onSetPatAlertOnly(true);
        onSetView('patients');
      },
    },
    {
      label: 'Dúvidas de Pacientes',
      value: openQCount,
      sub: openQCount === 1 ? '1 em aberto' : `${openQCount} aguardando`,
      color: '#d97706',
      bg: 'rgba(245, 158, 11, 0.12)',
      icon: <QuestionAnswerIcon sx={{ fontSize: 26, color: '#d97706' }} />,
      onClick: () => {
        onSetView('questions');
        onLoadAllQ();
      },
    },
    {
      label: 'Convites Pendentes',
      value: pendingInv.length,
      sub: pendingInv.length === 1 ? '1 aguardando' : `${pendingInv.length} aguardando`,
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.12)',
      icon: <PersonAddAlt1Icon sx={{ fontSize: 26, color: '#6366f1' }} />,
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
        <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 20, md: 24 }, lineHeight: 1.2 }}>
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
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontSize: { xs: 10, sm: 11 },
                    display: 'block',
                    mb: 0.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
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
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: { xs: 11, sm: 12 },
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
          {/* FILA DE ATENÇÃO: Pacientes com alterações */}
          {alerts.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Stethoscope size={20} weight="duotone" color={COPPER.deep} />
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 16, color: 'text.primary' }}>
                    Precisam de atenção agora
                  </Typography>
                  <Chip size="small" label={alerts.length} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(239,68,68,0.12)', color: '#ef4444' }} />
                </Stack>
                <Button size="small" onClick={() => onSetView('patients')} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>
                  Ver todos
                </Button>
              </Stack>
              <Stack spacing={1.25}>
                {alerts.slice(0, 4).map((p) =>
                  renderPatientRow(
                    p,
                    <>{statusDot(p.maxPriority === 'importante' ? '#ef4444' : p.maxPriority === 'moderada' ? '#f59e0b' : '#eab308')} {PRIORITY_LABEL[p.maxPriority] ?? 'Com alerta'}{p.openQuestions ? ` · ${p.openQuestions} dúvida(s)` : ''}{p.lastExamAt ? ` · exame ${relDays(p.lastExamAt)}` : ''}</>,
                    () => onOpenPatient(p, 'alterados'),
                    <Chip
                      size="small"
                      label={p.maxPriority === 'importante' ? 'Alta' : p.maxPriority === 'moderada' ? 'Média' : 'Leve'}
                      sx={{
                        height: 18,
                        fontSize: 10,
                        fontWeight: 800,
                        bgcolor: p.maxPriority === 'importante' ? 'rgba(239,68,68,0.12)' : p.maxPriority === 'moderada' ? 'rgba(245,158,11,0.12)' : 'rgba(234,179,8,0.12)',
                        color: p.maxPriority === 'importante' ? '#ef4444' : p.maxPriority === 'moderada' ? '#d97706' : '#ca8a04',
                      }}
                    />
                  )
                )}
                {alerts.length > 4 && (
                  <Button size="small" variant="outlined" onClick={() => onSetView('patients')} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                    {`+${alerts.length - 4} outro${alerts.length - 4 > 1 ? 's' : ''} com alerta`}
                  </Button>
                )}
              </Stack>
            </Box>
          )}

          {/* PERGUNTAS AGUARDANDO RESPOSTA */}
          {openQP.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ChatCircle size={20} weight="duotone" color={COPPER.deep} />
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 16, color: 'text.primary' }}>
                    Dúvidas aguardando resposta
                  </Typography>
                  <Chip size="small" label={openQCount} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706' }} />
                </Stack>
                <Button size="small" onClick={() => { onSetView('questions'); onLoadAllQ(); }} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>
                  Abrir Inbox
                </Button>
              </Stack>
              <Stack spacing={1.25}>
                {openQP.slice(0, 3).map((p) =>
                  renderPatientRow(
                    p,
                    `${p.openQuestions} pergunta(s) em aberto`,
                    () => onOpenPatient(p, 'questions'),
                    <Chip size="small" label="Aguardando" sx={{ height: 18, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706' }} />
                  )
                )}
                {openQP.length > 3 && (
                  <Button size="small" variant="outlined" onClick={() => { onSetView('questions'); onLoadAllQ(); }} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                    {`+${openQP.length - 3} paciente${openQP.length - 3 > 1 ? 's' : ''} aguardando resposta`}
                  </Button>
                )}
              </Stack>
            </Box>
          )}

          {/* EXAMES PARA RENOVAR (>1 ano ou sem exames) */}
          {stale.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CalendarBlank size={20} weight="duotone" color={COPPER.deep} />
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 16, color: 'text.primary' }}>
                    Exames para renovar
                  </Typography>
                </Stack>
                <Button size="small" onClick={() => onSetView('patients')} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>
                  Ver todos
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
                Sem exames novos há mais de 1 ano — oportuno solicitar atualização na próxima consulta.
              </Typography>
              <Stack spacing={1.25}>
                {stale.slice(0, 3).map((p) =>
                  renderPatientRow(
                    p,
                    (p.examsCount ?? 0) === 0 ? 'sem exames compartilhados ainda' : `último exame ${relDays(p.lastExamAt)}`,
                    () => onOpenPatient(p)
                  )
                )}
                {stale.length > 3 && (
                  <Button size="small" variant="outlined" onClick={() => onSetView('patients')} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                    {`+${stale.length - 3} para renovar`}
                  </Button>
                )}
              </Stack>
            </Box>
          )}

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
                <ChartLineUp size={20} weight="bold" color="#0f766e" />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1.2 }}>
                  Panorama da Carteira
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11.5 }}>
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

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 2, fontSize: 11, lineHeight: 1.4 }}>
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
              <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}>
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
                <Diamond size={16} weight="fill" color="#6366f1" />
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#6366f1' }}>
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
