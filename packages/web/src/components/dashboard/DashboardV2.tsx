import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, Typography, Box, Grid, useTheme, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { API_URL, token } from '../../config';
import { SEM } from '../../theme';
import { Heartbeat, Stethoscope, ChartLineUp, Dna } from '@phosphor-icons/react';
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
import { ReviewPrompt } from '../ReviewPrompt';
import { AppCard } from '../AppCard';
import { GradientButton } from '../GradientButton';
import { ChangesSinceExam, type Marker } from './ChangesSinceExam';
import { ScrollReveal } from './ScrollReveal';
import { Section } from './Section';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { getGoals, goalSubtitle } from '../GoalQuiz';

const readTotal = (r: Response) =>
  Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0');

/** Busca os mesmos dados do Dashboard legacy — V2 isolada (não toca no fetch do legacy). */
function useDashboardData(pid: string | null) {
  const [stats, setStats] = useState({ exams: 0, abnormal: 0 });
  const [failed, setFailed] = useState(0);
  const [lastExam, setLastExam] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<{ bons: number; alerta: number; alterados: number }>({ bons: 0, alerta: 0, alterados: 0 });
  const [score, setScore] = useState<number | null>(null);
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
  // Honestidade de estados (auditoria 2026-08): o server diz POR QUE cada feature não calculou
  // (availability) — o cliente nunca mais infere estado positivo a partir de null.
  const [availability, setAvailability] = useState<any>(null);
  const [rejected, setRejected] = useState(0);

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
      if (cn) setScore(Number(cn));
    } catch { /* ignore */ }
    (async () => {
      const h = { Authorization: `Bearer ${token()}` };
      const pidQ = pid ? `&patientId=${pid}` : '';
      // Fetches independentes em PARALELO (antes: 7 awaits encadeados — o score só pintava
      // depois de TODOS responderem, lento em 3G). Catch por bloco: uma falha isolada não
      // derruba o resto; setLoaded roda no finally de qualquer jeito.
      const jobs: Promise<void>[] = [
        (async () => { // total de exames + data do último
          const e = await fetch(`${API_URL}/exams?_start=0&_end=1${pidQ}`, { headers: h });
          const eData = await e.json().catch(() => []);
          setStats((s) => ({ ...s, exams: readTotal(e) }));
          if (Array.isArray(eData) && eData[0]?.performedAt) setLastExam(eData[0].performedAt);
        })(),
        (async () => setFailed(readTotal(await fetch(`${API_URL}/exams?_start=0&_end=1&status=FAILED${pidQ}`, { headers: h }))))(),
        (async () => setRejected(readTotal(await fetch(`${API_URL}/exams?_start=0&_end=1&status=REJECTED${pidQ}`, { headers: h }))))(),
        // Contagem de alterados VEM DO flag-summary (mesma fonte de /alterados — exclui exames
        // com CPF divergente). Antes: X-Total-Count de /items?abnormal=true (rota de lista, sem
        // o filtro) → Home dizia "8 alterados" enquanto /alterados dizia "tudo dentro da faixa".
        (async () => {
          const fs = await fetch(`${API_URL}/items/flag-summary${pid ? `?patientId=${pid}` : ''}`, { headers: h });
          if (fs.ok) {
            const fd = await fs.json();
            const b = fd.buckets ?? { bons: 0, alerta: 0, alterados: 0 };
            setBuckets(b);
            setStats((s) => ({ ...s, abnormal: (b.alerta ?? 0) + (b.alterados ?? 0) }));
            try { if (pid) localStorage.setItem(`dashScore:${pid}`, JSON.stringify(b)); } catch { /* ignore */ }
          }
        })(),
        // Camada canonical (Layer 2): score dedup-12m + availability + trend real.
        (async () => {
          if (!pid) return;
          const hs = await fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: h });
          if (hs.ok) {
            const hd = await hs.json();
            if (typeof hd.score === 'number') {
              setScore(hd.score);
              try { localStorage.setItem(`dashScoreNum:${pid}`, String(hd.score)); } catch { /* ignore */ }
            } else {
              // Sem score canônico agora (ex.: todos os exames eram de terceiro) → NÃO fica
              // score velho do localStorage (mostrava 93 de dados que não são mais contados).
              try { localStorage.removeItem(`dashScoreNum:${pid}`); } catch { /* ignore */ }
              setScore(null);
            }
            setImportante(hd.byPriority?.importante ?? 0);
            setModerada(hd.byPriority?.moderada ?? 0);
            setCardioRisk(hd.cardiometabolicRisk ?? null);
            setAvailability(hd.availability ?? null);
            setMarkerCount(typeof hd.markers === 'number' ? hd.markers : 0);
            setStaleWarning(hd.staleWarning ?? '');
            // "Pioraram" = trend PIOROU mesmo (hd.worsening). Antes alimentava com topAttention
            // (= alterados, qualquer tendência) — marcador ALTERADO-QUER-MELHORANDO caía nas
            // DUAS listas (topAttention ∩ improving) e o card mostrava o mesmo valor 2×
            // (bug da Heloisa: PCR 7.61 "piorou" e "melhorou" ao mesmo tempo).
            setWorsened(Array.isArray(hd.worsening) ? hd.worsening.slice(0, 3) : []);
            setImproved(Array.isArray(hd.improving) ? hd.improving.slice(0, 3) : []);
          }
        })(),
        (async () => {
          const p = await fetch(`${API_URL}/patients`, { headers: h });
          if (p.ok) { const pd = await p.json(); setMe(Array.isArray(pd) ? (pd.find((x: any) => x.id === pid) ?? pd[0]) : null); }
        })(),
        (async () => {
          const st = await fetch(`${API_URL}/billing/status`, { headers: h });
          if (st.ok) { const sd = await st.json(); setCredits(typeof sd.credits === 'number' ? sd.credits : null); }
        })(),
      ];
      try { await Promise.all(jobs.map((j) => j.catch(() => {}))); } finally { setLoaded(true); }
      // Streak server-side das conquistas — fire-and-forget (1x/dia, idempotente).
      fetch(`${API_URL}/achievements/heartbeat`, { method: 'POST', headers: h }).catch(() => {});
      void syncPushToken();
    })();
  }, [pid]);

  return { stats, failed, lastExam, buckets, score, importante, moderada, cardioRisk, markerCount, credits, me, loaded, worsened, improved, staleWarning, availability, rejected };
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
const Sparkle = ({ top, left, delay, size = 4 }: { top: string; left: string; delay: number; size?: number }) => (
  <Box sx={{
    position: 'absolute', top, left, width: size, height: size,
    borderRadius: '50%', bgcolor: 'rgba(32,178,170,.4)',
    boxShadow: '0 0 6px rgba(32,178,170,.4)',
    animation: `dxSparkle ${3 + delay}s ease-in-out ${delay}s infinite`,
    pointerEvents: 'none', ...SPARKLE_KF,
  }} />
);

/** HERO — score ring com gradiente cônico animado, countup, mesh gradient bg, sparkles. */
const HeroHealthCard = ({ loaded, score, exams, importante, moderada, lastExam, onDetails, onFirstExam }: {
  loaded: boolean; score: number | null; exams: number; importante: number; moderada: number; lastExam: string | null; onDetails: () => void; onFirstExam: () => void;
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

      <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="center" sx={{ width: '100%', minWidth: 0, position: 'relative', zIndex: 1 }}>
        {/* Score Ring — gradiente cônico animado */}
        <Box sx={{
          position: 'relative', display: 'grid', placeItems: 'center',
          width: { xs: 84, sm: 100 }, height: { xs: 84, sm: 100 }, flexShrink: 0,
          // Glow pulsante atrás do ring
          '&::before': {
            content: '""', position: 'absolute', inset: -4,
            borderRadius: '50%',
            background: scoreGlowColor(score),
            filter: 'blur(12px)',
            animation: 'dxRingPulse 3s ease-in-out infinite',
          },
          '@keyframes dxRingPulse': {
            '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
            '50%': { opacity: 1, transform: 'scale(1.08)' },
          },
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
                fontSize: { xs: 'clamp(1.375rem, 7vw, 1.75rem)', sm: 28 },
                lineHeight: 1, color: 'text.primary', fontVariantNumeric: 'tabular-nums',
              }}>{animatedScore ?? '—'}</Typography>
            ) : <Skeleton variant="text" width={36} height={30} />}
            <Typography noWrap sx={{ fontSize: 10, color: 'text.secondary', mt: 0.15 }}>de 100</Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: (t) => TONE_TEXT[st.tone][t.palette.mode === 'dark' ? 'dark' : 'light'] }}>Sua saúde hoje</Typography>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.125rem, 5.5vw, 1.375rem)', sm: 22 }, lineHeight: 1.15, color: 'text.primary', mt: 0.25, textWrap: 'balance' }}>{title}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
            {totalAtt > 0 ? (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                {importante > 0 && <Box component="span" sx={{ color: (t) => (t.palette.mode === 'dark' ? '#f87171' : '#b91c1c'), fontWeight: 700 }}>● {importante} importante{importante > 1 ? 's' : ''}</Box>}
                {importante > 0 && moderada > 0 && <Box component="span" sx={{ color: 'text.secondary' }}> · </Box>}
                {moderada > 0 && <Box component="span" sx={{ color: (t) => (t.palette.mode === 'dark' ? '#fbbf24' : '#b45309'), fontWeight: 700 }}>● {moderada} moderado{moderada > 1 ? 's' : ''}</Box>}
              </Typography>
            ) : noData ? (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{goalSubtitle(getGoals()) ?? 'Envie um exame pra começarmos a construir sua visão de saúde.'}</Typography>
            ) : score != null ? (
              <Typography sx={{ fontSize: 14, color: 'success.main', fontWeight: 700 }}>● Nada crítico no momento</Typography>
            ) : null}
            {last && !noData && <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>· atualizado {last}</Typography>}
          </Stack>
        </Box>
      </Stack>
      {noData ? (
        <GradientButton onClick={onFirstExam} endIcon={<ArrowForwardIcon />} sx={{ mt: 2.25, width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch', position: 'relative', zIndex: 1 }}>
          Enviar primeiro exame
        </GradientButton>
      ) : (
        <GradientButton onClick={onDetails} endIcon={<ArrowForwardIcon />} sx={{ mt: 2.25, width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch', position: 'relative', zIndex: 1 }}>
          Ver análise completa
        </GradientButton>
      )}
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

/** Tile de indicador — PREMIUM: radius 24, sombra refinada, mini arc gauge, spring entrance. */
const IndicatorTile = ({ icon, label, value, sub, tone, onClick, idx = 0, arcPercent, arcColor }: {
  icon: ReactNode; label: string; value: string; sub?: string;
  tone: 'error' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'premium';
  onClick: () => void; idx?: number;
  arcPercent?: number; arcColor?: string;
}) => (
  <AppCard kind="interactive" onClick={onClick} sx={{
    p: 2, height: '100%', borderRadius: '24px !important',
    boxShadow: (th) => th.palette.mode === 'dark'
      ? '0 2px 8px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.2)'
      : '0 1px 3px rgba(0,0,0,.03), 0 4px 12px rgba(0,0,0,.04), 0 12px 28px rgba(0,0,0,.03)',
    transition: 'transform .2s cubic-bezier(.16,1,.3,1), box-shadow .25s ease, border-color .2s ease',
    '&:hover': {
      boxShadow: '0 4px 8px rgba(32,178,170,.06), 0 12px 32px rgba(32,178,170,.1), 0 20px 48px rgba(32,178,170,.06)',
      transform: 'translateY(-3px)',
    },
    '&:active': { transform: 'scale(.97)' },
    animation: `dxTileSpring .45s cubic-bezier(.34,1.56,.64,1) ${idx * 0.08}s both`,
    '@keyframes dxTileSpring': {
      from: { opacity: 0, transform: 'translateY(16px) scale(.95)' },
      to: { opacity: 1, transform: 'translateY(0) scale(1)' },
    },
  }}>
    <Stack spacing={0.25} sx={{ width: '100%', minWidth: 0 }}>
      <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
        <Box sx={{
          width: { xs: 40, sm: 46 }, height: { xs: 40, sm: 46 },
          borderRadius: '14px', display: 'grid', placeItems: 'center', flexShrink: 0,
          bgcolor: (th) => alpha((th.palette as any)[tone]?.main ?? '#20b2aa', 0.12),
          color: `${tone}.main`,
          transition: 'transform .2s ease, background-color .2s ease',
          '&:hover': { transform: 'scale(1.08)' },
        }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.1, fontWeight: 600, textOverflow: 'ellipsis' }}>{label}</Typography>
          <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1rem, 5vw, 1.125rem)', sm: 18 }, color: 'text.primary', lineHeight: 1.2, mt: 0.15, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        </Box>
      </Stack>
      {/* Mini arc gauge — visual premium debaixo do valor */}
      {arcPercent != null && arcColor && <MiniArc percent={arcPercent} color={arcColor} />}
      {sub && <Typography sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1.25, mt: 0.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub}</Typography>}
    </Stack>
  </AppCard>
);

export const DashboardV2 = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const d = useDashboardData(pid);
  const [bioOffer, setBioOffer] = useState(false);
  const firstName = (d.me?.fullName || '').split(' ')[0];

  useEffect(() => {
    // Offer por PAPEL (paciente): médico matriculado no aparelho não pode calar o offer
    // do paciente (bug: hasEnrollment "qualquer papel" escondia p/ sempre).
    if (BiometricService.isSupported() && !BiometricService.hasEnrollmentFor('patient')) {
      const id = setTimeout(() => setBioOffer(true), 1500);
      return () => clearTimeout(id);
    }
  }, []);

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
  const examsArcPercent = d.stats.exams > 0 ? Math.round(((d.stats.exams - d.stats.abnormal) / d.stats.exams) * 100) : 0;

  return (
    <PageContainer width="wide" sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.default' : '#FAFBFC'), minHeight: '100vh' }}>
      <DashboardHeader firstName={firstName} />
      <FailedExamsAlert count={d.failed} onClick={() => navigate('/exams')} />
      <RejectedExamsAlert count={d.rejected} onClick={() => navigate('/exams')} />

      {/* HERO + MUDANÇAS — mobile: coluna; desktop: 7/5 */}
      <ScrollReveal>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <HeroHealthCard loaded={d.loaded} score={d.score} exams={d.stats.exams} importante={d.importante} moderada={d.moderada} lastExam={d.lastExam} onDetails={() => navigate('/tendencias')} onFirstExam={() => navigate('/exams/create')} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <ChangesSinceExam worsened={d.worsened} improved={d.improved} onView={() => navigate('/evolucao')} loaded={d.loaded} />
          </Grid>
        </Grid>
      </ScrollReveal>

      {/* PRÓXIMOS PASSOS — onboarding progressivo */}
      <ScrollReveal delay={60}>
        <NextStepsCard exams={d.stats.exams} />
      </ScrollReveal>

      {/* DR. EXAME — insight + CTA chat */}
      <ScrollReveal delay={120}>
        <Box sx={{ mt: 2 }}>
          <AiCard tip={tipNode} onChat={() => navigate('/chat')} />
        </Box>
      </ScrollReveal>

      {/* SEUS INDICADORES */}
      <ScrollReveal delay={180}>
        <Section label="Seus indicadores" icon={<FavoriteBorderIcon />}>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, md: 3 }}>
              <IndicatorTile idx={0} icon={<Heartbeat size={22} weight="duotone" />}
                tone={cardioLevel ? (cardioFactors > 0 ? 'error' : 'success') : 'info'}
                label="Cardiometabólico"
                value={cardioLevel || (d.loaded ? 'Sem dados' : '—')}
                sub={cardioLevel
                  ? (cardioFactors > 0 ? `${cardioFactors} fator${cardioFactors > 1 ? 'es' : ''} de risco` : 'sem fatores')
                  : (d.loaded ? (d.stats.exams > 0 ? 'sem colesterol, peso ou pressão' : 'envie um exame ou registre peso/pressão') : '')}
                arcPercent={cardioArc} arcColor={cardioArcColor}
                onClick={() => navigate(d.stats.exams > 0 ? '/tendencias' : '/exams/create')} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <BiologicalAgeCard />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <IndicatorTile idx={2} icon={<Stethoscope size={22} weight="duotone" />} tone="primary" label="Seus exames"
                value={d.loaded ? String(d.stats.exams) : '—'}
                sub={d.stats.exams === 0 && d.loaded ? 'envie o primeiro' : `${d.stats.abnormal} alterado${d.stats.abnormal === 1 ? '' : 's'}`}
                arcPercent={d.stats.exams > 0 ? examsArcPercent : undefined}
                arcColor="#20b2aa"
                onClick={() => navigate('/exams')} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <IndicatorTile idx={3} icon={<ChartLineUp size={22} weight="duotone" />} tone="info" label="Evolução"
                value={totalResults > 0 ? String(totalResults) : (d.loaded ? 'Sem dados' : '—')}
                sub={totalResults > 0 ? 'histórico de tendências' : (d.loaded ? 'após o 1º exame' : '')}
                onClick={() => navigate('/evolucao')} />
            </Grid>
          </Grid>
        </Section>
      </ScrollReveal>

      {/* ATIVIDADE FÍSICA — só titular */}
      {(!d.me?.relationship || d.me.relationship === 'Titular') && (
        <ScrollReveal delay={240}>
          <Section label="Atividade física" icon={<Heartbeat size={18} weight="duotone" />}>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <ActivityCard lastExamAt={d.lastExam} />
              <RestingHeartCard />
            </Box>
          </Section>
        </ScrollReveal>
      )}

      {/* DESDE SEU ÚLTIMO EXAME */}
      <ScrollReveal delay={300}>
        <Box sx={{ mt: 2 }}>
          <SinceExamCard lastExamAt={d.lastExam} />
        </Box>
      </ScrollReveal>

      {/* AÇÕES RÁPIDAS + CRÉDITOS */}
      <ScrollReveal delay={360}>
        <Section label="Ações rápidas" icon={<AutoAwesomeIcon sx={{ fontSize: 18 }} />}>
          <QuickActions />
        </Section>
      </ScrollReveal>

      <ScrollReveal delay={420}>
        <Box sx={{ mt: 2 }}>
          <CreditsCard credits={d.credits} onClick={() => navigate('/planos')} />
        </Box>
      </ScrollReveal>

      {/* Conquistas */}
      <ScrollReveal delay={480}>
        <Box sx={{ mt: 2 }}>
          <GamificationBadges examsCount={d.stats.exams} score={d.score} />
        </Box>
      </ScrollReveal>

      <ScrollReveal delay={540}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <ShareHealthButton score={d.score ?? undefined} />
        </Box>
      </ScrollReveal>

      <ReviewPrompt trigger={d.loaded && d.stats.exams > 0} />

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
