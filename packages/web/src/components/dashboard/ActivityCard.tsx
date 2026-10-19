import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, Typography, Skeleton, ToggleButtonGroup, ToggleButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert, Chip, alpha, useTheme } from '@mui/material';
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
import BedtimeIcon from '@mui/icons-material/Bedtime';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { GoogleG, LockSecure } from './GoogleG';
import { AppCard } from '../AppCard';
import { GradientButton } from '../GradientButton';
import { hapticLight } from '../../utils/haptic';
import { SEM } from '../../theme';
import { backfillActivityDays, fetchActivityDays, hasHealthPermissions, healthConnectSupported, permissionOutcomeMessage, requestHealthPermissions, syncActivityToServer } from '../../services/healthConnect';
import { fetchActivitySummary, summaryToDays, syncStamp } from '../../services/activitySummary';
import { barHeight, fmtKcal, fmtKm, fmtSleep, fmtSteps, summarize, weekOfExam, STEPS_GOAL, type ActivityDay, type ActivityRange } from '../../utils/activityStats';
import { celebrate } from '../../hooks/useCelebrate';

/**
 * ActivityCard — widget de atividade física (Health Connect) no Dashboard.
 *
 * Mobile-first premium (DESIGN.md "O Consultório de Vidro"): números Poppins 800
 * como herói, lavagens teal p/ hierarquia (The One Gradient Rule — gradiente só no
 * CTA "Conectar"), skeleton elegante, micro-interações (barras crescem, press sutil,
 * haptic ao conectar) e fluxo de permissão com UX writing que explica o VALOR antes
 * do popup nativo. DUAS FONTES: no APK lê o Health Connect (device); na WEB mostra
 * o consolidado que o APK sincronizou (cloud — services/activitySummary.ts).
 * Estados: loading → denied (device) | data | null sem dados (cloud).
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

/** Celebração "🎯 meta batida" — 1× POR DIA, só com dado de HOJE vindo do Health Connect
 *  (device; o consolidado cloud pode estar defasado — sem celebração em cima de dado velho).
 *  Chamada a cada leitura (mount/foreground), o localStorage segura a repetição. */
const maybeCelebrateGoal = (days: ActivityDay[] | null): void => {
  if (!days?.length) return;
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const key = `dx-goal-celebrated:${today}`;
  try { if (localStorage.getItem(key) === '1') return; } catch { return; }
  const latest = days[0]; // série DESC — o mais recente primeiro
  if (latest.date === today && latest.steps >= STEPS_GOAL) {
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    celebrate('goal_reached');
  }
};

/** Backfill 90d roda UMA vez por aparelho (flag localStorage). v1 = lote sono/hub 16/10/26. */
const BACKFILL_FLAG = 'dx-hc-backfill-v1';

export const ActivityCard = ({ lastExamAt }: { lastExamAt?: string | null }) => {
  const notify = useNotify();
  const navigate = useNavigate();
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
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);

  const hide = () => {
    try { localStorage.setItem(ACTIVITY_HIDDEN_KEY, '1'); } catch { /* localStorage indisponível */ }
    setHidden(true);
    notify('Card de atividade oculto — dá pra trazer de volta em Perfil → Acessibilidade.', { type: 'info' });
  };

  const load = async (): Promise<ActivityDay[] | null> => {
    // FONTE CLOUD (web/desktop — sem bridge nativa): busca o consolidado que o APK já
    // sincronizou no backend. Sem dados → null (o card nem renderiza: sem card morto na
    // 1ª dobra de quem nunca usou o app no celular). A web NUNCA acessa o Health Connect.
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
    maybeCelebrateGoal(d); // meta de HOJE batida → pill discreta (1×/dia)
    return d;
  };

  // Cold start NÃO dispara visibilitychange: sem o sync no mount, o 1º acesso do dia
  // lia o Health Connect (device fresco) mas não empurrava nada pro server — a Evolução
  // e a web continuavam no dia do ÚLTIMO sync (bug de campo: "travou na quinta").
  useEffect(() => {
    void (async () => {
      const d = await load();
      if (supported && d?.length) await sync(d, true);
      if (supported) await maybeBackfill();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = async (list: ActivityDay[] | null, silent = false) => {
    if (!list?.length) return;
    setSyncing(true);
    try {
      await syncActivityToServer(list);
      // Avisa a app inteira: quem leu o consolidado do SERVER (Evolução, Medições) pode
      // refazer o GET — antes a Evolução busava ANTES deste POST commitar e mostrava
      // atividade de ontem enquanto o dashboard já mostrava hoje (race reportada em campo).
      try { window.dispatchEvent(new Event('dx:activity-synced')); } catch { /* best-effort */ }
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
    if (supported && d?.length) await sync(d, silent); // cloud: só leitura (quem sincroniza é o APK)
  };

  /** BACKFILL 90 dias, 1× por aparelho (padrão Life Dashboard: histórico cheio já no
   *  1º connect — o gráfico nasce populado). Flag marcada ANTES de rodar: falha de
   *  rede não vira loop infinito de retry; o sync normal cobre o dia-a-dia dali em diante. */
  const maybeBackfill = async () => {
    try { if (localStorage.getItem(BACKFILL_FLAG) === '1') return; } catch { return; }
    if (!hasHealthPermissions()) return;
    try { localStorage.setItem(BACKFILL_FLAG, '1'); } catch { /* sem storage: segue sem flag (best-effort) */ }
    try {
      notify('Buscando seus últimos 90 dias no Health Connect…', { type: 'info' });
      const bf = await backfillActivityDays();
      if (bf.length) {
        await syncActivityToServer(bf);
        // Mergeia na view atual (dias antigos entram no sparkline de 30d sem re-load)
        setDays((prev) => {
          const byDate = new Map<string, ActivityDay>();
          for (const d of [...(prev ?? []), ...bf]) byDate.set(d.date, d);
          return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
        });
        notify(`Histórico sincronizado — ${bf.length} dias agora fazem parte da sua evolução ✨`, { type: 'success' });
      }
    } catch {
      notify('Não deu pra buscar o histórico antigo agora — seus dados novos continuam sincronizando.', { type: 'warning' });
    }
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
    await maybeBackfill(); // 1º connect (ou re-conect pós-update): histórico 90d de uma vez
  };

  // ── Shell: no APK lê o Health Connect (fonte device); na WEB mostra o consolidado que
  // o APK sincronizou (fonte cloud). Sem dados na web → null (sem card morto na 1ª dobra).
  if (hidden) return null;
  if (!supported && phase === 'data' && !days?.length) return null;

  return (
    <ActivityView
      phase={phase}
      days={days}
      range={range}
      onOpenVitals={() => navigate('/sinais')}
      onRange={(r) => { hapticLight(); setRange(r); }}
      syncing={syncing}
      updatedAt={updatedAt}
      source={supported ? 'device' : 'cloud'}
      syncedAtISO={supported ? undefined : (cloudSyncedAt ?? undefined)}
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
  phase, days, range, onOpenVitals, onRange, syncing, updatedAt, askOpen, asking, connectError, lastExamAt, onAskOpen, onAskClose, onConfirm, onSync, onHide, source = 'device', syncedAtISO,
}: {
  phase: 'loading' | 'denied' | 'data';
  days: ActivityDay[] | null;
  range: ActivityRange;
  /** Porta p/ a página Sinais Vitais (opcional — testes renderizam fases sem a porta). */
  onOpenVitals?: () => void;
  onRange: (r: ActivityRange) => void;
  syncing: boolean;
  updatedAt: Date | null;
  /** Fonte dos dados: device (bridge HC no APK) ou cloud (consolidado do server, web). */
  source?: 'device' | 'cloud';
  /** ISO do último sync (fonte cloud) — carimba "Sincronizado há X" + hint de staleness. */
  syncedAtISO?: string;
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
  /** Esconder o card (persistente; volta em Perfil → Acessibilidade). Chamado só após CONFIRMAR no dialog. */
  onHide: () => void;
}) => {
  const theme = useTheme();
  // Esconder é reversível só via Perfil — antes era 1 clique direto + toast sutil que
  // passava despercebido (o card "sumia"). Agora: diálogo de confirmação premium.
  const [hideAsk, setHideAsk] = useState(false);
  const confirmHide = () => { setHideAsk(false); onHide(); };
  // Gráfico INTERATIVO: dia selecionado (default = mais recente). Hook AQUI no topo —
  // depois de early-return o React #310 crasha (regra da casa).
  const [selDay, setSelDay] = useState<string | null>(null);

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
        {/* Quem não quer o card NÃO fica com ele pra sempre: esconde (com CONFIRMAÇÃO —
            voltar é em Perfil → Acessibilidade, então o gesto não pode ser 1 clique cego). */}
        <IconButton size="small" aria-label="Ocultar card de atividade" title="Ocultar (volta em Perfil → Acessibilidade)" onClick={() => setHideAsk(true)}
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
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>Dados seguros</Typography>
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
            <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mt: 0.25 }}>
              Passos, calorias, distância e sono do seu celular entram junto com seus exames — o Dr. Exame conecta tudo.
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
  const sel = s.series.find((d) => d.date === selDay) ?? s.series[s.series.length - 1] ?? null;
  const selFmt = sel ? new Date(`${sel.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') : '';
  const goalPct = Math.round(s.goalRatio * 100);
  const primarySteps = range === 'today' ? s.steps : s.totalSteps;
  const primaryKcal = range === 'today' ? s.kcal : s.totalKcal;
  const primaryKm = range === 'today' ? s.km : s.totalKm;
  const stepsLabel = range === 'today' ? 'Passos hoje' : `Passos em ${rangeLabel(range).toLowerCase()}`;
  // Marco científico (Lancet Public Health 2025): ~7.000 passos/dia é onde está o maior
  // salto de benefício (-47% risco de mortalidade vs 2.000) — celebrar ANTES da meta 8k
  // motiva e é honesto com a evidência. A meta continua 8k (aspiracional).
  const stepsSupport = range === 'today'
    ? (s.goalRatio >= 1
        ? 'meta batida 🎉'
        : s.steps >= 7000
          ? `✨ passou de 7.000 — marco científico`
          : `${goalPct}% da meta · ✨ maior benefício a partir de 7.000`)
    : (s.avgSteps >= 7000
        ? `média ${fmtSteps(s.avgSteps)}/dia · ✨ acima do marco científico`
        : `média ${fmtSteps(s.avgSteps)}/dia`);
  const periodMetricLabel = range === 'today' ? undefined : `Média ${rangeLabel(range).toLowerCase()}`;

  return (
    <AppCard sx={{ p: 2 }}>
      {/* Cabeçalho: título + range + sync. O título é PORTA p/ os Sinais Vitais com badge interativo */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          component="button"
          onClick={onOpenVitals}
          aria-label="Ver Sinais Vitais (sono, frequência cardíaca e tendências)"
          title="Sinais Vitais — detalhes e tendências"
          sx={{
            p: 0.5,
            px: 1,
            ml: -1,
            borderRadius: '10px',
            border: 'none',
            bgcolor: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            transition: 'background-color .2s ease',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              '& .dx-vitals-title': { color: 'primary.dark' },
              '& .dx-vitals-badge': { bgcolor: alpha(theme.palette.primary.main, 0.18), color: 'primary.dark' },
            },
            '&:active': { transform: 'scale(0.98)' },
          }}
        >
          <Typography className="dx-vitals-title" sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 0.75, transition: 'color .15s ease' }}>
            <DirectionsWalkIcon sx={{ fontSize: 20, color: 'primary.dark' }} /> Atividade física
          </Typography>
          <Box
            className="dx-vitals-badge"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.75,
              py: 0.2,
              borderRadius: '99px',
              fontSize: 11,
              fontWeight: 700,
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              color: 'text.secondary',
              transition: 'all .2s ease',
            }}
          >
            <span>Painel</span>
            <ChevronRightIcon sx={{ fontSize: 14 }} />
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {source === 'cloud' && syncedAtISO && (() => {
            const st = syncStamp(syncedAtISO);
            return (
              <Typography noWrap title="Última sincronização feita pelo app Dr. Exame no seu celular" sx={{ fontSize: 12, color: 'text.disabled' }}>
                Sincronizado {st.label}{st.stale ? ' · atualize pelo app' : ''}
              </Typography>
            );
          })()}
          {source === 'device' && updatedAt && (
            <Typography noWrap title="Hora da última leitura do Health Connect" sx={{ fontSize: 12, color: 'text.disabled' }}>
              Sincronizado {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          )}
          {source === 'device' && (
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
          )}
          <IconButton size="small" aria-label="Ocultar card de atividade" title="Ocultar (volta em Perfil → Acessibilidade)" onClick={() => setHideAsk(true)}
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
        sx={{ mb: 1.5, '& .MuiToggleButton-root': { px: 1.25, py: { xs: 0.75, sm: 0.35 }, minHeight: { xs: 40, sm: 0 }, borderRadius: '99px !important', border: '1px solid', borderColor: 'divider', textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'text.secondary', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.15), color: 'primary.dark', borderColor: alpha(theme.palette.primary.main, 0.4) } } }}
      >
        {RANGES.map((r) => (
          <ToggleButton key={r.value} value={r.value} aria-pressed={range === r.value} disabled={source === 'cloud' && r.value === 'today'} title={source === 'cloud' && r.value === 'today' ? 'O dado de hoje chega pela sincronização do app no celular — veja 7 ou 30 dias' : undefined}>
            {r.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Herói: RING de meta + número grande + grid de métricas secundárias perfeitamente acomodadas */}
      <Stack spacing={1.75}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
          <ActivityRing ratio={s.goalRatio} pct={goalPct} done={s.goalRatio >= 1} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>{stepsLabel}</Typography>
            <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.1rem' }, lineHeight: 1.1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                {fmtSteps(primarySteps)}
              </Typography>
              {s.goalRatio >= 1 && <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main', mb: 0.5 }} aria-label="meta batida" />}
            </Stack>
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.25, lineHeight: 1.35 }}>{stepsSupport}</Typography>
          </Box>
        </Stack>

        {/* Métricas Secundárias em Grid 2x2 com largura garantida (nunca quebra texto em letras verticais) */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          {primaryKcal > 0 && (
            <MetricMini icon={<LocalFireDepartmentIcon sx={{ fontSize: 15 }} />} tone={SEM.warn[theme.palette.mode]} label={s.kcalIsTotal ? 'Calorias totais' : 'Calorias'} labelTitle={s.kcalIsTotal ? 'Inclui metabolismo basal (Samsung Health só publica o total do dia)' : undefined} value={fmtKcal(primaryKcal)} unit="kcal" contextLabel={periodMetricLabel} />
          )}
          <MetricMini icon={<RouteIcon sx={{ fontSize: 15 }} />} tone={SEM.info[theme.palette.mode]} label="Distância" value={fmtKm(primaryKm)} unit="km" contextLabel={periodMetricLabel} />
          {(s.hrRest ?? 0) > 0 && (
            <MetricMini icon={<FavoriteIcon sx={{ fontSize: 15 }} />} tone={SEM.bad[theme.palette.mode]} label="FC de repouso" value={`${Math.round(s.hrRest ?? 0)}`} unit="bpm" contextLabel={periodMetricLabel} />
          )}
          {(s.sleepMin ?? 0) > 0 && (
            <MetricMini
              icon={<BedtimeIcon sx={{ fontSize: 15 }} />}
              tone={SEM.info[theme.palette.mode]}
              label="Sono"
              value={fmtSleep(s.sleepMin ?? 0)}
              unit=""
              contextLabel={range === 'today' ? 'última noite' : `média/noite`}
            />
          )}
          {(s.exerciseMin ?? 0) >= 10 && (
            <MetricMini icon={<TimerIcon sx={{ fontSize: 15 }} />} tone={SEM.ok[theme.palette.mode]} label="Exercício" value={`${Math.round(s.exerciseMin ?? 0)} min`} unit="" contextLabel={undefined} />
          )}
        </Box>
      </Stack>

      {/* Dado em trânsito: passos chegaram mas calorias NÃO — apps como o Samsung Health
          exportam pro HC em lotes; um 0 mudo pareceria "sem queima", o que seria mentira. */}
      {s.steps > 0 && primaryKcal === 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5, mt: 1.25 }}>
          Calorias ainda não chegaram ao Health Connect — apps de saúde exportam em lotes ao longo do dia. Toque ↻ mais tarde.
        </Typography>
      )}

      {/* Sparkline INTERATIVO (hoje: oculta — a barra de meta já conta a história):
          cada barra é um botão; tocar mostra o detalhe daquele dia logo abaixo. */}
      {range !== 'today' && s.series.length > 1 && (
        <Box sx={{ mt: 1.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: '3px', sm: '4px' }, height: 34 }}>
            {s.series.map((d) => {
              const on = sel?.date === d.date;
              return (
                <Box
                  key={d.date}
                  component="button"
                  onClick={() => setSelDay(d.date)}
                  aria-label={`${new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${fmtSteps(d.steps)} passos`}
                  sx={{
                    flex: 1, minWidth: 2, maxWidth: 14, p: 0, border: 'none', cursor: 'pointer',
                    height: `${Math.max(8, barHeight(d.steps, maxSteps) * 100)}%`,
                    borderRadius: on ? '4px' : '3px',
                    // Três tons: meta 8k cheia · marco científico 7k médio · resto lavagem;
                    // selecionada ganha contorno + brilho (feedback claro do toque)
                    bgcolor: d.steps >= STEPS_GOAL
                      ? 'primary.main'
                      : d.steps >= 7000
                        ? alpha(theme.palette.primary.main, 0.55)
                        : alpha(theme.palette.primary.main, 0.28),
                    outline: on ? `2px solid ${theme.palette.primary.main}` : 'none',
                    outlineOffset: on ? 1 : 0,
                    transform: on ? 'scaleY(1.06)' : 'none',
                    transition: 'height .5s cubic-bezier(.2,.8,.2,1), transform .15s ease',
                  }}
                />
              );
            })}
          </Box>
          {/* Detalhe do dia selecionado — o gráfico sozinho não conta a história */}
          {sel && (
            <Stack
              direction="row"
              spacing={{ xs: 1.25, sm: 2 }}
              alignItems="center"
              sx={{ mt: 1, px: 1.25, py: 0.9, borderRadius: '12px', bgcolor: alpha(theme.palette.primary.main, 0.07), border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`, flexWrap: 'wrap' }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'primary.dark', textTransform: 'capitalize', minWidth: 64 }}>{selFmt}</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {fmtSteps(sel.steps)} <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>passos</Typography>
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>🔥 {fmtKcal(sel.kcal)} kcal{sel.kcalIsTotal ? ' (total do dia)' : ''}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>📍 {fmtKm(sel.km)} km</Typography>
              {(sel.sleepMin ?? 0) > 0 && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>😴 {fmtSleep(sel.sleepMin ?? 0)} de sono</Typography>
              )}
              {sel.steps >= STEPS_GOAL && <Chip size="small" label="meta 🎉" sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: alpha('#059669', 0.15), color: '#047857' }} />}
              {sel.steps >= 7000 && sel.steps < STEPS_GOAL && <Chip size="small" label="✨ 7k+" sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: alpha(theme.palette.primary.main, 0.15), color: 'primary.dark' }} />}
            </Stack>
          )}
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
              Na semana do seu exame ({dt}): <strong>{fmtSteps(w.avgSteps)} passos/dia</strong> · {fmtKcal(w.avgKcal)} {w.kcalIsTotal ? 'kcal totais' : 'kcal'} · {fmtKm(w.avgKm)} km — contexto que o Dr. Exame usa na leitura.
            </Typography>
          </Stack>
        );
      })()}

      {/* Botão de Navegação Direto e Claro para Sinais Vitais (intuitivo, visual Apple Health/Dr. Exame) */}
      {onOpenVitals && (
        <Button
          fullWidth
          variant="outlined"
          onClick={onOpenVitals}
          endIcon={<ChevronRightIcon />}
          sx={{
            mt: 1.75,
            py: 0.9,
            borderRadius: '12px',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'none',
            letterSpacing: 0,
            color: 'primary.dark',
            borderColor: alpha(theme.palette.primary.main, 0.28),
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            boxShadow: 'none',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              borderColor: 'primary.main',
              boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
            },
            '&:active': { transform: 'scale(0.99)' },
          }}
        >
          Ver painel completo de Sinais Vitais & Tendências
        </Button>
      )}

      {/* CONFIRMAÇÃO de esconder — antes o card sumia num clique e o toast de "como voltar"
          passava despercebido. Premium: pergunta clara + pra onde vai + como volta. */}
      <Dialog open={hideAsk} onClose={() => setHideAsk(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ pb: 0.5, fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17, display: 'flex', alignItems: 'center', gap: 1 }}>
          <VisibilityOffIcon sx={{ fontSize: 20, color: 'text.secondary' }} /> Esconder o card de atividade?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: 14 }}>
            Ele sai da sua tela inicial agora. Nenhum dado é apagado — seus passos continuam sendo lidos e guardados.
          </Typography>
          <Alert severity="info" sx={{ mt: 1.5, borderRadius: '12px', fontSize: 13, alignItems: 'center' }}>
            Pra trazer de volta: <strong>Perfil → Acessibilidade</strong> → "Card de atividade física no início".
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setHideAsk(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Manter no início</Button>
          <Button onClick={confirmHide} color="inherit" sx={{ textTransform: 'none', fontWeight: 800, color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}>
            Esconder
          </Button>
        </DialogActions>
      </Dialog>
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
export const ActivityRing = ({ ratio, pct, done }: { ratio: number; pct: number; done: boolean }) => {
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

/** Métrica secundária — SEM clipe (regra CRITICAL): label e contexto fluem/quebram; só o
 *  par semântico valor+unidade é noWrap (curto por construção). No xs vive numa célula da
 *  grid auto-fit (~149px) — "Calorias totais"/"FC de repouso"/"15.234 kcal" cabem inteiros. */
export const MetricMini = ({ icon, tone, label, labelTitle, value, unit, contextLabel }: { icon: React.ReactNode; tone: string; label: string; labelTitle?: string; value: string; unit: string; contextLabel?: string }) => (
  <Stack
    direction="row"
    spacing={1}
    alignItems="center"
    sx={{
      minWidth: 0,
      p: 0.85,
      borderRadius: '12px',
      bgcolor: (t) => alpha(tone, t.palette.mode === 'dark' ? 0.12 : 0.05),
      border: '1px solid',
      borderColor: (t) => alpha(tone, t.palette.mode === 'dark' ? 0.25 : 0.14),
      transition: 'all .2s ease',
      '&:hover': { bgcolor: (t) => alpha(tone, t.palette.mode === 'dark' ? 0.18 : 0.09) },
    }}
  >
    <Box sx={{ width: 30, height: 30, borderRadius: '8px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: `${tone}1E`, color: tone }}>{icon}</Box>
    <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
      <Typography noWrap title={labelTitle} sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600, lineHeight: 1.2 }}>{label}</Typography>
      <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 14.5, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
        {value}{unit ? <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 600 }}> {unit}</Typography> : null}
      </Typography>
      {contextLabel && <Typography noWrap sx={{ fontSize: 10, color: 'text.disabled', lineHeight: 1.1 }}>{contextLabel}</Typography>}
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
        O Dr. Exame pode ler <strong>passos, calorias, distância e sono</strong> do Health Connect do seu celular — e mostrar a evolução junto com seus exames.
      </Typography>
      <Stack spacing={0.75} sx={{ mt: 1.5 }}>
        {[
          'Leitura apenas — o app nunca escreve nem altera seus dados de saúde',
          'Você escolhe no próximo passo, no popup do próprio Android',
          'Pode revogar a qualquer momento nas configurações do Health Connect',
        ].map((t) => (
          <Stack key={t} direction="row" spacing={0.75} alignItems="flex-start">
            <CheckCircleIcon sx={{ fontSize: 16, color: 'primary.main', mt: '2px' }} />
            <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>{t}</Typography>
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
