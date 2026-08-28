import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import { Box, Stack, Typography, Skeleton, ToggleButtonGroup, ToggleButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert, alpha, useTheme } from '@mui/material';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RouteIcon from '@mui/icons-material/Route';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import InsightsIcon from '@mui/icons-material/Insights';
import FavoriteIcon from '@mui/icons-material/Favorite';
import TimerIcon from '@mui/icons-material/Timer';
import { GoogleG, LockSecure } from './GoogleG';
import { AppCard } from '../AppCard';
import { GradientButton } from '../GradientButton';
import { hapticLight } from '../../utils/haptic';
import { fetchActivityDays, hasHealthPermissions, healthConnectSupported, permissionOutcomeMessage, requestHealthPermissions, syncActivityToServer } from '../../services/healthConnect';
import { barHeight, fmtKcal, fmtKm, fmtSteps, summarize, weekOfExam, STEPS_GOAL, type ActivityDay, type ActivityRange } from '../../utils/activityStats';

/**
 * ActivityCard — widget de atividade física (Health Connect) no Dashboard.
 *
 * Mobile-first premium (DESIGN.md "O Consultório de Vidro"): números Poppins 800
 * como herói, lavagens teal p/ hierarquia (The One Gradient Rule — gradiente só no
 * CTA "Conectar"), skeleton elegante, micro-interações (barras crescem, press sutil,
 * haptic ao conectar) e fluxo de permissão com UX writing que explica o VALOR antes
 * do popup nativo. Estados: loading → unsupported (web/desktop) | denied | data.
 */

const RANGES: Array<{ value: ActivityRange; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

const rangeLabel = (r: ActivityRange) => RANGES.find((x) => x.value === r)?.label ?? '';

/** Chave de "esconder card" (o volta é no Perfil → Acessibilidade — mesmo padrão do banner Pro). */
export const ACTIVITY_HIDDEN_KEY = 'dx_activity_hidden';
export const activityCardHidden = (): boolean => { try { return localStorage.getItem(ACTIVITY_HIDDEN_KEY) === '1'; } catch { return false; } };

export const ActivityCard = ({ lastExamAt }: { lastExamAt?: string | null }) => {
  const notify = useNotify();
  const supported = useMemo(healthConnectSupported, []);
  const [hidden, setHidden] = useState(activityCardHidden);
  const [phase, setPhase] = useState<'loading' | 'denied' | 'data'>('loading');
  const [days, setDays] = useState<ActivityDay[] | null>(null);
  const [range, setRange] = useState<ActivityRange>('30d'); // 30d como default (sempre tem dados)
  const [askOpen, setAskOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [connectError, setConnectError] = useState<string | undefined>();
  const [syncing, setSyncing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const hide = () => {
    try { localStorage.setItem(ACTIVITY_HIDDEN_KEY, '1'); } catch { /* localStorage indisponível */ }
    setHidden(true);
    notify('Card de atividade oculto — dá pra trazer de volta em Perfil → Acessibilidade.', { type: 'info' });
  };

  const load = async (): Promise<ActivityDay[] | null> => {
    if (!supported) { setPhase('loading'); return null; }
    if (!hasHealthPermissions()) { setPhase('denied'); return null; }
    setPhase('loading');
    const d = await fetchActivityDays(30);
    setDays(d);
    setUpdatedAt(d ? new Date() : null);
    setPhase('data');
    return d;
  };

  useEffect(() => { void load(); /* eslint-disable-line */ }, []);

  const sync = async (list: ActivityDay[] | null, silent = false) => {
    if (!list?.length) return;
    setSyncing(true);
    try {
      await syncActivityToServer(list);
      if (!silent) { hapticLight(); notify('Atividade sincronizada com o Dr. Exame ✨', { type: 'success' }); }
    } catch {
      if (!silent) notify('Não deu pra sincronizar agora — tenta de novo em instantes.', { type: 'warning' });
    } finally { setSyncing(false); }
  };

  /** Re-lê o Health Connect e sincroniza o que chegou. O Samsung Health (e afins)
   *  exportam pro HC em LOTES — re-ler ao voltar pro app é o que aproxima o card
   *  do tempo real do app de saúde. */
  const refresh = async (silent = false) => {
    const d = await load();
    if (d?.length) await sync(d, silent);
  };

  const connect = async () => {
    setAsking(true);
    setConnectError(undefined);
    const outcome = await requestHealthPermissions();
    console.debug('[DxHealth] connect:', JSON.stringify(outcome)); // visível no adb logcat (debug de campo)
    setAsking(false);
    if (outcome.granted) {
      setAskOpen(false);
      hapticLight();
      notify('Dados de atividade conectados 🎉', { type: 'success' });
      await loadAndSync();
      return;
    }
    if (outcome.code === 'denied') { setAskOpen(false); return; } // usuário recusou — sem drama
    if (outcome.code === 'settings_opened') {
      // FALLBACK abriu o HC settings: o usuário concede lá. Quando VOLTAR pro app,
      // o listener de visibilitychange abaixo re-checa e conecta sozinho.
      setConnectError(permissionOutcomeMessage('settings_opened'));
      return;
    }
    setConnectError(permissionOutcomeMessage(outcome.code));
  };

  // Ao VOLTAR pro app (foreground): (a) vindo do HC settings, re-checa permissões;
  // (b) já conectado, RE-LÊ o dia corrente — o Health Connect recebe dados das apps
  // de saúde em lotes (Samsung Health exporta com atraso), então o "hoje" do card
  // pode estar defasado em relação ao app de saúde.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      if (phase === 'denied') {
        // O usuário voltou do HC settings — deu as permissões?
        if (hasHealthPermissions()) {
          hapticLight();
          notify('Atividade conectada! 🎉', { type: 'success' });
          await loadAndSync();
        }
        return;
      }
      if (phase === 'data') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [phase]);

  const loadAndSync = async () => {
    if (!hasHealthPermissions()) return;
    await refresh(true);
  };

  // ── Shell: o widget só existe no APK (web/desktop → null, sem card morto na 1ª dobra).
  if (!supported || hidden) return null;

  return (
    <ActivityView
      phase={phase}
      days={days}
      range={range}
      onRange={(r) => { hapticLight(); setRange(r); }}
      syncing={syncing}
      updatedAt={updatedAt}
      askOpen={askOpen}
      asking={asking}
      connectError={connectError}
      lastExamAt={lastExamAt}
      onAskOpen={() => { hapticLight(); setConnectError(undefined); setAskOpen(true); }}
      onAskClose={() => setAskOpen(false)}
      onConfirm={connect}
      onSync={() => { hapticLight(); void refresh(); }}
      onHide={hide}
    />
  );
};

/**
 * ActivityView — apresentação PURA do widget (sem I/O): os estados são props,
 * o que a torna determinística em teste (renderToString) e reutilizável.
 * Shell (estado/permissões/sync) fica no ActivityCard acima.
 */
export const ActivityView = ({
  phase, days, range, onRange, syncing, updatedAt, askOpen, asking, connectError, lastExamAt, onAskOpen, onAskClose, onConfirm, onSync, onHide,
}: {
  phase: 'loading' | 'denied' | 'data';
  days: ActivityDay[] | null;
  range: ActivityRange;
  onRange: (r: ActivityRange) => void;
  syncing: boolean;
  updatedAt: Date | null;
  askOpen: boolean;
  asking: boolean;
  /** Motivo da última falha de conexão (aparece DENTRO do dialog, com retry a 1 toque). */
  connectError?: string;
  /** Data do último exame (ISO) — ativa o insight "na semana do seu exame" (Onda 2). */
  lastExamAt?: string | null;
  onAskOpen: () => void;
  onAskClose: () => void;
  onConfirm: () => void;
  onSync: () => void;
  /** Esconder o card (persistente; volta em Perfil → Acessibilidade). */
  onHide: () => void;
}) => {
  const theme = useTheme();

  if (phase === 'loading' && !days) {
    return (
      <AppCard sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Skeleton variant="rounded" width={140} height={20} animation="wave" />
          <Skeleton variant="rounded" width={72} height={32} animation="wave" />
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Skeleton variant="rounded" width={118} height={56} animation="wave" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="rounded" height={14} sx={{ mb: 1 }} animation="wave" />
            <Skeleton variant="rounded" height={14} width="60%" animation="wave" />
          </Box>
        </Stack>
        <Skeleton variant="rounded" height={26} sx={{ mt: 2 }} animation="wave" />
      </AppCard>
    );
  }

  if (phase === 'denied') {
    return (
      <AppCard sx={{ p: 2, position: 'relative' }}>
        {/* Quem não quer o card NÃO fica com ele pra sempre: esconde (volta em Perfil → Acessibilidade). */}
        <IconButton size="small" aria-label="Ocultar card de atividade" title="Ocultar (volta em Perfil → Acessibilidade)" onClick={onHide}
          sx={{ position: 'absolute', top: 6, right: 6, color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
          <VisibilityOffIcon sx={{ fontSize: 16 }} />
        </IconButton>

        {/* MÓDULO DE INTEGRAÇÃO GOOGLE (premium, ref: ideiaSaudeConnect.jpg):
            G multicolor + Health Connect + cadeado de segurança — comunicação
            instantânea de "integração oficial e segura do Google". */}
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{
            mb: 1.5, px: 1.5, py: 1.25,
            borderRadius: '12px',
            bgcolor: 'rgba(32,178,170,0.04)',
            border: '1px solid rgba(32,178,170,0.15)',
          }}
        >
          <GoogleG size={28} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
              Conectado com segurança via
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1a73e8', lineHeight: 1.3 }}>
              Google Health Connect
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            <LockSecure size={13} color="#5f6368" />
            <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600 }}>Dados seguros</Typography>
          </Stack>
        </Stack>

        <Stack spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }} direction={{ xs: 'column', sm: 'row' }}>
          <Box sx={{ position: 'relative', width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette.primary.main, 0.10), color: 'primary.dark', mx: { xs: 'auto', sm: 0 }, flexShrink: 0 }}>
            <DirectionsWalkIcon />
            <Box component="img" src="hc-icon.png" alt="" onError={(e: any) => { e.currentTarget.style.display = 'none'; }} sx={{ position: 'absolute', width: 30, height: 30, borderRadius: '8px' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15 }}>
              Seus passos podem entrar aqui
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5, mt: 0.25 }}>
              Passos, calorias e distância do seu celular entram junto com seus exames — o Dr. Exame conecta tudo.
            </Typography>
          </Box>
        </Stack>

        {/* Botão VERDE GOOGLE com G multicolor dentro (ref: imagem premium oficial) */}
        <Button
          fullWidth
          onClick={onAskOpen}
          startIcon={<GoogleG size={18} />}
          sx={{
            mt: 2, py: 1.25, borderRadius: '12px',
            bgcolor: '#34A853', color: '#fff',
            fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14,
            textTransform: 'none', letterSpacing: 0,
            boxShadow: '0 4px 12px rgba(52,168,83,0.35)',
            '&:hover': { bgcolor: '#2d9249', boxShadow: '0 6px 16px rgba(52,168,83,0.45)' },
            '&:active': { transform: 'scale(0.98)' },
            '& .MuiButton-startIcon': { mr: 1 },
          }}
        >
          Conectar atividade
        </Button>

        <PermissionRationaleDialog open={askOpen} onClose={onAskClose} onConfirm={onConfirm} asking={asking} error={connectError} />
      </AppCard>
    );
  }

  const s = summarize(days ?? [], range);
  const maxSteps = Math.max(...s.series.map((d) => d.steps), 1);
  const goalPct = Math.round(s.goalRatio * 100);
  const primarySteps = range === 'today' ? s.steps : s.totalSteps;
  const primaryKcal = range === 'today' ? s.kcal : s.totalKcal;
  const primaryKm = range === 'today' ? s.km : s.totalKm;
  const stepsLabel = range === 'today' ? 'Passos hoje' : `Passos em ${rangeLabel(range).toLowerCase()}`;
  const stepsSupport = range === 'today' ? (s.goalRatio >= 1 ? 'meta batida 🎉' : `${goalPct}% da meta`) : `média ${fmtSteps(s.avgSteps)}/dia`;
  const periodMetricLabel = range === 'today' ? undefined : `Média ${rangeLabel(range).toLowerCase()}`;

  return (
    <AppCard sx={{ p: 2 }}>
      {/* Cabeçalho: título + range + sync */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <DirectionsWalkIcon sx={{ fontSize: 19, color: 'primary.dark' }} /> Atividade física
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {updatedAt && (
            <Typography noWrap title="Hora da última leitura do Health Connect" sx={{ fontSize: 11, color: 'text.disabled' }}>
              {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          )}
          <IconButton
            size="small"
            aria-label="Atualizar e sincronizar atividade"
            title="Atualizar do celular e sincronizar"
            disabled={syncing}
            onClick={onSync}
            sx={{
              color: 'primary.dark', bgcolor: alpha(theme.palette.primary.main, 0.10),
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
              '@keyframes DxSpin': { to: { transform: 'rotate(360deg)' } },
              '& .MuiSvgIcon-root': { fontSize: 18, ...(syncing ? { animation: 'DxSpin 1s linear infinite' } : {}) },
            }}
          >
            <SyncIcon />
          </IconButton>
          <IconButton size="small" aria-label="Ocultar card de atividade" title="Ocultar (volta em Perfil → Acessibilidade)" onClick={onHide}
            sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
            <VisibilityOffIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Stack>
      </Stack>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={range}
        onChange={(_, v) => { if (v) onRange(v as ActivityRange); }}
        aria-label="Período da atividade"
        sx={{ mb: 1.5, '& .MuiToggleButton-root': { px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, borderRadius: '99px !important', border: '1px solid', borderColor: 'divider', textTransform: 'none', fontWeight: 700, fontSize: 12.5, color: 'text.secondary', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.15), color: 'primary.dark', borderColor: alpha(theme.palette.primary.main, 0.4) } } }}
      >
        {RANGES.map((r) => <ToggleButton key={r.value} value={r.value} aria-pressed={range === r.value}>{r.label}</ToggleButton>)}
      </ToggleButtonGroup>

      {/* Herói: RING de meta (assinatura Google Fit — intuitivo à primeira vista) + número.
          RESPONSIVO (fix Samsung M62): fontes clamp() fluídas + minWidth:0 em TODO flex container
          (sem isto o flex não encolhe e o texto vaza). Labels com noWrap+ellipsis. */}
      <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
        <ActivityRing ratio={s.goalRatio} pct={goalPct} done={s.goalRatio >= 1} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
            {stepsLabel}
          </Typography>
          <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.5rem, 8vw, 2rem)', sm: 'clamp(1.75rem, 5vw, 2.125rem)', md: 34 }, lineHeight: 1.1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{fmtSteps(primarySteps)}</Typography>
            {s.goalRatio >= 1 && <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main', mb: 0.5 }} aria-label="meta batida" />}
          </Stack>
          <Typography noWrap sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
            {stepsSupport}
          </Typography>
        </Box>
        <Stack spacing={{ xs: 0.75, sm: 1 }} sx={{ flex: 1, minWidth: 0 }}>
          <MetricMini icon={<LocalFireDepartmentIcon sx={{ fontSize: 15 }} />} tone="#c2410c" label="Calorias" value={fmtKcal(primaryKcal)} unit="kcal" contextLabel={periodMetricLabel} />
          <MetricMini icon={<RouteIcon sx={{ fontSize: 15 }} />} tone="#0369a1" label="Distância" value={fmtKm(primaryKm)} unit="km" contextLabel={periodMetricLabel} />
          {(s.hrAvg ?? 0) > 0 && (
            <MetricMini icon={<FavoriteIcon sx={{ fontSize: 15 }} />} tone="#ef4444" label="Freq. cardíaca" value={`${Math.round(s.hrAvg ?? 0)}`} unit="bpm" contextLabel={periodMetricLabel} />
          )}
          {(s.exerciseMin ?? 0) > 0 && (
            <MetricMini icon={<TimerIcon sx={{ fontSize: 15 }} />} tone="#047857" label="Exercício" value={`${Math.round(s.exerciseMin ?? 0)}min`} unit="" contextLabel={periodMetricLabel} />
          )}
        </Stack>
      </Stack>

      {/* Dado em trânsito: passos chegaram mas calorias NÃO — apps como o Samsung Health
          exportam pro HC em lotes; um 0 mudo pareceria "sem queima", o que seria mentira. */}
      {range === 'today' && s.steps > 0 && s.kcal === 0 && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.5, mt: 1.25 }}>
          Calorias ainda não chegaram ao Health Connect — apps de saúde exportam em lotes ao longo do dia. Toque ↻ mais tarde.
        </Typography>
      )}

      {/* Sparkline do período (hoje: oculta — a barra de meta já conta a história) */}
      {range !== 'today' && s.series.length > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: '3px', sm: '4px' }, height: 34, mt: 1.75 }} aria-hidden="true">
          {s.series.map((d) => (
            <Box key={d.date} sx={{
              flex: 1, minWidth: 2, maxWidth: 14,
              height: `${Math.max(8, barHeight(d.steps, maxSteps) * 100)}%`,
              borderRadius: '3px',
              bgcolor: d.steps >= STEPS_GOAL ? 'primary.main' : alpha(theme.palette.primary.main, 0.28),
              transition: 'height .5s cubic-bezier(.2,.8,.2,1)',
            }} />
          ))}
        </Box>
      )}
      {s.daysCounted === 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>Sem dados ainda — use o celular com o contador de passos ativo (Google Fit, Samsung Health, Wear OS…).</Typography>
      )}

      {/* ONDA 2 — "Dashboard sábio": atividade da SEMANA DO ÚLTIMO EXAME (contexto, não
          casualidade — copy educativa). Só existe com >=3 dias de dados na janela. */}
      {(() => {
        if (!lastExamAt || !days?.length) return null;
        const examDate = lastExamAt.slice(0, 10);
        const w = weekOfExam(days, examDate);
        if (!w) return null;
        const dt = new Date(`${examDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.5, px: 1.25, py: 0.9, borderRadius: '12px', bgcolor: alpha(theme.palette.primary.main, 0.07), border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}` }}>
            <InsightsIcon sx={{ fontSize: 16, color: 'primary.dark', flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>
              Na semana do seu exame ({dt}): <strong>{fmtSteps(w.avgSteps)} passos/dia</strong> · {fmtKcal(w.avgKcal)} kcal · {fmtKm(w.avgKm)} km — contexto que o Dr. Exame usa na leitura.
            </Typography>
          </Stack>
        );
      })()}

    </AppCard>
  );
};

/**
 * ActivityRing — anel de progresso da meta (linguagem Google Fit: círculo que fecha
 * ao completar). Ícone de passos no centro; trilha em lavagem teal, arco em gradiente
 * da marca (permitido: é o elemento-herói do card, não decoração).
 */
const RING_SIZE = 74;
const RING_STROKE = 7;
const ActivityRing = ({ ratio, pct, done }: { ratio: number; pct: number; done: boolean }) => {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, ratio)) * c;
  return (
    <Box
      sx={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, flexShrink: 0, display: 'grid', placeItems: 'center' }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Meta de ${STEPS_GOAL.toLocaleString('pt-BR')} passos: ${pct}%`}
    >
      <Box component="svg" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} sx={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="rgba(32,178,170,0.14)" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
          stroke={done ? '#059669' : 'url(#dxRingGrad)'}
          strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1)' }}
        />
        <defs>
          <linearGradient id="dxRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#20b2aa" />
            <stop offset="100%" stopColor="#178f89" />
          </linearGradient>
        </defs>
      </Box>
      {/* Centro do anel: logo Health Connect (fallback caminhada) — identidade Google Fit-like. */}
      <DirectionsWalkIcon aria-hidden="true" sx={{ fontSize: 26, color: done ? 'success.main' : 'primary.dark' }} />
      <Box component="img" src="hc-icon.png" alt="" aria-hidden="true" onError={(e: any) => { e.currentTarget.style.display = 'none'; }} sx={{ position: 'absolute', width: 30, height: 30, borderRadius: '8px' }} />
    </Box>
  );
};

/** Métrica secundária — resistente a largura: valor+unidade SEMPRE juntos (noWrap), label
 *  com ellipsis se não couber. Fonte clamp() escala sem quebrar. (fix Samsung M62) */
const MetricMini = ({ icon, tone, label, value, unit, contextLabel }: { icon: React.ReactNode; tone: string; label: string; value: string; unit: string; contextLabel?: string }) => (
  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
    <Box sx={{ width: { xs: 26, sm: 30 }, height: { xs: 26, sm: 30 }, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: `${tone}1E`, color: tone }}>{icon}</Box>
    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
      <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.1, textOverflow: 'ellipsis' }}>{label}</Typography>
      <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(0.875rem, 4vw, 1.0625rem)', sm: 17 }, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
        {value}{unit ? <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 600 }}> {unit}</Typography> : null}
      </Typography>
      {contextLabel && <Typography noWrap sx={{ fontSize: 10.5, color: 'text.disabled', lineHeight: 1.1 }}>{contextLabel}</Typography>}
    </Box>
  </Stack>
);

/**
 * Onboarding de permissão — o VALOR antes do popup nativo (UX writing, LGPD):
 * explica O QUE é lido (só leitura), QUEM decide e COMO sair.
 */
const PermissionRationaleDialog = ({ open, onClose, onConfirm, asking, error }: { open: boolean; onClose: () => void; onConfirm: () => void; asking: boolean; error?: string }) => (
  <Dialog open={open} onClose={asking ? () => {} : onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
    <PermissionRationaleContent onConfirm={onConfirm} onClose={onClose} asking={asking} error={error} />
  </Dialog>
);

/** Conteúdo do dialog separado do Portal (Dialog não renderiza em SSR — teste usa este).
 *  BRANDING exigido pelas guidelines do Health Connect: nome "Health Connect" + "do Google"
 *  no ponto de conexão — sem isto o usuário não sabe O QUE vai conectar (feedback real do dono). */
export const PermissionRationaleContent = ({ onConfirm, onClose, asking, error }: { onConfirm: () => void; onClose: () => void; asking: boolean; error?: string }) => (
  <>
    <DialogTitle sx={{ pb: 0.5 }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        {/* Ícone Health Connect (guideline): coração+raio no chip da marca. Trocar pelo asset
            oficial (public/hc-icon.png) quando disponível — o layout já acomoda. */}
        <Box sx={{ position: 'relative', width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: '#fff', border: '1px solid #e6f1f0' }}>
          <HealthAndSafetyIcon sx={{ color: '#20b2aa', fontSize: 24 }} aria-hidden="true" />
          <Box component="img" src="hc-icon.png" alt="" onError={(e: any) => { e.currentTarget.style.display = 'none'; }} sx={{ position: 'absolute', width: 28, height: 28 }} />
        </Box>
        <Box sx={{ position: 'relative' }}>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17, lineHeight: 1.2 }}>Health Connect</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.2 }}>do Google · seus dados de saúde do celular</Typography>
        </Box>
      </Stack>
    </DialogTitle>
    <DialogContent>
      <Typography sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: 14 }}>
        O Dr. Exame pode ler <strong>passos, calorias e distância</strong> do Health Connect do seu celular — e mostrar a evolução junto com seus exames.
      </Typography>
      <Stack spacing={0.75} sx={{ mt: 1.5 }}>
        {[
          'Leitura apenas — o app nunca escreve nem altera seus dados de saúde',
          'Você escolhe no próximo passo, no popup do próprio Android',
          'Pode revogar a qualquer momento nas configurações do Health Connect',
        ].map((t) => (
          <Stack key={t} direction="row" spacing={0.75} alignItems="flex-start">
            <CheckCircleIcon sx={{ fontSize: 16, color: 'primary.main', mt: '2px' }} />
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>{t}</Typography>
          </Stack>
        ))}
      </Stack>
    </DialogContent>
    {error && (
      <Alert severity="warning" sx={{ mx: 3, mb: 0.5, borderRadius: '12px', fontSize: 13 }}>
        {error}
      </Alert>
    )}
    <DialogActions sx={{ px: 3, pb: 2.5 }}>
      <Button onClick={onClose} disabled={asking} sx={{ textTransform: 'none', fontWeight: 700 }}>Agora não</Button>
      <GradientButton onClick={onConfirm} disabled={asking}>{asking ? 'Abrindo o Health Connect…' : 'Continuar'}</GradientButton>
    </DialogActions>
  </>
);
