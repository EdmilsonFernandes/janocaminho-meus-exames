/**
 * Sinais Vitais — hub de sinais integrados do Health Connect / Google Fit / Apple Health.
 *
 * Inspirado nos melhores apps de saúde do mundo (Google Fit, Apple Health, Telemedicina Morsch,
 * Consultorio.me e Unimed):
 * - Herói com anel de metas concêntrico + chips de métricas (zero quebra de texto).
 * - Indicador dos 7 dias da semana (S T Q Q S S D) com dias de meta batida (do Google Fit).
 * - Destaques & Insights clínicos em linguagem natural (do Apple Health).
 * - Ficha de Sinais para a consulta médica / teleconsulta (com 1 toque para copiar).
 * - Tendências com variação percentual semântica e marco científico (OMS / The Lancet).
 * - Atalhos integrados de medicamentos e saúde mental.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Skeleton, ToggleButtonGroup, ToggleButton,
  IconButton, Alert, Button, Chip, Tooltip, alpha, useTheme,
} from '@mui/material';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RouteIcon from '@mui/icons-material/Route';
import FavoriteIcon from '@mui/icons-material/Favorite';
import TimerIcon from '@mui/icons-material/Timer';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MedicationIcon from '@mui/icons-material/Medication';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { AppCard } from '../components/AppCard';
import { GradientButton } from '../components/GradientButton';
import { PageContainer } from '../components/layout/PageContainer';
import { ActivityRing, MetricMini } from '../components/dashboard/ActivityCard';
import { hapticLight } from '../utils/haptic';
import { SEM } from '../theme';
import {
  fetchActivityDays, hasHealthPermissions, healthConnectSupported, permissionOutcomeMessage,
  requestHealthPermissions, syncActivityToServer,
} from '../services/healthConnect';
import { fetchActivitySummary, summaryToDays, syncStamp } from '../services/activitySummary';
import {
  barHeight, fmtKcal, fmtKm, fmtSleep, fmtSteps, summarize, STEPS_GOAL,
  type ActivityDay, type ActivityRange,
} from '../utils/activityStats';

const RANGES: Array<{ value: ActivityRange; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

/** Meta de sono por noite (min) — consenso de higiene do sono 7-9h; barras cheias a partir de 7h. */
const SLEEP_GOAL_MIN = 420;
/** Exercício: 30 min/dia ≈ os 150 min/semana da OMS. */
const EXERCISE_DAILY_MIN = 30;

export const SinaisPage = () => {
  const theme = useTheme();
  const notify = useNotify();
  const navigate = useNavigate();
  const supported = useMemo(healthConnectSupported, []);
  const [phase, setPhase] = useState<'loading' | 'denied' | 'data'>('loading');
  const [days, setDays] = useState<ActivityDay[] | null>(null);
  const [range, setRange] = useState<ActivityRange>('7d');
  const [syncing, setSyncing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | undefined>();
  const [copiedMedical, setCopiedMedical] = useState(false);

  const load = async (): Promise<ActivityDay[] | null> => {
    if (!supported) {
      setPhase('loading');
      const s = await fetchActivitySummary(30);
      const d = s ? summaryToDays(s) : [];
      setCloudSyncedAt(s?.lastSyncAt ?? null);
      setDays(d.length ? d : null);
      setPhase('data');
      return d.length ? d : null;
    }
    if (!hasHealthPermissions()) { setPhase('denied'); return null; }
    setPhase('loading');
    const d = await fetchActivityDays(30);
    setDays(d);
    setUpdatedAt(d ? new Date() : null);
    setPhase('data');
    return d;
  };

  useEffect(() => {
    void (async () => {
      const d = await load();
      if (supported && d?.length) { try { await syncActivityToServer(d); } catch { /* staleness não bloqueia */ } }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setSyncing(true);
    try {
      const d = await load();
      if (supported && d?.length) { try { await syncActivityToServer(d); } catch { /* idem */ } }
      hapticLight();
    } finally { setSyncing(false); }
  };

  const connect = async () => {
    setConnectError(undefined);
    const outcome = await requestHealthPermissions();
    if (outcome.granted) {
      notify('Dados de atividade conectados 🎉', { type: 'success' });
      await load();
      return;
    }
    if (outcome.code === 'denied') return;
    setConnectError(permissionOutcomeMessage(outcome.code));
  };

  const s = summarize(days ?? [], range);
  const goalPct = Math.round(s.goalRatio * 100);
  const primarySteps = range === 'today' ? s.steps : s.totalSteps;
  const primaryKcal = range === 'today' ? s.kcal : s.totalKcal;
  const primaryKm = range === 'today' ? s.km : s.totalKm;
  const periodMetricLabel = range === 'today' ? undefined : `Total ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`;

  // Cálculo das metas alcançadas nos últimos 7 dias (inspirado no Google Fit do vídeo WhatsApp)
  const last7DaysList = useMemo(() => {
    if (!days?.length) return [];
    return days.slice(0, 7).reverse();
  }, [days]);

  const daysGoalMetCount = useMemo(() => {
    return last7DaysList.filter((d) => d.steps >= STEPS_GOAL).length;
  }, [last7DaysList]);

  // Copiar Ficha de Sinais para o Médico (estilo Telemedicina Morsch / Consultorio.me)
  const handleCopyMedicalSummary = () => {
    hapticLight();
    const text = `📋 *Ficha de Sinais Vitais - Dr. Exame*\n` +
      `• Passos médios: ${fmtSteps(s.avgSteps)} passos/dia (${rangeLabel(range)})\n` +
      `• Frequência Cardíaca de Repouso: ${s.hrRest ? Math.round(s.hrRest) + ' bpm' : 'Não registrada'}\n` +
      `• Sono médio: ${fmtSleep(avgOf(days, 'sleepMin', range)) || 'Não registrado'}\n` +
      `• Atividade/Exercício: ${Math.round(s.totalExercise ?? 0)} min acumulados no período\n` +
      `• Gasto Calórico Médio: ${fmtKcal(s.avgKcal)} kcal/dia\n` +
      `_Dados lidos via Health Connect e consolidados no Dr. Exame._`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedMedical(true);
      notify('Resumo copiado! Pronto para colar no WhatsApp do seu médico.', { type: 'success' });
      setTimeout(() => setCopiedMedical(false), 3000);
    }).catch(() => {
      notify('Não foi possível copiar automaticamente.', { type: 'warning' });
    });
  };

  return (
    <PageContainer>
      {/* Barra de Navegação Superior Refinada com Voltar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: 13,
            color: 'text.secondary',
            px: 1.5,
            py: 0.5,
            borderRadius: '99px',
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
          }}
        >
          Voltar ao Início
        </Button>

        <Stack direction="row" spacing={1} alignItems="center">
          {!supported && cloudSyncedAt && (() => {
            const st = syncStamp(cloudSyncedAt);
            return (
              <Chip
                size="small"
                variant="outlined"
                label={`Sincronizado ${st.label}${st.stale ? ' · pelo celular' : ''}`}
                sx={{ fontSize: 11, fontWeight: 600, borderColor: 'divider' }}
              />
            );
          })()}
          {supported && updatedAt && (
            <Chip
              size="small"
              variant="outlined"
              label={`Sincronizado ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
              sx={{ fontSize: 11, fontWeight: 600, borderColor: 'divider' }}
            />
          )}
          {supported && phase === 'data' && (
            <IconButton
              size="small"
              aria-label="Atualizar e sincronizar"
              title="Atualizar do celular e sincronizar"
              disabled={syncing}
              onClick={() => void refresh()}
              sx={{
                color: 'primary.dark',
                bgcolor: alpha(theme.palette.primary.main, 0.10),
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                '@keyframes DxSpin': { to: { transform: 'rotate(360deg)' } },
                '& .MuiSvgIcon-root': { fontSize: 18, ...(syncing ? { animation: 'DxSpin 1s linear infinite' } : {}) },
              }}
            >
              <SyncIcon />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Cabeçalho da Página com Identidade Visual Premium */}
      <Box sx={{ mb: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '14px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              color: 'primary.dark',
            }}
          >
            <MonitorHeartIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 22, sm: 26 }, color: 'text.primary', lineHeight: 1.15 }}>
              Sinais Vitais
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              Seus sinais contínuos entre um exame e outro — lidos do Health Connect
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Estado sem conexão */}
      {(phase === 'denied' || (phase === 'data' && !days?.length)) && (
        <AppCard sx={{ p: 4, textAlign: 'center', display: 'grid', placeItems: 'center', minHeight: '42vh', borderRadius: '20px' }}>
          <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '20px', display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette.primary.main, 0.10), color: 'primary.dark' }}>
            <MonitorHeartIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 19, mb: 0.75 }}>
            {phase === 'denied' ? 'Conecte o Health Connect' : 'Aguardando seus primeiros sinais'}
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6, maxWidth: 440, mx: 'auto', mb: 2 }}>
            {phase === 'denied'
              ? 'Sua rotina — passos, sono, calorias, distância e frequência cardíaca — entra aqui e conversa com seus exames de sangue.'
              : 'Assim que o app do celular sincronizar sua primeira leitura do Health Connect, seus sinais aparecem aqui.'}
          </Typography>
          {supported && phase === 'denied' && (
            <GradientButton sx={{ px: 4, py: 1.25, borderRadius: '12px' }} onClick={() => void connect()}>
              Conectar agora
            </GradientButton>
          )}
          {connectError && <Alert severity="warning" sx={{ mt: 2, borderRadius: '12px', fontSize: 13, textAlign: 'left' }}>{connectError}</Alert>}
        </AppCard>
      )}

      {phase === 'loading' && (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={160} sx={{ borderRadius: '16px' }} />
          <Skeleton variant="rounded" height={100} sx={{ borderRadius: '16px' }} />
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: '16px' }} />
        </Stack>
      )}

      {/* ── PAINEL PRINCIPAL COM DADOS ── */}
      {phase === 'data' && !!days?.length && (
        <Stack spacing={2.5}>
          {/* Seletor de Período Estilo Apple Health */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={range}
              onChange={(_, v) => { if (v) { hapticLight(); setRange(v as ActivityRange); } }}
              aria-label="Período dos sinais"
              sx={{
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                p: 0.4,
                borderRadius: '99px',
                border: '1px solid',
                borderColor: 'divider',
                '& .MuiToggleButton-root': {
                  px: 2,
                  py: 0.5,
                  borderRadius: '99px !important',
                  border: 'none',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: '#fff',
                    color: 'primary.dark',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  },
                },
              }}
            >
              {RANGES.map((r) => (
                <ToggleButton key={r.value} value={r.value} disabled={!supported && r.value === 'today'} title={!supported && r.value === 'today' ? 'O dado de hoje chega pela sincronização do app no celular' : undefined}>
                  {r.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* 1. HERO CARD: ANEL CONCÊNTRICO + PASSOS + CHIPS DE SINAIS (ZERO QUEBRA VERTICAL) */}
          <AppCard sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '20px' }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <ActivityRing ratio={s.goalRatio} pct={goalPct} done={s.goalRatio >= 1} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>
                    {range === 'today' ? 'Passos hoje' : `Passos em ${rangeLabel(range).toLowerCase()}`}
                  </Typography>
                  <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 32, sm: 38 }, lineHeight: 1.1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtSteps(primarySteps)}
                    </Typography>
                    {s.goalRatio >= 1 && <CheckCircleIcon sx={{ fontSize: 22, color: 'success.main', mb: 0.5 }} aria-label="meta batida" />}
                  </Stack>
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25, lineHeight: 1.4 }}>
                    {s.goalRatio >= 1
                      ? 'Parabéns! Meta batida com sucesso 🎉'
                      : `${goalPct}% da meta diária de ${fmtSteps(STEPS_GOAL)} passos`}
                    {' · '}
                    <Typography component="span" sx={{ color: 'primary.dark', fontWeight: 700, fontSize: 12 }}>
                      Estudos (Lancet): benefício a partir de 7.000
                    </Typography>
                  </Typography>
                </Box>
              </Stack>

              {/* Grid 4 métricas perfeitamente alinhadas (Calorias, Distância, FC, Sono, Exercício) */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
                {primaryKcal > 0 && (
                  <MetricMini icon={<LocalFireDepartmentIcon sx={{ fontSize: 16 }} />} tone={SEM.warn[theme.palette.mode]} label={s.kcalIsTotal ? 'Calorias totais' : 'Calorias'} value={fmtKcal(primaryKcal)} unit="kcal" contextLabel={periodMetricLabel} />
                )}
                <MetricMini icon={<RouteIcon sx={{ fontSize: 16 }} />} tone={SEM.info[theme.palette.mode]} label="Distância" value={fmtKm(primaryKm)} unit="km" contextLabel={periodMetricLabel} />
                {(s.hrRest ?? 0) > 0 && (
                  <MetricMini icon={<FavoriteIcon sx={{ fontSize: 16 }} />} tone={SEM.bad[theme.palette.mode]} label="FC de repouso" value={`${Math.round(s.hrRest ?? 0)}`} unit="bpm" contextLabel={range === 'today' ? undefined : `média ${rangeLabel(range).toLowerCase()}`} />
                )}
                {(s.sleepMin ?? 0) > 0 && (
                  <MetricMini icon={<BedtimeIcon sx={{ fontSize: 16 }} />} tone={SEM.info[theme.palette.mode]} label="Sono" value={fmtSleep(s.sleepMin ?? 0)} unit="" contextLabel={range === 'today' ? 'última noite' : `média/noite`} />
                )}
                {(s.exerciseMin ?? 0) >= 10 && (
                  <MetricMini icon={<TimerIcon sx={{ fontSize: 16 }} />} tone={SEM.ok[theme.palette.mode]} label="Exercício" value={`${Math.round(s.exerciseMin ?? 0)} min`} unit="" contextLabel={range === 'today' ? undefined : 'no período'} />
                )}
              </Box>
            </Stack>
          </AppCard>

          {/* 2. CARD DO GOOGLE FIT: METAS SEMANAIS DOS 7 DIAS (S T Q Q S S D) + OMS */}
          {last7DaysList.length > 0 && (
            <AppCard sx={{ p: 2, borderRadius: '18px', bgcolor: (t) => alpha(t.palette.primary.main, 0.03), border: '1px solid', borderColor: (t) => alpha(t.palette.primary.main, 0.12) }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Suas metas diárias · Últimos 7 dias
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 20, color: 'text.primary' }}>
                      {daysGoalMetCount} de {last7DaysList.length}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>dias alcançados</Typography>
                  </Stack>
                </Box>

                {/* As 7 bolinhas da semana (S T Q Q S S D) inspiradas no Google Fit */}
                <Stack direction="row" spacing={1} alignItems="center">
                  {last7DaysList.map((d) => {
                    const dt = new Date(`${d.date}T12:00:00`);
                    const dayLetter = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][dt.getDay()];
                    const met = d.steps >= STEPS_GOAL;
                    return (
                      <Tooltip key={d.date} title={`${dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}: ${fmtSteps(d.steps)} passos`}>
                        <Stack spacing={0.5} alignItems="center">
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              display: 'grid',
                              placeItems: 'center',
                              bgcolor: met ? '#059669' : alpha(theme.palette.text.disabled, 0.18),
                              color: met ? '#fff' : 'text.disabled',
                              fontSize: 12,
                              fontWeight: 800,
                              boxShadow: met ? '0 2px 6px rgba(5,150,105,0.35)' : 'none',
                              transition: 'transform .15s ease',
                              '&:hover': { transform: 'scale(1.1)' },
                            }}
                          >
                            {met ? '✓' : ''}
                          </Box>
                          <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.secondary' }}>
                            {dayLetter}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Stack>

              {/* Mensagem OMS */}
              <Box sx={{ mt: 1.5, pt: 1.25, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                  🏛️ <strong>Meta OMS:</strong> 150 min de atividade aeróbica moderada por semana ajudam a reduzir em até 30% o risco cardiovascular e melhoram marcadores de glicose e triglicerídeos.
                </Typography>
              </Box>
            </AppCard>
          )}

          {/* 3. DESTAQUES & INSIGHTS DE SAÚDE (ESTILO APPLE HEALTH "HIGHLIGHTS") */}
          <Box>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 16, mb: 1.25, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <AutoAwesomeIcon sx={{ fontSize: 19, color: 'primary.main' }} /> Destaques & Insights de Saúde
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              {/* Insight 1: Frequência Cardíaca de Repouso */}
              {(s.hrRest ?? 0) > 0 && (
                <AppCard sx={{ p: 2, borderRadius: '16px' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                    <FavoriteIcon sx={{ fontSize: 18, color: '#ef4444' }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                      Coração & Repouso
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', lineHeight: 1.45, mb: 0.5 }}>
                    Sua frequência cardíaca de repouso média está em {Math.round(s.hrRest ?? 0)} bpm.
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>
                    {s.hrRest! <= 80
                      ? 'Excelente indicador de eficiência miocárdica e baixo estresse cardiovascular.'
                      : 'Batimentos em repouso ligeiramente aumentados. Manter boa hidratação e sono regular ajuda a estabilizar.'}
                  </Typography>
                </AppCard>
              )}

              {/* Insight 2: Passos e Longevidade */}
              <AppCard sx={{ p: 2, borderRadius: '16px' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                  <DirectionsWalkIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.dark', textTransform: 'uppercase' }}>
                    Passos & Longevidade
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', lineHeight: 1.45, mb: 0.5 }}>
                  {s.avgSteps >= 7000
                    ? `Média de ${fmtSteps(s.avgSteps)} passos/dia — você ultrapassou o marco científico!`
                    : `Média de ${fmtSteps(s.avgSteps)} passos/dia — meta recomendada é de 7.000 a 8.000.`}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>
                  Estudos no The Lancet confirmam que atingir 7.000 passos diários promove o maior salto de proteção preventiva contra doenças metabólicas.
                </Typography>
              </AppCard>
            </Box>
          </Box>

          {/* 4. CARDS DE TENDÊNCIAS COM ESTÉTICA APPLE HEALTH */}
          <Box>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 16, mb: 1.25 }}>
              Tendências Detalhadas
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              <TrendCard
                icon={<BedtimeIcon sx={{ fontSize: 16 }} />} tone={SEM.info[theme.palette.mode]} label="Sono"
                value={fmtSleep(avgOf(days, 'sleepMin', range))} valueSub="média/noite"
                series={s.series.map((d) => ({ date: d.date, v: d.sleepMin }))}
                goal={SLEEP_GOAL_MIN} fmtBar={(v) => `${fmtSleep(v)} de sono`}
                delta={deltaPct(days, 'sleepMin', range)} deltaGoodWhenLower={false}
                footer="Consenso AASM: 7 a 9 horas diárias para reparação física e cognitiva."
              />
              {(s.hrRest ?? 0) > 0 && (
                <TrendCard
                  icon={<FavoriteIcon sx={{ fontSize: 16 }} />} tone={SEM.bad[theme.palette.mode]} label="FC de repouso"
                  value={`${Math.round(s.hrRest ?? 0)}`} valueSub="bpm"
                  series={fcSeries(days, range)}
                  goal={undefined} fmtBar={(v) => `${Math.round(v)} bpm`}
                  delta={deltaPct(days, 'hrRest', range)} deltaGoodWhenLower={true}
                  footer="A tendência de médio prazo importa mais do que uma variação isolada."
                />
              )}
              <TrendCard
                icon={<DirectionsWalkIcon sx={{ fontSize: 16 }} />} tone={theme.palette.primary.main} label="Passos"
                value={fmtSteps(range === 'today' ? s.steps : s.avgSteps)} valueSub={range === 'today' ? 'hoje' : 'média/dia'}
                series={s.series.map((d) => ({ date: d.date, v: d.steps }))}
                goal={STEPS_GOAL} fmtBar={(v) => `${fmtSteps(v)} passos`}
                delta={deltaPct(days, 'steps', range)} deltaGoodWhenLower={false}
              />
              <TrendCard
                icon={<RouteIcon sx={{ fontSize: 16 }} />} tone={SEM.info[theme.palette.mode]} label="Distância"
                value={fmtKm(range === 'today' ? s.km : s.avgKm)} valueSub={range === 'today' ? 'hoje' : 'média/dia'}
                series={s.series.map((d) => ({ date: d.date, v: d.km }))}
                goal={undefined} fmtBar={(v) => `${fmtKm(v)} km`}
                delta={deltaPct(days, 'km', range)} deltaGoodWhenLower={false}
              />
              <TrendCard
                icon={<LocalFireDepartmentIcon sx={{ fontSize: 16 }} />} tone={SEM.warn[theme.palette.mode]} label={s.kcalIsTotal ? 'Calorias totais' : 'Calorias'}
                value={fmtKcal(range === 'today' ? s.kcal : s.avgKcal)} valueSub={range === 'today' ? 'hoje' : 'média/dia'}
                series={s.series.map((d) => ({ date: d.date, v: d.kcal }))}
                goal={undefined} fmtBar={(v) => `${fmtKcal(v)} kcal`}
                delta={deltaPct(days, 'kcal', range)} deltaGoodWhenLower={false}
              />
              {(s.exerciseMin ?? 0) > 0 && (
                <TrendCard
                  icon={<TimerIcon sx={{ fontSize: 16 }} />} tone={SEM.ok[theme.palette.mode]} label="Exercício"
                  value={`${Math.round(range === 'today' ? (s.exerciseMin ?? 0) : (s.totalExercise ?? 0))}`} valueSub={range === 'today' ? 'min hoje' : 'min no período'}
                  series={s.series.map((d) => ({ date: d.date, v: 0 }))}
                  goal={EXERCISE_DAILY_MIN} fmtBar={(v) => `${Math.round(v)} min`}
                  footer="OMS recomenda 150 min de atividade moderada por semana."
                  delta={deltaPct(days, 'exerciseMin', range)} deltaGoodWhenLower={false}
                />
              )}
            </Box>
          </Box>

          {/* 5. FICHA DE SINAIS PARA O MÉDICO (ESTILO TELEMEDICINA MORSCH / CONSULTORIO.ME) */}
          <AppCard sx={{ p: 2.5, borderRadius: '18px', bgcolor: (t) => alpha(t.palette.background.paper, 0.95), border: '1px solid', borderColor: 'divider' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Box>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AssignmentIcon sx={{ color: 'primary.main', fontSize: 20 }} /> Preparar para sua Consulta Médica
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
                  Resumo pronto dos seus sinais vitais dos últimos 30 dias para você levar à teleconsulta ou ao seu médico.
                </Typography>
              </Box>

              <Button
                variant="contained"
                onClick={handleCopyMedicalSummary}
                startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
                sx={{
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: 13,
                  textTransform: 'none',
                  px: 2,
                  py: 0.85,
                  bgcolor: copiedMedical ? '#059669' : 'primary.main',
                  '&:hover': { bgcolor: copiedMedical ? '#047857' : 'primary.dark' },
                }}
              >
                {copiedMedical ? 'Copiado! ✓' : 'Copiar Resumo Médico'}
              </Button>
            </Stack>
          </AppCard>

          {/* 6. ATALHOS DO ECOSSISTEMA: MEDICAMENTOS & SAÚDE MENTAL */}
          <Box>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 14, color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Rotina & Saúde Preventiva
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              <AppCard
                onClick={() => navigate('/medicamentos')}
                sx={{
                  p: 2,
                  borderRadius: '16px',
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                  '&:hover': { transform: 'translateY(-2px)', borderColor: 'primary.main' },
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha('#0284c7', 0.12), color: '#0284c7' }}>
                    <MedicationIcon />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5 }}>Medicamentos & Lembretes</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Horários, dosagens e adesão do tratamento</Typography>
                  </Box>
                  <ChevronRightIcon sx={{ color: 'text.disabled' }} />
                </Stack>
              </AppCard>

              <AppCard
                onClick={() => navigate('/saude-mental')}
                sx={{
                  p: 2,
                  borderRadius: '16px',
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                  '&:hover': { transform: 'translateY(-2px)', borderColor: 'primary.main' },
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha('#8b5cf6', 0.12), color: '#8b5cf6' }}>
                    <PsychologyIcon />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5 }}>Saúde Mental & Humor</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Diário de humor, estresse e bem-estar</Typography>
                  </Box>
                  <ChevronRightIcon sx={{ color: 'text.disabled' }} />
                </Stack>
              </AppCard>
            </Box>
          </Box>

          {/* Rodapé informativo */}
          <Alert severity="info" icon={false} sx={{ mt: 1, borderRadius: '14px', fontSize: 12, bgcolor: alpha(theme.palette.primary.main, 0.05), border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`, color: 'text.secondary' }}>
            Dados sincronizados com segurança pelo <strong>Google Health Connect</strong>. Esta página é informativa e não substitui avaliação médica clínica.
          </Alert>
        </Stack>
      )}
    </PageContainer>
  );
};

const rangeLabel = (r: ActivityRange): string => {
  switch (r) {
    case 'today': return 'Hoje';
    case '7d': return '7 dias';
    case '30d': return '30 dias';
  }
};

/** Média de um campo no range (ignora 0 = sem dado). */
const avgOf = (days: ActivityDay[] | null, key: 'sleepMin' | 'hrRest', range: ActivityRange): number => {
  if (!days?.length) return 0;
  const slice = days.slice(0, range === 'today' ? 1 : range === '7d' ? 7 : 30).filter((d) => (d[key] ?? 0) > 0);
  if (!slice.length) return 0;
  return slice.reduce((t, d) => t + (d[key] ?? 0), 0) / slice.length;
};

/** Série ASC da FC de repouso. */
const fcSeries = (days: ActivityDay[] | null, range: ActivityRange): { date: string; v: number }[] =>
  (days ?? []).slice(0, range === 'today' ? 1 : range === '7d' ? 7 : 30).reverse().map((d) => ({ date: d.date, v: d.hrRest ?? 0 }));

/** Delta percentual entre 1ª e 2ª metade do período. */
const deltaPct = (days: ActivityDay[] | null, key: 'sleepMin' | 'hrRest' | 'steps' | 'km' | 'kcal' | 'exerciseMin', range: ActivityRange): number | null => {
  if (!days?.length || range === 'today') return null;
  const n = range === '7d' ? 7 : 30;
  const slice = days.slice(0, n);
  if (slice.length < 4) return null;
  const half = Math.floor(slice.length / 2);
  const v = (arr: ActivityDay[]) => arr.filter((d) => (d[key] ?? 0) > 0);
  const a = v(slice.slice(0, half));
  const b = v(slice.slice(half));
  if (!a.length || !b.length) return null;
  const avgA = a.reduce((t, d) => t + (d[key] ?? 0), 0) / a.length;
  const avgB = b.reduce((t, d) => t + (d[key] ?? 0), 0) / b.length;
  if (avgA <= 0) return null;
  return Math.round(((avgB - avgA) / avgA) * 100);
};

/**
 * TrendCard — cartão de tendência de UMA métrica estilo Apple Health:
 * valor do período, barras por dia com cor de meta, delta comparativo e nota clínica.
 */
const TrendCard = ({ icon, tone, label, value, valueSub, series, goal, fmtBar, delta, deltaGoodWhenLower, footer }: {
  icon: React.ReactNode; tone: string; label: string; value: string; valueSub: string;
  series: { date: string; v: number }[]; goal?: number; fmtBar: (v: number) => string;
  delta?: number | null; deltaGoodWhenLower?: boolean; footer?: string;
}) => {
  const theme = useTheme();
  const vals = series.filter((p) => p.v > 0);
  const max = Math.max(...vals.map((p) => p.v), 1);
  return (
    <AppCard sx={{ p: 2, borderRadius: '16px' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '9px', display: 'grid', placeItems: 'center', bgcolor: `${tone}1E`, color: tone }}>{icon}</Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', flex: 1 }}>{label}</Typography>
        {typeof delta === 'number' && delta !== 0 && (() => {
          const good = deltaGoodWhenLower ? delta < 0 : delta > 0;
          return (
            <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 800, px: 0.85, py: 0.25, borderRadius: '99px', bgcolor: alpha(good ? '#059669' : '#d97706', 0.14), color: good ? '#047857' : '#b45309' }} title="Comparando a 1ª com a 2ª metade do período">
              {delta > 0 ? '+' : ''}{delta}%
            </Typography>
          );
        })()}
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mb: 1 }}>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 24, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 600 }}>{valueSub}</Typography>
      </Stack>
      {vals.length > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 32 }} role="img" aria-label={vals.map((p) => `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}: ${fmtBar(p.v)}`).join(', ')}>
          {series.map((p) => (
            <Box key={p.date} sx={{
              flex: 1, minWidth: 2, maxWidth: 18, height: `${Math.max(8, barHeight(p.v, max) * 100)}%`,
              borderRadius: '3px',
              bgcolor: p.v <= 0
                ? alpha(theme.palette.text.primary, 0.08)
                : goal && p.v >= goal
                  ? tone
                  : alpha(tone as string, 0.32),
            }} />
          ))}
        </Box>
      )}
      {footer && <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 1, lineHeight: 1.45 }}>{footer}</Typography>}
    </AppCard>
  );
};
