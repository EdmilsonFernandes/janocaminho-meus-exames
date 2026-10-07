import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, Typography, Box, Grid, useTheme, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Button, LinearProgress, CircularProgress, Chip, IconButton } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { API_URL, token } from '../../config';
import { SEM, copperText, tealText } from '../../theme';
import { ActivationChecklist } from './ActivationChecklist';
import { deltaEntre, deltaLabel, diasAteJanela } from '../../utils/mental-delta';
import { SeverityBar } from '../mental/SeverityBar';
import { Heartbeat, Stethoscope, ChartLineUp, Dna, ChatCircle } from '@phosphor-icons/react';
import { useSelectedPatient } from '../../patient-context';
import { syncPushToken } from '../../push';
import { BiometricService } from '../BiometricService';
import { PageContainer } from '../layout/PageContainer';
import { DashboardHeader } from './DashboardHeader';
import { FailedExamsAlert } from './FailedExamsAlert';
import { RejectedExamsAlert } from './RejectedExamsAlert';
import { NextStepsCard } from './NextStepsCard';
import { AiCard } from './AiCard';
import { AiTip } from './AiTip';
import { GamificationBadges } from '../GamificationBadges';
import { QuickActions } from './QuickActions';
import { ActivityCard } from './ActivityCard';
import { RestingHeartCard } from './RestingHeartCard';
import { SinceExamCard } from './SinceExamCard';
import { CreditsCard } from './CreditsCard';
import { BiologicalAgeCard } from './BiologicalAgeCard';
import { ShareHealthButton } from '../ShareHealthCard';
import { ReviewPrompt, maybeRequestReview } from '../ReviewPrompt';
import { AppCard } from '../AppCard';
import { GradientButton } from '../GradientButton';
import { Celebration } from '../Celebration';
import { Shimmer, TileShimmer } from '../Shimmer';
import { ChangesSinceExam, type Marker } from './ChangesSinceExam';
import { ScrollReveal } from './ScrollReveal';
import { Section } from './Section';
import { DEMO_DASHBOARD, DEMO_CHRONO_AGE } from './demoData';
import { track } from '../../utils/analytics';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { getGoals, goalSubtitle, GoalQuizCard } from '../GoalQuiz';
import { useSportsProfile } from '../../hooks/useSportsProfile';
import { SportsDashboard } from '../sports/SportsDashboard';
import { SportsUpsellCard } from '../sports/SportsUpsellCard';

const readTotal = (r: Response) =>
  Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0');

/** G2 — linha de rastreamento mental (subset do que /mental-screenings/latest serializa). */
interface MentalRow {
  id: string;
  type: 'phq9' | 'gad7';
  total: number;
  severity: { key: string; label: string };
  /** F3 — ideação (item 9 do PHQ-9 > 0). Opcional: cache offline antigo pode não ter o campo. */
  suicidalIdeation?: boolean;
  createdAt: string;
}
interface MentalLatest {
  phq9: MentalRow | null;
  gad7: MentalRow | null;
  phq9Previous: MentalRow | null;
  gad7Previous: MentalRow | null;
}

/** Um único ponto p/ prefers-reduced-motion (sparkles, ring pulse, tile spring). */
const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
};

/** Busca os mesmos dados do Dashboard legacy — V2 isolada (não toca no fetch do legacy). */
function useDashboardData(pid: string | null) {
  const [stats, setStats] = useState({ exams: 0, abnormal: 0 });
  const [failed, setFailed] = useState(0);
  const [lastExam, setLastExam] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<{ bons: number; alerta: number; alterados: number }>({ bons: 0, alerta: 0, alterados: 0 });
  const [score, setScore] = useState<number | null>(null);
  // Score da última VISITA (cache no mount) — alimenta o "⚡ +N desde sua última visita".
  const [prevScore, setPrevScore] = useState<number | null>(null);
  const [importante, setImportante] = useState(0);
  const [moderada, setModerada] = useState(0);
  const [cardioRisk, setCardioRisk] = useState<any>(null);
  const [markerCount, setMarkerCount] = useState(0);
  const [credits, setCredits] = useState<number | null>(null);
  const [me, setMe] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [worsened, setWorsened] = useState<Marker[]>([]);
  const [improved, setImproved] = useState<Marker[]>([]);
  const [staleWarning, setStaleWarning] = useState('');
  // E1: exames em processamento (UPLOADED/EXTRACTING) — strip global do dashboard.
  const [processing, setProcessing] = useState<{ count: number; oldestAt: string | null } | null>(null);
  // Idade biológica: espelha o MESMO /health-summary que o hook já busca (o tile não refaz o GET).
  const [bio, setBio] = useState<any>(null);
  const [bioKdm, setBioKdm] = useState<any>(null);
  const [bioAvail, setBioAvail] = useState<any>(null);
  const [hsLoaded, setHsLoaded] = useState(false);
  // Honestidade de estados (auditoria 2026-08): o server diz POR QUE cada feature não calculou
  // (availability) — o cliente nunca mais infere estado positivo a partir de null.
  const [availability, setAvailability] = useState<any>(null);
  const [rejected, setRejected] = useState(0);
  // G2 — rastreamento de saúde mental (/latest, fetch LEVE: não integra o job do
  // dashboard-summary nem bloqueia `loaded` — o card tem gate de render próprio).
  const [mental, setMental] = useState<MentalLatest | null>(null);
  const [mentalOffline, setMentalOffline] = useState(false);

  useEffect(() => {
    if (!pid) {
      setLoaded(true);
      return;
    }
    // Score cacheado (instantâneo na 1ª pintura, igual ao legacy).
    try {
      const c = pid ? localStorage.getItem(`dashScore:${pid}`) : null;
      if (c) setBuckets(JSON.parse(c));
      const cn = pid ? localStorage.getItem(`dashScoreNum:${pid}`) : null;
      if (cn) { setScore(Number(cn)); setPrevScore(Number(cn)); } // prevScore = score da ÚLTIMA VISITA (pro badge de ganho)
    } catch { /* ignore */ }
    (async () => {
      const h = { Authorization: `Bearer ${token()}` };
      const pidQ = pid ? `&patientId=${pid}` : '';
      // G2 — saúde mental: fire-and-forget (fora dos `jobs` — não atrasa o loaded).
      // X-Offline-Empty → desconhecido (nunca "nunca fez": sem dado não se afirma estado).
      (async () => {
        try {
          const r = await fetch(`${API_URL}/patients/${pid}/mental-screenings/latest`, { headers: h });
          if (r.headers.get('X-Offline-Empty') === 'true') { setMentalOffline(true); return; }
          if (!r.ok) return;
          const dm = await r.json();
          setMental({ phq9: dm.phq9 ?? null, gad7: dm.gad7 ?? null, phq9Previous: dm.phq9Previous ?? null, gad7Previous: dm.gad7Previous ?? null });
        } catch { /* silencioso — card mental não é crítico */ }
      })();
      // 1 ROUND-TRIP (antes: 8 GETs paralelos — exams×2, failed, rejected, flag-summary,
      // health-summary, patients, billing). /dashboard-summary consolida tudo no server com
      // a MESMA semântica de cada fonte. Catch: offline → o cache instantâneo já pintou.
      const jobs: Promise<void>[] = [
        (async () => {
          try {
          const r = await fetch(`${API_URL}/patients/${pid}/dashboard-summary`, { headers: h });
          if (!r.ok) return;
          const d = await r.json();
          setStats({ exams: d.exams?.total ?? 0, abnormal: (d.buckets?.alerta ?? 0) + (d.buckets?.alterados ?? 0) });
          setLastExam(d.exams?.lastExamAt ?? null);
          setFailed(d.exams?.failed ?? 0);
          setRejected(d.exams?.rejected ?? 0);
          setProcessing(d.processing && typeof d.processing.count === 'number' ? d.processing : null);
          if (d.buckets) {
            setBuckets(d.buckets);
            try { localStorage.setItem(`dashScore:${pid}`, JSON.stringify(d.buckets)); } catch { /* ignore */ }
          }
          const hd: any = d.health;
          if (hd) {
            if (typeof hd.score === 'number') {
              setScore(hd.score);
              try { localStorage.setItem(`dashScoreNum:${pid}`, String(hd.score)); } catch { /* ignore */ }
            } else {
              // Sem score canônico agora → NÃO fica score velho do localStorage.
              try { localStorage.removeItem(`dashScoreNum:${pid}`); } catch { /* ignore */ }
              setScore(null);
            }
            setImportante(hd.byPriority?.importante ?? 0);
            setModerada(hd.byPriority?.moderada ?? 0);
            setCardioRisk(hd.cardiometabolicRisk ?? null);
            setAvailability(hd.availability ?? null);
            setMarkerCount(typeof hd.markers === 'number' ? hd.markers : 0);
            setStaleWarning(hd.staleWarning ?? '');
            setBio(hd.biologicalAge ?? null);
            setBioKdm(hd.biologicalAgeKdm ?? null);
            setBioAvail(hd.availability?.biologicalAge ?? null);
            // "Pioraram" = trend PIOROU mesmo (worsening) — nunca topAttention (bug da Heloisa).
            setWorsened(Array.isArray(hd.worsening) ? hd.worsening.slice(0, 3) : []);
            setImproved(Array.isArray(hd.improving) ? hd.improving.slice(0, 3) : []);
          }
          setMe(d.me ?? null);
          setCredits(typeof d.credits === 'number' ? d.credits : null);
          } finally {
            setHsLoaded(true); // tile Idade Bio sai do '…' mesmo se o resumo falhar
          }
        })(),
      ];
      try { await Promise.all(jobs.map((j) => j.catch(() => {}))); } finally { setLoaded(true); }
      // Streak server-side das conquistas — fire-and-forget (1x/dia, idempotente).
      fetch(`${API_URL}/achievements/heartbeat`, { method: 'POST', headers: h }).catch(() => {});
      void syncPushToken();
    })();
  }, [pid]);

  return { stats, failed, lastExam, buckets, score, prevScore, importante, moderada, cardioRisk, markerCount, credits, me, loaded, worsened, improved, staleWarning, availability, rejected, bio, bioKdm, bioAvail, hsLoaded, processing, mental, mentalOffline };
}

const statusFromScore = (s: number | null): { label: string; tone: 'primary' | 'success' | 'warning' | 'error' } => {
  if (s == null) return { label: '—', tone: 'primary' };
  if (s >= 80) return { label: 'Em ótima forma', tone: 'success' };
  if (s >= 60) return { label: 'Em boa forma', tone: 'primary' };
  if (s >= 40) return { label: 'Pede atenção', tone: 'warning' };
  return { label: 'Precisa de cuidados', tone: 'error' };
};

/** Contraste AA nos DOIS modos: tom do texto por prioridade. */
const TONE_TEXT: Record<string, { light: string; dark: string }> = {
  success: SEM.ok,
  warning: { light: '#8a5a1f', dark: SEM.warn.dark },
  error: SEM.bad,
  primary: SEM.tealDeep,
};

/** Cor do glow por score — muda a vibe do ring. */
const scoreGlowColor = (s: number | null) => {
  if (s == null) return 'rgba(32,178,170,.08)';
  if (s >= 80) return 'rgba(5,150,105,.18)';
  if (s >= 60) return 'rgba(32,178,170,.15)';
  if (s >= 40) return 'rgba(245,158,11,.12)';
  return 'rgba(239,68,68,.12)';
};

/** Countup hook — anima um número de 0 ao alvo com easing. CSS-free, cancelável. */
const useCountUp = (target: number | null, duration = 1200) => {
  const [value, setValue] = useState(0);
  const prevTarget = useRef<number | null>(null);
  useEffect(() => {
    if (target == null || target === prevTarget.current) return;
    prevTarget.current = target;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); return; }
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round(ease * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return target == null ? null : value;
};

/** Floating sparkle CSS-only — 3 partículas lentas no bg do hero. */
const SPARKLE_KF = {
  '@keyframes dxSparkle': {
    '0%': { transform: 'translateY(0) scale(1)', opacity: 0.7 },
    '50%': { transform: 'translateY(-12px) scale(1.3)', opacity: 1 },
    '100%': { transform: 'translateY(0) scale(1)', opacity: 0.7 },
  },
} as const;
const Sparkle = ({ top, left, delay, size = 4 }: { top: string; left: string; delay: number; size?: number }) => {
  // Partículas são decoração pura: reduced-motion → nem renderiza.
  if (usePrefersReducedMotion()) return null;
  return (
  <Box sx={{
    position: 'absolute', top, left, width: size, height: size,
    borderRadius: '50%', bgcolor: 'rgba(32,178,170,.4)',
    boxShadow: '0 0 6px rgba(32,178,170,.4)',
    animation: `dxSparkle ${3 + delay}s ease-in-out ${delay}s infinite`,
    pointerEvents: 'none', ...SPARKLE_KF,
  }} />
  );
};

/** E1 — strip "analisando… há 1:32" no dashboard: sinal GLOBAL de exame em processamento.
 *  Antes só existia na lista de exames — quem ficava no painel não sabia onde estava a
 *  análise (ansiedade "cadê meu exame?"). Elapsed deriva do createdAt real do exame.
 *  Exportado desde o E4: o painel esportivo reusa o MESMO strip (mesma fonte/sinal). */
export const ProcessingStrip = ({ count, oldestAt, onClick }: { count: number; oldestAt: string | null; onClick: () => void }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const start = oldestAt ? new Date(oldestAt).getTime() : 0;
  const elapsed = start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  const mm = Math.floor(elapsed / 60);
  const ss = (elapsed % 60).toString().padStart(2, '0');
  return (
    <AppCard kind="interactive" onClick={onClick} sx={{ p: 1.5, mb: 2, borderRadius: '16px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ position: 'relative', flexShrink: 0, width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={34} thickness={4.5} sx={{ color: 'info.main', position: 'absolute' }} />
        <Box sx={{ fontSize: 15 }}>🤖</Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary' }}>
          {count === 1 ? 'Dr. Exame está analisando seu exame' : `Dr. Exame está analisando ${count} exames`}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {start ? `há ${mm}:${ss}` : 'agora'} · toque para acompanhar · pode usar o app normalmente
        </Typography>
      </Box>
      <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </AppCard>
  );
};

/** G2 — Saúde mental no dashboard: atalho de STATUS (não é painel). Compacto (~72px):
 *  h2 "Saúde mental" + valor "PHQ-9 9 · Leve" + chip de delta (G3) + caption
 *  "28/09 · próxima janela 12/10"; toque → /saude-mental. Quem nunca fez vê 1× por
 *  paciente a variante educativa (flag dx-mental-intro:<pid>, dismissível no X).
 *  Desconhecido (offline/ainda carregando) → NÃO renderiza: dashboard limpo, sem estado inventado. */
const MentalCard = ({ mental, mentalOffline, introDismissed, onDismissIntro, onOpen }: {
  mental: MentalLatest | null;
  mentalOffline: boolean;
  introDismissed: boolean;
  onDismissIntro: () => void;
  onOpen: () => void;
}) => {
  if (mentalOffline || !mental) return null;
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  // Instrumento mais recente entre os dois (o "como estou" da vez).
  const { phq9, gad7, phq9Previous, gad7Previous } = mental;
  const latest = phq9 && gad7 ? (phq9.createdAt >= gad7.createdAt ? phq9 : gad7) : (phq9 ?? gad7);

  // Variante educativa (1× por paciente): 🧠 + convite. X ou "Responder" setam a flag.
  if (!latest) {
    if (introDismissed) return null;
    return (
      <AppCard sx={{ p: 1.5, borderRadius: '16px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', fontSize: 20 }} aria-hidden="true">🧠</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}>Saúde mental</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.4 }}>
            Saúde mental também é saúde — 2 minutos, questionário validado, grátis
          </Typography>
        </Box>
        <Button variant="contained" size="small" onClick={onOpen} sx={{ textTransform: 'none', fontWeight: 700, flexShrink: 0, borderRadius: '10px' }}>Responder</Button>
        <IconButton aria-label="Dispensar dica de saúde mental" size="small" onClick={onDismissIntro} sx={{ flexShrink: 0, color: 'text.disabled' }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </AppCard>
    );
  }

  // 05/10 (dono: "falta um tchan"): os DOIS instrumentos lado a lado, cada um com a
  // régua de severidade (marcador animado) + delta. Selo da janela no topo.
  const dias = diasAteJanela(latest.createdAt);
  const due = dias <= 0 || !phq9 || !gad7;
  const ideation = !!(phq9?.suicidalIdeation || gad7?.suicidalIdeation);
  const Row = ({ kind, row, prev }: { kind: 'phq9' | 'gad7'; row: typeof phq9; prev: typeof phq9Previous }) => {
    const label = kind === 'phq9' ? 'Humor' : 'Ansiedade';
    if (!row) {
      return (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: (t) => tealText(t.palette.mode), mt: 0.5 }}>Responder · 2 min →</Typography>
        </Box>
      );
    }
    const d = prev ? deltaEntre(prev.total, row.total) : null;
    const tk = d ? (d.tone === 'good' ? 'ok' : d.tone === 'warn' ? 'warn' : null) : null;
    return (
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
          <Box sx={{ flex: 1 }} />
          {d && prev && (
            <Typography component="span" aria-label={`Diferença desde o rastreamento anterior: ${d.dir === 'down' ? 'menos' : d.dir === 'up' ? 'mais' : 'igual'} ${d.abs} pontos`}
              title={deltaLabel(d, prev.createdAt)}
              sx={{ fontSize: 11, fontWeight: 800, color: tk ? (t) => SEM[tk][t.palette.mode] : 'text.secondary' }}>
              {d.dir === 'down' ? '↓' : d.dir === 'up' ? '↑' : '±'}{d.abs}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mt: 0.25 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{row.total}</Typography>
          <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontWeight: 600 }}>/{kind === 'phq9' ? 27 : 21}</Typography>
          <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', ml: 0.5 }}>{row.severity.label}</Typography>
        </Stack>
        <Box sx={{ mt: 0.5 }}><SeverityBar type={kind} score={row.total} compact /></Box>
      </Box>
    );
  };

  return (
    <AppCard kind="interactive" onClick={onOpen} aria-label="Saúde mental — ver rastreamentos" sx={{
      p: 1.75, borderRadius: '18px', position: 'relative', overflow: 'hidden',
      background: (t) => t.palette.mode === 'dark'
        ? `radial-gradient(120% 120% at 0% 0%, rgba(32,178,170,.14), transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(212,165,116,.10), transparent 55%), ${t.palette.background.paper}`
        : 'radial-gradient(120% 120% at 0% 0%, rgba(32,178,170,.09), transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(212,165,116,.09), transparent 55%), #fff',
    }}>
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <Box sx={{ width: 38, height: 38, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 19,
          background: 'linear-gradient(135deg, rgba(32,178,170,.22), rgba(212,165,116,.22))' }} aria-hidden="true">🧠</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14.5, lineHeight: 1.2 }}>Saúde mental</Typography>
          <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>Último retrato em {fmtDay(latest.createdAt)}</Typography>
        </Box>
        <Chip size="small" label={due ? 'Pode refazer' : `Refazer em ${dias}d`}
          sx={{ height: 22, fontSize: 11, fontWeight: 800, flexShrink: 0,
            bgcolor: due ? 'rgba(32,178,170,.15)' : 'action.hover',
            color: due ? (t) => tealText(t.palette.mode) : 'text.secondary' }} />
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0, ml: -0.5 }} />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1.5 }}>
        {Row({ kind: 'phq9', row: phq9, prev: phq9Previous })}
        {Row({ kind: 'gad7', row: gad7, prev: gad7Previous })}
      </Box>

      {/* F3 — presença, não pânico: 1 linha discreta quando o PHQ-9 marcou ideação (item 9 > 0).
          Campo opcional (cache offline antigo não tem) → truthy check degrada com segurança. */}
      {ideation && (
        <Typography noWrap sx={{ mt: 1.25, fontSize: 12, fontWeight: 700, color: (t) => tealText(t.palette.mode) }}>
          💚 Apoio 24h, gratuito: CVV 188
        </Typography>
      )}
    </AppCard>
  );
};

/** HERO — score ring com gradiente cônico animado, countup, mesh gradient bg, sparkles. */
const HeroHealthCard = ({ loaded, score, exams, importante, moderada, lastExam, staleWarning, scoreGain = 0, onDetails, onFirstExam, onChat, onDemo }: {
  loaded: boolean; score: number | null; exams: number; importante: number; moderada: number; lastExam: string | null; staleWarning: string; scoreGain?: number; onDetails: () => void; onFirstExam: () => void; onChat?: () => void; onDemo?: () => void;
}) => {
  const t = useTheme();
  const st = statusFromScore(score);
  const last = lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : null;
  const totalAtt = importante + moderada;
  const noData = score == null && exams === 0;
  const title = noData ? 'Começa com seu primeiro exame' : score == null ? 'Score indisponível' : st.label;
  const animatedScore = useCountUp(score);
  const dashLen = (score ?? 0) * 2.64;
  const isDark = t.palette.mode === 'dark';
  const reduced = usePrefersReducedMotion();
  // Badge de ganho some sozinho (8s) — nunca vira ruído permanente.
  const [showGain, setShowGain] = useState(true);
  useEffect(() => {
    if (scoreGain > 0) { const tm = setTimeout(() => setShowGain(false), 8000); return () => clearTimeout(tm); }
    setShowGain(true);
  }, [scoreGain]);
  return (
    <AppCard kind="tinted" tone={st.tone} tone2="secondary" glow sx={{
      p: { xs: 2, sm: 2.25, md: 3 }, position: 'relative', overflow: 'hidden',
      borderRadius: '20px !important',
      // Mesh gradient bg — sutil, só dá profundidade
      background: isDark
        ? `radial-gradient(ellipse at 20% 30%, rgba(32,178,170,.12), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(212,165,116,.06), transparent 50%), ${t.palette.background.paper}`
        : `radial-gradient(ellipse at 20% 30%, rgba(32,178,170,.08), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(212,165,116,.04), transparent 50%), #ffffff`,
      boxShadow: `0 2px 8px rgba(0,0,0,.04), 0 8px 32px ${scoreGlowColor(score)}`,
      transition: 'box-shadow .6s ease',
    }}>
      {/* Floating sparkles */}
      <Sparkle top="15%" left="85%" delay={0} size={4} />
      <Sparkle top="60%" left="92%" delay={1.2} size={3} />
      <Sparkle top="35%" left="78%" delay={2.5} size={5} />

      <Stack direction="row" spacing={{ xs: 1.5, sm: 2.25 }} alignItems="center" sx={{ width: '100%', minWidth: 0, position: 'relative', zIndex: 1 }}>
        {/* Score Ring — gradiente cônico animado */}
        <Box sx={{
          position: 'relative', display: 'grid', placeItems: 'center',
          width: { xs: 80, sm: 96 }, height: { xs: 80, sm: 96 }, flexShrink: 0,
          // Glow pulsante atrás do ring
          '&::before': {
            content: '""', position: 'absolute', inset: -4,
            borderRadius: '50%',
            background: scoreGlowColor(score),
            filter: 'blur(12px)',
            animation: reduced ? 'none' : 'dxRingPulse 3s ease-in-out infinite',
          },
          '@keyframes dxRingPulse': {
            '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
            '50%': { opacity: 1, transform: 'scale(1.08)' },
          },
          // W2 — pulso dourado quando o score subiu (4 batidas e descansa).
          ...(scoreGain > 0 && showGain ? {
            animation: 'dxGoldPulse .85s ease-in-out 4',
            '@keyframes dxGoldPulse': {
              '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,165,116,0)' },
              '50%': { boxShadow: '0 0 0 10px rgba(212,165,116,.38)' },
            },
          } : {}),
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}>
          <Box component="svg" aria-hidden="true" viewBox="0 0 100 100" sx={{ width: '100%', height: '100%', transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#20b2aa" />
                <stop offset="50%" stopColor="#059669" />
                <stop offset="100%" stopColor="#20b2aa" />
              </linearGradient>
            </defs>
            {/* Track — mais sutil */}
            <circle cx="50" cy="50" r="42" fill="none"
              stroke={alpha(t.palette.text.primary, isDark ? 0.08 : 0.06)}
              strokeWidth="8" />
            {/* Progress — gradiente + animação */}
            <circle cx="50" cy="50" r="42" fill="none"
              stroke="url(#scoreGrad)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${dashLen} 999`}
              style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.16,1,.3,1)' }}
              filter={score && score >= 60 ? 'drop-shadow(0 0 4px rgba(32,178,170,.4))' : undefined}
            />
          </Box>
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 0.5, minWidth: 0, pointerEvents: 'none', zIndex: 2 }}>
            {loaded ? (
              <Typography noWrap sx={{
                fontFamily: 'Poppins, sans-serif', fontWeight: 800,
                fontSize: { xs: 'clamp(1.375rem, 7vw, 1.75rem)', sm: 26 },
                lineHeight: 1, color: 'text.primary', fontVariantNumeric: 'tabular-nums',
              }}>{animatedScore ?? '—'}</Typography>
            ) : <Shimmer w={40} h={26} r={8} />}
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.15 }}>de 100</Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: (th) => TONE_TEXT[st.tone][th.palette.mode === 'dark' ? 'dark' : 'light'] }}>Sua saúde hoje</Typography>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.125rem, 5.5vw, 1.375rem)', sm: 22 }, lineHeight: 1.15, color: 'text.primary', mt: 0.25, textWrap: 'balance' }}>{title}</Typography>
          {/* W2 — comemora o progresso (só quando SUBIU; nunca pune queda). */}
          {scoreGain > 0 && showGain && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.75, px: 1.25, py: 0.4, borderRadius: '999px', bgcolor: 'rgba(212,165,116,.14)', border: '1px solid rgba(212,165,116,.35)', fontSize: 12.5, fontWeight: 800, color: (th) => copperText(th.palette.mode) }}>
              ⚡ +{scoreGain} pontos desde sua última visita
            </Box>
          )}
          <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
            {totalAtt > 0 ? (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                {importante > 0 && <Box component="span" sx={{ color: (th) => (th.palette.mode === 'dark' ? '#f87171' : '#b91c1c'), fontWeight: 700 }}>● {importante} importante{importante > 1 ? 's' : ''}</Box>}
                {importante > 0 && moderada > 0 && <Box component="span" sx={{ color: 'text.secondary' }}> · </Box>}
                {moderada > 0 && <Box component="span" sx={{ color: (th) => (th.palette.mode === 'dark' ? '#fbbf24' : '#b45309'), fontWeight: 700 }}>● {moderada} moderado{moderada > 1 ? 's' : ''}</Box>}
              </Typography>
            ) : noData ? (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{goalSubtitle(getGoals()) ?? 'Envie um exame pra começarmos a construir sua visão de saúde.'}</Typography>
            ) : score != null ? (
              <Typography sx={{ fontSize: 14, color: 'success.main', fontWeight: 700 }}>● Nada crítico no momento</Typography>
            ) : null}
            {/* Honestidade de estado (voltou pra V2): dados velhos AVISAM em vez de parecerem atuais. */}
            {staleWarning && !noData ? (
              <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: (th) => TONE_TEXT.warning[th.palette.mode === 'dark' ? 'dark' : 'light'] }}>⏳ {staleWarning}</Typography>
            ) : last && !noData ? (
              <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>· atualizado {last}</Typography>
            ) : null}
          </Stack>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2.25, width: '100%', position: 'relative', zIndex: 1 }}>
        {noData ? (
          <>
            <GradientButton onClick={onFirstExam} endIcon={<ArrowForwardIcon />} sx={{ width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch' }}>
              Enviar primeiro exame
            </GradientButton>
            {/* Ação secundária (design system: 1 primária por tela) — "vendo o app sente vontade". */}
            {onDemo && (
              <Button variant="text" onClick={onDemo} sx={{ width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch', borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: (th) => tealText(th.palette.mode) }}>
                👀 Ver com dados de exemplo
              </Button>
            )}
          </>
        ) : (
          <>
            <GradientButton onClick={onDetails} endIcon={<ArrowForwardIcon />} sx={{ flex: 1, width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch' }}>
              Ver análise completa
            </GradientButton>
            {onChat && (
              <Button
                onClick={onChat}
                variant="outlined"
                startIcon={<ChatCircle size={18} weight="bold" />}
                sx={{
                  flex: { xs: 'none', sm: '0 0 auto' },
                  width: { xs: '100%', sm: 'auto' },
                  py: 1.1, px: 2.25,
                  borderRadius: '12px',
                  borderColor: (th) => alpha(th.palette.primary.main, 0.35),
                  color: (th) => tealText(th.palette.mode),
                  fontWeight: 700,
                  fontSize: 13,
                  textTransform: 'none',
                  bgcolor: (th) => alpha(th.palette.primary.main, 0.04),
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: (th) => alpha(th.palette.primary.main, 0.1),
                  }
                }}
              >
                Tirar dúvida com IA
              </Button>
            )}
          </>
        )}
      </Stack>
    </AppCard>
  );
};

/** Mini arc gauge SVG — semicírculo progressivo de 180°. */
const MiniArc = ({ percent, color, size = 32 }: { percent: number; color: string; size?: number }) => {
  const r = 12; const circ = Math.PI * r; const dash = (percent / 100) * circ;
  return (
    <Box component="svg" viewBox="0 0 30 18" sx={{ width: size, height: size * 0.6, mt: 0.5, display: 'block' }}>
      <path d="M3,15 A12,12 0 0,1 27,15" fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="3" strokeLinecap="round" />
      <path d="M3,15 A12,12 0 0,1 27,15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray .8s ease' }} />
    </Box>
  );
};

/** Tile de indicador — SOFT BADGE MODERNO (SaaS / Hospital management). */
const IndicatorTile = ({ icon, label, value, sub, tone, onClick, idx = 0, badgeBg, badgeColor, arcPercent, arcColor }: {
  icon: ReactNode; label: string; value: string; sub?: string;
  tone: 'error' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'premium';
  onClick: () => void; idx?: number;
  badgeBg?: string; badgeColor?: string;
  arcPercent?: number; arcColor?: string;
}) => {
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();
  const bg = badgeBg ?? alpha((theme.palette as any)[tone]?.main ?? '#20b2aa', 0.12);
  const color = badgeColor ?? `${tone}.main`;

  return (
    <AppCard kind="interactive" onClick={onClick} sx={{
      p: 2, height: '100%', borderRadius: '20px !important',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: (th) => th.palette.mode === 'dark'
        ? '0 2px 8px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.2)'
        : '0 1px 3px rgba(0,0,0,.03), 0 4px 12px rgba(0,0,0,.04)',
      transition: 'transform .2s cubic-bezier(.16,1,.3,1), box-shadow .25s ease, border-color .2s ease',
      '&:hover': {
        boxShadow: '0 4px 14px rgba(0,0,0,.06)',
        transform: 'translateY(-2px)',
      },
      '&:active': { transform: 'scale(.98)' },
      // Hover no CARD inteiro escala o ícone (antes o seletor era no próprio ícone de 42px).
      '&:hover .dx-tile-icon': { transform: 'scale(1.06)' },
      animation: reduced ? 'none' : `dxTileSpring .45s cubic-bezier(.34,1.56,.64,1) ${idx * 0.08}s both`,
      '@keyframes dxTileSpring': {
        from: { opacity: 0, transform: 'translateY(14px) scale(.96)' },
        to: { opacity: 1, transform: 'translateY(0) scale(1)' },
      },
    }}>
      <Box sx={{ minWidth: 0, flex: 1, pr: 1.25 }}>
        <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {label}
        </Typography>
        <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.125rem, 5vw, 1.375rem)', sm: 22 }, color: 'text.primary', lineHeight: 1.2, mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
        {arcPercent != null && arcColor && <MiniArc percent={arcPercent} color={arcColor} />}
        {sub && (
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}
          </Typography>
        )}
      </Box>
      <Box className="dx-tile-icon" sx={{
        width: 42, height: 42,
        borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0,
        bgcolor: bg, color: color,
        transition: 'transform .2s ease',
      }}>
        {icon}
      </Box>
    </AppCard>
  );
};

/** Panorama de Marcadores — estilo Hospital Management / Department Occupancy */
const MarkerDistributionCard = ({ buckets, totalMarkers, onOpen }: { buckets: { bons: number; alerta: number; alterados: number }; totalMarkers: number; onOpen: (dest: 'exams' | 'alterados') => void }) => {
  const t = useTheme();
  const isDark = t.palette.mode === 'dark';
  const total = (buckets.bons + buckets.alerta + buckets.alterados) || totalMarkers;
  const bonsPct = total > 0 ? Math.round((buckets.bons / total) * 100) : 0;
  const alertaPct = total > 0 ? Math.round((buckets.alerta / total) * 100) : 0;
  const alteradosPct = total > 0 ? Math.round((buckets.alterados / total) * 100) : 0;

  /** F4 — linha do panorama = atalho (padrão app grande): Normais → exames;
   *  fora-da-faixa → /alterados. Teclado + hover + hint "ver". */
  const row = (label: string, count: number, pct: number, color: any, bar: string, dest: 'exams' | 'alterados', last = false) => (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(dest)}
      aria-label={`${label}: ${count} de ${total} (${pct}%) — ver`}
      sx={{
        display: 'block', width: '100%', textAlign: 'left', p: 0, m: 0, border: 'none',
        bgcolor: 'transparent', fontFamily: 'inherit', cursor: 'pointer',
        minHeight: 44,
        borderRadius: '10px', px: 0.75, py: 0.5, mx: -0.75,
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        '&:active': { transform: 'scale(.99)' },
        ...(last ? {} : { mb: 0.25 }),
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary' }}>{label} <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}>ver →</Box></Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 800, color }}>{count}/{total} ({pct}%)</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9', '& .MuiLinearProgress-bar': { bgcolor: bar, borderRadius: 3 } }} />
    </Box>
  );

  return (
    <AppCard sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '20px !important' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(13, 148, 136, 0.12)', color: 'primary.dark' }}>
          <ShowChartIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14.5, lineHeight: 1.2 }}>
            Seus Marcadores
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {total > 0 ? `Distribuição de ${total} marcadores analisados` : 'Nenhum exame analisado ainda'}
          </Typography>
        </Box>
      </Stack>

      <Stack spacing={0.75}>
        {row('Normais & Saudáveis', buckets.bons, bonsPct, (th: any) => TONE_TEXT.success[th.palette.mode === 'dark' ? 'dark' : 'light'], '#10b981', 'exams')}
        {row('Alteração Leve', buckets.alerta, alertaPct, (th: any) => TONE_TEXT.warning[th.palette.mode === 'dark' ? 'dark' : 'light'], '#f59e0b', 'alterados')}
        {row('Requerem Atenção', buckets.alterados, alteradosPct, (th: any) => TONE_TEXT.error[th.palette.mode === 'dark' ? 'dark' : 'light'], '#ef4444', 'alterados', true)}
      </Stack>

      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 2, lineHeight: 1.35 }}>
        💡 Comparações baseadas nas diretrizes oficiais dos laboratórios credenciados.
      </Typography>
    </AppCard>
  );
};

export const DashboardV2 = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const real = useDashboardData(pid);
  // E4.1 — perfil esportivo (GET /sports/profile, cache de sessão): só o TOGGLE ativo
  // no servidor troca o painel. Sem perfil / offline / active=false → dashboard normal.
  const sports = useSportsProfile();
  // MODO EXEMPLO: swap 1:1 do payload (ver demoData.ts). NÃO persiste — dado fictício
  // de saúde jamais "vira seu"; sair/recarregar volta pro app real. O hook real continua
  // rodando (hooks incondicionais) e o firstName continua o DO USUÁRIO (saudação real).
  const [demo, setDemo] = useState(false);
  const [demoAsk, setDemoAsk] = useState(false);
  // 28/09: tile Cardiorrisco abre os FATORES (dialog) em vez de navegar pra Tendências.
  const [cardioOpen, setCardioOpen] = useState(false);
  const d = demo ? DEMO_DASHBOARD : real;
  const th = useTheme();
  const isDark = th.palette.mode === 'dark';
  // Badges dos KPI tiles a partir dos tokens SEM (mode-aware — fecha o P10 da review).
  // As tintas de fundo (rgba .12) continuam literais: são deliberadamente mode-agnósticas.
  const semC = (k: 'ok' | 'warn' | 'bad' | 'premium') => SEM[k][isDark ? 'dark' : 'light'];
  const [bioOffer, setBioOffer] = useState(false);
  const firstName = (real.me?.fullName || '').split(' ')[0];
  // Navegação guardada: no demo, telas de DADO REAL abrem dialog de conversão em vez de
  // navegar pro vazio (quebraria a ilusão e confundiria).
  const go = (to: string) => (demo ? () => setDemoAsk(true) : () => navigate(to));

  // MEDIÇÃO do modo exemplo (R1): started = entrou; converted = clicou "Usar meu exame"
  // (1× por sessão de demo — banner e dialog apontam pro mesmo conversor).
  const demoConvertedRef = useRef(false);
  const demoEvent = (type: 'started' | 'converted') => {
    fetch(`${API_URL}/patients/demo-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ type }),
    }).catch(() => {});
    track(`demo_${type}`); // G4 — funil do modo exemplo no PostHog (no-op sem key)
  };
  const convertDemo = () => {
    if (!demoConvertedRef.current) { demoConvertedRef.current = true; demoEvent('converted'); }
    setDemoAsk(false);
    navigate('/exams/create');
  };

  useEffect(() => {
    // Offer por PAPEL (paciente): médico matriculado no aparelho não pode calar o offer
    // do paciente (bug: hasEnrollment "qualquer papel" escondia p/ sempre).
    if (BiometricService.isSupported() && !BiometricService.hasEnrollmentFor('patient')) {
      const id = setTimeout(() => setBioOffer(true), 1500);
      return () => clearTimeout(id);
    }
  }, []);
  // Demo cala o offer de biometria (ruído em cima de dado fictício).
  useEffect(() => { if (demo) setBioOffer(false); }, [demo]);

  // W1 — CELEBRAÇÃO DO 1º EXAME (1× por paciente): dispara quando a conta passa a ter
  // exatamente 1 exame extraído. Veteranos (exames > 1) marcam a flag em silêncio —
  // nunca celebram "1º exame" atrasado. Demo jamais dispara.
  const [celebrate, setCelebrate] = useState(false);
  const firstKey = `dx1st:${pid}`;
  useEffect(() => {
    if (demo || !d.loaded || !pid) return;
    let seen = false;
    try { seen = localStorage.getItem(firstKey) === '1'; } catch { /* ignore */ }
    if (seen) return;
    if (d.stats.exams > 1) { try { localStorage.setItem(firstKey, '1'); } catch { /* ignore */ } return; }
    if (d.stats.exams === 1) {
      const tm = setTimeout(() => { setCelebrate(true); track('celebration_shown'); }, 900);
      return () => clearTimeout(tm);
    }
  }, [d.loaded, d.stats.exams, pid, demo, firstKey]);
  const finishCelebration = () => {
    // REVIEW (01/10, gatilho 3): celebrou e FECHOU a celebração = vitória consumida —
    // momento certo pro review nativo (mesma API/90d; nunca durante a animação).
    void maybeRequestReview();
    setCelebrate(false);
    try { localStorage.setItem(firstKey, '1'); } catch { /* ignore */ }
  };

  // G2 — variante educativa do card mental: 1× por PACIENTE (dx-mental-intro:<pid>),
  // setada ao dispensar (X) OU ao responder (entrar na tela conta como "viu").
  const mentalIntroKey = `dx-mental-intro:${pid}`;
  const [mentalIntroSeen, setMentalIntroSeen] = useState(() => {
    try { return pid ? localStorage.getItem(`dx-mental-intro:${pid}`) === '1' : true; } catch { return true; }
  });
  useEffect(() => {
    try { setMentalIntroSeen(pid ? localStorage.getItem(mentalIntroKey) === '1' : true); } catch { setMentalIntroSeen(true); }
  }, [pid, mentalIntroKey]);
  const dismissMentalIntro = () => {
    try { localStorage.setItem(mentalIntroKey, '1'); } catch { /* ignore */ }
    setMentalIntroSeen(true);
  };

  const totalResults = d.buckets.bons + d.buckets.alerta + d.buckets.alterados;
  const cardioLevel: string = d.cardioRisk?.level ?? '';
  const cardioFactors: number = Array.isArray(d.cardioRisk?.factors) ? d.cardioRisk.factors.filter((f: any) => f.risk).length : 0;

  // Dica da IA SEM fetch novo: mesmos markers do ChangesSinceExam (padrão do Dashboard
  // legacy). Sem marker de atenção → fallback convida pro chat.
  const markerToTip = (m: Marker | undefined): any => (m ? {
    name: m.name,
    value: (m as any).latest?.valueNumeric ?? null,
    unit: (m as any).unit,
    flag: ((m as any).latest?.valueNumeric != null && (m as any).refHigh != null && (m as any).latest.valueNumeric > (m as any).refHigh) ? 'HIGH'
        : ((m as any).latest?.valueNumeric != null && (m as any).refLow != null && (m as any).latest.valueNumeric < (m as any).refLow) ? 'LOW'
        : ((m as any).flag || ''),
  } : null);
  const tipNode = <AiTip firstName={firstName} tipData={{ abnormal: markerToTip(d.worsened[0]), good: markerToTip(d.improved[0]) }} fallbackTip="Toque e pergunte qualquer coisa sobre seus exames — eu leio seu histórico antes de responder." />;

  // Arc percentages para os indicator tiles (sem fetch novo — calcula dos dados que já existem).
  const cardioArc = cardioLevel === 'baixo' ? 20 : cardioLevel === 'moderado' ? 55 : cardioLevel === 'alto' ? 90 : 0;
  const cardioArcColor = cardioLevel === 'baixo' ? '#059669' : cardioLevel === 'moderado' ? '#f59e0b' : cardioLevel === 'alto' ? '#ef4444' : '#94a3b8';

  // E4.1 — SWAP POR FLAG (padrão do modo demo: troca na renderização, hooks seguem
  // rodando). Perfil esportivo ATIVO → painel "Saúde Esportiva" no lugar do grid.
  // Toggle OFF → este return não é alcançado e a renderização abaixo fica
  // EXATAMENTE igual à atual (screenshot-comparável).
  if (!demo && sports.active) {
    return <SportsDashboard pid={pid} d={real} profile={sports.profile} firstName={firstName} />;
  }

  return (
    <PageContainer width="wide" sx={{ bgcolor: 'transparent', minHeight: '100dvh' }}>
      <DashboardHeader firstName={firstName} />
      {/* Descoberta (07/10): modo esportivo elegível e NÃO ativo → vitrine/atalho no topo.
          Ativou → card some e o return do SportsDashboard assume. */}
      {!demo && !sports.active && <SportsUpsellCard pid={pid} />}
      <FailedExamsAlert count={d.failed} onClick={() => navigate('/exams')} />
      <RejectedExamsAlert count={d.rejected} onClick={() => navigate('/exams')} />
      {/* E1 — sinal global de análise em andamento (o exame não "some" ao sair da lista). */}
      {!demo && d.processing && d.processing.count > 0 && (
        <ProcessingStrip count={d.processing.count} oldestAt={d.processing.oldestAt} onClick={() => navigate('/exams')} />
      )}

      {/* MODO EXEMPLO — banner sempre visível: dado fictício nunca pode passar por seu. */}
      {demo && (
        <AppCard kind="accent" tone="warning" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: '14px', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ flex: 1, minWidth: 180, fontSize: 13, lineHeight: 1.45 }}>
            👀 <b>Modo exemplo</b> — tudo aqui é de uma pessoa fictícia. Seu app real ganha essa análise no 1º exame.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDemo(false)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 2 }}>Sair</Button>
            <GradientButton onClick={convertDemo} sx={{ py: 0.9, px: 2.25, fontSize: 13 }}>Usar meu exame</GradientButton>
          </Stack>
        </AppCard>
      )}

      {/* 1. HERO HEALTH CARD (Score + Status + Ações em largura total) */}
      <ScrollReveal>
        <HeroHealthCard
          loaded={d.loaded}
          score={d.score}
          exams={d.stats.exams}
          importante={d.importante}
          moderada={d.moderada}
          lastExam={d.lastExam}
          staleWarning={d.staleWarning}
          scoreGain={demo ? 0 : (d.score != null && d.prevScore != null && d.score > d.prevScore ? d.score - d.prevScore : 0)}
          onDetails={go('/tendencias')}
          onFirstExam={() => navigate('/exams/create')}
          onChat={go('/chat')}
          onDemo={demo ? undefined : () => { setDemo(true); demoEvent('started'); }}
        />
      </ScrollReveal>

      {/* CHECKLIST DE ATIVAÇÃO — só no estado vazio real (sem exames, fora do modo exemplo):
          passos concretos em vez de tiles vazios (cliff do dia 0). 1º exame = missão cumprida. */}
      {!demo && d.loaded && d.stats.exams === 0 && (
        <ScrollReveal delay={60}>
          <Box sx={{ mt: 2 }}>
            <ActivationChecklist exams={d.stats.exams} />
          </Box>
        </ScrollReveal>
      )}

      {/* QUIZ RESUMÍVEL (05/10) — card anuncia os metadados ANTES de entrar ("~30s · 3
          perguntas · +Y créditos") e retoma de onde parou com % de progresso. some sozinho
          quando o quiz é concluído/pulado (localStorage) ou já completo no server. */}
      {!demo && <GoalQuizCard />}

      {/* 2. 4 CARDS DE KPI COM SOFT BADGES (2x2 no mobile, 4x1 no desktop). W4: enquanto
          carrega, TILES EM SHIMMER (mesmo footprint) em vez de '…' — feel de app nativo. */}
      <ScrollReveal delay={80}>
        {!d.loaded && !demo ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5, mt: 2 }}>
            {[0, 1, 2, 3].map((i) => <TileShimmer key={i} />)}
          </Box>
        ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5, mt: 2 }}>
          {/* Alterados (antes: tile de Score — redundante com o hero logo acima). O score
              continua no HERO; aqui entra a métrica que estava só num subtítulo minúsculo. */}
          <IndicatorTile
            idx={0}
            icon={<FavoriteBorderIcon />}
            badgeBg={d.stats.abnormal > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(5, 150, 105, 0.12)'}
            badgeColor={d.stats.abnormal > 0 ? semC('bad') : semC('ok')}
            tone={d.stats.abnormal > 0 ? 'error' : 'success'}
            label="Alterados"
            value={d.loaded ? String(d.stats.abnormal) : '—'}
            sub={d.loaded ? (totalResults > 0 ? `de ${totalResults} marcadores` : '') : ''}
            arcPercent={totalResults > 0 ? Math.max(0, Math.round((d.stats.abnormal / totalResults) * 100)) : undefined}
            arcColor={d.stats.abnormal > 0 ? '#ef4444' : '#059669'}
            onClick={go('/alterados')}
          />
          <IndicatorTile
            idx={1}
            icon={<Stethoscope size={22} weight="duotone" />}
            badgeBg="rgba(99, 102, 241, 0.12)"
            badgeColor={semC('premium')}
            tone="primary"
            label="Exames"
            value={d.loaded ? String(d.stats.exams) : '—'}
            sub={d.stats.exams === 0 && d.loaded ? 'envie o primeiro' : `${d.stats.abnormal} alterado${d.stats.abnormal === 1 ? '' : 's'}`}
            onClick={go('/exams')}
          />
          <BiologicalAgeCard idx={2} bio={d.bio} bioKdm={d.bioKdm} bioAvail={d.bioAvail} bioLoaded={d.hsLoaded} chronoAge={demo ? DEMO_CHRONO_AGE : undefined} />
          <IndicatorTile
            idx={3}
            icon={<ChartLineUp size={22} weight="duotone" />}
            badgeBg={cardioLevel === 'alto' ? 'rgba(239, 68, 68, 0.12)' : cardioLevel === 'moderado' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)'}
            badgeColor={cardioLevel === 'alto' ? semC('bad') : cardioLevel === 'moderado' ? semC('warn') : semC('ok')}
            tone={cardioLevel ? (cardioFactors > 0 ? 'error' : 'success') : 'info'}
            label="Cardiorrisco"
            value={cardioLevel || (d.loaded ? 'Sem dados' : '—')}
            sub={cardioLevel
              ? (cardioFactors > 0 ? `${cardioFactors} fator${cardioFactors > 1 ? 'es' : ''} de risco` : 'sem fatores')
              : (d.loaded ? (d.stats.exams > 0 ? 'sem colesterol, peso ou pressão' : 'envie um exame') : '')}
            arcPercent={cardioArc}
            arcColor={cardioArcColor}
            /* 28/09 (bug bash do dono): levava a Tendências — incoerente. Agora abre os
               FATORES que dimensionam o risco (o que o tile promete). */
            onClick={() => setCardioOpen(true)}
          />
        </Box>
        )}
      </ScrollReveal>

      {/* 3. GRID ASSIMÉTRICO 2 COLUNAS (Desktop 65/35, Mobile 1 coluna fluida) */}
      <ScrollReveal delay={140}>
        <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
          {/* COLUNA PRINCIPAL (65%) */}
          <Grid size={{ xs: 12, md: 7, lg: 8 }}>
            <Stack spacing={2.5}>
              {/* PRÓXIMOS PASSOS (onboarding) — escondido no demo (checklist real não faz sentido) */}
              {!demo && <NextStepsCard exams={d.stats.exams} />}

              {/* O QUE MUDOU NO SEU ÚLTIMO EXAME */}
              <ChangesSinceExam worsened={d.worsened} improved={d.improved} onView={go('/evolucao')} loaded={d.loaded} />

              {/* G2 — saúde mental: flui do "como estou" (exames) pro "como estou por
                  dentro". Dado real do paciente → JAMAIS no modo exemplo. */}
              {!demo && (
                <MentalCard
                  mental={real.mental}
                  mentalOffline={real.mentalOffline}
                  introDismissed={mentalIntroSeen}
                  onDismissIntro={dismissMentalIntro}
                  onOpen={() => { dismissMentalIntro(); navigate('/saude-mental'); }}
                />
              )}

              {/* ATIVIDADE FÍSICA & HEALTH CONNECT — escondida no demo (dado é do DEVICE, não há como fingir) */}
              {!demo && (!real.me?.relationship || real.me.relationship === 'Titular') && (
                <Section label="Atividade física • Health Connect" icon={<Heartbeat size={18} weight="duotone" />}>
                  <Box sx={{ display: 'grid', gap: 2 }}>
                    <ActivityCard lastExamAt={d.lastExam} />
                    <RestingHeartCard />
                  </Box>
                </Section>
              )}

              {/* DR. EXAME IA */}
              <AiCard tip={tipNode} onChat={go('/chat')} />

              {/* DESDE SEU ÚLTIMO EXAME */}
              <SinceExamCard lastExamAt={d.lastExam} />
            </Stack>
          </Grid>

          {/* COLUNA LATERAL (35%) */}
          <Grid size={{ xs: 12, md: 5, lg: 4 }}>
            <Stack spacing={2.5}>
              {/* PANORAMA DOS MARCADORES */}
              <MarkerDistributionCard buckets={d.buckets} totalMarkers={d.markerCount} onOpen={(dest) => (dest === 'alterados' ? go('/alterados') : go('/exams'))()} />

              {/* AÇÕES RÁPIDAS */}
              <Section label="Ações rápidas" icon={<AutoAwesomeIcon sx={{ fontSize: 18 }} />}>
                <QuickActions />
              </Section>

              {/* CRÉDITOS DO PLANO */}
              <CreditsCard credits={d.credits} onClick={() => navigate('/planos')} />

              {/* CONQUISTAS */}
              <GamificationBadges examsCount={d.stats.exams} score={d.score} />

              {/* COMPARTILHAMENTO DE SAÚDE — JAMAIS no demo (compartilhar score fictício) */}
              {!demo && (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <ShareHealthButton score={d.score ?? undefined} />
                </Box>
              )}
            </Stack>
          </Grid>
        </Grid>
      </ScrollReveal>

      <ReviewPrompt trigger={!demo && d.loaded && d.stats.exams > 0} />

      {/* FATORES DO RISCO CARDIOMETABÓLICO (28/09): o tile promete fatores — entrega fatores.
          Nível + cada insumo (✓ dentro / ⚠ acima) + o que falta cadastrar. Educativo. */}
      <Dialog open={cardioOpen} onClose={() => setCardioOpen(false)} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 440 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>❤️ Seu risco cardiometabólico</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 800, fontSize: 17, mb: 1.5, color: cardioArcColor }}>
            {cardioLevel === 'baixo' ? 'Baixo' : cardioLevel === 'moderado' ? 'Moderado' : cardioLevel === 'alto' ? 'Alto' : 'Sem dados'}
            {cardioFactors > 0 ? ` · ${cardioFactors} fator${cardioFactors > 1 ? 'es' : ''} de risco` : ' · nenhum fator'}
          </Typography>
          <Stack spacing={0.75}>
            {(d.cardioRisk?.factors ?? []).map((f: any, i: number) => (
              <Stack key={i} direction="row" alignItems="center" spacing={1} sx={{ p: 0.9, borderRadius: '10px', bgcolor: f.risk ? 'rgba(239,68,68,.08)' : 'rgba(16,185,129,.07)' }}>
                <Typography sx={{ fontSize: 16 }}>{f.risk ? '⚠️' : '✅'}</Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>{f.label}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{f.risk ? 'acima do ideal' : 'dentro do esperado'}</Typography>
              </Stack>
            ))}
            {(!d.cardioRisk?.factors || d.cardioRisk.factors.length === 0) && (
              <Typography variant="body2" color="text.secondary">Envie exames com colesterol/glicose e cadastre peso e pressão em Medições pra dimensionar o risco.</Typography>
            )}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary', lineHeight: 1.4 }}>
            Identifica fatores de risco — não calcula probabilidade individual de infarto/AVC. A avaliação completa é com seu médico.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCardioOpen(false); navigate('/medicoes'); }} sx={{ textTransform: 'none', fontWeight: 700 }}>Cadastrar peso/pressão</Button>
          <Button onClick={() => setCardioOpen(false)} variant="contained" sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* W1 — o momento "woowww" do funil de ativação. */}
      <Celebration
        open={celebrate}
        firstName={firstName}
        onDone={finishCelebration}
        onCta={() => { finishCelebration(); navigate('/tendencias'); }}
      />

      {/* Dialog de conversão do modo exemplo (clique em tela de dado real) */}
      <Dialog open={demoAsk} onClose={() => setDemoAsk(false)} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 420 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Isso é o modo exemplo 👀</DialogTitle>
        <DialogContent>
          <Typography sx={{ lineHeight: 1.6 }}>
            Os números que você está vendo são de uma pessoa fictícia. Envie seu primeiro exame (PDF ou foto) e em poucos minutos o Dr. Exame monta a <b>sua</b> análise igual a essa.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDemoAsk(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Continuar no exemplo</Button>
          <GradientButton onClick={convertDemo}>Enviar meu exame</GradientButton>
        </DialogActions>
      </Dialog>

      {/* Oferta de biometria */}
      <Dialog open={bioOffer} onClose={() => setBioOffer(false)} PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>🔐 Entrar com biometria?</DialogTitle>
        <DialogContent><Typography sx={{ color: 'text.secondary' }}>Ative a entrada por face/digital neste aparelho. Na próxima vez, você entra sem digitar senha — mais rápido e seguro.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setBioOffer(false)} sx={{ textTransform: 'none' }}>Agora não</Button>
          <GradientButton onClick={() => { BiometricService.enroll(token() || '', false); setBioOffer(false); }}>Ativar biometria</GradientButton>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
