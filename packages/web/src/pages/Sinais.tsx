/**
 * Sinais Vitais — hub de sinais do Health Connect (estudo 16/10/26, docs/research).
 *
 * Padrão "Today" do Fitbit/FitnessView: herói com anel de meta + tiles de sinais +
 * tendências por métrica — mas com a identidade Dr. Exame (teal, Poppins, cards 16px)
 * e o nosso diferencial: é a ponte entre exames (foto) e rotina (filme).
 *
 * EXCLUSIVA DE QUEM CONECTA: a porta de entrada é o ActivityCard conectado
 * (fase data). Sem Health Connect/sem dado sincronizado → estado de convite, não
 * dashboard vazio. Duas fontes como o card: device (bridge HC) | cloud (consolidado
 * que o APK sincronizou — services/activitySummary).
 *
 * Sem recharts de propósito: barras SVG leves (padrão ActivityCard) mantêm a página
 * instantânea no WebView do APK e no 3G.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box, Stack, Typography, Skeleton, ToggleButtonGroup, ToggleButton, IconButton, Alert, alpha, useTheme,
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
import { AppCard } from '../components/AppCard';
import { GradientButton } from '../components/GradientButton';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
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
/** Exercício: 30 min/dia ≈ os 150 min/semana da OMS (usado só p/ cor da barra). */
const EXERCISE_DAILY_MIN = 30;

export const SinaisPage = () => {
  const theme = useTheme();
  const notify = useNotify();
  const supported = useMemo(healthConnectSupported, []);
  const [phase, setPhase] = useState<'loading' | 'denied' | 'data'>('loading');
  const [days, setDays] = useState<ActivityDay[] | null>(null);
  const [range, setRange] = useState<ActivityRange>('7d');
  const [syncing, setSyncing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | undefined>();

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
      if (supported && d?.length) { try { await syncActivityToServer(d); } catch { /* staleness não bloqueia a página */ } }
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
    if (outcome.code === 'denied') return; // recusou — sem drama
    setConnectError(permissionOutcomeMessage(outcome.code));
  };

  const s = summarize(days ?? [], range);
  const maxSteps = Math.max(...s.series.map((d) => d.steps), 1);
  const goalPct = Math.round(s.goalRatio * 100);
  const primarySteps = range === 'today' ? s.steps : s.totalSteps;
  const primaryKcal = range === 'today' ? s.kcal : s.totalKcal;
  const primaryKm = range === 'today' ? s.km : s.totalKm;
  const periodMetricLabel = range === 'today' ? undefined : `Total ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`;

  return (
    <PageContainer>
      <PageHeader
        icon={<MonitorHeartIcon />}
        title="Sinais Vitais"
        subtitle="Seus sinais entre um exame e outro — lidos do Health Connect do celular"
        actions={
          <Stack direction="row" spacing={0.5} alignItems="center">
            {!supported && cloudSyncedAt && (() => {
              const st = syncStamp(cloudSyncedAt);
              return (
                <Typography noWrap title="Última sincronização feita pelo app Dr. Exame no seu celular" sx={{ fontSize: 12, color: 'text.disabled' }}>
                  Sincronizado {st.label}{st.stale ? ' · atualize pelo app' : ''}
                </Typography>
              );
            })()}
            {supported && phase === 'data' && (
              <IconButton
                size="small" aria-label="Atualizar e sincronizar" title="Atualizar do celular e sincronizar"
                disabled={syncing} onClick={() => void refresh()}
                sx={{
                  color: 'primary.dark', bgcolor: alpha(theme.palette.primary.main, 0.10),
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                  '@keyframes DxSpin': { to: { transform: 'rotate(360deg)' } },
                  '& .MuiSvgIcon-root': { fontSize: 18, ...(syncing ? { animation: 'DxSpin 1s linear infinite' } : {}) },
                }}
              >
                <SyncIcon />
              </IconButton>
            )}
          </Stack>
        }
      />

      {/* ── Estado de convite (sem conexão): a página SÓ existe de verdade pra quem conecta. */}
      {(phase === 'denied' || (phase === 'data' && !days?.length)) && (
        <AppCard sx={{ p: 3, textAlign: 'center', display: 'grid', placeItems: 'center', minHeight: '42vh' }}>
          <Box sx={{ width: 56, height: 56, mx: 'auto', mb: 1.5, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette.primary.main, 0.10), color: 'primary.dark' }}>
            <MonitorHeartIcon sx={{ fontSize: 28 }} />
          </Box>
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 17, mb: 0.5 }}>
            {phase === 'denied' ? 'Conecte o Health Connect' : 'Aguardando seus primeiros sinais'}
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, maxWidth: 420, mx: 'auto' }}>
            {phase === 'denied'
              ? 'Sua rotina — passos, sono, calorias, distância e frequência cardíaca — entra aqui e conversa com seus exames.'
              : 'Assim que o app do celular sincronizar sua primeira leitura do Health Connect, seus sinais aparecem aqui.'}
          </Typography>
          {supported && phase === 'denied' && (
            <GradientButton sx={{ mt: 2 }} onClick={() => void connect()}>Conectar agora</GradientButton>
          )}
          {connectError && <Alert severity="warning" sx={{ mt: 1.5, borderRadius: '12px', fontSize: 13, textAlign: 'left' }}>{connectError}</Alert>}
        </AppCard>
      )}

      {phase === 'loading' && (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={150} />
          <Skeleton variant="rounded" height={100} />
          <Skeleton variant="rounded" height={100} />
        </Stack>
      )}

      {/* ── HERO: anel de passos + minis de sinais (mesma linguagem do ActivityCard). */}
      {phase === 'data' && !!days?.length && (
        <>
          <ToggleButtonGroup
            exclusive size="small" value={range}
            onChange={(_, v) => { if (v) { hapticLight(); setRange(v as ActivityRange); } }}
            aria-label="Período dos sinais"
            sx={{ mb: 1.5, '& .MuiToggleButton-root': { px: 1.5, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, borderRadius: '99px !important', border: '1px solid', borderColor: 'divider', textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'text.secondary', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.15), color: 'primary.dark', borderColor: alpha(theme.palette.primary.main, 0.4) } } }}
          >
            {RANGES.map((r) => (
              <ToggleButton key={r.value} value={r.value} disabled={!supported && r.value === 'today'} title={!supported && r.value === 'today' ? 'O dado de hoje chega pela sincronização do app no celular' : undefined}>{r.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>

          <AppCard sx={{ p: 2, mb: 1.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.75, sm: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                <ActivityRing ratio={s.goalRatio} pct={goalPct} done={s.goalRatio >= 1} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {range === 'today' ? 'Passos hoje' : `Passos em ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`}
                  </Typography>
                  <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.5rem, 8vw, 2rem)', sm: 34 }, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{fmtSteps(primarySteps)}</Typography>
                    {s.goalRatio >= 1 && <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main', mb: 0.5 }} aria-label="meta batida" />}
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.25, lineHeight: 1.35 }}>
                    {s.goalRatio >= 1 ? 'meta batida 🎉' : `${goalPct}% da meta de ${fmtSteps(STEPS_GOAL)}`}
                  </Typography>
                </Box>
              </Stack>
              <Box sx={{ flex: { sm: 1 }, minWidth: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(auto-fit, minmax(140px, 1fr))', sm: '1fr 1fr' }, gap: { xs: 1.25, sm: 1 } }}>
                {primaryKcal > 0 && (
                  <MetricMini icon={<LocalFireDepartmentIcon sx={{ fontSize: 15 }} />} tone={SEM.warn[theme.palette.mode]} label={s.kcalIsTotal ? 'Calorias totais' : 'Calorias'} value={fmtKcal(primaryKcal)} unit="kcal" contextLabel={periodMetricLabel} />
                )}
                <MetricMini icon={<RouteIcon sx={{ fontSize: 15 }} />} tone={SEM.info[theme.palette.mode]} label="Distância" value={fmtKm(primaryKm)} unit="km" contextLabel={periodMetricLabel} />
                {(s.hrRest ?? 0) > 0 && (
                  <MetricMini icon={<FavoriteIcon sx={{ fontSize: 15 }} />} tone={SEM.bad[theme.palette.mode]} label="FC de repouso" value={`${Math.round(s.hrRest ?? 0)}`} unit="bpm" contextLabel={range === 'today' ? undefined : `média ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`} />
                )}
                {(s.sleepMin ?? 0) > 0 && (
                  <MetricMini icon={<BedtimeIcon sx={{ fontSize: 15 }} />} tone={SEM.info[theme.palette.mode]} label="Sono" value={fmtSleep(s.sleepMin ?? 0)} unit="" contextLabel={range === 'today' ? 'última noite' : `média/noite`} />
                )}
                {(s.exerciseMin ?? 0) >= 10 && (
                  <MetricMini icon={<TimerIcon sx={{ fontSize: 15 }} />} tone={SEM.ok[theme.palette.mode]} label="Exercício" value={`${Math.round(s.exerciseMin ?? 0)} min`} unit="" contextLabel={range === 'today' ? undefined : 'no período'} />
                )}
              </Box>
            </Stack>
          </AppCard>

          {/* ── TENDÊNCIAS: uma barra por dia, cor por meta (padrão FitnessView/Fitbit).
              Delta honesto: 1ª metade × 2ª metade do período (as duas fontes têm 30d). */}
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15, mt: 1.5, mb: 1 }}>Tendências</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
            <TrendCard
              icon={<BedtimeIcon sx={{ fontSize: 16 }} />} tone={SEM.info[theme.palette.mode]} label="Sono"
              value={fmtSleep(avgOf(days, 'sleepMin', range))} valueSub="média/noite"
              series={s.series.map((d) => ({ date: d.date, v: d.sleepMin }))}
              goal={SLEEP_GOAL_MIN} fmtBar={(v) => `${fmtSleep(v)} de sono`}
              delta={deltaPct(days, 'sleepMin', range)} deltaGoodWhenLower={false}
            />
            {(s.hrRest ?? 0) > 0 && (
              <TrendCard
                icon={<FavoriteIcon sx={{ fontSize: 16 }} />} tone={SEM.bad[theme.palette.mode]} label="FC de repouso"
                value={`${Math.round(s.hrRest ?? 0)}`} valueSub="bpm"
                series={fcSeries(days, range)}
                goal={undefined} fmtBar={(v) => `${Math.round(v)} bpm`}
                delta={deltaPct(days, 'hrRest', range)} deltaGoodWhenLower={true}
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
                series={s.series.map((d) => ({ date: d.date, v: 0 }))} // exercício não está na série diária do contrato — sem barras mentirosas
                goal={EXERCISE_DAILY_MIN} fmtBar={(v) => `${Math.round(v)} min`}
                footer="OMS recomenda 150 min de atividade moderada por semana"
                delta={deltaPct(days, 'exerciseMin', range)} deltaGoodWhenLower={false}
              />
            )}
          </Box>

          <Alert severity="info" icon={false} sx={{ mt: 2, borderRadius: '14px', fontSize: 12.5, bgcolor: alpha(theme.palette.primary.main, 0.06), border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`, color: 'text.secondary' }}>
            Dados do <strong>Health Connect</strong> do Google — só leitura, no seu celular. Esta página é informativa e não substitui avaliação médica; leve suas dúvidas ao médico.
          </Alert>
        </>
      )}
    </PageContainer>
  );
};

/** Média de um campo no range (ignora 0 = sem dado — sono/FC não mentem "zero"). */
const avgOf = (days: ActivityDay[] | null, key: 'sleepMin' | 'hrRest', range: ActivityRange): number => {
  if (!days?.length) return 0;
  const slice = days.slice(0, range === 'today' ? 1 : range === '7d' ? 7 : 30).filter((d) => (d[key] ?? 0) > 0);
  if (!slice.length) return 0;
  return slice.reduce((t, d) => t + (d[key] ?? 0), 0) / slice.length;
};

/** Série ASC da FC de repouso (o summarize não carrega hrRest no `series` — vem dos dias). */
const fcSeries = (days: ActivityDay[] | null, range: ActivityRange): { date: string; v: number }[] =>
  (days ?? []).slice(0, range === 'today' ? 1 : range === '7d' ? 7 : 30).reverse().map((d) => ({ date: d.date, v: d.hrRest ?? 0 }));

/** Delta honesto: 1ª metade × 2ª metade da janela (funciona nas DUAS fontes — device e
 *  cloud só carregam 30d, então "vs mês anterior" seria inventado). Null = sem dado suficiente. */
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
 * TrendCard — cartão de tendência de UMA métrica: valor do período, barras por dia
 * (cor por meta quando existe), delta 1ª×2ª metade e nota educativa opcional.
 * Barras são <Box> div (sem botão aqui — a interação por dia fica no ActivityCard).
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
    <AppCard sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '9px', display: 'grid', placeItems: 'center', bgcolor: `${tone}1E`, color: tone }}>{icon}</Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', flex: 1 }}>{label}</Typography>
        {typeof delta === 'number' && delta !== 0 && (() => {
          const good = deltaGoodWhenLower ? delta < 0 : delta > 0;
          return (
            <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 800, px: 0.75, py: 0.25, borderRadius: '99px', bgcolor: alpha(good ? '#059669' : '#d97706', 0.14), color: good ? '#047857' : '#b45309' }} title="Comparando a 1ª com a 2ª metade do período">
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
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 30 }} role="img" aria-label={vals.map((p) => `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}: ${fmtBar(p.v)}`).join(', ')}>
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
      {footer && <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 1, lineHeight: 1.45 }}>{footer}</Typography>}
    </AppCard>
  );
};
