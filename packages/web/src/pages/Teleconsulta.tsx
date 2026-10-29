// Teleconsulta in-app (LiveKit) — F2, 19/10/26. Spec: docs/design/2026-10-19-livekit-fase2-ux.md
// Rota imersiva /teleconsulta/:id (fora do AppLayout — sem bottom-nav/menu).
// Fases: loading → prejoin → connecting → incall → ended · fallback (501/navegador) · error.
// Degradação da casa: join 501/não suportado → tela fallback com "Abrir no Meet" (linkUrl).
// Regras de ouro: TODOS os hooks antes de qualquer early-return (React #310); nunca
// reload() (crasha o APK); zero jargão ("consulta/chamada", nunca room/track/token).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme, Avatar } from '@mui/material';
import CallEndIcon from '@mui/icons-material/CallEnd';
import CallIcon from '@mui/icons-material/Call';
import AssignmentIcon from '@mui/icons-material/Assignment';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import VerifiedIcon from '@mui/icons-material/Verified';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import SentimentSatisfiedIcon from '@mui/icons-material/SentimentSatisfied';
import SentimentVerySatisfiedIcon from '@mui/icons-material/SentimentVerySatisfied';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PaymentsIcon from '@mui/icons-material/Payments';
import ShareIcon from '@mui/icons-material/Share';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { Room, RoomEvent, Track, isBrowserSupported, ConnectionQuality, type LocalVideoTrack, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication, type TrackPublication } from 'livekit-client';
import { API_URL, token, photoUrlFor, doctorPhotoUrl } from '../config';
import { Capacitor } from '@capacitor/core';
import { DrExame } from '../components/DrExame';

// ── Dicas humanizadas Dr. Exame durante o pré-join e sala de espera ───────────
const PREP_TIPS = [
  { icon: '💡', title: 'Boa iluminação', desc: 'Fique de frente para uma luz suave para o médico examinar com máxima clareza.' },
  { icon: '🎧', title: 'Fones de ouvido', desc: 'Evitam ecos no ambiente e garantem total privacidade para a sua consulta.' },
  { icon: '📋', title: 'Exames e sintomas', desc: 'Tenha em mãos suas dúvidas, nomes de remédios ou exames anteriores.' },
  { icon: '🔒', title: 'Sigilo CFM 2.314/2022', desc: 'Transmissão criptografada de ponta a ponta com total segurança jurídica.' },
];

function playAudioTestChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.001, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    /* áudio bloqueado ou não suportado */
  }
}

import { openTelemedicinaRoom } from '../utils/telemedicina';
import { hapticError, hapticLight, hapticSuccess } from '../utils/haptic';
import { tealText } from '../theme';
import { CONSENT_TEXT } from '../constants/consent';
// F3 — componentes compartilhados da área de teleconsulta (fe2): 1 padrão só p/
// médico e paciente. Contratos: docs/research/2026-10-20-f3-arquitetura.md §3.
import { ExamRequestCard } from '../components/teleconsulta/ExamRequestCard';
import { BriefClinico } from '../components/teleconsulta/BriefClinico';
import { RobotAnalysis } from '../components/RobotAnalysis';
import { TranscriptView } from '../components/teleconsulta/TranscriptView';
import type { ConsultSummaryInfo, ExamRequest, ExamRequestAction, TeleconsultaSummary as TeleSummary } from '../components/teleconsulta/types';

// ── Diagnóstico técnico (§19): log dev-only, NUNCA em prod/APK ─────────────────
const LOG_GATE = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (LOG_GATE) console.log('[tele]', ...args); };

// ── Tokens fixos da spec (§5) ──────────────────────────────────────────────────
const CALL_BG = '#0c1818'; // fundo in-call — fixo nos 2 modos (vídeo é o herói)
// Fundo premium com padrão sutil de consultório (gradiente + cross-hatch CSS)
const CALL_BG_STYLE = {
  bgcolor: CALL_BG,
  backgroundImage: `
    radial-gradient(ellipse at 20% 80%, rgba(32,178,170,0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(212,165,116,0.04) 0%, transparent 50%),
    linear-gradient(135deg, #0a1616 0%, #0c1818 40%, #0e1e1e 100%)
  `,
} as const;
const GLASS = 'rgba(15,24,24,.68)';
const GLASS_FILTER = 'blur(18px) saturate(160%)';
const COPPER = '#d4a574';
const COPPER_DARK = '#b88a54';
// CONSENT_TEXT: movido p/ src/constants/consent.ts (fonte única — fila imediata reusa).

type Phase = 'loading' | 'prejoin' | 'connecting' | 'incall' | 'ended' | 'readonly' | 'fallback' | 'error' | 'waiting' | 'payment';
/** Outcome honesto do /end (lifecycle 24/10): 'completed' o server valida sozinho. */
type TeleOutcome = 'completed' | 'no_show' | 'technical';
type CamState = 'pending' | 'ok' | 'denied' | 'nodevice';
interface Summary {
  id: string;
  title?: string;
  dueDate?: string;
  consentAt?: string | null;
  recordConsentAt?: string | null; // F3: paciente autorizou gravação p/ transcrição (§1 spec UX)
  endedAt?: string | null; // F4: consulta ENCERRADA (server marca no /end) → área read-only
  provider?: string | null;
  linkUrl?: string | null;
  doctor?: { id?: string; name?: string; crm?: string; specialty?: string; photoUrl?: string; phone?: string } | null;
  patient?: { id?: string; name?: string; photoUrl?: string } | null;
  patientId?: string;
  doctorInRoom?: boolean; // WhatsApp-style: médico já entrou → pré-join vira "chamada recebida"
  stt?: boolean; // reviewer-L: server transcreve? false esconde o checkbox de gravação
  feedback?: { rating: number; note?: string | null; role?: string | null; audioQuality?: string | null } | null; // F4: avaliação já registrada (+ T1: áudio)
  durationSec?: number | null; // F4: duração real (1º join → endedAt) — server /summary
}
// Data rápida p/ "Agendar" (§2b): 09:00 do dia escolhido, fuso do usuário.
const dueAtDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return d.toISOString(); };
interface RemoteView {
  identity: string;
  name: string;
  isDoctor: boolean;
  track: RemoteTrack | null;
  muted: boolean;
  /** §19 G3 (QA 24/10): presença também por ÁUDIO — participante só de mic (sem
   *  câmera) ficaava eternamente "conectando…" p/ o outro lado. */
  audio?: boolean;
}

const initials = (name?: string) => (name || '?').replace(/^Dr[aº.]?\s*/i, '').trim().charAt(0).toUpperCase() || '?';
const clockFmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};
const dueShort = (d?: string) => {
  if (!d) return '';
  const dt = new Date(d);
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  const hm = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Hoje · ${hm}`;
  return `${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${hm}`;
};

/** Markdown mínimo do resumo (§14.1): títulos ##/**, negrito **, quebras de linha —
 *  sem lib nova (o prompt do resumo só emite títulos e negrito — texto clínico sóbrio). */
const renderSummaryMd = (md: string) =>
  md.split(/\n+/).map((line, i) => {
    const heading = line.match(/^#{1,6}\s*(.*)$/);
    const text = (heading ? heading[1] : line).trim();
    if (!text) return null;
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return (
      <Typography key={i} sx={heading
        ? { fontSize: 13.5, fontWeight: 800, color: 'text.primary', mt: i === 0 ? 0 : 1.5, mb: 0.5 }
        : { fontSize: 13.5, color: 'text.secondary', lineHeight: 1.65 }}>
        {parts.map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
      </Typography>
    );
  });

// ── Gravação não se perde (22/10): fila IndexedDB p/ uploads que falharam ──────
// Se o POST /recording falha (rede caiu no encerrar), o blob fica em indexedDB
// ('drexame' → 'pending-recordings', keyPath 'id') e sobe de novo no 'online' /
// próximo mount. Mesma key do reminder = última gravação vence (o server também
// guarda 1 áudio por consulta em audioPathFor(id)). Best-effort: IDB indisponível
// (modo privado) → helpers resolvem sem erro, gravação se perde como antes.
const PENDING_REC_DB = 'drexame';
const PENDING_REC_STORE = 'pending-recordings';
const openPendingRecordingsDb = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
  try {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(PENDING_REC_DB, 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore(PENDING_REC_STORE, { keyPath: 'id' }); } catch { /* store já existe */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  } catch { resolve(null); }
});
const savePendingRecording = async (id: string, blob: Blob, mime?: string): Promise<void> => {
  const db = await openPendingRecordingsDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(PENDING_REC_STORE, 'readwrite');
      tx.objectStore(PENDING_REC_STORE).put({ id, blob, ...(mime ? { mime } : {}), timestamp: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); resolve(); };
    } catch { resolve(); }
  });
};
/** Soba as gravações pendentes (rede voltou). Sucesso = apaga da fila; falha = fica. */
const retryPendingRecordingUploads = async (getToken: () => string | null): Promise<void> => {
  const db = await openPendingRecordingsDb();
  if (!db) return;
  const rows: { id: string; blob: Blob; mime?: string }[] = await new Promise((resolve) => {
    try {
      const rq = db.transaction(PENDING_REC_STORE, 'readonly').objectStore(PENDING_REC_STORE).getAll();
      rq.onsuccess = () => resolve((rq.result as any[]) || []);
      rq.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
  for (const row of rows) {
    if (!row?.id || !(row.blob instanceof Blob)) continue;
    const drop = () => new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(PENDING_REC_STORE, 'readwrite');
        tx.objectStore(PENDING_REC_STORE).delete(row.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch { resolve(); }
    });
    try {
      const fd = new FormData();
      // ext honra o container real (iOS/Safari grava mp4, não webm — §19 G4)
      const ext = (row.mime || '').includes('mp4') ? 'mp4' : 'webm';
      fd.append('file', row.blob, `${row.id}.${ext}`);
      const r = await fetch(`${API_URL}/teleconsulta/${row.id}/recording`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      if (r.ok) await drop(); // subiu — sai da fila
      else if (r.status === 401) await drop(); // sessão morta p/ este acesso — não fica retentando p/ sempre
    } catch { /* ainda offline — próxima tentativa (listener 'online' / mount) */ }
  }
  try { db.close(); } catch { /* noop */ }
};

/** Vídeo anexado a um track LiveKit (remoto ou local). Muted: áudio vem por track
 *  separado (sink oculto) — este elemento só renderiza imagem. */
const TrackVideo = ({ track, mirrored, sx }: { track: RemoteTrack | LocalVideoTrack; mirrored?: boolean; sx?: any }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try { track.attach(el); } catch { /* já anexado/desmontando */ }
    el.play().catch(() => {});
    return () => { try { track.detach(el); } catch { /* noop */ } };
  }, [track]);
  return <video ref={ref} playsInline autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...(mirrored ? { transform: 'scaleX(-1)' } : {}), ...sx }} />;
};

// ── Página (wrapper de rota) ───────────────────────────────────────────────────
export const TeleconsultaPage = () => {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/lembretes" replace />;
  return <TeleconsultaCall reminderId={id} />;
};

/** State machine completa. role: paciente (app) ou médico (portal). */
export const TeleconsultaCall = ({ reminderId, onExited }: { reminderId: string; onExited?: () => void }) => {
  const theme = useTheme();
  const isDesktopViewport = useMediaQuery(theme.breakpoints.up('sm'));
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Papel: ?role=doctor explícito, ou presença só do doctorToken (portal médico).
  const [role] = useState<'patient' | 'doctor'>(() => {
    const q = searchParams.get('role');
    if (q === 'doctor') return 'doctor';
    if (q === 'patient') return 'patient';
    let hasDoc = false;
    try { hasDoc = !!localStorage.getItem('doctorToken'); } catch { /* noop */ }
    return !token() && hasDoc ? 'doctor' : 'patient';
  });
  const authToken = useCallback(() => {
    if (role === 'doctor') { try { return localStorage.getItem('doctorToken'); } catch { return null; } }
    return token();
  }, [role]);
  const [hasAuth] = useState(() => !!authToken());

  // Resumo do lembrete: chega via location.state (navegação interna) e é
  // revalidado no server (paciente) — lista /reminders é patient-scoped.
  const [summary, setSummary] = useState<Summary | null>(() => {
    const s = (location.state as any)?.reminder;
    const p = (location.state as any)?.patient;
    const pName = (location.state as any)?.patientName;
    return s ? {
      id: s.id,
      title: s.title,
      dueDate: s.dueDate,
      consentAt: s.consentAt,
      recordConsentAt: s.recordConsentAt,
      endedAt: s.endedAt,
      provider: s.provider,
      linkUrl: s.linkUrl,
      doctor: s.doctor,
      patient: p || (pName ? { name: pName, photoUrl: s.patient?.photoUrl } : s.patient) || null,
    } : null;
  });
  const summaryRef = useRef<Summary | null>(summary);
  useEffect(() => { summaryRef.current = summary; }, [summary]);
  // Graça de 5 min quando o OUTRO participante cai (24/10 dono): não encerra
  // "concluída" na hora — dá janela de reconexão antes do pós-chamada.
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [camState, setCamState] = useState<CamState>('pending');
  const [micDenied, setMicDenied] = useState(false); // fix #13d: mic NEGADO no preview — câmera+mic negados bloqueiam a entrada
  const [joinLoading, setJoinLoading] = useState(false);
  const [banner, setBanner] = useState<'connecting' | 'reconnecting' | null>(null);
  const [toast, setToast] = useState<{ text: string; k: number } | null>(null);
  const [remotes, setRemotes] = useState<RemoteView[]>([]);
  const [otherJoined, setOtherJoined] = useState(false); // alguém já entrou (para diferenciar "aguardando" de "saiu")
  const [remoteLeft, setRemoteLeft] = useState<string | null>(null); // nome de quem saiu ("Dr(a). X saiu da chamada")
  // §19 G3: qualidade de conexão do OUTRO participante (RoomEvent.ConnectionQualityChanged)
  // — alimenta os estados de presença: presente / reconectando.
  const [peerQuality, setPeerQuality] = useState<string>('unknown');
  const [patientNoShow, setPatientNoShow] = useState(false); // agent2: médico sozinho na sala por 5 min
  const [nudgeBusy, setNudgeBusy] = useState(false); // agent2: "Reenviar convite" em voo
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  // Lifecycle 24/10: join barrado antes da janela (TOO_EARLY) ou sem PIX pago
  // (PAYMENT_REQUIRED) + dialog honesto de encerramento (outcome do /end).
  const [opensAt, setOpensAt] = useState<string | null>(null); // countdown até a janela abrir
  // §5 dono (26/10): deadline da TOLERÂNCIA DE AUSÊNCIA (dueDate + noShowToleranceMin,
  // relógio do SERVER — chega no /join) p/ o countdown "Paciente ausente — encerra em
  // Xmin". Não confundir com o grace de RECONEXÃO (5min): tolerância é p/ quem NUNCA
  // apareceu; o server encerra sozinho como no_show quando ela vence.
  const [noShowDeadlineMs, setNoShowDeadlineMs] = useState<number | null>(null);
  const [payPriceCents, setPayPriceCents] = useState<number | null>(null);
  const [recheckBusy, setRecheckBusy] = useState(false); // "Já paguei" em voo (spinner + disabled)
  const payBlockedRef = useRef(false); // join 402 → fase payment É estável (nunca volta a prejoin/câmera)
  const [outcomeOpen, setOutcomeOpen] = useState(false); // "Como encerrar?"
  const [outcomeSuggest, setOutcomeSuggest] = useState<'no_show' | 'technical' | null>(null); // sugestão do server
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [ended, setEnded] = useState<{ sec: number } | null>(null);
  const [fallbackLink, setFallbackLink] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  // ── CID-10 (P0.3, 24/10): diagnóstico estruturado no registro do médico —
  // autocomplete contra a base oficial DATASUS (GET /api/doctor/cid10). Selecionado,
  // vai no PUT doctor-note junto da nota; X limpa (cidDirty = usuário mexeu).
  const [cidQuery, setCidQuery] = useState('');
  const [cidResults, setCidResults] = useState<{ c: string; d: string }[]>([]);
  const [cidSel, setCidSel] = useState<{ code: string; desc: string } | null>(null);
  const [cidDirty, setCidDirty] = useState(false);
  const cidSearchBusy = useRef(false);
  // Debounce 350ms: busca na base oficial só com ≥2 caracteres e sem seleção ativa.
  useEffect(() => {
    if (role !== 'doctor' || cidSel || cidQuery.trim().length < 2) { setCidResults([]); return; }
    const t = setTimeout(() => {
      if (cidSearchBusy.current) return;
      cidSearchBusy.current = true;
      fetch(`${API_URL}/doctor/cid10?q=${encodeURIComponent(cidQuery.trim())}`, { headers: { Authorization: `Bearer ${authToken()}` } })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items?: { c: string; d: string }[] }) => setCidResults(d.items ?? []))
        .catch(() => setCidResults([]))
        .finally(() => { cidSearchBusy.current = false; });
    }, 350);
    return () => clearTimeout(t);
  }, [cidQuery, cidSel, role]);
  // ── §14.1 Resumo pós-consulta (médico): gerar/editar/aprovar o rascunho da IA.
  // Erro de geração NUNCA bloqueia a nota manual (QuickNote segue independente).
  const [csBusy, setCsBusy] = useState<string | null>(null); // 'generate' | 'save' | 'approve'
  const [csDraft, setCsDraft] = useState('');
  const [csEditing, setCsEditing] = useState(false);
  const [csError, setCsError] = useState<string | null>(null);
  const [csApproveOpen, setCsApproveOpen] = useState(false);
  // Feedback pós-chamada (dono 19/10: "quando encerra tem que ter algo pronto pra falar
  // se a chamada foi boa ou não") — 1 toque + nota opcional → audit TELECONSULTA_FEEDBACK.
  const [fbRating, setFbRating] = useState<number | null>(null);
  const [fbNote, setFbNote] = useState('');
  const [fbSent, setFbSent] = useState(false);
  // T1 insights (27/10): CSAT de áudio pós-consulta — 1 dos 3 valores, opcional.
  const [fbAudio, setFbAudio] = useState<string | null>(null);
  const sendFeedback = async (rating: number, customNote?: string, audioQuality?: string) => {
    setFbRating(rating);
    const text = customNote !== undefined ? customNote : fbNote;
    try {
      // reviewer-J: authToken() é role-aware — token() mandaria Bearer null no portal.
      await fetch(`${API_URL}/teleconsulta/${reminderId}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ rating, note: text.trim() || undefined, ...(audioQuality ? { audioQuality } : {}) }),
      });
    } catch { /* best-effort: a UX não trava por audit */ }
    setFbSent(true);
    if (role === 'doctor' && text.trim()) {
      try { localStorage.setItem(noteKey, text); } catch { /* noop */ }
      setNoteSaved(true);
    }
  };
  const [pipCorner, setPipCorner] = useState<'tr' | 'tl' | 'br' | 'bl'>('tr');
  const [pipDrag, setPipDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

  // ── F3 (paciente): gravação (consent) + pedidos do médico + área pós-consulta ──
  const [recordAudio, setRecordAudio] = useState(false); // checkbox §1 — default OFF (opt-in honesto)
  const [installDismissed, setInstallDismissed] = useState(false); // banner Play Store (web Android) — dispensável
  const [briefOpen, setBriefOpen] = useState(false); // brief clínico (médico, in-call)
  // Esc fecha o brief; foco entra no sheet e Tab fica preso nele (critic #5 —
  // sem isso o Tab vazava pros controles da chamada atrás do scrim)
  const briefSheetRef = useRef<HTMLDivElement | null>(null);
  const briefCloseRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!briefOpen) return;
    const sheet = briefSheetRef.current;
    briefCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setBriefOpen(false); return; }
      if (e.key !== 'Tab' || !sheet) return;
      const focusables = sheet.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"]),input,select,textarea');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [briefOpen]);
  const [examQueue, setExamQueue] = useState<ExamRequest[]>([]); // pedidos novos chegando in-call
  const [reqBusy, setReqBusy] = useState<string | null>(null);
  const [schedFor, setSchedFor] = useState<string | null>(null); // req com quick-chips "Agendar" abertos (§3a)
  const [areaSummary, setAreaSummary] = useState<TeleSummary | null>(null); // §3 — área "Resumo da consulta"
  const [txState, setTxState] = useState<'pending' | 'ready' | 'error' | 'none'>('pending'); // §3b transcrição — 'none' = consentiu mas NÃO há áudio/transcrição (bug 26/10: ficava shimmer eterno)
  const [txText, setTxText] = useState<string | null>(null);

  // Estados de teste de som e rotação de dicas humanizadas
  const [soundTested, setSoundTested] = useState(false);
  const [prepTipIdx, setPrepTipIdx] = useState(0);

  useEffect(() => {
    if (phase !== 'prejoin' && (otherJoined || phase !== 'incall')) return;
    const t = setInterval(() => {
      setPrepTipIdx((prev) => (prev + 1) % PREP_TIPS.length);
    }, 6000);
    return () => clearInterval(t);
  }, [phase, otherJoined]);

  const togglePreviewCam = () => {
    if (!previewStream.current) return;
    const next = !camOn;
    previewStream.current.getVideoTracks().forEach((t) => { t.enabled = next; });
    setCamOn(next);
    hapticLight();
  };

  const togglePreviewMic = () => {
    if (!previewStream.current) return;
    const next = !micOn;
    previewStream.current.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicOn(next);
    hapticLight();
  };

  const testAudioSound = () => {
    playAudioTestChime();
    setSoundTested(true);
    hapticSuccess();
    setTimeout(() => setSoundTested(false), 2500);
  };

  const [txAt, setTxAt] = useState<string | null>(null);
  const [txRetry, setTxRetry] = useState(0); // "Tentar de novo" religa o poll
  const seenReqIds = useRef<Set<string>>(new Set()); // ids já notificados (diff do poll 20s)
  const dismissedReqIds = useRef<Set<string>>(new Set()); // "Depois" — não reacende o painel nesta sessão

  // ── Sons de chamada (dono 19/10: "som de aguardar como as empresas usam") ──
  // Web Audio API puro (zero arquivos/CDN). Ringback = padrão Brasília: 1s tom /
  // 4s pausa. Join/leave = chime discreto. Beep de gravação = aviso periódico.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringbackIvRef = useRef<number | null>(null);
  const recBeepIvRef = useRef<number | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
    }
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    return audioCtxRef.current;
  }, []);

  /** Toca um tom simples (oscilador sine) por `durMs` — volume discreto. */
  const playTone = useCallback((freq: number, durMs: number, vol = 0.04, delay = 0) => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.value = 0;
      const t0 = ctx.currentTime + delay / 1000;
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.linearRampToValueAtTime(0, t0 + durMs / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + durMs / 1000 + 0.05);
    } catch { /* best-effort */ }
  }, [getAudioCtx]);

  /** Ringback: "toc toc" de chamada telefônica enquanto o outro não entra. */
  const startRingback = useCallback(() => {
    if (ringbackIvRef.current) return;
    const ring = () => {
      playTone(440, 800); // tom principal
      playTone(480, 800, 0.03); // harmônico
    };
    ring();
    ringbackIvRef.current = window.setInterval(ring, 4000); // cadência Brasília: 1s on / 3s off
  }, [playTone]);
  const stopRingback = useCallback(() => {
    if (ringbackIvRef.current) { clearInterval(ringbackIvRef.current); ringbackIvRef.current = null; }
  }, []);

  /** Chime discreto quando alguém entra/sai (join=dó-sol; leave=sol-dó descendente). */
  const playJoinChime = useCallback(() => { playTone(523.25, 150, 0.06); playTone(783.99, 200, 0.05, 120); }, [playTone]);
  const playLeaveChime = useCallback(() => { playTone(783.99, 150, 0.05); playTone(523.25, 200, 0.04, 120); }, [playTone]);

  /** Beep periódico de gravação ativa (cortesia LGPD — avisa que está gravando). */
  const startRecordingBeep = useCallback(() => {
    if (recBeepIvRef.current) return;
    const beep = () => playTone(1200, 120, 0.02);
    recBeepIvRef.current = window.setInterval(beep, 30_000);
  }, [playTone]);
  const stopRecordingBeep = useCallback(() => {
    if (recBeepIvRef.current) { clearInterval(recBeepIvRef.current); recBeepIvRef.current = null; }
  }, []);

  // ── F3/F4: gravação da chamada e transcrição inteligente por IA ──────────────
  // MediaRecorder captura mic local + áudio remoto (mixado via Web Audio em webm/opus
  // OU mp4 no iOS/Safari) → upload no encerrar → server transcreve → transcript cifrado.
  //
  // §19 B2 (áudio unilateral, paciente iPhone/Safari): NUNCA rotear a track de mic
  // PUBLICADA no LiveKit por createMediaStreamSource — no iOS Safari o WebAudio
  // assume o hardware e silencia a track original (o médico recebe silêncio com o
  // ícone "ligado"; a gravação sai muda). Correção: track.clone() ANTES do
  // createMediaStreamSource (o clone é uma track separada; a publicada segue
  // intocada). Fallback: clone falhar + track LOCAL → grava só o áudio REMOTO e
  // avisa (consulta e áudio ao vivo NUNCA são derrubados pela gravação).
  // Extra: AudioContext COMPARTILHADO (getAudioCtx) — no iOS um ctx novo fora de
  // gesto do usuário nasce 'suspended' e grava silêncio; o compartilhado já foi
  // destravado no toque de "Entrar".
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recClonesRef = useRef<MediaStreamTrack[]>([]); // clones p/ WebAudio — stop no fim
  const recConnectedIdsRef = useRef<Set<string>>(new Set()); // tracks JÁ no mix (dedup do restart)
  const recMimeRef = useRef<string>('audio/webm'); // container real (Safari = mp4)
  const recStartedAtRef = useRef<number | null>(null); // timer do estado "capturando"
  const [recording, setRecording] = useState(false);
  // §19 G4: ciclo de vida VISÍVEL da gravação: capturando → enviando → processando
  // (job do server) → concluída · falhou = material salvo no aparelho c/ "Retomar envio".
  const [recPhase, setRecPhase] = useState<'idle' | 'capturing' | 'uploading' | 'processing' | 'done' | 'failed'>('idle');
  const [pendingRecCount, setPendingRecCount] = useState(0); // gravações na fila IndexedDB
  const [recordPromptDismissed, setRecordPromptDismissed] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

  // ── F3 reviewer-B (alto): botão "Solicitar exame" IN-CALL do médico.
  const [reqOpen, setReqOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [docReqBusy, setDocReqBusy] = useState(false);

  /** Áudio da sala rotulado: local (mic publicado) × remoto. §19: só a LOCAL
   *  precisa de clone; a remota não é hardware-bound e pode ir direto. */
  const collectRoomAudioTracks = (room: Room): { track: MediaStreamTrack; isLocal: boolean }[] => {
    const out: { track: MediaStreamTrack; isLocal: boolean }[] = [];
    try {
      room.localParticipant.audioTrackPublications.forEach((p: any) => { if (p.track?.mediaStreamTrack) out.push({ track: p.track.mediaStreamTrack, isLocal: true }); });
      room.remoteParticipants.forEach((p: any) => p.audioTrackPublications.forEach((pub: any) => { if (pub.track?.mediaStreamTrack) out.push({ track: pub.track.mediaStreamTrack, isLocal: false }); }));
    } catch { /* best-effort */ }
    return out;
  };

  /** Desmonta o grafo WebAudio da gravação (fontes, clones, dest). Idempotente. */
  const cleanupRecordingGraph = useCallback(() => {
    try { recSourcesRef.current.forEach((s) => s.disconnect()); } catch { /* noop */ }
    recSourcesRef.current = [];
    try { recClonesRef.current.forEach((c) => { c.stop(); }); } catch { /* noop */ }
    recClonesRef.current = [];
    recConnectedIdsRef.current = new Set();
    recDestRef.current = null; // ctx é COMPARTILHADO — teardown fecha (nunca aqui)
  }, []);

  /** Adiciona ao mix as tracks que AINDA não estão nele (clone da local; remota
   *  direta). Retorna true se ao menos 1 fonte entrou. §19 B2 fix. */
  const addTracksToRecMix = useCallback((room: Room): boolean => {
    const actx = getAudioCtx();
    const dest = recDestRef.current;
    if (!actx || !dest) return false;
    let added = false;
    let localSkipped = false;
    for (const { track, isLocal } of collectRoomAudioTracks(room)) {
      if (recConnectedIdsRef.current.has(track.id)) continue; // já no mix (dedup §19)
      let feed: MediaStreamTrack | null = track;
      if (isLocal) {
        try { feed = track.clone(); recClonesRef.current.push(feed); } // §19 B2: NUNCA a publicada
        catch { feed = null; localSkipped = true; } // clone falhou → local fora do mix (avisa)
      }
      if (!feed) continue;
      try {
        const src = actx.createMediaStreamSource(new MediaStream([feed]));
        src.connect(dest);
        recSourcesRef.current.push(src);
        recConnectedIdsRef.current.add(track.id);
        added = true;
      } catch { /* fonte individual falha — as demais seguem */ }
    }
    if (localSkipped) {
      setToast({ text: 'Gravando só o áudio do outro participante (limitação do navegador).', k: Date.now() });
    }
    return added;
  }, [getAudioCtx]);

  const startRoomRecording = useCallback((room: Room) => {
    if (typeof MediaRecorder === 'undefined' || mediaRecorderRef.current) return;
    try {
      cleanupRecordingGraph(); // restart pode ter deixado grafo velho (§19)
      const tracks = collectRoomAudioTracks(room);
      if (!tracks.length) {
        // Honestidade (23/10, chamada real): sem NENHUM áudio publicado não existe
        // transcrição — avisar na hora, não deixar o médico descobrir no fim.
        setToast({ text: 'Sem áudio capturado — a transcrição precisa do microfone ligado.', k: Date.now() });
        return;
      }

      let recordStream: MediaStream;
      const actx = getAudioCtx(); // compartilhado (destravado por gesto) — §19 iOS
      if (actx) {
        const dest = actx.createMediaStreamDestination();
        recDestRef.current = dest;
        addTracksToRecMix(room);
        recordStream = dest.stream;
      } else {
        recordStream = new MediaStream(tracks.map((t) => t.track)); // sem WebAudio: tapa direto
      }
      devLog('rec:start', { sources: recSourcesRef.current.length, clones: recClonesRef.current.length, ctxState: actx?.state ?? 'none' });

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      recMimeRef.current = mime;
      const mr = new MediaRecorder(recordStream, { mimeType: mime });
      recordChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size) recordChunksRef.current.push(e.data); };
      mr.start(3000);
      mediaRecorderRef.current = mr;
      recStartedAtRef.current = Date.now();
      setRecording(true);
      setRecPhase('capturing');
      startRecordingBeep();
    } catch (e) { devLog('rec:start-fail', e); /* gravação é best-effort — nunca derruba a consulta */ }
  }, [addTracksToRecMix, cleanupRecordingGraph, getAudioCtx, startRecordingBeep]);

  const restartRoomRecording = useCallback((room: Room) => {
    if (!mediaRecorderRef.current) {
      startRoomRecording(room);
      return;
    }
    // Grafo vivo: só INCLUI as tracks novas (dedup por id) — sem re-criar fontes
    // (o código antigo duplicava o mix a cada entrada = eco/gravação dupla §19).
    if (recDestRef.current && addTracksToRecMix(room)) return;
    const old = mediaRecorderRef.current;
    if (!old) return;
    try {
      old.onstop = () => { setTimeout(() => { cleanupRecordingGraph(); mediaRecorderRef.current = null; startRoomRecording(room); }, 60); };
      old.stop();
    } catch { cleanupRecordingGraph(); mediaRecorderRef.current = null; startRoomRecording(room); }
  }, [addTracksToRecMix, cleanupRecordingGraph, startRoomRecording]);

  /** §19 G4: conta gravações na fila IndexedDB (estado "falhou + retomável"). */
  const refreshPendingRecCount = useCallback(async (): Promise<number> => {
    const db = await openPendingRecordingsDb();
    if (!db) { setPendingRecCount(0); return 0; }
    const n = await new Promise<number>((resolve) => {
      try {
        const rq = db.transaction(PENDING_REC_STORE, 'readonly').objectStore(PENDING_REC_STORE).count();
        rq.onsuccess = () => resolve(rq.result || 0);
        rq.onerror = () => resolve(0);
      } catch { resolve(0); }
    });
    try { db.close(); } catch { /* noop */ }
    setPendingRecCount(n);
    return n;
  }, []);

  const stopAndUploadRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) { cleanupRecordingGraph(); return; }
    mediaRecorderRef.current = null;
    setRecording(false);
    stopRecordingBeep();
    cleanupRecordingGraph();

    await new Promise<void>((res) => {
      try { mr.onstop = () => res(); mr.stop(); setTimeout(res, 2000); } catch { res(); }
    });
    const mime = recMimeRef.current || 'audio/webm';
    const blob = new Blob(recordChunksRef.current, { type: mime });
    recordChunksRef.current = [];
    devLog('rec:stop', { size: blob.size, mime });
    if (blob.size < 1500) return; // vazio/curto demais — nem envia
    setRecPhase('uploading');
    try {
      const fd = new FormData();
      fd.append('file', blob, `${reminderId}.${mime.includes('mp4') ? 'mp4' : 'webm'}`);
      const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/recording`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` }, body: fd });
      if (r.ok) { setRecPhase('processing'); return; } // subiu — STT roda no server
      setRecPhase('failed');
      await savePendingRecording(reminderId, blob, mime); // não se perde — retry no 'online'
      void refreshPendingRecCount(); // acende o "Retomar envio" na hora (§19 G4)
    } catch {
      setRecPhase('failed');
      await savePendingRecording(reminderId, blob, mime); // rede caiu — blob vai pra fila no IndexedDB
      void refreshPendingRecCount();
    }
  }, [authToken, cleanupRecordingGraph, refreshPendingRecCount, reminderId, stopRecordingBeep]);

  /** §19 G4: "Retomar envio" — sobe a fila e informa o resultado honesto. */
  const retryPendingUploads = useCallback(async () => {
    const before = pendingRecCount;
    await retryPendingRecordingUploads(authToken);
    const after = await refreshPendingRecCount();
    if (after === 0) { hapticSuccess(); setToast({ text: 'Gravação enviada — a transcrição sai em instantes.', k: Date.now() }); }
    else if (after < before) { setToast({ text: `${before - after} enviada(s) — ${after} ainda pendente(s).`, k: Date.now() }); }
    else { hapticError(); setToast({ text: 'Ainda sem rede p/ enviar — a gravação segue salva no aparelho.', k: Date.now() }); }
  }, [authToken, pendingRecCount, refreshPendingRecCount]);

  const handleEnableRecording = useCallback(async () => {
    setConsentBusy(true);
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/record-consent`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const at = data.recordConsentAt || new Date().toISOString();
        setSummary((cur) => cur ? { ...cur, recordConsentAt: at } : cur);
        if (roomRef.current) {
          startRoomRecording(roomRef.current);
        }
        setToast({ text: '🎙️ Gravação com IA ativada', k: Date.now() });
        hapticSuccess();
      } else {
        setToast({ text: 'Não foi possível ativar a gravação', k: Date.now() });
      }
    } catch {
      setToast({ text: 'Falha de conexão', k: Date.now() });
    } finally {
      setConsentBusy(false);
    }
  }, [authToken, reminderId, startRoomRecording]);

  // Encerramento SERVER-SIDE: marca a consulta como encerrada no banco (done +
  // endedAt, rota do agent1). Sem isto o card ficava "Entrar na consulta" pra
  // sempre (dono 21/10: "ela nunca encerra"). keepalive sobrevive ao unload.
  // Chamado no endCall, no disconnect de rede E no unload (agent3 a/b).
  const markEnded = useCallback(async (outcome?: TeleOutcome): Promise<{ ok: boolean; reason?: string | null; suggestion?: 'no_show' | 'technical' | null; error?: string | null }> => {
    // Lifecycle 24/10: /end aceita outcome explícito — o server EXIGE quando o
    // paciente não entrou ou o tempo conjunto ficou abaixo do mínimo (400 com
    // reason+suggestion). Devolve o veredito p/ o endCall abrir o dialog honesto;
    // callers best-effort (disconnect/unload) ignoram o resultado.
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify(outcome ? { outcome } : {}),
        keepalive: true,
      });
      if (res.ok) return { ok: true };
      const d = await res.json().catch(() => null);
      return { ok: false, reason: d?.reason ?? null, suggestion: d?.suggestion ?? null, error: d?.error ?? null };
    } catch { return { ok: false }; /* best-effort: rede caída — server fecha sozinho pelo audit */ }
  }, [authToken, reminderId]);

  // agent2: "Reenviar convite" do painel de no-show — push pro paciente entrar agora.
  const resendInvite = useCallback(async () => {
    if (nudgeBusy) return;
    setNudgeBusy(true);
    try {
      const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/nudge`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) throw new Error('nudge');
      hapticSuccess();
      setToast({ text: 'Convite reenviado ao paciente ✓', k: Date.now() });
    } catch {
      hapticError();
      setToast({ text: 'Não deu pra reenviar. Tenta de novo.', k: Date.now() });
    } finally { setNudgeBusy(false); }
  }, [authToken, nudgeBusy, reminderId]);

  const otherJoinedRef = useRef(false); // espelho ref do otherJoined (guard do markEnded no unmount)
  const noShowTimerRef = useRef<number | null>(null); // agent2: timer de no-show (5 min) — limpo no unmount
  const roomRef = useRef<Room | null>(null);
  const previewStream = useRef<MediaStream | null>(null);
  /** Tracks do preview em trânsito pro publishTrack (fix Safari 29/10) — o
   *  startJoin transfere a posse pra cá; connectRoom publica, o finally descarta. */
  const pendingTracksRef = useRef<MediaStreamTrack[]>([]);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const audioSink = useRef<HTMLDivElement>(null);
  const wakeLock = useRef<any>(null);
  const startedAtRef = useRef<number | null>(null);
  const endedByUser = useRef(false);
  const noteKey = `dx-teleconsulta-note:${reminderId}`;

  // ── Preview (pré-join) ───────────────────────────────────────────────────────
  // Dono 20/10: audio JUNTO com vídeo — o browser permissa AMBOS de uma vez
  // (se audio:false, o mic só era pedido pelo LiveKit JÁ DENTRO da chamada,
  // quando o usuário menos espera e o Chrome às vezes bloqueia).
  const openPreview = useCallback(async () => {
    setCamState('pending');
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      previewStream.current?.getTracks().forEach((t) => t.stop());
      previewStream.current = stream;
      if (previewVideo.current) { previewVideo.current.srcObject = stream; previewVideo.current.play().catch(() => {}); }
      setCamState('ok');
    } catch (e: any) {
      const noDevice = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError';
      setCamState(noDevice ? 'nodevice' : 'denied');
      // fix #13d: câmera negada → sonda o mic em separado. Ambos negados = sem mídia
      // nenhuma: a entrada é bloqueada com orientação clara (não deixa entrar "no escuro").
      if (!noDevice) {
        try {
          const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
          audio.getTracks().forEach((t) => t.stop());
          setMicDenied(false);
        } catch { setMicDenied(true); }
      }
    }
  }, []);
  const stopPreview = useCallback(() => {
    previewStream.current?.getTracks().forEach((t) => t.stop());
    previewStream.current = null;
  }, []);

  // ── Teardown da sala ─────────────────────────────────────────────────────────
  const teardownRoom = useCallback(async () => {
    // Flush da gravação ANTES de derrubar a sala — se o médico fecha a tab/unmount
    // sem passar pelo endCall, o upload parcial acontece aqui (chunks até então).
    // Idempotente: endCall/Disconnected já fizeram o flush → recorder null → early-return.
    void stopAndUploadRecording();
    // §19 B2: clones do mix de gravação nunca sobrevivem à sala (idempotente).
    try { recClonesRef.current.forEach((c) => c.stop()); } catch { /* noop */ }
    if (graceTimerRef.current) { clearTimeout(graceTimerRef.current); graceTimerRef.current = null; }
    const room = roomRef.current;
    roomRef.current = null;
    if (audioSink.current) audioSink.current.innerHTML = '';
    // Sons: tudo para no teardown (ringback, beep de gravação, AudioContext fecha)
    stopRingback();
    stopRecordingBeep();
    try { audioCtxRef.current?.close(); audioCtxRef.current = null; } catch { /* noop */ }
    setLocalVideo(null);
    setRemotes([]);
    if (room) {
      // Presença conjunta (lifecycle §2): reporta a SAÍDA da sala — sem webhook
      // LiveKit no v1, o server conta presença pelos eventos join/leave do client.
      // Fire-and-forget + keepalive (sobrevive ao unload). Só quando HAVIA sala:
      // o teardown "preventivo" do connectRoom (roomRef null) não conta como saída.
      fetch(`${API_URL}/teleconsulta/${reminderId}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` }, keepalive: true })
        .catch(() => { /* best-effort */ });
      try { room.removeAllListeners(); } catch { /* noop */ }
      try { await room.disconnect(); } catch { /* noop */ }
    }
  }, [authToken, reminderId, stopAndUploadRecording, stopRingback, stopRecordingBeep]);

  // ── Conexão LiveKit ──────────────────────────────────────────────────────────
  const connectRoom = useCallback(async (serverUrl: string, lkToken: string) => {
    await teardownRoom();
    endedByUser.current = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const upsertRemote = (p: RemoteParticipant) => {
      const isDoctor = p.identity.startsWith('doctor:');
      setRemotes((cur) => {
        // Preserva track/muted existentes — sem isto, re-upsert (ParticipantConnected
        // chegando depois de TrackSubscribed) ZERAVA o track e o vídeo sumia.
        const existing = cur.find((r) => r.identity === p.identity);
        const next = cur.filter((r) => r.identity !== p.identity);
        next.push({ identity: p.identity, name: p.name || p.identity, isDoctor, track: existing?.track ?? null, muted: existing?.muted ?? false, audio: existing?.audio ?? false });
        return next;
      });
    };
    const setRemoteVideo = (p: RemoteParticipant, track: RemoteTrack | null) => {
      setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, track } : r)));
    };

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        // Dono 20/10: TrackSubscribed pode chegar ANTES de ParticipantConnected processar
        // (raça). Garante que o participante está no estado ANTES de setar o track —
        // sem isto, setRemoteVideo mapeava array vazio e o vídeo unilateral sumia.
        upsertRemote(p);
        if (track.kind === 'audio') {
          try { const el = track.attach(); el.style.display = 'none'; audioSink.current?.appendChild(el); } catch { /* noop */ }
          // §19 G3: mic público = presença REAL (áudio-only também é "presente").
          setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, audio: true } : r)));
          // Gravando e alguém entrou depois: reinclui o áudio novo no recorder.
          if (mediaRecorderRef.current && roomRef.current) {
            restartRoomRecording(roomRef.current);
          } else if (summaryRef.current?.recordConsentAt && roomRef.current) {
            startRoomRecording(roomRef.current);
          }
          return;
        }
        if (pub.source === Track.Source.Camera) setRemoteVideo(p, track);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === 'audio') { try { track.detach().forEach((el) => el.remove()); } catch { /* noop */ } setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, audio: false } : r))); return; }
        if (pub.source === Track.Source.Camera) setRemoteVideo(p, null);
      })
      .on(RoomEvent.TrackMuted, (pub: TrackPublication, p: Participant) => {
        if (pub.source === Track.Source.Camera) setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, muted: true } : r)));
      })
      .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, p: Participant) => {
        if (pub.source === Track.Source.Camera) setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, muted: false } : r)));
      })
      .on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
        devLog('remote:TrackPublished', { kind: pub.kind, source: pub.source, participant: p.identity });
      })
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, p: Participant) => {
        devLog('quality', { participant: p.identity, quality });
        if (p.identity !== room.localParticipant.identity) setPeerQuality(String(quality));
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        upsertRemote(p);
        const displayName = (p.name || 'Participante').replace(/\s*\([0-9]+\/?[A-Za-z]{2}\)\s*$/, '');
        setToast({ text: `${displayName} entrou`, k: Date.now() });
        setOtherJoined(true);
        otherJoinedRef.current = true;
        setRemoteLeft(null);
        setPeerQuality('unknown');
        // Voltou dentro da graça — cancela o timer de encerramento automático
        if (graceTimerRef.current) { clearTimeout(graceTimerRef.current); graceTimerRef.current = null; }
        playJoinChime();
        hapticSuccess();
        if (summaryRef.current?.recordConsentAt && roomRef.current && !mediaRecorderRef.current) {
          startRoomRecording(roomRef.current);
        }
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        const displayName = (p.name || 'Participante').replace(/\s*\([0-9]+\/?[A-Za-z]{2}\)\s*$/, '');
        setRemotes((cur) => cur.filter((r) => r.identity !== p.identity));
        setRemoteLeft(displayName);
        setPeerQuality('unknown');
        playLeaveChime();
        // Dono 23/10: o outro saiu ≠ consulta encerrada. Se ELE encerrou (server),
        // cai no pós-chamada com aviso claro; se só caiu a conexão, GRAÇA de 5 min
        // p/ voltar antes de encerrar (nada de "concluída" imediata).
        void (async () => {
          if (graceTimerRef.current) { clearTimeout(graceTimerRef.current); graceTimerRef.current = null; }
          try {
            const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } });
            if (r.ok) {
              const d = await r.json().catch(() => null);
              if (d?.endedAt) {
                setSummary((cur) => (cur ? { ...cur, endedAt: d.endedAt } : cur));
                setEnded({ sec: Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000) });
                setPhase('ended');
                setToast({ text: `${displayName} encerrou a consulta.`, k: Date.now() });
                return;
              }
            }
          } catch { /* offline — segue a graça padrão */ }
          setToast({ text: `${displayName} saiu — aguardando voltar (até 5 min).`, k: Date.now() });
          graceTimerRef.current = setTimeout(() => {
            graceTimerRef.current = null;
            if (roomRef.current && !otherJoinedRef.current) {
              setEnded({ sec: Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000) });
              setPhase('ended');
              setToast({ text: 'Consulta encerrada — 5 min sem retorno do outro participante.', k: Date.now() });
              hapticLight();
            }
          }, 5 * 60_000);
        })();
      })
      .on(RoomEvent.Reconnecting, () => setBanner('reconnecting'))
      .on(RoomEvent.Reconnected, () => setBanner(null))
      .on(RoomEvent.Disconnected, () => {
        if (endedByUser.current) return;
        // Caiu sem o usuário encerrar (rede/servidor) → pós-chamada com o tempo corrido.
        void stopAndUploadRecording(); // best-effort: chunks até o corte sobrevivem
        markEnded(); // best-effort: encerramento server-side mesmo com a rede caída
        const t0 = startedAtRef.current ?? Date.now();
        setEnded({ sec: Math.round((Date.now() - t0) / 1000) });
        setPhase('ended');
        setBanner(null);
        hapticSuccess();
      });

    await room.connect(serverUrl, lkToken);

    // Participantes que JÁ estão na sala não disparam ParticipantConnected.
    room.remoteParticipants.forEach((p) => upsertRemote(p));

    // Publica mídia local — respeita as escolhas do pré-join.
    // Fix 29/10 (Heloisa, Safari): REAPROVEITA as tracks do preview — elas nasceram
    // no gesto do usuário e já estão autorizadas; pedir getUserMedia DE NOVO depois
    // dos awaits do join falhava no Safari/iOS (NotAllowed intermitente → mic
    // vermelho, sem gravação/transcrição). Sem preview (auto-join APK/agenda) →
    // setMicrophoneEnabled + retry, caminho antigo.
    let camOk = true;
    let micOk = true;
    const pending = pendingTracksRef.current;
    pendingTracksRef.current = [];
    const pvAudio = pending.find((t) => t.kind === 'audio' && t.readyState === 'live') ?? null;
    const pvVideo = pending.find((t) => t.kind === 'video' && t.readyState === 'live') ?? null;
    for (const t of pending) if (t !== pvAudio && t !== pvVideo) { try { t.stop(); } catch { /* noop */ } }

    if (micOn && pvAudio) {
      try { pvAudio.enabled = true; await room.localParticipant.publishTrack(pvAudio, { source: Track.Source.Microphone }); }
      catch { try { pvAudio.stop(); } catch { /* noop */ } micOk = false; }
    } else {
      if (pvAudio) { try { pvAudio.stop(); } catch { /* noop */ } }
      try { await room.localParticipant.setMicrophoneEnabled(micOn); } catch { micOk = false; }
    }
    // Dono 23/10 (chamada REAL): mic falhava no AUTO-JOIN do APK — a permissão do
    // WebView às vezes não está pronta quando o connect dispara na carga da página
    // (sem gesto). Retry curto resolve a corrida; sem mic, o botão fica vermelho DE
    // VERDADE e sem track não existe gravação/transcrição (era o sintoma da Heloisa).
    if (!micOk && micOn) {
      for (let i = 0; i < 3 && !micOk; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try { await room.localParticipant.setMicrophoneEnabled(true); micOk = true; } catch { /* tenta de novo */ }
      }
    }
    if (camOn && pvVideo) {
      try {
        pvVideo.enabled = true;
        const pub = await room.localParticipant.publishTrack(pvVideo, { source: Track.Source.Camera });
        setLocalVideo(((pub as any)?.videoTrack as LocalVideoTrack | undefined) ?? null);
      } catch {
        try { pvVideo.stop(); } catch { /* noop */ }
        try { const pub = await room.localParticipant.setCameraEnabled(true); setLocalVideo(pub?.videoTrack ?? null); } catch { camOk = false; }
      }
    } else {
      if (pvVideo) { try { pvVideo.stop(); } catch { /* noop */ } }
      try {
        const pub = await room.localParticipant.setCameraEnabled(camOn);
        setLocalVideo(pub?.videoTrack ?? null);
      } catch { camOk = false; }
    }

    // §19 diagnóstico: saúde da track local publicada (mudo por engano = médico
    // não ouve). Dev-only. audioTrackPublications é Map — percorre, não indexa.
    {
      let mst: MediaStreamTrack | undefined;
      room.localParticipant.audioTrackPublications.forEach((p: any) => { if (!mst && p?.track?.mediaStreamTrack) mst = p.track.mediaStreamTrack; });
      devLog('local:audio-track', { micOk, readyState: mst?.readyState, muted: mst?.muted, enabled: mst?.enabled });
    }
    setMicOn(micOk);
    setCamOn(camOk);
    if (!micOk || !camOk) setToast({ text: !micOk ? 'Sem microfone — verifique a permissão do app. A transcrição precisa de áudio.' : camOk ? 'Sem microfone — entre com o que tiver.' : 'Câmera bloqueada — você também pode entrar só com áudio.', k: Date.now() });

    setStartedAt(Date.now());
    startedAtRef.current = Date.now();
    setPhase('incall');
    setBanner(null);
    // Se o consentimento já existe e outro participante já está na sala, grava
    if (summaryRef.current?.recordConsentAt && (room.remoteParticipants.size > 0 || otherJoined)) {
      startRoomRecording(room);
    }
    try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* WebView sem wakelock — ok */ }
  }, [authToken, hapticLight, markEnded, playJoinChime, playLeaveChime, reminderId, restartRoomRecording, role, startRoomRecording, stopAndUploadRecording, teardownRoom, otherJoined]);

  // ── Join via backend ─────────────────────────────────────────────────────────
  const startJoin = useCallback(async (s?: Summary | null) => {
    const sum = s ?? summaryRef.current;
    // Fix Safari 29/10: as tracks do preview (autorizadas no GESTO de "Entrar")
    // passam pro pendingTracksRef ANTES do stopPreview — o connectRoom as publica
    // direto (sem segundo getUserMedia, que falhava no Safari). O finally descarta
    // o que não foi consumido (early-return 402/403/falha de join).
    pendingTracksRef.current = previewStream.current?.getTracks() ?? [];
    previewStream.current = null;
    stopPreview();
    setPhase('connecting');
    setBanner('connecting');
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/join`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (res.status === 401) {
        // agent2: sessão expirou — manda pro login em vez de toast genérico + loop no pré-join.
        setBanner(null);
        window.location.hash = role === 'doctor' ? '#/entrar/medico' : '#/entrar';
        return;
      }
      if (res.status === 501) {
        const d = await res.json().catch(() => ({} as any));
        setFallbackLink(d?.linkUrl || sum?.linkUrl || '');
        setPhase('fallback');
        setBanner(null);
        return;
      }
      if (res.status === 402) {
        // Lifecycle §2 (24/10): consulta particular sem PIX pago → não entra.
        // Paciente volta aos lembretes (o dialog de PIX já existe lá); médico
        // fica sabendo que o paciente ainda não pagou.
        // bug dono 24/10: TODO 402 do join é barreira de pagamento — code ausente
        // não pode virar 'join-failed' → prejoin → câmera ↔ payment em loop.
        const d = await res.json().catch(() => ({} as any));
        payBlockedRef.current = true;
        setPayPriceCents(typeof d?.priceCents === 'number' ? d.priceCents : null);
        setPhase('payment');
        setBanner(null);
        hapticError();
        return;
      }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({} as any));
        if (d?.code === 'CONSENT_REQUIRED') {
          setSummary((cur) => (cur ? { ...cur, consentAt: null } : cur));
          setPhase('prejoin');
          setBanner(null);
          setToast({ text: 'Autorize a telemedicina para entrar.', k: Date.now() });
          return;
        }
        // Lifecycle §1 (24/10): antes da janela (dueDate − 5 min, relógio do SERVER)
        // → sala de espera com countdown até opensAt; nunca entra.
        if (d?.code === 'TOO_EARLY') {
          setOpensAt(typeof d.opensAt === 'string' ? d.opensAt : null);
          setPhase('waiting');
          setBanner(null);
          return;
        }
        // F4: consulta encerrada entre o load e o toque em "Entrar" → área read-only
        // (nunca loop de "não deu pra entrar" numa consulta que já acabou).
        if (d?.code === 'TELECONSULTA_ENDED') {
          setSummary((cur) => (cur ? { ...cur, endedAt: d.endedAt ?? new Date().toISOString() } : cur));
          setPhase('readonly');
          setBanner(null);
          return;
        }
        throw new Error('forbidden');
      }
      if (!res.ok) throw new Error('join-failed');
      payBlockedRef.current = false; // join liberado — não é mais barreira de pagamento
      const data = await res.json();
      // §5 dono (26/10): deadline da tolerância de ausência (server-verdade) p/ o chip.
      if (typeof data.noShowDeadlineMs === 'number') setNoShowDeadlineMs(data.noShowDeadlineMs);
      // fix #13c: o /join devolve stt (hasStt do server) mas o client não salvava —
      // sem isto o gate do banner/chip de gravação ficava cego até um /summary futuro.
      if (typeof data.stt === 'boolean') setSummary((cur) => (cur ? { ...cur, stt: data.stt } : cur));
      await connectRoom(data.serverUrl, data.token);
    } catch {
      // bug dono 24/10: bloqueado por pagamento NUNCA cai no prejoin (abriria a
      // câmera/pedido de permissão e piscaria payment ↔ câmera). Fica no payment.
      if (payBlockedRef.current) { setPhase('payment'); setBanner(null); return; }
      setBanner(null);
      setToast({ text: 'Não deu pra entrar. Tenta de novo em instantes.', k: Date.now() });
      hapticError();
      setPhase('prejoin');
    } finally {
      // Tracks não consumidas pelo connectRoom (early-return/falha): solta o hardware.
      pendingTracksRef.current.forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      pendingTracksRef.current = [];
    }
  }, [authToken, connectRoom, reminderId, role, stopPreview]);

  // "Já paguei — verificar de novo" (bug dono 24/10): verificação DE VERDADE —
  // refetch do /summary (paidAt, relógio do server). Pago → auto-avança pro join
  // (que agora passa); pendente → toast claro + botão reabilita. NUNCA re-roda o
  // join às cegas (402 em loop = botão piscando sem feedback).
  const recheckPay = useCallback(async () => {    if (recheckBusy) return;
    setRecheckBusy(true);
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } });
      const d = res.ok ? await res.json().catch(() => null) : null;
      if (d?.paidAt) {
        payBlockedRef.current = false;
        hapticSuccess();
        setToast({ text: 'Pagamento confirmado! Entrando na consulta…', k: Date.now() });
        await startJoin();
        return;
      }
      hapticError();
      setToast({ text: 'Ainda não identificamos o pagamento — pode levar alguns segundos após o PIX.', k: Date.now() });
    } catch {
      hapticError();
      setToast({ text: 'Sem conexão pra verificar agora. Tenta de novo.', k: Date.now() });
    } finally {
      setRecheckBusy(false);
    }
  }, [authToken, hapticError, hapticSuccess, recheckBusy, reminderId, startJoin]);

  // AUTO-RECHECK (brecha 26/10 — pagamento da Heloisa): o webhook do Asaas pode
  // levar MINUTOS (fila SEQUENTIALLY atrasa ainda mais) — nesse gap a tela ficava
  // "aguardando pagamento" mesmo com o PIX já pago no banco. Silencioso: só age
  // quando o /summary traz paidAt (aí reaproveita o recheckPay, que auto-avança
  // pra consulta); pendente NÃO faz barulho (botão manual segue p/ feedback).
  useEffect(() => {
    if (phase !== 'payment' || role !== 'patient') return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } });
        if (!res.ok) return;
        const d = await res.json().catch(() => null);
        if (d?.paidAt) void recheckPay();
      } catch { /* offline: próximo tick */ }
    }, 20_000);
    return () => clearInterval(iv);
  }, [phase, role, reminderId, authToken, recheckPay]);

  // Botão do pré-join (paciente): consent Art.15 (só se ainda não consenter) + join.
  // F3 §1: se marcou o checkbox de gravação, registra o record-consent logo após o
  // consent Art.15 (3a — PUT; PATCH de fallback até be2 consolidar o verbo). Best-effort:
  // falha aqui NUNCA derruba a entrada na chamada.
  const consentAndJoin = useCallback(async () => {
    const sum = summaryRef.current;
    if (joinLoading) return;
    // fix #13d: câmera E microfone negados — sem mídia não existe consulta. Guarda
    // dupla (botão desabilita no pré-join/atender; aqui cobre qualquer caminho residual).
    if (camState === 'denied' && micDenied) {
      setToast({ text: 'Sem câmera nem microfone não é possível consultar. Libere pelo menos um.', k: Date.now() });
      hapticError();
      return;
    }
    setJoinLoading(true);
    try {
      let next: Summary | null = sum ? { ...sum } : sum;
      // Art.15 (CFM 2.314/22) — só se ainda não consenter.
      if (role === 'patient' && sum && !sum.consentAt) {
        const res = await fetch(`${API_URL}/reminders/${reminderId}/consent`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) throw new Error('consent');
        hapticSuccess();
        next = { ...sum, consentAt: new Date().toISOString() };
      }
      // F3 §1: record-consent INDEPENDENTE do Art.15 — fix 23/10: antes só era
      // registrado junto do consent pendente; quem consentiu na marcação nunca
      // via o checkbox e o recordConsentAt nunca nascia → gravação morta.
      // Best-effort: falha aqui NUNCA derruba a entrada na chamada.
      if (role === 'patient' && recordAudio && next && !next.recordConsentAt) {
        const rcUrl = `${API_URL}/teleconsulta/${reminderId}/record-consent`;
        const rcHeaders = { Authorization: `Bearer ${token()}` };
        let rc: Response | null = null;
        try {
          rc = await fetch(rcUrl, { method: 'PUT', headers: rcHeaders });
          if (!rc.ok && (rc.status === 404 || rc.status === 405)) rc = await fetch(rcUrl, { method: 'PATCH', headers: rcHeaders });
        } catch { rc = null; }
        if (rc?.ok) next = { ...next, recordConsentAt: new Date().toISOString() };
      }
      if (next !== sum) setSummary(next);
      await startJoin(next);
    } catch {
      hapticError();
      // Mesma estabilidade do startJoin: barreira de pagamento → payment, não prejoin.
      if (payBlockedRef.current) { setPhase('payment'); return; }
      setToast({ text: 'Não deu pra entrar. Tenta de novo em instantes.', k: Date.now() });
      setPhase('prejoin');
    } finally {
      setJoinLoading(false);
    }
  }, [camState, joinLoading, micDenied, recordAudio, reminderId, role, startJoin]);

  // ── Bootstrap: resumo + decisão da fase inicial ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isBrowserSupported()) { setUnsupported(true); setPhase('fallback'); return; }
      if (role === 'patient') {
        const pid = (() => { try { return localStorage.getItem('selPatientId') || localStorage.getItem('patientId'); } catch { return null; } })();
        let fetched: Summary | null = null;
        
        // Tenta buscar no summary canônico primeiro (não depende de patientId no localStorage)
        try {
          const sumRes = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } });
          if (sumRes.ok) {
            const d = await sumRes.json();
            if (d) {
              fetched = {
                id: reminderId,
                patientId: d.patient?.id || pid || '',
                title: d.title || 'Teleconsulta médica',
                dueDate: d.dueDate || new Date().toISOString(),
                consentAt: d.consentAt ?? null,
                recordConsentAt: d.recordConsentAt ?? null,
                provider: 'livekit',
                linkUrl: d.linkUrl || null,
                doctor: d.doctor,
                patient: d.patient,
                endedAt: d.endedAt ?? null,
                stt: typeof d.stt === 'boolean' ? d.stt : undefined,
                doctorInRoom: d.doctorInRoom ?? false,
              };
            }
          }
        } catch { /* segue pro fallback de reminders */ }

        if (!fetched && pid) {
          try {
            const res = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
              const list = await res.json();
              const found = Array.isArray(list) ? list.find((x: any) => x?.id === reminderId) : null;
              if (found) {
                fetched = { id: found.id, patientId: found.patientId, title: found.title, dueDate: found.dueDate, consentAt: found.consentAt, recordConsentAt: found.recordConsentAt, provider: found.provider, linkUrl: found.linkUrl, doctor: found.doctor, endedAt: found.endedAt };
              }
            } else if (res.status === 401) { setPhase('error'); return; }
          } catch { /* offline */ }
        }
        if (cancelled) return;
        const s = fetched ?? summaryRef.current;
        if (s) setSummary(s);
        if (!s) { setPhase('error'); return; }

        if (s.endedAt) { setPhase('readonly'); return; }
        if (s.consentAt) { void startJoin(s); return; }
        setPhase('prejoin');
      } else {
        try { setNote(localStorage.getItem(`dx-teleconsulta-note:${reminderId}`) || ''); } catch { /* noop */ }
        fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!cancelled && d) {
              setSummary((cur) => (cur ? {
                ...cur,
                endedAt: d.endedAt ?? cur.endedAt ?? null,
                stt: typeof d.stt === 'boolean' ? d.stt : cur.stt,
                patient: d.patient || cur.patient,
                doctor: d.doctor || cur.doctor,
              } : {
                id: reminderId,
                endedAt: d.endedAt ?? null,
                stt: d.stt,
                patient: d.patient,
                doctor: d.doctor,
              }));
              // F4: médico também cai na área read-only se a consulta já encerrou.
              if (d.endedAt) setPhase((p) => (p === 'loading' || p === 'prejoin' ? 'readonly' : p));
              // QuickNote: nota do PRONTUÁRIO (server) manda sobre o rascunho
              // local — o médico reabre a consulta e vê o que escreveu antes.
              if (d.doctorNote) setNote(d.doctorNote);
              if (d.cid10?.code) setCidSel({ code: d.cid10.code, desc: d.cid10.desc });
            }
          })
          .catch(() => {});
        setPhase('prejoin');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preview de câmera apenas no pré-join.
  useEffect(() => {
    if (phase === 'prejoin') { void openPreview(); }
    else stopPreview();
  }, [phase, openPreview, stopPreview]);

  // WhatsApp-style: poll do summary no pré-join p/ detectar médico entrando
  // (doctorInRoom true = tela vira "chamada recebida" com toque visual)
  useEffect(() => {
    if (phase !== 'prejoin' || role !== 'patient') return;
    const iv = setInterval(() => {
      fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.doctorInRoom) setSummary((cur) => (cur ? { ...cur, doctorInRoom: true } : cur)); })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, [authToken, phase, reminderId, role]);

  // Ringback: toca enquanto "Aguardando…" (incall + ninguém conectado AINDA). Para no
  // 1º join e NÃO religa quando o outro sai (evita tocar eternamente).
  useEffect(() => {
    if (phase === 'incall' && remotes.length === 0 && !otherJoined) startRingback();
    else stopRingback();
    return () => { stopRingback(); };
  }, [phase, remotes.length, otherJoined, startRingback, stopRingback]);

  // agent2: no-show do paciente — médico incall SOZINHO (ninguém nunca entrou) por
  // 5 min → para o ringback e mostra "Paciente ainda não chegou" com ações reais
  // (reenviar convite / encerrar). Timer em ref: limpo quando alguém entra e no unmount.
  useEffect(() => {
    const alone = phase === 'incall' && role === 'doctor' && remotes.length === 0 && !otherJoined;
    if (!alone) {
      if (noShowTimerRef.current) { clearTimeout(noShowTimerRef.current); noShowTimerRef.current = null; }
      if (otherJoined) setPatientNoShow(false); // paciente chegou (mesmo que tenha saído depois) — não é no-show
      return;
    }
    if (noShowTimerRef.current != null) return; // já armado
    noShowTimerRef.current = window.setTimeout(() => {
      noShowTimerRef.current = null;
      setPatientNoShow(true);
      stopRingback(); // 5 min tocando é suficiente
      hapticError();
    }, 300_000);
    return () => {
      if (noShowTimerRef.current) { clearTimeout(noShowTimerRef.current); noShowTimerRef.current = null; }
    };
  }, [phase, role, remotes.length, otherJoined, stopRingback]);

  // Beep de gravação: só enquanto gravando (LGPD — cortesia auditiva).
  useEffect(() => {
    if (recording) startRecordingBeep();
    else stopRecordingBeep();
    return () => { stopRecordingBeep(); };
  }, [recording, startRecordingBeep, stopRecordingBeep]);

  // agent2: rede voltou (ou remontou já online) → sobe gravações da fila IndexedDB.
  // §19 G4: também atualiza o contador da fila (estado "falhou + Retomar envio").
  useEffect(() => {
    const retry = () => { void (async () => { await retryPendingRecordingUploads(authToken); await refreshPendingRecCount(); })(); };
    window.addEventListener('online', retry);
    retry(); // mount: pendência da sessão anterior pode subir agora
    return () => window.removeEventListener('online', retry);
  }, [authToken, refreshPendingRecCount]);

  // §19 G3: app voltando ao 1º plano (visibilitychange/focus) → refetch LEVE do
  // summary. O médico/paciente que deixou o app em 2º plano volta com a presença
  // e o estado da consulta ATUALIZADOS (doctorInRoom / endedAt), sem esperar o poll.
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState !== 'visible') return;
      if (phase !== 'prejoin' && phase !== 'waiting' && phase !== 'incall') return;
      fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setSummary((cur) => (cur ? {
            ...cur,
            doctorInRoom: d.doctorInRoom ?? cur.doctorInRoom ?? false,
            endedAt: d.endedAt ?? cur.endedAt ?? null,
            stt: typeof d.stt === 'boolean' ? d.stt : cur.stt,
          } : cur));
          // Consulta encerrou ENQUANTO estávamos fora (e não estamos em chamada a
          // dois) → área read-only honesta em vez de prejoin zombie.
          if (d.endedAt && (phase === 'prejoin' || phase === 'waiting') && !otherJoinedRef.current) setPhase('readonly');
        })
        .catch(() => { /* offline — o poll cobre */ });
    };
    window.addEventListener('visibilitychange', refetch);
    window.addEventListener('focus', refetch);
    return () => { window.removeEventListener('visibilitychange', refetch); window.removeEventListener('focus', refetch); };
  }, [authToken, phase, reminderId]);

  // §19 G4: transcrição pronta em qualquer fluxo → gravação "concluída".
  useEffect(() => { if (txState === 'ready') setRecPhase((p) => (p === 'processing' || p === 'uploading' || p === 'capturing' ? 'done' : p)); }, [txState]);

  // O <video> do preview monta DEPOIS do getUserMedia resolver (camState ok) —
  // bind do stream acontece aqui, quando o ref já existe.
  useEffect(() => {
    if (camState === 'ok' && previewStream.current && previewVideo.current) {
      previewVideo.current.srcObject = previewStream.current;
      previewVideo.current.play().catch(() => {});
    }
  }, [camState]);

  // Toast auto-hide.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Cronômetro.
  useEffect(() => {
    if (phase !== 'incall' || !startedAt) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase, startedAt]);

  // Sala de espera (TOO_EARLY): countdown de 1s + re-tentativa automática do join
  // a cada 30s quando a janela (opensAt, relógio do server) já chegou.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'waiting' || !opensAt) return;
    const target = new Date(opensAt).getTime();
    if (Number.isNaN(target)) return;
    const iv = setInterval(() => {
      if (Date.now() >= target) void startJoin();
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase, opensAt, startJoin]);

  // Back gesture (Android) durante a chamada → dialog de encerrar (nunca sai direto).
  useEffect(() => {
    if (phase !== 'incall') return;
    const h = (e: Event) => { e.preventDefault(); setEndOpen(true); };
    window.addEventListener('app:back', h);
    return () => window.removeEventListener('app:back', h);
  }, [phase]);

  // Cleanup total no unmount.
  useEffect(() => () => {
    endedByUser.current = true;
    stopPreview();
    try { wakeLock.current?.release?.(); } catch { /* noop */ }
    wakeLock.current = null;
    // agent2: unmount SEM endCall/Disconnected (navegou fora, fechou a tab no meio
    // da chamada) também encerra no server — com o MESMO guard do endCall: sessão
    // <25s sem o outro lado conectar é saída da sala de espera, não encerra.
    const t0 = startedAtRef.current;
    if (t0 != null && ((Date.now() - t0) / 1000 >= 25 || otherJoinedRef.current)) markEnded();
    if (noShowTimerRef.current) { clearTimeout(noShowTimerRef.current); noShowTimerRef.current = null; }
    void teardownRoom();
  }, [markEnded, stopPreview, teardownRoom]);

  // ── F3 (c): resumo da área "Resumo da consulta" (3d GET summary) ───────
  const loadAreaSummary = useCallback(async (): Promise<TeleSummary | null> => {
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!res.ok) return null; // rota ainda não no ar (be2) → área degrada sem pedidos/transcrição
      const d = await res.json();
      return {
        transcript: d?.transcript ?? null,
        examRequests: Array.isArray(d?.examRequests) ? d.examRequests : [],
        feedback: d?.feedback ?? null,
        durationHint: d?.durationHint ?? null,
        consultSummary: d?.consultSummary ?? null, // §14.1: aprovado (paciente) / draft+approved (médico)
      };
    } catch { return null; }
  }, [authToken, reminderId]);

  // ── §14.1: ações do resumo (MÉDICO) — generate/edit/approve. Erro nunca derruba
  // a página: mensagem + retry (as anotações manuais seguem intactas no server).
  const applyConsultSummary = (payload: ConsultSummaryInfo | null) => {
    if (!payload) return;
    setAreaSummary((cur) => (cur ? { ...cur, consultSummary: payload } : cur));
  };
  const csGenerate = async () => {
    setCsBusy('generate');
    setCsError(null);
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary/generate`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` } });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || 'Não foi possível gerar o rascunho agora.');
      applyConsultSummary(d);
      setCsDraft(String(d?.draftMd ?? ''));
      setCsEditing(false);
      hapticSuccess();
    } catch (e: any) {
      setCsError(e?.message || 'Não foi possível gerar o rascunho agora.');
      hapticError();
    } finally {
      setCsBusy(null);
    }
  };
  const csSaveDraft = async (): Promise<boolean> => {
    if (!csDraft.trim()) { setCsError('Escreva o rascunho antes de salvar.'); return false; }
    setCsBusy('save');
    setCsError(null);
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ draftMd: csDraft }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || 'Não foi possível salvar o rascunho.');
      applyConsultSummary(d);
      setCsEditing(false);
      setToast({ text: 'Rascunho salvo — continue depois ou aprove quando quiser.', k: Date.now() });
      hapticSuccess();
      return true;
    } catch (e: any) {
      setCsError(e?.message || 'Não foi possível salvar o rascunho.');
      hapticError();
      return false;
    } finally {
      setCsBusy(null);
    }
  };
  const csApprove = async () => {
    setCsApproveOpen(false);
    // Editor aberto com texto não salvo → salva ANTES (o server aprova o draft salvo;
    // sem isso o médico aprovaria uma versão antiga sem perceber).
    if (csEditing && !(await csSaveDraft())) return;
    setCsBusy('approve');
    setCsError(null);
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary/approve`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` } });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || 'Não foi possível aprovar o resumo.');
      applyConsultSummary(d);
      setCsEditing(false);
      setToast({ text: 'Resumo aprovado — o paciente já pode ler.', k: Date.now() });
      hapticSuccess();
    } catch (e: any) {
      setCsError(e?.message || 'Não foi possível aprovar o resumo.');
      hapticError();
    } finally {
      setCsBusy(null);
    }
  };

  // F3 (b): pedidos em tempo real IN-CALL — poll leve do summary a cada 20s (fallback
  // da casa: sem DataChannel, o polling cobre). Diff por id → painel flutuante §2b.
  useEffect(() => {
    if (phase !== 'incall' || role !== 'patient') return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } });
        if (!res.ok || stop) return;
        const d = await res.json();
        const list: ExamRequest[] = Array.isArray(d?.examRequests) ? d.examRequests : [];
        const fresh = list.filter((x) => x?.id && x.status === 'pending' && !seenReqIds.current.has(x.id) && !dismissedReqIds.current.has(x.id));
        list.forEach((x) => { if (x?.id) seenReqIds.current.add(x.id); });
        if (fresh.length) {
          hapticSuccess(); // "Dr. pediu 1 toque" — chegou pedido do médico
          setExamQueue((cur) => { const ids = new Set(cur.map((q) => q.id)); return [...cur, ...fresh.filter((x) => !ids.has(x.id))]; });
        }
      } catch { /* offline: o próximo tick tenta de novo */ }
    };
    void poll(); // baseline: pedidos criados ANTES da entrada aparecem ao conectar (§2a)
    const t = setInterval(() => void poll(), 20000);
    return () => { stop = true; clearInterval(t); };
  }, [phase, role, reminderId, authToken]);

  // F3 (c): ao virar 'ended' (fim da chamada ao vivo) OU 'readonly' (reentrada de
  // consulta encerrada), carrega a área do paciente (pedidos + transcrição + duração).
  useEffect(() => {
    if ((phase !== 'ended' && phase !== 'readonly') || role !== 'patient') return;
    setExamQueue([]);
    setSchedFor(null);
    void (async () => { const s = await loadAreaSummary(); if (s) setAreaSummary(s); })();
  }, [phase, role, loadAreaSummary]);

  // F3 (c) §3b: transcrição — pendente → poll 15s até 3min até transcriptAt aparecer;
  // pronta → texto via GET transcript (3c). Só existe se houve consent de gravação.
  // F4: vale também na reentrada read-only (transcrição pode ter ficado pronta depois).
  useEffect(() => {
    if ((phase !== 'ended' && phase !== 'readonly') || role !== 'patient' || !summary?.recordConsentAt) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    let sawPromise = false; // viu transcript.at OU recordingAt em algum tick
    setTxState('pending');
    setTxText(null);
    setTxAt(null);
    const normAt = (s: TeleSummary | null): string | null => {
      const t: any = s?.transcript;
      if (!t) return null;
      if (typeof t === 'string') return t;
      return t.at || t.transcriptAt || null;
    };
    const tick = async () => {
      if (stop) return;
      const s = await loadAreaSummary();
      if (s) setAreaSummary(s);
      const at = normAt(s);
      const rec = (s as any)?.recordingAt ?? null; // áudio no disco = STT vai rodar
      if (at || rec) sawPromise = true;
      // Bug 26/10 (dono): histórico ANTIGO sem áudio (consent sim, recordingAt e
      // transcript null) decidia "processando" ETERNO — o upload nunca mais chega.
      // Consulta encerrada há >15min sem promessa nenhuma → 'none' JÁ (sem 3min de
      // shimmer). Pós-chamada fresco mantém o poll (upload pode estar subindo).
      if (!at && !rec) {
        const em = s?.endedAt ? new Date(s.endedAt).getTime() : null;
        if (em != null && Date.now() - em > 15 * 60_000) { if (!stop) setTxState('none'); return; }
      }
      if (at) {
        try {
          const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/transcript`, { headers: { Authorization: `Bearer ${authToken()}` } });
          if (r.ok) {
            const d = await r.json();
            if (!stop) { setTxText(typeof d?.text === 'string' ? d.text : ''); setTxAt(typeof d?.transcriptAt === 'string' ? d.transcriptAt : at); setTxState('ready'); }
            return;
          }
        } catch { /* cai no próximo tick */ }
      }
      tries += 1;
      if (tries >= 12) { if (!stop) setTxState(sawPromise ? 'error' : 'none'); return; } // ~3 min: houve promessa → erro c/ retry; nunca houve → sem áudio
      timer = setTimeout(() => void tick(), 15000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, role, summary?.recordConsentAt, txRetry]);

  // fix #9 (a): médico em 'ended'/'readonly' também carrega a área pós-consulta
  // (pedidos + transcrição + duração) — mesmo GET /summary auth-dual do paciente.
  // Transcrição: poll curto (15s × 4) — a STT pode estar terminando logo após o
  // encerramento; sem gravação, transcript nunca aparece e a seção simplesmente some.
  // Bug 26/10: esgotou as tentativas COM promessa de texto (at) → estado 'error'
  // explícito (antes ficava "processando…" pra sempre, sem animação, no histórico).
  useEffect(() => {
    if ((phase !== 'ended' && phase !== 'readonly') || role !== 'doctor') return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    let sawAt = false;
    setTxState('pending');
    const tick = async () => {
      if (stop) return;
      const s = await loadAreaSummary();
      if (stop) return;
      if (s) setAreaSummary(s);
      const at = s?.transcript?.at ?? null;
      if (at) {
        sawAt = true;
        try {
          const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/transcript`, { headers: { Authorization: `Bearer ${authToken()}` } });
          if (r.ok) {
            const d = await r.json();
            if (!stop) { setTxText(typeof d?.text === 'string' ? d.text : ''); setTxAt(typeof d?.transcriptAt === 'string' ? d.transcriptAt : at); setTxState('ready'); }
            return;
          }
        } catch { /* próximo tick */ }
      }
      tries += 1;
      if (tries >= 4) { if (!stop && sawAt) setTxState('error'); return; } // promessa sem texto → erro visível c/ retry
      timer = setTimeout(() => void tick(), 15000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [phase, role, authToken, reminderId, loadAreaSummary, txRetry]);

  // ── Ações da chamada ─────────────────────────────────────────────────────────
  // Dono 20/10: WebView não tem 🔒 na barra de endereço — mensagem precisa ser
  // CONTEXT-AWARE: nativo → "configurações do app"; navegador → "🔒 na barra".
  const mediaErrHint = useCallback((kind: 'mic' | 'cam', e?: any) => {
    const label = kind === 'mic' ? 'microfone' : 'câmera';
    const capLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
    if (e?.name === 'NotFoundError') return `Não achamos ${label} neste aparelho.`;
    if (isNative) return `Permita o ${label} nas Configurações do Android → Apps → Dr. Exame → Permissões.`;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) return `${capLabel} bloqueado no Safari — vá em Ajustes → Safari → ${capLabel} e toque em Permitir.`;
    return `${capLabel} bloqueado — clique no 🔒 ou 🎥 na barra de endereço do navegador e permita.`;
  }, []);

  const toggleMic = useCallback(async () => {
    hapticLight();
    const room = roomRef.current;
    if (!room) return;
    try {
      if (!micOn) { await room.localParticipant.setMicrophoneEnabled(true); setMicOn(true); }
      else { await room.localParticipant.setMicrophoneEnabled(false); setMicOn(false); }
    } catch (e: any) {
      setToast({ text: mediaErrHint('mic', e), k: Date.now() });
      hapticError();
    }
  }, [micOn, mediaErrHint]);

  const toggleCam = useCallback(async () => {
    hapticLight();
    const room = roomRef.current;
    if (!room) return;
    try {
      if (!camOn) { const pub = await room.localParticipant.setCameraEnabled(true); setLocalVideo(pub?.videoTrack ?? null); setCamOn(true); }
      else { await room.localParticipant.setCameraEnabled(false); setLocalVideo(null); setCamOn(false); }
    } catch (e: any) {
      setToast({ text: mediaErrHint('cam', e), k: Date.now() });
      hapticError();
    }
  }, [camOn, mediaErrHint]);

  // agent2: exitTo declarado ANTES do endCall — o deps do endCall referenciava antes
  // da declaração (TS2448, bloqueava o tsc do CI).
  const exitTo = useCallback(() => {
    hapticLight();
    if (onExited) { onExited(); return; }
    navigate(role === 'doctor' ? '/doctor' : '/lembretes');
  }, [navigate, onExited, role]);

  const endCall = useCallback(async (outcome?: TeleOutcome) => {
    setEndOpen(false);
    setOutcomeOpen(false);
    const t0 = startedAtRef.current ?? Date.now();
    endedByUser.current = true;
    const durSec = Math.round((Date.now() - t0) / 1000);
    setEnded({ sec: durSec });

    // Se o usuário entrou e saiu em menos de 25s sem outro participante conectado:
    // Trata como saída da sala de espera — NÃO mata a consulta no servidor e NÃO pede avaliação!
    if (durSec < 25 && !otherJoined) {
      try { wakeLock.current?.release?.(); } catch { /* noop */ }
      wakeLock.current = null;
      await stopAndUploadRecording();
      await teardownRoom();
      exitTo();
      return;
    }

    // Encerramento honesto (lifecycle 24/10): só EU na chamada → pergunta COMO
    // encerrar ANTES de derrubar a sala (o server exige outcome explícito).
    // "Voltar à chamada" devolve o usuário à sala intacta (gravação segue).
    if (!outcome && !otherJoined) {
      setOutcomeSuggest(null);
      setOutcomeOpen(true);
      return;
    }

    const res = await markEnded(outcome ?? 'completed');
    if (!res.ok && res.reason) {
      // Server recusou (400): paciente nunca entrou OU tempo conjunto abaixo do
      // mínimo. Abre o dialog com a sugestão DO SERVER — nunca registra silencioso
      // o que não aconteceu (escolha explícita rejeitada cai aqui de novo).
      setOutcomeSuggest(res.suggestion ?? null);
      setOutcomeOpen(true);
      hapticError();
      setToast({
        text: res.reason === 'min_time_not_met'
          ? 'Tempo conjunto abaixo do mínimo'
          : res.error || 'O paciente não entrou nesta consulta.',
        k: Date.now(),
      });
      return;
    }
    if (!res.ok) {
      // Rede/500: mantém o fim local (best-effort — o auto-end do server fecha depois).
      setToast({ text: 'Encerramento vai ser confirmado em instantes.', k: Date.now() });
    }
    try { wakeLock.current?.release?.(); } catch { /* noop */ }
    wakeLock.current = null;
    await stopAndUploadRecording();
    await teardownRoom();
    setPhase('ended');
    hapticSuccess();
  }, [exitTo, markEnded, otherJoined, stopAndUploadRecording, teardownRoom]);

  const saveNote = useCallback(async () => {
    // QuickNote 23/10: PRONTUÁRIO no server (fim do localStorage "só neste
    // aparelho"). localStorage fica como fallback offline — se o PUT falhar,
    // a nota não se perde e sincroniza no próximo save.
    if (role === 'doctor') {
      try {
        const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/doctor-note`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
          body: JSON.stringify({ note, ...(cidDirty ? { cid10Code: cidSel?.code ?? '' } : {}) }),
        });
        if (!r.ok) throw new Error();
        setNoteSaved(true);
        hapticSuccess();
        return;
      } catch { /* offline/erro → cai no localStorage abaixo */ }
    }
    try { localStorage.setItem(noteKey, note); } catch { /* noop */ }
    setNoteSaved(true);
    hapticSuccess();
  }, [authToken, cidDirty, cidSel, note, noteKey, reminderId, role]);

  // ── F3 (b/c): responder pedido do médico (3f PATCH /api/exam-requests/:id) ────
  // authorize = médico quer VER exame existente · schedule = exame novo (cria lembrete) · deny.
  const respondRequest = useCallback(async (req: ExamRequest, action: 'authorize' | 'deny' | 'schedule', dueDate?: string) => {
    if (reqBusy === req.id) return;
    setReqBusy(req.id);
    try {
      const res = await fetch(`${API_URL}/exam-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ action, ...(action === 'schedule' && dueDate ? { dueDate } : {}) }),
      });
      if (!res.ok) throw new Error('respond');
      hapticSuccess();
      dismissedReqIds.current.add(req.id);
      setExamQueue((cur) => cur.filter((q) => q.id !== req.id));
      setSchedFor(null);
      setAreaSummary((cur) => (cur ? {
        ...cur,
        examRequests: (cur.examRequests || []).map((x) => (x.id === req.id
          ? { ...x, status: action === 'authorize' ? 'authorized' : action === 'deny' ? 'denied' : 'scheduled', scheduledFor: action === 'schedule' ? (dueDate ?? x.scheduledFor ?? null) : x.scheduledFor, respondedAt: new Date().toISOString() }
          : x)),
      } : cur));
      const verb = action === 'authorize' ? 'autorizado' : action === 'schedule' ? 'agendado' : 'negado';
      setToast({ text: `${req.title} ${verb} ✓`, k: Date.now() }); // chip fino "autorizado ✓" (§2b)
    } catch {
      hapticError();
      setToast({ text: 'Não deu agora — dá pra responder depois na área da consulta.', k: Date.now() });
    } finally { setReqBusy(null); }
  }, [authToken, reqBusy]);

  // "Depois" do painel in-call (§2b): descarta o chip; o pedido fica pendente na área.
  const dismissRequest = useCallback((id: string) => {
    hapticLight();
    dismissedReqIds.current.add(id);
    setExamQueue((cur) => cur.filter((q) => q.id !== id));
  }, []);

  // ── Guardas (depois de TODOS os hooks) ───────────────────────────────────────
  if (!hasAuth) return <Navigate to={role === 'doctor' ? '/entrar/medico' : '/entrar'} replace />;

  const doctor = summary?.doctor;
  const main = remotes.find((r) => r.isDoctor) ?? remotes[0] ?? null;
  // ── §19 G3: presença do outro participante DERIVADA dos eventos reais ────────
  // notjoined (ninguém conectou) · connecting (ParticipantConnected, mídia ainda
  // não assinada) · present (track de vídeo/áudio ativa) · reconnecting
  // (ConnectionQualityChanged → poor/lost do REMOTO) · left (ParticipantDisconnected).
  const peerPresence: 'notjoined' | 'connecting' | 'present' | 'reconnecting' | 'left' =
    remoteLeft != null ? 'left'
    : (otherJoined || remotes.length > 0)
      ? (remotes.length === 0 ? 'left'
        : (peerQuality === 'poor' || peerQuality === 'lost') ? 'reconnecting'
        : (main?.track || main?.muted || main?.audio) ? 'present' : 'connecting')
      : 'notjoined';
  const PRESENCE_META: Record<typeof peerPresence, { label: string; color: string; bg: string; border: string }> = {
    notjoined: { label: 'não entrou', color: 'rgba(255,255,255,.7)', bg: 'rgba(255,255,255,.10)', border: 'rgba(255,255,255,.25)' },
    connecting: { label: 'conectando…', color: '#5fc9c3', bg: 'rgba(32,178,170,.15)', border: 'rgba(32,178,170,.4)' },
    present: { label: 'presente', color: '#6ee7b7', bg: 'rgba(16,185,129,.15)', border: 'rgba(16,185,129,.45)' },
    reconnecting: { label: 'reconectando…', color: '#fbbf24', bg: 'rgba(245,158,11,.15)', border: 'rgba(245,158,11,.45)' },
    left: { label: 'saiu', color: '#e0bc97', bg: 'rgba(212,165,116,.15)', border: 'rgba(212,165,116,.4)' },
  };
  const presenceMeta = PRESENCE_META[peerPresence];
  // §19 G3: link do paciente p/ compartilhar (portal tem o WhatsApp copy; aqui o
  // médico em sala de espera manda direto — link da consulta ou rota do app).
  const consultShareUrl = summary?.linkUrl || `${window.location.origin}${window.location.pathname}#/teleconsulta/${reminderId}`;
  const shareConsult = async () => {
    hapticLight();
    const text = 'Sua consulta por vídeo do Dr. Exame está neste link — toque para entrar:';
    try {
      if (navigator.share) { await navigator.share({ title: 'Consulta Dr. Exame', text, url: consultShareUrl }); return; }
    } catch (e: any) { if (e?.name === 'AbortError') return; /* cancelado ≠ erro */ }
    try {
      await navigator.clipboard.writeText(`${text} ${consultShareUrl}`);
      setToast({ text: 'Link copiado — envie ao paciente (WhatsApp).', k: Date.now() });
      hapticSuccess();
    } catch { setToast({ text: 'Não deu pra copiar o link agora.', k: Date.now() }); }
  };
  // P2-reviewer: header do MÉDICO mostra o NOME do paciente (state do portal), não o
  // título do lembrete; fallback = quem está na sala.
  const statePatientName = (location.state as any)?.patientName as string | undefined;
  // Brief clínico (médico): patientId do summary — o bootstrap do médico não
  // popula o campo plano, mas patient.id vem no objeto do /summary.
  const briefPatientId = summary?.patientId || summary?.patient?.id || (location.state as any)?.patient?.id || (location.state as any)?.reminder?.patientId || '';
  const headerName = role === 'doctor'
    ? (`Paciente: ${statePatientName || summary?.patient?.name || (location.state as any)?.patient?.fullName || main?.name || '—'}`)
    : (doctor?.name || main?.name || 'Médico(a)');
  // P3-reviewer: CRM completo com UF (o joinName do server traz "116739/SP" — normalizamos p/ "116739-SP")
  const headerCrm = role === 'patient' && doctor?.crm
    ? (/(\/|-)[A-Za-z]{2}$/.test(doctor.crm) ? doctor.crm.replace(/\/([A-Za-z]{2})$/, '-$1') : `${doctor.crm}${(doctor as any).crmUf ? `-${(doctor as any).crmUf}` : ''}`)
    : undefined;
  const elapsedSec = startedAt && phase === 'incall' ? Math.round((Date.now() - startedAt) / 1000) : 0;
  void nowTick; // re-render do cronômetro

  const pipSize = { w: 96, h: 128 };
  const pipPosStyle: any = pipDrag
    ? { left: pipDrag.x, top: pipDrag.y, right: 'auto', bottom: 'auto' }
    : {
        [pipCorner[0] === 't' ? 'top' : 'bottom']: pipCorner[0] === 't' ? 'calc(env(safe-area-inset-top) + 64px)' : 'calc(env(safe-area-inset-bottom) + 96px)',
        [pipCorner[1] === 'l' ? 'left' : 'right']: 12,
      };
  const onPipDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPipDrag({ x: rect.left, y: rect.top, dx: e.clientX - rect.left, dy: e.clientY - rect.top });
  };
  const onPipMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pipDrag) return;
    setPipDrag((d) => (d ? { ...d, x: e.clientX - d.dx, y: e.clientY - d.dy } : d));
  };
  const onPipUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pipDrag) return;
    const cx = e.clientX;
    const cy = e.clientY;
    const nearL = cx < window.innerWidth / 2;
    const nearT = cy < window.innerHeight / 2;
    setPipCorner(`${nearT ? 't' : 'b'}${nearL ? 'l' : 'r'}` as 'tr' | 'tl' | 'br' | 'bl');
    setPipDrag(null);
  };

  const primaryBtn = {
    height: 48, borderRadius: '14px', textTransform: 'none' as const, fontWeight: 800, fontSize: 14.5,
    background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)', color: '#fff',
    boxShadow: '0 4px 14px rgba(13,148,136,.35)',
    '&:focus-visible': { outline: '2px solid #0d9488', outlineOffset: 3 },
    '&:hover': { background: 'linear-gradient(135deg, #0f766e 0%, #047857 100%)', boxShadow: '0 6px 20px rgba(13,148,136,.45)' },
    '&:disabled': { color: 'rgba(255,255,255,.7)' },
  };

  // ══ FASES ════════════════════════════════════════════════════════════════════
  if (phase === 'incall') {
    const mainHasVideo = main?.track && !main.muted;
    const otherName = role === 'doctor'
      ? (summary?.patient?.name || (location.state as any)?.patientName || (location.state as any)?.patient?.fullName || 'o paciente')
      : (doctor?.name || main?.name || 'o médico');
    const otherPhoto = role === 'doctor'
      ? (() => {
          const pId = (location.state as any)?.patient?.id
            || (location.state as any)?.reminder?.patientId
            || summary?.patient?.id
            || summary?.patientId;
          return pId ? photoUrlFor(String(pId)) : undefined;
        })()
      : (summary?.doctor?.id ? doctorPhotoUrl(summary.doctor.id) : undefined);
    return (
      <Box sx={{ position: 'fixed', inset: 0, ...CALL_BG_STYLE, zIndex: 1300, overflow: 'hidden', userSelect: 'none' }}>
        {/* Tile principal: o outro participante (médico, p/ paciente) */}
        {mainHasVideo ? (
          <Box sx={{ position: 'absolute', inset: 0 }}>
            <TrackVideo track={main!.track!} />
          </Box>
        ) : otherJoined && remoteLeft ? (
          /* O outro SAIU (Teams-style: você fica, mas sabe que ele foi) */
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3 }}>
            <Stack alignItems="center" spacing={2.5} sx={{ textAlign: 'center', maxWidth: 360 }}>
              <Avatar
                src={otherPhoto}
                sx={{
                width: 84, height: 84, fontSize: 30, fontWeight: 800,
                bgcolor: 'rgba(245,158,11,.12)', color: '#d97706', border: '3px solid rgba(245,158,11,.35)',
              }}>
                {initials(remoteLeft)}
              </Avatar>
              <Box>
                <Typography sx={{ color: 'rgba(255,255,255,.95)', fontWeight: 800, fontSize: 18 }}>
                  {remoteLeft} saiu da chamada
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.6)', fontSize: 13, mt: 0.5, lineHeight: 1.5 }}>
                  A chamada continua ativa do seu lado. Você pode encerrar quando quiser ou aguardar o retorno.
                </Typography>
              </Box>
              <Button variant="contained" onClick={() => setEndOpen(true)} startIcon={<CallEndIcon />}
                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: COPPER, '&:hover': { bgcolor: COPPER_DARK } }}>
                Encerrar também
              </Button>
            </Stack>
          </Box>
        ) : patientNoShow && role === 'doctor' ? (
          /* agent2: 5 min sozinho na sala — ringback parou, oferta de ação real
             (reenviar convite via push / encerrar). Sala segue aberta se esperar. */
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3 }}>
            <Stack alignItems="center" spacing={2.5} sx={{ textAlign: 'center', maxWidth: 360 }}>
              <Avatar
                src={otherPhoto}
                sx={{ width: 84, height: 84, fontSize: 30, fontWeight: 800, bgcolor: 'rgba(245,158,11,.12)', color: '#d97706', border: '3px solid rgba(245,158,11,.35)' }}
              >
                {initials(summary?.patient?.name || (location.state as any)?.patientName)}
              </Avatar>
              <Box>
                <Typography sx={{ color: 'rgba(255,255,255,.95)', fontWeight: 800, fontSize: 18 }}>
                  Paciente ainda não chegou
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.6)', fontSize: 13, mt: 0.5, lineHeight: 1.5 }}>
                  Você está na sala há 5 minutos esperando. Reenvie o convite ou encerre a consulta — ela continua aberta se você preferir aguardar.
                </Typography>
                {/* §5 dono (26/10): countdown da tolerância — vencida, o server encerra
                    sozinho como no_show (noShowBy='patient'; estorno já reservado). */}
                {noShowDeadlineMs != null && noShowDeadlineMs > Date.now() && (
                  <Chip size="small" label={`Paciente ausente — encerra em ${Math.max(1, Math.ceil((noShowDeadlineMs - Date.now()) / 60000))}min`} sx={{ height: 26, fontSize: 12, fontWeight: 800, color: '#fbbf24', bgcolor: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.35)' }} />
                )}
              </Box>
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained" disabled={nudgeBusy} onClick={() => void resendInvite()}
                  startIcon={nudgeBusy ? <CircularProgress size={16} color="inherit" /> : <NotificationsActiveIcon />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, background: 'linear-gradient(135deg,#20b2aa,#178f89)', '&:hover': { background: 'linear-gradient(135deg,#178f89,#0f766e)' }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 2 } }}
                >
                  {nudgeBusy ? 'Enviando…' : 'Reenviar convite'}
                </Button>
                <Button
                  variant="contained" onClick={() => setEndOpen(true)} startIcon={<CallEndIcon />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: COPPER, '&:hover': { bgcolor: COPPER_DARK } }}
                >
                  Encerrar consulta
                </Button>
              </Stack>
            </Stack>
          </Box>
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: { xs: 2, sm: 3 } }}>
            <Stack alignItems="center" spacing={2.5} sx={{ textAlign: 'center', maxWidth: 420, width: '100%', zIndex: 2 }}>
              {/* Avatar com Ondas Sonar Concéntricas */}
              <Box sx={{ position: 'relative', width: 120, height: 120, display: 'grid', placeItems: 'center' }}>
                {/* 3 Ondas Sonar */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: -12,
                    borderRadius: '50%',
                    border: '2px solid rgba(32,178,170,0.4)',
                    animation: 'dxSonarWave 2.8s infinite cubic-bezier(0.22, 1, 0.36, 1)',
                    '@keyframes dxSonarWave': {
                      '0%': { transform: 'scale(0.85)', opacity: 0.9 },
                      '100%': { transform: 'scale(1.7)', opacity: 0 },
                    },
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: -12,
                    borderRadius: '50%',
                    border: '1.5px solid rgba(32,178,170,0.3)',
                    animation: 'dxSonarWave 2.8s infinite cubic-bezier(0.22, 1, 0.36, 1) 0.9s',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: -12,
                    borderRadius: '50%',
                    border: '1px solid rgba(32,178,170,0.2)',
                    animation: 'dxSonarWave 2.8s infinite cubic-bezier(0.22, 1, 0.36, 1) 1.8s',
                  }}
                />

                <Avatar
                  src={otherPhoto}
                  sx={{
                    width: 96,
                    height: 96,
                    fontSize: 34,
                    fontWeight: 800,
                    bgcolor: 'rgba(32,178,170,.18)',
                    color: '#5fc9c3',
                    border: '3px solid rgba(32,178,170,.6)',
                    boxShadow: '0 0 36px rgba(32,178,170,0.45)',
                    position: 'relative',
                    zIndex: 2,
                    animation: 'dxCallPulse 2.4s ease-in-out infinite',
                    '@keyframes dxCallPulse': {
                      '0%,100%': { transform: 'scale(1)' },
                      '50%': { transform: 'scale(1.04)' },
                    },
                  }}
                >
                  {initials(role === 'doctor'
                    ? (summary?.patient?.name || (location.state as any)?.patientName || (location.state as any)?.patient?.fullName || main?.name)
                    : (doctor?.name || main?.name))}
                </Avatar>
              </Box>

              <Box sx={{ width: '100%' }}>
                <Typography sx={{ color: 'rgba(255,255,255,.98)', fontWeight: 800, fontSize: { xs: 18, sm: 20 }, letterSpacing: '-0.01em' }}>
                  {peerPresence === 'present' ? `Conectando áudio com ${otherName}…` : `Aguardando ${otherName} entrar…`}
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.7)', fontSize: 13, mt: 0.5, lineHeight: 1.45, maxWidth: 360, mx: 'auto' }}>
                  {role === 'doctor'
                    ? 'Você já está conectado na sala. Assim que o paciente acessar o link, o vídeo iniciará automaticamente.'
                    : 'Sua sala criptografada está aberta. O médico foi avisado da sua entrada e entrará em instantes.'}
                </Typography>

                {/* Timeline de Conexão em 3 Etapas Humanizada */}
                <Box
                  sx={{
                    mt: 2,
                    p: 1.5,
                    borderRadius: '16px',
                    bgcolor: 'rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Stack spacing={1} sx={{ textAlign: 'left' }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CheckCircleIcon sx={{ fontSize: 16, color: '#10b981' }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                        Sala Segura CFM 2.314/2022 ativa
                      </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CheckCircleIcon sx={{ fontSize: 16, color: '#10b981' }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                        Seu microfone e câmera prontos
                      </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: '#38bdf8',
                            boxShadow: '0 0 10px #38bdf8',
                            animation: 'dxBlink 1.4s infinite ease-in-out',
                            '@keyframes dxBlink': {
                              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                              '50%': { opacity: 0.4, transform: 'scale(0.8)' },
                            },
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                        {peerPresence === 'present' ? `Sincronizando com ${otherName}…` : `Aguardando entrada de ${otherName}…`}
                      </Typography>
                    </Stack>
                  </Stack>
                </Box>

                {/* Chips de estado e deadline */}
                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                  <Chip size="small" label={`● ${presenceMeta.label}`} sx={{ height: 24, fontSize: 12, fontWeight: 800, color: presenceMeta.color, bgcolor: presenceMeta.bg, border: `1px solid ${presenceMeta.border}` }} />
                  {summary?.dueDate && (
                    <Chip size="small" label={`Agendada ${dueShort(summary.dueDate)}`} sx={{ height: 24, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.75)', bgcolor: 'rgba(0,0,0,.3)' }} />
                  )}
                  {noShowDeadlineMs != null && noShowDeadlineMs > Date.now() && !otherJoined && (
                    <Chip size="small" label={`${role === 'doctor' ? 'Paciente ausente' : 'Médico ainda não chegou'} — encerra em ${Math.max(1, Math.ceil((noShowDeadlineMs - Date.now()) / 60000))}min`} sx={{ height: 24, fontSize: 12, fontWeight: 800, color: '#fbbf24', bgcolor: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.35)' }} />
                  )}
                </Stack>

                {/* Ações Inteligentes Durante a Espera */}
                <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" flexWrap="wrap" sx={{ mt: 2 }}>
                  {/* Testar Som */}
                  <Button
                    size="small"
                    onClick={testAudioSound}
                    startIcon={soundTested ? <CheckCircleIcon sx={{ fontSize: 16, color: '#10b981' }} /> : <VolumeUpIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      height: 38,
                      px: 2,
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: 12.5,
                      color: soundTested ? '#10b981' : '#fff',
                      bgcolor: soundTested ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.08)',
                      border: '1px solid',
                      borderColor: soundTested ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.15)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
                    }}
                  >
                    {soundTested ? 'Som funcionando ✓' : 'Testar som'}
                  </Button>

                  {/* Médico: Acessar Prontuário e Exames sem tempo morto */}
                  {role === 'doctor' && (
                    <Button
                      size="small"
                      startIcon={<AssignmentIcon sx={{ fontSize: 16 }} />}
                      onClick={() => setBriefOpen(true)}
                      sx={{
                        height: 38,
                        px: 2,
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 12.5,
                        color: '#5fc9c3',
                        bgcolor: 'rgba(32,178,170,0.12)',
                        border: '1px solid rgba(32,178,170,0.4)',
                        '&:hover': { bgcolor: 'rgba(32,178,170,0.22)' },
                      }}
                    >
                      Ver Prontuário & Exames
                    </Button>
                  )}

                  {/* Médico: Compartilhar link */}
                  {role === 'doctor' && peerPresence === 'notjoined' && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ShareIcon sx={{ fontSize: 16 }} />}
                      onClick={() => void shareConsult()}
                      sx={{
                        height: 38,
                        px: 2,
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 12.5,
                        color: '#38bdf8',
                        borderColor: 'rgba(56,189,248,0.5)',
                        bgcolor: 'rgba(56,189,248,0.08)',
                        '&:hover': { borderColor: '#38bdf8', bgcolor: 'rgba(56,189,248,0.16)' },
                      }}
                    >
                      Reenviar link
                    </Button>
                  )}
                </Stack>

                {/* Dica humanizada no rodapé da espera para o paciente */}
                {role === 'patient' && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 1.25,
                      borderRadius: '12px',
                      bgcolor: 'rgba(32,178,170,0.08)',
                      border: '1px dashed rgba(32,178,170,0.25)',
                    }}
                  >
                    <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 1.4 }}>
                      {PREP_TIPS[prepTipIdx].icon} <strong>{PREP_TIPS[prepTipIdx].title}:</strong> {PREP_TIPS[prepTipIdx].desc}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Stack>
          </Box>
        )}


        {/* PiP local — arrastável, snap nos 4 cantos, espelhado */}
        <Box
          onPointerDown={onPipDown} onPointerMove={onPipMove} onPointerUp={onPipUp} onPointerCancel={onPipUp}
          aria-label="Sua câmera"
          sx={{
            position: 'absolute', width: pipSize.w, height: pipSize.h, borderRadius: '16px', overflow: 'hidden',
            border: '2px solid rgba(255,255,255,.25)', bgcolor: '#000',
            touchAction: 'none', cursor: 'grab',
            transition: pipDrag ? 'none' : 'all .25s cubic-bezier(.34,1.3,.64,1)',
            display: 'grid', placeItems: 'center',
            ...(camOn && localVideo ? {} : {}),
          }}
          style={pipPosStyle}
        >
          {camOn && localVideo ? <TrackVideo track={localVideo} mirrored /> : <VideocamOffIcon sx={{ color: 'rgba(255,255,255,.5)' }} />}
        </Box>

        {/* Header vidro — 2 LINHAS (nome+timer / chips): 6 elementos numa linha
            de 390px ficava sopa no iPhone — dono 20/10 "header confuso" */}
        <Stack
          sx={{
            position: 'absolute', top: 0, left: 0, right: 0, px: 1.5,
            pt: 'calc(env(safe-area-inset-top) + 8px)', pb: 0.75,
            background: 'rgba(0,0,0,.45)', backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <DrExame size={26} />
            {role === 'doctor' && (
              <Avatar
                src={otherPhoto}
                sx={{
                  width: 32,
                  height: 32,
                  fontSize: 12,
                  fontWeight: 800,
                  bgcolor: 'rgba(32,178,170,.2)',
                  color: '#5fc9c3',
                  border: '1.5px solid rgba(32,178,170,.4)',
                  borderRadius: '10px',
                  flexShrink: 0,
                }}
              >
                {initials(otherName)}
              </Avatar>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{headerName}</Typography>
              {headerCrm && <Typography noWrap sx={{ color: 'rgba(255,255,255,.55)', fontSize: 12 }}>{headerCrm}</Typography>}
            </Box>
            <Typography sx={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }} aria-label="Tempo de chamada">
              {clockFmt(elapsedSec)}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
            {role === 'doctor' && <Chip size="small" label="Médico" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(212,165,116,.2)', color: '#e0bc97' }} />}
            {/* §19 G3: qualidade do REMOTO visível (o banner "reconectando" cobre a
                rede LOCAL; este chip cobre o outro lado da chamada). */}
            {peerPresence === 'reconnecting' && <Chip size="small" label={`${(main?.name || otherName || 'participante').split(' ')[0]} reconectando…`} sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(245,158,11,.2)', color: '#fbbf24' }} />}
            {role === 'doctor' && briefPatientId && (
              <Chip size="small" icon={<AssignmentIcon sx={{ fontSize: '15px !important' }} />} label="Exames" onClick={() => setBriefOpen(true)} aria-label="Abrir brief clínico do paciente" sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.18)', color: '#5fc9c3', cursor: 'pointer', position: 'relative', '& .MuiChip-icon': { color: '#5fc9c3', ml: '6px', mr: '-4px' }, // hitbox 44px (critic #3): a área clicável estende 12px em volta
                '&::after': { content: '""', position: 'absolute', inset: -12, }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 1 } }} />
            )}
            {role === 'patient' && summary?.consentAt && <Chip size="small" label="✓ autorizada" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.18)', color: '#5fc9c3' }} />}
            {/* fix #13b: stt false (server não transcreve) → chip de gravação NEM renderiza */}
            {summary?.stt !== false && (recording ? (
              <Chip size="small" label="● Gravando IA" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(239,68,68,.25)', color: '#fca5a5' }} />
            ) : (
              <Chip
                size="small"
                label={summary?.recordConsentAt ? "🎙️ Transcrição ativa" : "🎙️ Gravar IA"}
                onClick={() => setRecordPromptDismissed(false)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.18)', color: '#5fc9c3', cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Stack>

        {/* Banner Interativo: Perguntar se quer gravar áudio para transcrição quando ambos estiverem conectados */}
        {/* fix #13b: stt false (server não transcreve) → banner de gravação NEM renderiza */}
        {phase === 'incall' && (otherJoined || remotes.length > 0) && !recording && !summary?.recordConsentAt && !recordPromptDismissed && summary?.stt !== false && (
          <Box
            sx={{
              position: 'absolute',
              top: 'calc(env(safe-area-inset-top) + 68px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(94%, 440px)',
              zIndex: 25,
              p: 2,
              borderRadius: '20px',
              background: 'rgba(12, 24, 28, 0.95)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1.5px solid rgba(32, 178, 170, 0.5)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(32, 178, 170, 0.25)',
              animation: 'dxSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
              '@keyframes dxSlideDown': {
                from: { opacity: 0, transform: 'translate(-50%, -16px)' },
                to: { opacity: 1, transform: 'translate(-50%, 0)' },
              },
            }}
          >
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '12px',
                    bgcolor: 'rgba(32, 178, 170, 0.18)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#20b2aa',
                    flexShrink: 0,
                    border: '1px solid rgba(32, 178, 170, 0.35)',
                  }}
                >
                  <MicIcon sx={{ fontSize: 24 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>
                    🎙️ Gravação & Transcrição por IA
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontSize: 12.5, lineHeight: 1.45, mt: 0.5 }}>
                    {role === 'doctor'
                      ? 'Deseja gravar o áudio desta consulta para gerar automaticamente a transcrição clínica e o prontuário por IA?'
                      : 'Vocês dois estão na chamada. Autoriza gravar o áudio para gerar o resumo e a transcrição por IA? A gravação começa assim que você aprovar — e é opcional.'}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setRecordPromptDismissed(true)}
                  sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#fff' }, p: 0.5 }}
                >
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>

              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 0.5 }}>
                <Button
                  size="small"
                  onClick={() => setRecordPromptDismissed(true)}
                  sx={{
                    color: 'rgba(255,255,255,0.7)',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 12.5,
                    px: 1.5,
                    borderRadius: '999px',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
                  }}
                >
                  Não gravar
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={consentBusy}
                  onClick={() => void handleEnableRecording()}
                  startIcon={consentBusy ? <CircularProgress size={14} color="inherit" /> : <MicIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    borderRadius: '999px',
                    textTransform: 'none',
                    fontWeight: 800,
                    fontSize: 13,
                    px: 2.5,
                    background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
                    boxShadow: '0 4px 14px rgba(32,178,170,0.4)',
                    '&:hover': { background: 'linear-gradient(135deg, #26cfc6 0%, #1a9e97 100%)' },
                  }}
                >
                  {consentBusy ? 'Ativando…' : 'Sim, Gravar com IA'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}

        {/* Indicadores (vidro, topo) */}
        {(banner || toast) && (
          <Stack
            direction="row" alignItems="center" spacing={1}
            sx={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top) + 60px)', left: '50%', transform: 'translateX(-50%)',
              maxWidth: '90%', px: 1.75, py: 0.75, borderRadius: '999px',
              background: GLASS, backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER,
              color: '#fff', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 2,
            }}
            role="status"
          >
            {banner === 'reconnecting' && <WifiOffIcon sx={{ fontSize: 16 }} />}
            {banner === 'connecting' && <CircularProgress size={14} sx={{ color: '#5fc9c3' }} />}
            <span>{banner === 'connecting' ? 'Conectando…' : banner === 'reconnecting' ? 'Conexão instável — reconectando…' : toast?.text}</span>
          </Stack>
        )}

        {/* Fallback telefone (23/10, chamada real caiu de áudio): conexão ruim ou
            médico saiu → paciente tem 1 toque pra salvar a consulta por ligação.
            Telefone vem do perfil público do médico (opcional). */}
        {role === 'patient' && (banner === 'reconnecting' || remoteLeft) && summary?.doctor?.phone && (
          <Button
            component="a"
            href={`tel:${summary.doctor.phone}`}
            size="small"
            variant="contained"
            startIcon={<CallIcon sx={{ fontSize: 16 }} />}
            sx={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 104px)', left: '50%', transform: 'translateX(-50%)', zIndex: 3, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 12.5, px: 2.5, background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}
          >
            Problema na chamada? Ligar {summary.doctor.phone}
          </Button>
        )}

        {/* F3 §2b: pedido do médico chegou — painel flutuante (vidro) abaixo do header.
            Nunca cobre PiP nem controles (ancorado à esquerda, acima da barra). */}
        {role === 'patient' && examQueue[0] && (() => {
          const req = examQueue[0];
          const canAuthorize = !!req.existingExamId;
          return (
            <Box
              role="dialog" aria-label="Pedido do médico"
              sx={{
                position: 'absolute', left: 16, zIndex: 5,
                top: `calc(env(safe-area-inset-top) + ${(banner || toast) ? 104 : 60}px)`,
                maxWidth: 'min(88%, calc(100vw - 150px))',
                p: 1.25, borderRadius: '16px', color: '#fff',
                background: 'rgba(15,24,24,.92)', backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER,
                boxShadow: '0 8px 24px rgba(0,0,0,.35)',
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: COPPER, flexShrink: 0 }} />
                <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0 }}>
                  Dr. pediu: {req.title}
                </Typography>
                <IconButton aria-label="Responder depois" onClick={() => dismissRequest(req.id)} sx={{ color: 'rgba(255,255,255,.72)', width: 44, height: 44, '&:hover': { bgcolor: 'rgba(255,255,255,.10)' } }}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
              {req.note && (
                <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,.75)', mt: 0.25, lineHeight: 1.45 }}>“{req.note}”</Typography>
              )}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Button
                  size="small" variant="contained" disabled={reqBusy === req.id}
                  onClick={() => void respondRequest(req, canAuthorize ? 'authorize' : 'schedule', canAuthorize ? undefined : dueAtDays(30))}
                  sx={{
                    height: 44, px: 2.5, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 13.5,
                    background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff',
                    '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 2 },
                  }}
                >
                  {canAuthorize ? 'Autorizar' : 'Agendar'}
                </Button>
                <Button size="small" onClick={() => dismissRequest(req.id)} sx={{ height: 44, px: 1.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,.85)', '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}>
                  Depois
                </Button>
              </Stack>
            </Box>
          );
        })()}

        {/* Controles flutuantes */}
        <Stack
          direction="row" spacing={1.5}
          sx={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            mb: 'calc(env(safe-area-inset-bottom) + 20px)', p: 1, borderRadius: '20px',
            background: GLASS, backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER,
          }}
        >
          <IconButton aria-label={micOn ? 'Desligar microfone' : 'Ligar microfone'} aria-pressed={micOn} onClick={() => void toggleMic()}
            sx={{ width: 56, height: 56, bgcolor: micOn ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.92)', color: micOn ? '#fff' : '#dc2626', '&:hover': { bgcolor: micOn ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.95)' } }}>
            {micOn ? <MicIcon sx={{ fontSize: 26 }} /> : <MicOffIcon sx={{ fontSize: 26 }} />}
          </IconButton>
          <IconButton aria-label={camOn ? 'Desligar câmera' : 'Ligar câmera'} aria-pressed={camOn} onClick={() => void toggleCam()}
            sx={{ width: 56, height: 56, bgcolor: camOn ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.92)', color: camOn ? '#fff' : '#dc2626', '&:hover': { bgcolor: camOn ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.95)' } }}>
            {camOn ? <VideocamIcon sx={{ fontSize: 26 }} /> : <VideocamOffIcon sx={{ fontSize: 26 }} />}
          </IconButton>
          {/* Botão de Gravação & Transcrição por IA */}
          <Tooltip title={recording ? "Gravação e Transcrição por IA Ativa" : "Gravar Áudio para Transcrição IA"}>
            <IconButton
              aria-label="Gravação por IA"
              onClick={() => {
                hapticLight();
                if (!recording) {
                  if (!summary?.recordConsentAt) {
                    setRecordPromptDismissed(false);
                  } else if (roomRef.current) {
                    startRoomRecording(roomRef.current);
                  }
                } else {
                  setToast({ text: 'Gravação por IA ativa na consulta', k: Date.now() });
                }
              }}
              sx={{
                width: 56,
                height: 56,
                bgcolor: recording ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,.14)',
                color: recording ? '#f87171' : '#fff',
                border: recording ? '2px solid rgba(239,68,68,0.7)' : 'none',
                '&:hover': { bgcolor: recording ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,.22)' },
              }}
            >
              <MicIcon sx={{ fontSize: 26 }} />
            </IconButton>
          </Tooltip>
          {/* F3 reviewer-B (alto): "Solicitar exame" IN-CALL — controle do médico.
              Pedido chega na tela do paciente em tempo real (poll do summary). */}
          {/* Brief clínico (médico): acesso direto aos exames alterados */}
          {role === 'doctor' && briefPatientId && (
            <Tooltip title={briefOpen ? "Fechar exames do paciente" : "Ver exames do paciente (Brief)"} arrow>
              <IconButton aria-label="Ver exames do paciente" onClick={() => { hapticLight(); setBriefOpen((v) => !v); }}
                sx={{
                  width: 56, height: 56,
                  bgcolor: briefOpen ? 'rgba(32,178,170,.35)' : 'rgba(255,255,255,.14)',
                  color: briefOpen ? '#5fc9c3' : '#fff',
                  border: briefOpen ? '1.5px solid #20b2aa' : 'none',
                  '&:hover': { bgcolor: 'rgba(32,178,170,.25)' },
                }}>
                <AssignmentIcon sx={{ fontSize: 24 }} />
              </IconButton>
            </Tooltip>
          )}
          {/* Solicitar exame ao paciente (médico) */}
          {role === 'doctor' && (
            <Tooltip title="Solicitar novo exame ao paciente" arrow>
              <IconButton aria-label="Solicitar exame ao paciente" onClick={() => { hapticLight(); setReqOpen(true); }}
                sx={{ width: 56, height: 56, bgcolor: 'rgba(255,255,255,.14)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,.22)' } }}>
                <CheckCircleIcon sx={{ fontSize: 24 }} />
              </IconButton>
            </Tooltip>
          )}
          {/* Paciente também pode consultar seus exames durante a chamada */}
          {role === 'patient' && (summary?.patientId || summary?.patient?.id) && (
            <Tooltip title={briefOpen ? "Fechar meus exames" : "Ver meus exames"} arrow>
              <IconButton aria-label="Ver meus exames" onClick={() => { hapticLight(); setBriefOpen((v) => !v); }}
                sx={{
                  width: 56, height: 56,
                  bgcolor: briefOpen ? 'rgba(32,178,170,.35)' : 'rgba(255,255,255,.14)',
                  color: briefOpen ? '#5fc9c3' : '#fff',
                  border: briefOpen ? '1.5px solid #20b2aa' : 'none',
                  '&:hover': { bgcolor: 'rgba(32,178,170,.25)' },
                }}>
                <AssignmentIcon sx={{ fontSize: 24 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Encerrar chamada" arrow>
            <IconButton aria-label="Encerrar consulta" onClick={() => { hapticLight(); setEndOpen(true); }}
              sx={{ width: 56, height: 56, bgcolor: '#dc2626', color: '#fff', '&:hover': { bgcolor: '#b91c1c' }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 3 } }}>
              <CallEndIcon sx={{ fontSize: 26 }} />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Sink de áudio remoto (elementos ocultos criados pelo SDK) */}
        <div ref={audioSink} aria-hidden style={{ display: 'none' }} />

        {/* §19 G4: estado da gravação VISÍVEL — capturando (● + timer) · enviando ·
            falhou (a chamada segue; o material fica no aparelho c/ Retomar envio). */}
        {recording && (
          <Chip
            size="small"
            label={`● gravando ${recStartedAtRef.current ? clockFmt((Date.now() - recStartedAtRef.current) / 1000) : ''}`.trim()}
            sx={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top) + 148px)', left: 14,
              height: 24, fontSize: 12, fontWeight: 800, color: '#e0bc97', fontVariantNumeric: 'tabular-nums',
              bgcolor: 'rgba(0,0,0,.35)', border: '1px solid rgba(224,188,151,.35)',
              '& .MuiChip-label': { px: 1 },
              '@media (prefers-reduced-motion: no-preference)': {
                animation: 'dxRecPulse 2s ease-in-out infinite',
                '@keyframes dxRecPulse': { '0%,100%': { opacity: 0.75 }, '50%': { opacity: 1 } },
              },
            }}
          />
        )}
        {recPhase === 'uploading' && (
          <Chip size="small" label="enviando gravação…" sx={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 96px)', left: '50%', transform: 'translateX(-50%)', height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(0,0,0,.4)', color: '#cfe8e6' }} />
        )}
        {recPhase === 'failed' && pendingRecCount > 0 && (
          <Chip size="small" label="gravação salva no aparelho — envio no fim" sx={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 96px)', left: '50%', transform: 'translateX(-50%)', height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(245,158,11,.18)', color: '#fbbf24' }} />
        )}

        {/* F3: dialog "Solicitar exame" (médico, in-call) */}
        <Dialog open={reqOpen} onClose={() => setReqOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ pb: 0.5, fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssignmentIcon sx={{ fontSize: 20, color: 'secondary.dark' }} /> Solicitar exame
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ color: 'text.secondary', fontSize: 13, lineHeight: 1.55, mb: 1.5 }}>
              O paciente recebe o pedido na tela dele agora — com botões de autorizar acesso ou agendar o exame.
            </Typography>
            <Stack spacing={1.5}>
              <TextField label="Exame" placeholder="Ex.: Ultrassom abdominal total" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} size="small" fullWidth slotProps={{ htmlInput: { maxLength: 120, 'aria-label': 'Nome do exame solicitado' } }} />
              <TextField label="Observação (opcional)" placeholder="Jejum 8h, levar pedido anterior…" value={reqNote} onChange={(e) => setReqNote(e.target.value)} size="small" fullWidth multiline minRows={2} maxRows={4} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setReqOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
            <Button
              variant="contained" disabled={docReqBusy || !reqTitle.trim()}
              onClick={async () => {
                setDocReqBusy(true);
                try {
                  const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/exam-request`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
                    body: JSON.stringify({ title: reqTitle.trim(), note: reqNote.trim() || undefined }),
                  });
                  if (!r.ok) throw new Error();
                  hapticSuccess();
                  setToast({ text: 'Pedido enviado ao paciente ✨', k: Date.now() });
                  setReqOpen(false);
                  setReqTitle(''); setReqNote('');
                } catch { setToast({ text: 'Não deu pra enviar. Tenta de novo.', k: Date.now() }); hapticError(); }
                finally { setDocReqBusy(false); }
              }}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, background: 'linear-gradient(135deg,#20b2aa,#178f89)', '&:hover': { background: 'linear-gradient(135deg,#178f89,#0f766e)' }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 2 } }}
            >
              {docReqBusy ? 'Enviando…' : 'Enviar pedido'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Brief clínico (in-call): sheet PRÓPRIO (fixed, mesma árvore) em vez de
            Drawer MUI — o portal do Drawer perdia o stacking para os overlays
            fullscreen da chamada (toque interceptado — bug real, achado no E2E).
            Padrão overlay da casa: backdrop + painel com scroll interno, Esc fecha. */}
        {!!briefPatientId && briefOpen && (
          <>
            {/* Scrim só no mobile (critic #6: no desktop o painel lateral não
                precisa escurecer o vídeo — fecha pelo X ou clicando fora) */}
            {!isDesktopViewport && (
              <Box
                aria-hidden
                onClick={() => setBriefOpen(false)}
                sx={{ position: 'fixed', inset: 0, zIndex: 1290, bgcolor: 'rgba(0,0,0,.45)', '@media (prefers-reduced-motion: no-preference)': { animation: 'dxFade .18s ease' }, '@keyframes dxFade': { from: { opacity: 0 }, to: { opacity: 1 } } }}
              />
            )}
            <Box
              ref={briefSheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="Brief clínico — exames do paciente"
              sx={{
                position: 'fixed', zIndex: 1300, bgcolor: 'background.paper',
                ...(isDesktopViewport
                  ? { top: 0, right: 0, bottom: 0, width: 420, maxWidth: '92vw', borderLeft: '1px solid', borderColor: 'divider' }
                  : { left: 0, right: 0, bottom: 0, maxHeight: '62dvh', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }),
                boxShadow: '0 -8px 40px rgba(0,0,0,.35)',
                '@media (prefers-reduced-motion: no-preference)': { animation: isDesktopViewport ? 'dxSheetL .22s cubic-bezier(0.16,1,0.3,1)' : 'dxSheetUp .22s cubic-bezier(0.16,1,0.3,1)' },
                '@keyframes dxSheetUp': { from: { transform: 'translateY(24px)', opacity: 0.6 }, to: { transform: 'none', opacity: 1 } },
                '@keyframes dxSheetL': { from: { transform: 'translateX(24px)', opacity: 0.6 }, to: { transform: 'none', opacity: 1 } },
              }}
            >
              {/* Handle visual (critic #2): pista de que o sheet é puxável/fechável */}
              {!isDesktopViewport && <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />}
              <IconButton ref={briefCloseRef} size="medium" aria-label="Fechar brief clínico" onClick={() => setBriefOpen(false)} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: 'text.secondary', bgcolor: 'action.hover', width: 44, height: 44, '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 1 } }}>
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <Box sx={{ overflowY: 'auto', overscrollBehavior: 'contain' }}>
                <BriefClinico
                  patientId={briefPatientId}
                  authToken={authToken() ?? ''}
                  patientName={summary?.patient?.name || statePatientName || (role === 'patient' ? 'Meus exames' : null)}
                  reason={summary?.title || null}
                />
              </Box>
            </Box>
          </>
        )}

        {/* Encerrar — dialog leve */}
        <Dialog open={endOpen} onClose={() => setEndOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17 }}>Encerrar consulta?</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.6 }}>
              A chamada vai terminar pra você e pro {role === 'doctor' ? 'paciente' : 'médico'}.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setEndOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Continuar</Button>
            <Button variant="contained" onClick={() => void endCall()} startIcon={<CallEndIcon />}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}>
              Encerrar
            </Button>
          </DialogActions>
        </Dialog>

        {/* Encerramento honesto (lifecycle 24/10): o server exige o motivo quando
            o paciente não entrou ou o tempo a dois ficou abaixo do mínimo. Três
            opções claras, zero jargão; a sugestão do server vem destacada. */}
        <Dialog open={outcomeOpen} onClose={() => { setOutcomeOpen(false); endedByUser.current = false; }} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17 }}>Como encerrar?</DialogTitle>
          <DialogContent sx={{ pb: 0 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: 14, mb: 2, lineHeight: 1.6 }}>
              {outcomeSuggest === 'technical'
                ? 'O tempo de chamada a dois ficou abaixo do mínimo.'
                : outcomeSuggest === 'no_show'
                  ? 'O paciente não chegou a entrar na chamada.'
                  : role === 'doctor'
                    ? 'Você está sozinho(a) nesta chamada.'
                    : 'A chamada não aconteceu como o esperado.'}
            </Typography>
            <Stack spacing={1} sx={{ pb: 1 }}>
              {([
                { v: 'completed' as const, label: 'Encerrar consulta', desc: 'A consulta aconteceu normalmente.' },
                { v: 'no_show' as const, label: 'Paciente não compareceu', desc: 'O paciente não entrou na chamada.' },
                { v: 'technical' as const, label: 'Tivemos problema técnico', desc: 'Conexão, áudio ou vídeo falharam.' },
              ]).map((o) => (
                <Button
                  key={o.v}
                  variant="outlined"
                  disabled={outcomeBusy}
                  onClick={() => { hapticLight(); setOutcomeBusy(true); void endCall(o.v).finally(() => setOutcomeBusy(false)); }}
                  sx={{
                    justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', borderRadius: '14px',
                    py: 1.25, px: 2,
                    borderColor: outcomeSuggest === o.v ? '#20b2aa' : 'divider',
                    borderWidth: outcomeSuggest === o.v ? 2 : 1,
                    bgcolor: outcomeSuggest === o.v ? 'rgba(32,178,170,0.08)' : 'transparent',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>
                      {o.label}{outcomeSuggest === o.v ? ' · sugerido' : ''}
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.4 }}>{o.desc}</Typography>
                  </Box>
                </Button>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => { setOutcomeOpen(false); endedByUser.current = false; }} sx={{ textTransform: 'none', fontWeight: 700 }}>Voltar à chamada</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // F4 (agent2): 'ended' = sessão que ACABOU de encerrar (tem duração local); 'readonly'
  // = consulta encerrada NO PASSADO (entrou pelo histórico — não há sessão). Mesma área.
  if (phase === 'ended' || phase === 'readonly') {
    const readOnly = phase === 'readonly' || !!summary?.endedAt; // servidor já encerrou → não re-entra
    const endedFmt = summary?.endedAt
      ? new Date(summary.endedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    const min = ended
      ? (ended.sec >= 30 ? `${Math.max(1, Math.round(ended.sec / 60))} min` : 'menos de 1 min')
      : (areaSummary?.durationHint || '—');

    const PRESET_TAGS = role === 'doctor'
      ? ['🔊 Áudio excelente', '📶 Conexão nítida', '⏱️ Pontual', '📋 Exames solicitados', '💊 Prescrição orientada', '⚠️ Conexão instável']
      : ['🔊 Áudio excelente', '📶 Imagem nítida', '⏱️ Pontual', '🩺 Muito atencioso', '💡 Tirou dúvidas', '⚠️ Conexão oscilou'];

    const togglePresetTag = (tag: string) => {
      hapticLight();
      const current = role === 'doctor' ? (fbNote || note) : fbNote;
      const updated = current.includes(tag)
        ? current.replace(tag, '').replace(/\s{2,}/g, ' ').trim()
        : (current ? `${current} · ${tag}` : tag);
      setFbNote(updated);
      if (role === 'doctor') {
        setNote(updated);
        setNoteSaved(false);
      }
    };

    const existingFb = summary?.feedback || areaSummary?.feedback;
    const isRated = fbSent || (existingFb && existingFb.rating != null);
    const activeRating = fbRating || existingFb?.rating;
    const activeNote = fbNote || existingFb?.note;
    const actualSec = ended?.sec ?? summary?.durationSec ?? areaSummary?.durationSec ?? 0;
    const wasRealCall = actualSec >= 25 || otherJoined;

    // T1 insights (27/10): CSAT de áudio pós-consulta — pergunta EXTRA do paciente
    // (abaixo do rating), 3 chips grandes (toque 44px), opcional (pode pular).
    // Envia no mesmo POST do feedback: o server faz merge (upsert do audit).
    const AUDIO_OPTS = [
      { v: 'otimo', label: 'Ótimo 🎧' },
      { v: 'ok', label: 'OK' },
      { v: 'ruim', label: 'Ruim' },
    ] as const;
    const activeAudio = fbAudio || existingFb?.audioQuality || null;
    const sendAudioQuality = (q: string) => {
      setFbAudio(q);
      hapticLight();
      void sendFeedback(fbRating ?? existingFb?.rating ?? 5, undefined, q);
    };
    const audioAnswered = activeAudio != null;
    const audioBlock = role === 'patient' ? (audioAnswered ? (
      <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', fontSize: 12 }}>
        Áudio da consulta: <Box component="span" sx={{ fontWeight: 800, color: 'text.primary' }}>
          {AUDIO_OPTS.find((o) => o.v === activeAudio)?.label ?? activeAudio}
        </Box>
      </Typography>
    ) : (
      <Box sx={{ mt: 1.25, mb: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 0.75, textAlign: 'center' }}>
          Como estava o áudio da consulta?
        </Typography>
        <Stack direction="row" justifyContent="center" useFlexGap spacing={0.75} sx={{ mb: 0.5 }}>
          {AUDIO_OPTS.map((o) => {
            const sel = activeAudio === o.v;
            return (
              <Chip
                key={o.v}
                label={o.label}
                clickable
                aria-label={`Áudio: ${o.label}`}
                onClick={() => sendAudioQuality(o.v)}
                sx={{
                  height: 44, px: 2.5, fontSize: 14, fontWeight: 800, borderRadius: '999px',
                  bgcolor: sel ? 'rgba(32,178,170,0.18)' : 'rgba(0,0,0,0.04)',
                  color: sel ? '#178f89' : 'text.primary',
                  border: '1px solid',
                  borderColor: sel ? '#20b2aa' : 'divider',
                  '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,0.10)' },
                  '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 2 },
                }}
              />
            );
          })}
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', fontSize: 11.5, color: 'text.disabled', textAlign: 'center' }}>
          Opcional — pode pular.
        </Typography>
      </Box>
    )) : null;

    // Feedback 1-toque com opções prontas — não exibe se a chamada foi só uma saída rápida (<25s e sem outro participante)
    const feedbackBlock = isRated ? (
      <Box sx={{ mt: 2.5, p: 2, borderRadius: '16px', bgcolor: 'rgba(32,178,170,0.06)', border: '1px solid rgba(32,178,170,0.22)', textAlign: 'center' }}>
        <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ mb: 0.5 }}>
          <VerifiedIcon sx={{ fontSize: 18, color: '#178f89' }} />
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
            Avaliação registrada ✓
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} justifyContent="center" sx={{ my: 0.75 }}>
          {[1, 2, 3, 4, 5].map((st) => (
            <span key={st} style={{ fontSize: 22, color: st <= (activeRating || 5) ? '#f59e0b' : '#cbd5e1' }}>★</span>
          ))}
          <Typography component="span" sx={{ ml: 0.75, fontWeight: 800, fontSize: 14, color: 'text.primary', alignSelf: 'center' }}>
            ({activeRating || 5}/5)
          </Typography>
        </Stack>
        {activeNote && (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', mt: 0.5 }}>
            “{activeNote}”
          </Typography>
        )}
        {audioBlock}
      </Box>
    ) : wasRealCall ? (
      <Box sx={{ mt: 2.5, p: 2, borderRadius: '16px', bgcolor: 'rgba(32,178,170,0.06)', border: '1px solid rgba(32,178,170,0.18)', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', mb: 1 }}>Como foi a consulta?</Typography>
        <Stack direction="row" justifyContent="center" useFlexGap spacing={0.5} sx={{ mb: 1.25 }}>
          {[
            { v: 1, icon: <SentimentVeryDissatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Péssima' },
            { v: 2, icon: <SentimentDissatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Ruim' },
            { v: 3, icon: <SentimentNeutralIcon sx={{ fontSize: 30 }} />, label: 'Ok' },
            { v: 4, icon: <SentimentSatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Boa' },
            { v: 5, icon: <SentimentVerySatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Ótima' },
          ].map((o) => (
            <Tooltip key={o.v} title={o.label}>
              <IconButton aria-label={o.label} onClick={() => { setFbRating(o.v); hapticLight(); void sendFeedback(o.v); }}
                sx={{ color: fbRating === o.v ? '#178f89' : 'text.secondary', bgcolor: fbRating === o.v ? 'rgba(32,178,170,0.18)' : 'transparent', '&:hover': { color: '#178f89', bgcolor: 'rgba(32,178,170,0.10)' }, width: 44, height: 44 }}>
                {o.icon}
              </IconButton>
            </Tooltip>
          ))}
        </Stack>
        {fbRating != null && audioBlock}
        <Stack direction="row" flexWrap="wrap" justifyContent="center" useFlexGap spacing={0.75} sx={{ mb: 1.25 }}>
          {PRESET_TAGS.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              clickable
              onClick={() => togglePresetTag(tag)}
              sx={{
                fontSize: 12,
                fontWeight: 700,
                borderRadius: '999px',
                bgcolor: fbNote.includes(tag) ? 'rgba(32,178,170,0.22)' : 'rgba(0,0,0,0.04)',
                color: fbNote.includes(tag) ? '#178f89' : 'text.primary',
                border: '1px solid',
                borderColor: fbNote.includes(tag) ? '#20b2aa' : 'divider',
              }}
            />
          ))}
        </Stack>
        <TextField multiline minRows={2} maxRows={4} fullWidth size="small" value={fbNote} onChange={(e) => setFbNote(e.target.value)}
          placeholder="A conexão e o áudio funcionaram bem? (opcional)"
          slotProps={{ htmlInput: { 'aria-label': 'Observação sobre a chamada' } }}
          sx={{ mt: 0.5, '& .MuiInputBase-root': { fontSize: 13.5, borderRadius: '10px' } }} />
        {fbNote.trim() && (
          <Button size="small" variant="text" onClick={() => void sendFeedback(fbRating ?? 5, fbNote)} sx={{ mt: 1, textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode) }}>
            Salvar avaliação
          </Button>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, fontSize: 12, color: 'text.disabled', textAlign: 'center' }}>
          Registramos sua avaliação para melhorar a teleconsulta.
        </Typography>
      </Box>
    ) : null;

    // ══ F3 §3 — ÁREA PREMIUM DO PACIENTE: "Resumo da consulta" ═════════════
    // A consulta não acaba no encerrar: pedidos com ações + transcrição + feedback
    // moram numa área rolável que persiste (a rota /teleconsulta/:id vira a área).
    if (role === 'patient') {
      const reqs = areaSummary?.examRequests ?? [];
      const hasRecording = !!summary?.recordConsentAt; // sem consent → seção transcrição NEM existe
      const mode = theme.palette.mode;
      // Ações do card (§3a): Negar direto · Autorizar só quando há exame existente
      // (3f exige existingExamId) · Agendar/autorizar-exame-novo → quick-chips de data.
      const handleAreaAction = (req: ExamRequest, action: ExamRequestAction) => {
        if (action === 'deny') { void respondRequest(req, 'deny'); return; }
        if (action === 'authorize' && req.existingExamId) { void respondRequest(req, 'authorize'); return; }
        hapticLight();
        setSchedFor((cur) => (cur === req.id ? null : req.id)); // expande Em 7/15/Escolher data
      };
      const quickBtnSx = {
        height: 44, px: 2, borderRadius: '999px', textTransform: 'none' as const, fontWeight: 800, fontSize: 13,
        color: tealText(mode), borderColor: 'rgba(32,178,170,.45)',
        '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.06)' },
        '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 2 },
      };
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      return (
        <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
          <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pt: 'calc(env(safe-area-inset-top) + 20px)', pb: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
            {/* Voltar (template oficial do app — pill do Sinais/relatório). Histórico
                read-only só tinha o contained no rodapé (dono 26/10). */}
            {readOnly && (
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={exitTo}
                sx={{
                  textTransform: 'none', fontWeight: 700, fontSize: 13,
                  color: 'text.secondary', px: 1.5, py: 0.5, borderRadius: '99px',
                  alignSelf: 'flex-start', mb: 0.5,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,60,55,0.05)',
                  '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15,60,55,0.09)' },
                }}
              >
                Voltar aos lembretes
              </Button>
            )}
            {/* Cabeçalho (superfície da página, sem card) */}
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                <DrExame size={56} />
                <CheckCircleIcon sx={{ position: 'absolute', right: -5, bottom: -5, fontSize: 22, color: '#5fc9c3', bgcolor: 'background.default', borderRadius: '50%' }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
                  {readOnly ? 'Consulta encerrada' : 'Resumo da consulta'}
                </Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.25 }}>
                  {readOnly
                    ? `Encerrada em ${endedFmt} · ${areaSummary?.durationHint || min}`
                    : `Consulta encerrada · ${areaSummary?.durationHint || min}`}
                </Typography>
              </Box>
            </Stack>

            {/* §14.1 — Resumo da consulta APROVADO pelo médico. Sem aprovação → NADA
                (não prometer: o rascunho é privado do médico e nunca vaza ao paciente). */}
            {areaSummary?.consultSummary?.status === 'approved' && (() => {
              const cs = areaSummary.consultSummary!;
              const approvedFmt = cs.approvedAt
                ? new Date(cs.approvedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';
              const docName = cs.approvedBy?.name
                ? (cs.approvedBy.name.toLowerCase().startsWith('dr') ? cs.approvedBy.name : `Dr. ${cs.approvedBy.name}`)
                : 'seu médico';
              return (
                <Box sx={{ mt: 3 }}>
                  <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, mb: 1.25 }}>Resumo da consulta</Typography>
                  <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'divider', boxShadow: 'none' }}>
                    <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                        <VerifiedIcon sx={{ fontSize: 17, color: tealText(mode) }} />
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.secondary' }}>
                          Aprovado por {docName}{approvedFmt ? ` · ${approvedFmt}` : ''}
                        </Typography>
                      </Stack>
                      {renderSummaryMd(cs.summaryMd ?? '')}
                    </CardContent>
                  </Card>
                </Box>
              );
            })()}

            {/* §3a — Pedidos do médico (só se ≥1) */}
            {reqs.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, mb: 1.25 }}>Pedidos do médico</Typography>
                <Stack spacing={1.25}>
                  {reqs.map((req) => (
                    <Box key={req.id}>
                      <ExamRequestCard req={req} role="patient" busy={reqBusy === req.id} onAction={handleAreaAction} />
                      {req.status === 'pending' && schedFor === req.id && (
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
                          <Button size="small" variant="outlined" disabled={reqBusy === req.id} onClick={() => void respondRequest(req, 'schedule', dueAtDays(7))} sx={quickBtnSx}>Em 7 dias</Button>
                          <Button size="small" variant="outlined" disabled={reqBusy === req.id} onClick={() => void respondRequest(req, 'schedule', dueAtDays(15))} sx={quickBtnSx}>Em 15 dias</Button>
                          <Box component="label" sx={{ ...quickBtnSx, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid rgba(32,178,170,.45)', position: 'relative' }}>
                            Escolher data
                            <input
                              type="date" min={tomorrow} aria-label="Escolher data do exame"
                              onChange={(e) => { const v = e.target.value; if (v) void respondRequest(req, 'schedule', new Date(`${v}T09:00`).toISOString()); }}
                              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                            />
                          </Box>
                        </Stack>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {/* §19 G4: upload falhou mas o material está salvo no aparelho —
                retomada EXPLÍCITA ( IndexedDB ), nunca perda silenciosa. */}
            {pendingRecCount > 0 && (
              <Card variant="outlined" sx={{ mt: 3, borderRadius: '16px', bgcolor: 'rgba(245,158,11,.06)', borderColor: 'rgba(245,158,11,.35)', boxShadow: 'none' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack spacing={1} alignItems="flex-start">
                    <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 700 }}>
                      Gravação da consulta salva no aparelho
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                      O envio falhou (rede caiu no fim da chamada){pendingRecCount > 1 ? ` — ${pendingRecCount} gravações na fila` : ''}. Retome quando quiser; a transcrição sai depois do envio.
                    </Typography>
                    <Button size="small" variant="outlined" onClick={() => void retryPendingUploads()} sx={{ height: 40, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 13, borderColor: 'rgba(245,158,11,.5)', color: '#b45309', '&:hover': { borderColor: '#f59e0b', bgcolor: 'rgba(245,158,11,.08)' } }}>
                      Retomar envio
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* §3b — Transcrição */}
            {hasRecording ? (
              <Box sx={{ mt: 3 }}>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, mb: 1.25 }}>Transcrição da Consulta</Typography>
                {/* Bug 26/10 (dono): consentiu gravação mas NÃO há áudio/transcrição
                    (consulta antiga sem upload) — antes era shimmer "processando"
                    ETERNO. Estado honesto: não há transcrição a esperar. */}
                {txState === 'none' && (
                  <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'divider', boxShadow: 'none' }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}>
                        {pendingRecCount > 0
                          ? 'A gravação desta consulta não chegou até nós — toque em “Retomar envio” acima; a transcrição sai depois do envio.'
                          : 'Esta consulta não teve gravação de áudio recebida — não há transcrição a exibir.'}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
                {txState === 'pending' && (
                  <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'divider', boxShadow: 'none' }} >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box aria-label="Transcrição chegando" role="status">
                        <Stack spacing={1}>
                          {[86, 70, 78].map((w, i) => (
                            <Box key={i} sx={{
                              height: 14, width: `${w}%`, borderRadius: '7px',
                              bgcolor: 'rgba(13,148,136,.12)',
                              animation: `dxTxShimmer 1.6s ease ${i * 0.18}s infinite`,
                              '@keyframes dxTxShimmer': { '0%,100%': { opacity: 0.55 }, '50%': { opacity: 1 } },
                            }} />
                          ))}
                        </Stack>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1.5, lineHeight: 1.55 }}>
                          A transcrição por IA está sendo processada — pode sair, avisamos quando estiver pronta.
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                )}
                {txState === 'ready' && <TranscriptView text={txText} transcriptAt={txAt} role="patient" />}
                {txState === 'error' && (
                  <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'divider', boxShadow: 'none' }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Stack spacing={1} alignItems="flex-start">
                        <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>Não foi possível carregar a transcrição no momento.</Typography>
                        <Button size="small" variant="outlined" onClick={() => setTxRetry((n) => n + 1)} sx={quickBtnSx}>Tentar de novo</Button>
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </Box>
            ) : (
              <Box sx={{ mt: 3 }}>
                <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: 'divider', boxShadow: 'none' }}>
                  <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: 'rgba(13,148,136,0.1)', color: '#0d9488', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <AssignmentIcon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                          <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                            {wasRealCall ? 'Transcrição da Consulta' : 'Entrada Rápida / Saída'}
                          </Typography>
                          <Chip size="small" label={wasRealCall ? 'Sem gravação autorizada' : 'Consulta Não Iniciada'} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(100,116,139,0.12)', color: 'text.secondary' }} />
                        </Stack>
                        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                          {wasRealCall
                            ? 'Por privacidade e diretriz do CFM (Res. 2.314/2022), a gravação e transcrição inteligente exigem consentimento prévio de ambas as partes. Esta chamada ocorreu sem gravação de áudio ativa.'
                            : 'Você entrou e saiu da sala antes da chamada começar. A teleconsulta permanece agendada para o seu horário.'}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* §3c — feedback só se a chamada realmente aconteceu (wasRealCall) */}
            {readOnly
              ? (areaSummary?.feedback ? (
                <Chip
                  size="small"
                  icon={<VerifiedIcon sx={{ fontSize: 13 }} />}
                  label={`Avaliação registrada (${areaSummary.feedback.rating}/5) ✓`}
                  sx={{ mt: 2.5, height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }}
                />
              ) : null)
              : (wasRealCall ? feedbackBlock : null)}

            {/* FIX 2 — contained ÚNICO. Read-only: "Voltar aos lembretes" e NADA de
                re-entrar (a consulta acabou — o join do server bloqueia mesmo). */}
            <Button variant="contained" fullWidth onClick={exitTo} sx={{ ...primaryBtn, mt: 3 }}>
              {readOnly ? 'Voltar aos lembretes' : 'Sair'}
            </Button>
            {!readOnly && (
              <Button variant="text" onClick={() => { setEnded(null); setPhase('prejoin'); setFbSent(false); setFbRating(null); }}
                sx={{ display: 'block', mx: 'auto', mt: 1, textTransform: 'none', fontWeight: 700, fontSize: 13, borderRadius: '999px', color: 'text.secondary' }}>
                Entrar de novo
              </Button>
            )}
          </Box>

          {/* Toast da área (respostas de pedido / cópia) */}
          {toast && (
            <Box sx={{ position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 24px)', left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, borderRadius: '999px', bgcolor: GLASS, backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER, color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1400, maxWidth: '90%', textAlign: 'center' }} role="status">
              {toast.text}
            </Box>
          )}
        </Box>
      );
    }

    // Médico — área pós-consulta (fix #9a): duração + pedidos de exame (read-only com
    // status) + transcrição (mesmo reader do paciente) + avaliação/anotações. Mesma
    // área rolável do paciente (o card centrado estourava com transcrição longa).
    const docReqs = areaSummary?.examRequests ?? [];
    const docTxReady = txState === 'ready';
    const docTxFailed = txState === 'error' && !!areaSummary?.transcript?.at;
    const docTxPending = !docTxReady && !docTxFailed && !!areaSummary?.transcript?.at;
    const docPatientName = summary?.patient?.name || statePatientName || '';
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
        <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pt: 'calc(env(safe-area-inset-top) + 20px)', pb: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
          {/* Voltar ao portal (template oficial do app — dono 26/10: área do médico
              só tinha o "Voltar aos lembretes" da área de paciente, nada pra ele). */}
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={exitTo}
            sx={{
              textTransform: 'none', fontWeight: 700, fontSize: 13,
              color: 'text.secondary', px: 1.5, py: 0.5, borderRadius: '99px',
              alignSelf: 'flex-start', mb: 0.5,
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,60,55,0.05)',
              '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15,60,55,0.09)' },
            }}
          >
            Voltar ao portal
          </Button>
          {/* Cabeçalho (mesma estrutura da área do paciente) */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
              <DrExame size={56} />
              <CheckCircleIcon sx={{ position: 'absolute', right: -5, bottom: -5, fontSize: 22, color: '#5fc9c3', bgcolor: 'background.default', borderRadius: '50%' }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
                Consulta encerrada
              </Typography>
              <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.25 }}>
                {docPatientName ? `Paciente: ${docPatientName} · ` : ''}duração {areaSummary?.durationHint || min}
              </Typography>
            </Box>
          </Stack>

          {/* Bater o olho (dono 23/10): os fatos da consulta em 1 linha — o médico
              reabre e SABE o que tem aqui sem caçar seção por seção. */}
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
            <Chip size="small" label={`⏱ ${areaSummary?.durationHint || min}`} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), borderRadius: '8px' }} />
            {docTxReady ? (
              <Chip size="small" label="Transcrição pronta" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), borderRadius: '8px' }} />
            ) : docTxPending ? (
              <Chip size="small" label="Transcrição processando…" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#b45309', borderRadius: '8px' }} />
            ) : docTxFailed ? (
              <Chip size="small" label="Transcrição não carregou — tente de novo" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#b45309', borderRadius: '8px' }} />
            ) : (
              <Chip size="small" label={areaSummary?.recordConsentAt || summary?.recordConsentAt ? 'Sem transcrição (áudio não capturado)' : 'Sem gravação'} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'action.hover', color: 'text.secondary', borderRadius: '8px' }} />
            )}
            {docReqs.length > 0 && (
              <Chip size="small" label={`${docReqs.length} pedido${docReqs.length > 1 ? 's' : ''} de exame`} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', borderRadius: '8px' }} />
            )}
            <Chip size="small" label={noteSaved ? 'Nota no prontuário' : 'Nota não salva'} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: noteSaved ? 'rgba(32,178,170,.10)' : 'action.hover', color: noteSaved ? (t) => tealText(t.palette.mode) : 'text.secondary', borderRadius: '8px' }} />
            {/* §19 G4: gravação retida no aparelho (upload falhou) — 1 toque retoma. */}
            {pendingRecCount > 0 && (
              <Chip
                size="small" clickable onClick={() => void retryPendingUploads()}
                label={`Gravação p/ reenviar${pendingRecCount > 1 ? ` (${pendingRecCount})` : ''} — toque p/ retomar`}
                sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#b45309', borderRadius: '8px', '&:focus-visible': { outline: '2px solid #f59e0b', outlineOffset: 1 } }}
              />
            )}
            {/* §14.1: status do resumo revisado — rascunho (âmbar) vs aprovado (teal). */}
            {areaSummary?.consultSummary?.status === 'approved' && (
              <Chip size="small" label="Resumo aprovado ✓" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), borderRadius: '8px' }} />
            )}
            {areaSummary?.consultSummary?.status === 'draft' && (
              <Chip size="small" label="Resumo em rascunho" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#b45309', borderRadius: '8px' }} />
            )}
          </Stack>

          {/* §14.1 — Resumo da consulta: rascunho da IA → revisão do médico → aprovação.
              Erro de geração = mensagem + retry; a nota manual (abaixo) segue independente. */}
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, flex: 1 }}>Resumo da consulta</Typography>
              {areaSummary?.consultSummary && (
                <Chip size="small" label={`versão ${areaSummary.consultSummary.version}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
              )}
            </Stack>
            <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'divider', boxShadow: 'none' }}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                {csBusy === 'generate' ? (
  <Box sx={{ py: 1 }}>
    <RobotAnalysis label="Gerando brief clínico…" />
  </Box>
) : csEditing ? (
                  <Stack spacing={1.25}>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                      Revise o rascunho antes de disponibilizar ao paciente. Nada é enviado sem sua aprovação.
                    </Typography>
                    <TextField
                      multiline
                      minRows={6}
                      maxRows={14}
                      fullWidth
                      value={csDraft}
                      onChange={(e) => setCsDraft(e.target.value)}
                      slotProps={{ htmlInput: { 'aria-label': 'Rascunho do resumo da consulta' } }}
                      sx={{ '& .MuiInputBase-root': { fontSize: 13.5, borderRadius: '12px', lineHeight: 1.6 } }}
                    />
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="contained" disabled={csBusy != null} onClick={() => void csSaveDraft()} sx={{ textTransform: 'none', fontWeight: 800, fontSize: 13, borderRadius: '999px' }}>
                        {csBusy === 'save' ? 'Salvando…' : 'Salvar rascunho'}
                      </Button>
                      <Button size="small" variant="outlined" disabled={csBusy != null || !csDraft.trim()} onClick={() => setCsApproveOpen(true)} sx={{ textTransform: 'none', fontWeight: 800, fontSize: 13, borderRadius: '999px', borderColor: 'rgba(32,178,170,.45)', color: (t) => tealText(t.palette.mode) }}>
                        Aprovar e disponibilizar
                      </Button>
                      <Button size="small" variant="text" disabled={csBusy != null} onClick={() => void csGenerate()} sx={{ textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'text.secondary' }}>
                        {csBusy === 'generate' ? 'Gerando…' : 'Gerar com IA ✨'}
                      </Button>
                      <Button size="small" variant="text" disabled={csBusy != null} onClick={() => { setCsEditing(false); setCsError(null); }} sx={{ textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'text.secondary' }}>
                        Cancelar
                      </Button>
                    </Stack>
                  </Stack>
                ) : !areaSummary?.consultSummary ? (
                  <Stack spacing={1.25} alignItems="flex-start">
                    <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55 }}>
                      Gere um rascunho com IA a partir dos dados da consulta (motivo, exames, transcrição e seus pedidos), revise e aprove. O paciente só vê depois da sua aprovação.
                    </Typography>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={csBusy != null}
                      onClick={() => void csGenerate()}
                      startIcon={csBusy === 'generate' ? <CircularProgress size={15} color="inherit" /> : null}
                      sx={{ textTransform: 'none', fontWeight: 800, fontSize: 13, borderRadius: '999px' }}
                    >
                      {csBusy === 'generate' ? 'Gerando rascunho…' : 'Gerar rascunho com IA ✨'}
                    </Button>
                  </Stack>
                ) : (() => {
                  const cs = areaSummary!.consultSummary!;
                  const approvedFmt = cs.approvedAt
                    ? new Date(cs.approvedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <Stack spacing={1.25}>
                      {cs.status === 'approved' && (
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <VerifiedIcon sx={{ fontSize: 16, color: (t) => tealText(t.palette.mode) }} />
                          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.secondary' }}>
                            Aprovado{approvedFmt ? ` · ${approvedFmt}` : ''} — visível ao paciente
                          </Typography>
                        </Stack>
                      )}
                      {cs.status === 'draft' && (
                        <Chip size="small" label="Rascunho — ainda não visível ao paciente" sx={{ alignSelf: 'flex-start', height: 24, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#b45309', borderRadius: '8px' }} />
                      )}
                      {renderSummaryMd((cs.status === 'approved' ? cs.summaryMd : cs.draftMd) ?? '')}
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" disabled={csBusy != null} onClick={() => { setCsDraft(String(cs.draftMd ?? cs.summaryMd ?? '')); setCsEditing(true); setCsError(null); }} sx={{ textTransform: 'none', fontWeight: 800, fontSize: 13, borderRadius: '999px', borderColor: 'rgba(32,178,170,.45)', color: (t) => tealText(t.palette.mode) }}>
                          {cs.status === 'approved' ? 'Editar (nova versão)' : 'Editar rascunho'}
                        </Button>
                        <Button size="small" variant="contained" disabled={csBusy != null} onClick={() => setCsApproveOpen(true)} sx={{ textTransform: 'none', fontWeight: 800, fontSize: 13, borderRadius: '999px' }}>
                          {csBusy === 'approve' ? 'Aprovando…' : 'Aprovar e disponibilizar ao paciente'}
                        </Button>
                      </Stack>
                    </Stack>
                  );
                })()}
                {csError && (
                  <Stack spacing={0.75} alignItems="flex-start" sx={{ mt: 1.5, p: 1.25, borderRadius: '12px', bgcolor: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)' }} role="alert">
                    <Typography sx={{ fontSize: 12.5, color: 'error.main', lineHeight: 1.5 }}>{csError}</Typography>
                    <Button size="small" variant="text" disabled={csBusy != null} onClick={() => void csGenerate()} sx={{ textTransform: 'none', fontWeight: 800, fontSize: 12.5, color: 'error.main', px: 0 }}>
                      Tentar de novo
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Box>

          {/* Confirmação curta antes de disponibilizar ao paciente (irreversível no
              histórico — sempre gera versão nova rastreável). */}
          <Dialog open={csApproveOpen} onClose={() => setCsApproveOpen(false)}>
            <DialogTitle>Aprovar o resumo?</DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55 }}>
                O texto atual do rascunho será disponibilizado ao paciente. Você pode editar e aprovar uma nova versão depois — o histórico fica registrado.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCsApproveOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Voltar</Button>
              <Button variant="contained" disabled={csBusy != null} onClick={() => void csApprove()} sx={{ textTransform: 'none', fontWeight: 800 }}>
                {csBusy === 'approve' ? 'Aprovando…' : 'Aprovar'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Pedidos de exame — mesmo card do paciente; médico vê status (read-only). */}
          {docReqs.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, mb: 1.25 }}>Pedidos de exame</Typography>
              <Stack spacing={1.25}>
                {docReqs.map((req) => (
                  <ExamRequestCard key={req.id} req={req} role="doctor" />
                ))}
              </Stack>
            </Box>
          )}

          {/* Transcrição — mesmo reader do paciente (role doctor = copiar tudo).
              Bug 26/10: pendente era card ESTÁTICO eterno; agora animado + erro com retry. */}
          {(docTxReady || docTxPending || docTxFailed) && (
            <Box sx={{ mt: 3 }}>
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, mb: 1.25 }}>Transcrição da Consulta</Typography>
              {docTxReady ? (
                <TranscriptView text={txText} transcriptAt={txAt} role="doctor" />
              ) : docTxFailed ? (
                <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'rgba(245,158,11,.35)', boxShadow: 'none' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}>
                      Não conseguimos carregar a transcrição desta consulta agora.
                    </Typography>
                    <Button
                      size="small" variant="outlined"
                      onClick={() => setTxRetry((n) => n + 1)}
                      sx={{ mt: 1, textTransform: 'none', fontWeight: 800, fontSize: 12.5, borderRadius: '999px', borderColor: 'rgba(32,178,170,.45)', color: (t) => tealText(t.palette.mode) }}
                    >
                      Tentar de novo
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <TranscriptView text={null} transcriptAt={txAt} role="doctor" state="processing" />
              )}
            </Box>
          )}

          {/* Avaliação + anotações (card original) */}
          <Box sx={{ mt: 3, p: 2, borderRadius: '16px', bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(32,178,170,0.06)', border: '1px solid', borderColor: 'rgba(32,178,170,0.18)', textAlign: 'left' }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mb: 1, textAlign: 'center' }}>
                Como foi a consulta?
              </Typography>

              <Stack direction="row" justifyContent="center" useFlexGap spacing={0.5} sx={{ mb: 1.5 }}>
                {[
                  { v: 1, icon: <SentimentVeryDissatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Péssima' },
                  { v: 2, icon: <SentimentDissatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Ruim' },
                  { v: 3, icon: <SentimentNeutralIcon sx={{ fontSize: 30 }} />, label: 'Ok' },
                  { v: 4, icon: <SentimentSatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Boa' },
                  { v: 5, icon: <SentimentVerySatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Ótima' },
                ].map((o) => (
                  <Tooltip key={o.v} title={o.label}>
                    <IconButton aria-label={o.label} onClick={() => { setFbRating(o.v); hapticLight(); void sendFeedback(o.v, fbNote || note); }}
                      sx={{ color: fbRating === o.v ? '#178f89' : 'text.secondary', bgcolor: fbRating === o.v ? 'rgba(32,178,170,0.18)' : 'transparent', '&:hover': { color: '#178f89', bgcolor: 'rgba(32,178,170,0.10)' }, width: 44, height: 44 }}>
                      {o.icon}
                    </IconButton>
                  </Tooltip>
                ))}
              </Stack>

              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>
                Toque para adicionar itens rápidos:
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75} sx={{ mb: 1.75 }}>
                {PRESET_TAGS.map((tag) => {
                  const sel = (fbNote || note).includes(tag);
                  return (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      clickable
                      onClick={() => togglePresetTag(tag)}
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: '999px',
                        bgcolor: sel ? 'rgba(32,178,170,0.22)' : 'rgba(0,0,0,0.04)',
                        color: sel ? '#178f89' : 'text.primary',
                        border: '1px solid',
                        borderColor: sel ? '#20b2aa' : 'divider',
                      }}
                    />
                  );
                })}
              </Stack>

              <TextField
                multiline
                minRows={3}
                maxRows={6}
                fullWidth
                size="small"
                value={note || fbNote}
                onChange={(e) => {
                  const val = e.target.value;
                  setNote(val);
                  setFbNote(val);
                  setNoteSaved(false);
                  setFbSent(false);
                }}
                placeholder="Anotações clínicas ou observações da consulta (opcional)…"
                slotProps={{ htmlInput: { 'aria-label': 'Anotações clínicas da consulta' } }}
                sx={{ '& .MuiInputBase-root': { fontSize: 13.5, borderRadius: '12px' } }}
              />

              {/* CID-10 (P0.3): diagnóstico estruturado — autocomplete na base oficial
                  DATASUS. Chip quando selecionado; busca quando limpo. Só o médico. */}
              {role === 'doctor' && (
                <Box sx={{ mt: 1 }}>
                  {cidSel ? (
                    <Chip
                      icon={<MedicalInformationIcon sx={{ fontSize: 15 }} />}
                      label={`${cidSel.code} · ${cidSel.desc}`}
                      onDelete={() => { setCidSel(null); setCidDirty(true); hapticLight(); }}
                      sx={{ height: 30, maxWidth: '100%', fontSize: 12.5, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode), borderRadius: '10px', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                    />
                  ) : (
                    <>
                      <TextField
                        size="small" fullWidth value={cidQuery}
                        onChange={(e) => setCidQuery(e.target.value)}
                        placeholder="CID-10 do diagnóstico — código ou nome (ex.: E11, diabetes)"
                        slotProps={{ htmlInput: { 'aria-label': 'Busca de código CID-10' } }}
                        sx={{ '& .MuiInputBase-root': { fontSize: 13, borderRadius: '12px' } }}
                      />
                      {cidResults.length > 0 && (
                        <Paper elevation={2} sx={{ mt: 0.5, borderRadius: '14px', overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                          {cidResults.slice(0, 6).map((o) => (
                            <Box
                              key={o.c} component="button" type="button"
                              onClick={() => { setCidSel({ code: o.c, desc: o.d }); setCidQuery(''); setCidResults([]); setCidDirty(true); hapticLight(); }}
                              sx={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 44, px: 1.5, py: 1, bgcolor: 'transparent', border: 0, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer', '&:last-child': { borderBottom: 0 }, '&:hover': { bgcolor: 'rgba(32,178,170,.07)' }, '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: -2 } }}
                            >
                              <Box component="span" sx={{ fontWeight: 800, fontSize: 13, color: (t) => tealText(t.palette.mode), mr: 1 }}>{o.c}</Box>
                              <Box component="span" sx={{ fontSize: 12.5, color: 'text.primary' }}>{o.d}</Box>
                            </Box>
                          ))}
                        </Paper>
                      )}
                    </>
                  )}
                </Box>
              )}

              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { void sendFeedback(fbRating ?? 5, note || fbNote); void saveNote(); }}
                  disabled={fbSent && noteSaved}
                  sx={{
                    borderRadius: '999px',
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    borderColor: 'rgba(32,178,170,.45)',
                    color: (t) => tealText(t.palette.mode),
                    '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.06)' },
                  }}
                >
                  {noteSaved ? 'Anotação salva ✓' : 'Salvar avaliação e anotações'}
                </Button>
                {noteSaved && (
                  <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 13 }} />} label="Salva no aparelho" sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />
                )}
              </Stack>
          </Box>

          <Button variant="contained" fullWidth onClick={exitTo} sx={{ ...primaryBtn, mt: 3 }}>
            Voltar ao Prontuário
          </Button>
        </Box>

        {/* Toast da área (igual ao do paciente) */}
        {toast && (
          <Box sx={{ position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 24px)', left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, borderRadius: '999px', bgcolor: GLASS, backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER, color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1400, maxWidth: '90%', textAlign: 'center' }} role="status">
            {toast.text}
          </Box>
        )}
      </Box>
    );
  }

  // Lifecycle §1 (24/10): sala de espera — a janela do server ainda não abriu.
  if (phase === 'waiting') {
    void nowTick; // countdown re-renderiza a cada 1s
    const opensMs = opensAt ? new Date(opensAt).getTime() : NaN;
    const opensFmt = Number.isNaN(opensMs) ? null : new Date(opensMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const remainMs = Number.isNaN(opensMs) ? null : Math.max(0, opensMs - Date.now());
    const remainTxt = remainMs == null ? '' : remainMs <= 45_000 ? 'Abre em instantes.' : `Faltam ${Math.ceil(remainMs / 60_000)} min.`;
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px' }} elevation={4}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
            {/* §19 G3 (QA 24/10): identificação na espera — quem vai atender / quem
                espero, com FOTO REAL (mesma identidade das listas). Fallback ícone. */}
            {(() => {
              const otherName = role === 'patient'
                ? (summary?.doctor?.name ? (summary.doctor.name.toLowerCase().startsWith('dr') ? summary.doctor.name : `Dr(a). ${summary.doctor.name}`) : null)
                : summary?.patient?.name ?? null;
              const otherPhoto = role === 'patient'
                ? (summary?.doctor?.id ? doctorPhotoUrl(summary.doctor.id) : undefined)
                : (summary?.patient?.id ? photoUrlFor(summary.patient.id) : undefined);
              if (!otherName) return (
                <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '18px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)' }}>
                  <AccessTimeIcon sx={{ fontSize: 32, color: (t) => tealText(t.palette.mode) }} />
                </Box>
              );
              return (
                <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <Avatar src={otherPhoto} alt={otherName} sx={{ width: 64, height: 64, borderRadius: '18px', fontSize: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }}>
                    {initials(otherName)}
                  </Avatar>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: '"Poppins",sans-serif' }}>
                    {role === 'patient' ? `Consulta com ${otherName}` : `Aguardando ${otherName}`}
                  </Typography>
                </Stack>
              );
            })()}
            <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1 }}>
              {opensFmt ? `A consulta abre às ${opensFmt}` : 'A consulta ainda não abriu'}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2.5, lineHeight: 1.6 }}>
              {opensFmt ? `A entrada é liberada 5 minutos antes do horário. ${remainTxt}` : 'Tente novamente em instantes.'}
            </Typography>
            <Button variant="contained" fullWidth startIcon={<CallIcon />} onClick={() => void startJoin()} sx={primaryBtn}>
              Atualizar
            </Button>
            <Button onClick={exitTo} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700, borderRadius: '999px', color: 'text.secondary' }}>
              {role === 'doctor' ? 'Voltar ao Portal do Médico' : 'Voltar aos Meus Lembretes'}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Lifecycle §2 (24/10): consulta particular com PIX pendente — o join é barrado
  // até o pagamento. Paciente volta aos lembretes (o PIX vive lá); médico é
  // informado e segue no portal.
  if (phase === 'payment') {
    const priceTxt = payPriceCents != null ? `R$ ${(payPriceCents / 100).toFixed(2).replace('.', ',')}` : '';
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px' }} elevation={4}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
            <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '18px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(212,165,116,.16)' }}>
              <PaymentsIcon sx={{ fontSize: 32, color: COPPER }} />
            </Box>
            {role === 'patient' ? (
              <>
                <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1 }}>
                  Consulta particular{priceTxt ? ` — ${priceTxt}` : ''}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2.5, lineHeight: 1.6 }}>
                  O pagamento confirma a sua entrada. Pague com PIX na área de lembretes e volte para entrar na consulta.
                </Typography>
                <Button variant="contained" fullWidth onClick={() => { hapticLight(); exitTo(); }} sx={primaryBtn}>
                  Ir para o pagamento
                </Button>
              </>
            ) : (
              <>
                <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1 }}>
                  Paciente ainda não pagou{priceTxt ? ` (${priceTxt})` : ''}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2.5, lineHeight: 1.6 }}>
                  A entrada na chamada é liberada para o paciente após o pagamento do PIX.
                </Typography>
                <Button variant="contained" fullWidth onClick={() => { hapticLight(); exitTo(); }} sx={primaryBtn}>
                  Voltar ao Portal do Médico
                </Button>
              </>
            )}
            <Button variant="outlined" fullWidth disabled={recheckBusy} onClick={() => void recheckPay()} startIcon={recheckBusy ? <CircularProgress size={16} color="inherit" /> : null} sx={{ mt: 1.25, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, height: 44, borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: 'text.secondary' } }}>
              {recheckBusy ? 'Verificando…' : 'Já paguei — verificar de novo'}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (phase === 'fallback') {
    const isMeet = /meet\.google\.com/i.test(fallbackLink || '');
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px' }} elevation={4}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
            <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '18px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)' }}>
              <VideocamOffIcon sx={{ fontSize: 32, color: (t) => tealText(t.palette.mode) }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1 }}>
              {unsupported ? 'Chamada de vídeo não disponível neste aparelho' : 'Teleconsulta pelo app indisponível'}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2.5, lineHeight: 1.6 }}>
              {unsupported
                ? 'Seu aparelho não suporta chamada de vídeo no app.'
                : fallbackLink
                  ? 'A chamada pelo app não está disponível agora. Você pode entrar pelo link da consulta:'
                  // P3-reviewer: 501 SEM link (rollback de config) não pode ser beco sem saída.
                  : 'A chamada pelo app está desativada agora — entre em contato com o consultório para receber o link da consulta.'}
            </Typography>
            {fallbackLink && (
              <Button variant="contained" fullWidth startIcon={<OpenInNewIcon />} onClick={() => { hapticLight(); void openTelemedicinaRoom(fallbackLink); }} sx={primaryBtn}>
                {isMeet ? 'Abrir no Meet' : 'Abrir link da chamada'}
              </Button>
            )}
            <Button onClick={exitTo} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700, borderRadius: '999px', color: 'text.secondary' }}>
              {role === 'doctor' ? 'Voltar à ficha' : 'Voltar aos lembretes'}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px' }} elevation={4}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1 }}>Não achamos esta consulta</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2.5 }}>
              Ela pode ter sido removida, ou sua sessão expirou.
            </Typography>
            <Button variant="contained" fullWidth onClick={exitTo} sx={primaryBtn}>
              {role === 'doctor' ? 'Voltar à ficha' : 'Voltar aos lembretes'}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (phase === 'connecting') {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: CALL_BG, display: 'grid', placeItems: 'center' }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress sx={{ color: '#20b2aa' }} />
          <Typography sx={{ color: 'rgba(255,255,255,.85)', fontWeight: 700, fontSize: 15 }}>Conectando…</Typography>
        </Stack>
      </Box>
    );
  }

  // Pré-join + loading — ou WHATSAPP-STYLE incoming call quando médico já tá na sala
  const showConsent = role === 'patient' && !summary?.consentAt;
  // Banner "instale o app" (23/10): quem chega num LINK de consulta pelo navegador
  // Android não tem o app instalado (com App Link verificado, o app abriria direto).
  // Oferece a Play Store sem sequestrar a web — a consulta funciona no navegador.
  const showInstallBanner = role === 'patient' && !Capacitor.isNativePlatform() && /android/i.test(navigator.userAgent) && !installDismissed;
  const isIncomingCall = role === 'patient' && !!summary?.doctorInRoom && phase === 'prejoin';
  if (isIncomingCall) {
    const docName = summary?.doctor?.name || 'Seu médico';
    return (
      <Box sx={{ ...CALL_BG_STYLE, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, pt: 'calc(env(safe-area-inset-top) + 40px)' }}>
        {/* Anéis pulsantes ao redor da foto (estilo telefone chamando) */}
        <Box sx={{ position: 'relative', mb: 3 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{
              position: 'absolute', inset: -(20 + i * 22), borderRadius: '50%',
              border: '2px solid rgba(32,178,170,0.25)',
              animation: `dxRingExpand 2s ease-out ${i * 0.4}s infinite`,
              '@keyframes dxRingExpand': {
                '0%': { transform: 'scale(0.8)', opacity: 0.8 },
                '100%': { transform: 'scale(1.4)', opacity: 0 },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.2 },
            }} />
          ))}
          <Avatar
            src={summary?.doctor?.id ? doctorPhotoUrl(summary.doctor.id) : undefined}
            sx={{
              width: 120, height: 120, fontSize: 42, fontWeight: 800,
              bgcolor: 'rgba(32,178,170,.15)', color: '#5fc9c3',
              border: '4px solid rgba(32,178,170,.4)',
              boxShadow: '0 0 48px rgba(32,178,170,.3)',
            }}
          >
            {docName.charAt(0).toUpperCase()}
          </Avatar>
        </Box>
        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 22, fontFamily: '"Poppins",sans-serif', mb: 0.5 }}>
          {docName}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,.6)', fontSize: 14, mb: 5 }}>
          {summary?.doctor?.specialty ? `${summary.doctor.specialty} · ` : ''}Chamada de vídeo…
        </Typography>
        {/* Botões: verde atender + vermelho recusar */}
        <Stack direction="row" spacing={6} alignItems="center">
          <Box sx={{ textAlign: 'center' }}>
            <IconButton
              aria-label="Recusar chamada"
              onClick={() => { hapticLight(); exitTo(); }}
              sx={{
                width: 64, height: 64, bgcolor: '#ef4444', color: '#fff',
                '&:hover': { bgcolor: '#dc2626', transform: 'scale(1.05)' },
                transition: 'all .2s', boxShadow: '0 4px 20px rgba(239,68,68,.4)',
              }}
            >
              <CallEndIcon sx={{ fontSize: 28 }} />
            </IconButton>
            <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 12, mt: 1 }}>Recusar</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <IconButton
              aria-label={showConsent ? 'Autorizar e atender' : 'Atender chamada'}
              onClick={() => void consentAndJoin()}
              disabled={joinLoading || (camState === 'denied' && micDenied)}
              sx={{
                width: 64, height: 64, bgcolor: '#059669', color: '#fff',
                '&:hover': { bgcolor: '#047857', transform: 'scale(1.05)' },
                '&:disabled': { bgcolor: '#05966980' },
                transition: 'all .2s', boxShadow: '0 4px 20px rgba(5,150,105,.4)',
                '@media (prefers-reduced-motion: no-preference)': {
                  animation: 'dxAnswerPulse 1.5s ease-in-out infinite',
                  '@keyframes dxAnswerPulse': { '0%,100%': { boxShadow: '0 4px 20px rgba(5,150,105,.3)' }, '50%': { boxShadow: '0 4px 32px rgba(5,150,105,.6)' } },
                },
              }}
            >
              {joinLoading ? <CircularProgress size={26} sx={{ color: '#fff' }} /> : <VideocamIcon sx={{ fontSize: 28 }} />}
            </IconButton>
            <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 12, mt: 1 }}>{showConsent ? 'Autorizar' : 'Atender'}</Typography>
          </Box>
        </Stack>
        {showConsent && (
          <Typography sx={{ color: 'rgba(255,255,255,.35)', fontSize: 12, mt: 4, maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
            Ao atender, você autoriza a telemedicina conforme o Art. 15 da Res. CFM 2.314/2022.
          </Typography>
        )}
        {/* F3 §1 fix 23/10: opt-in de gravação também na chamada recebida — antes
            só existia no pré-join "cold", então quem atendia o push nunca via
            (médico dentro → patient answer → gravação morta). Compacto: não
            atrapalha o gesto de atender. */}
        {role === 'patient' && !summary?.recordConsentAt && summary?.stt !== false && (
          <FormControlLabel
            disableTypography
            label={(
              <Typography sx={{ color: 'rgba(255,255,255,.75)', fontSize: 12.5, lineHeight: 1.4, userSelect: 'none', maxWidth: 240 }}>
                Autorizo gravar o áudio p/ transcrição (opcional)
              </Typography>
            )}
            control={(
              <Checkbox
                checked={recordAudio}
                onChange={(e) => setRecordAudio(e.target.checked)}
                inputProps={{ 'aria-label': 'Autorizar gravação de áudio para transcrição' }}
                sx={{ color: 'rgba(255,255,255,.6)', p: '8px', '&.Mui-checked': { color: '#5fc9c3' }, '& .MuiSvgIcon-root': { fontSize: 22 }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 2 } }}
              />
            )}
            sx={{ alignItems: 'flex-start', m: 0, mt: 1.5 }}
          />
        )}
      </Box>
    );
  }
  const ctaLabel = 'Entrar na consulta';
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 1.5 }}>
      <Card
        sx={{
          maxWidth: 440,
          width: '100%',
          borderRadius: '24px',
          border: '1.5px solid',
          borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(13,148,136,0.35)' : 'rgba(13,148,136,0.22)',
          boxShadow: (t) => t.palette.mode === 'dark' ? '0 16px 48px rgba(0,0,0,0.6)' : '0 14px 40px rgba(13,148,136,0.12)',
        }}
        elevation={0}
      >
        <CardContent sx={{ p: 2.75 }}>
          {showInstallBanner && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, mb: 1.5, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.08)', border: '1px solid rgba(32,178,170,.3)' }}>
              <Box sx={{ flexShrink: 0 }}><DrExame size={34} /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>Prefere pelo app?</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>Instale o Dr. Exame — links de consulta abrem direto nele.</Typography>
              </Box>
              <Button size="small" variant="contained" href="https://play.google.com/store/apps/details?id=com.janocaminho.drexame" target="_blank" rel="noopener" sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12.5, px: 1.5, minWidth: 0, flexShrink: 0 }}>Instalar</Button>
              <IconButton size="small" aria-label="Dispensar aviso do app" onClick={() => { try { localStorage.setItem('dx_install_banner_off', '1'); } catch { /* storage bloqueado — some só desta sessão */ } setInstallDismissed(true); }} sx={{ flexShrink: 0, color: 'text.secondary' }}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          )}
          <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1.5 }}>
            Sua teleconsulta vai começar
          </Typography>

          {/* Preview espelhado com controles flutuantes modernos */}
          <Box
            sx={{
              position: 'relative',
              aspectRatio: '16 / 9',
              borderRadius: '16px',
              overflow: 'hidden',
              bgcolor: '#0c1818',
              mb: 1.25,
              border: '1px solid',
              borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            }}
          >
            {camState === 'ok' && camOn ? (
              <>
                <video ref={previewVideo} playsInline autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                {phase === 'prejoin' && (
                  <Chip
                    size="small"
                    label="Pré-visualização da câmera"
                    sx={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      height: 24,
                      fontSize: 11.5,
                      fontWeight: 700,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      borderRadius: '8px',
                    }}
                  />
                )}
              </>
            ) : (
              <Stack
                spacing={1}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (t) => (t.palette.mode === 'dark' ? '#141d1d' : '#f0fdfa'),
                }}
              >
                <Avatar
                  src={role === 'doctor' ? doctorPhotoUrl(summary?.doctor?.id || '') : photoUrlFor(summary?.patient?.id || '')}
                  sx={{
                    width: 70,
                    height: 70,
                    fontSize: 26,
                    fontWeight: 800,
                    bgcolor: 'rgba(32,178,170,.18)',
                    color: '#0d9488',
                    border: '2px dashed rgba(32,178,170,.45)',
                  }}
                >
                  {initials(role === 'doctor' ? doctor?.name : (summary?.patient?.name || statePatientName))}
                </Avatar>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
                  {camOn ? 'Iniciando câmera…' : 'Câmera desativada'}
                </Typography>
              </Stack>
            )}

            {/* Controles flutuantes de pré-join (Câmera, Mic, Teste de Som) */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                position: 'absolute',
                bottom: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                bgcolor: 'rgba(15,23,42,0.78)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: '999px',
                p: '4px 8px',
                border: '1px solid rgba(255,255,255,0.18)',
                zIndex: 2,
              }}
            >
              <Tooltip title={camOn ? 'Desativar câmera' : 'Ativar câmera'}>
                <IconButton
                  size="small"
                  onClick={togglePreviewCam}
                  sx={{
                    color: '#fff',
                    bgcolor: camOn ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.85)',
                    '&:hover': { bgcolor: camOn ? 'rgba(255,255,255,0.22)' : 'rgba(220,38,38,0.95)' },
                    width: 34,
                    height: 34,
                  }}
                >
                  {camOn ? <VideocamIcon sx={{ fontSize: 18 }} /> : <VideocamOffIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </Tooltip>

              <Tooltip title={micOn ? 'Mutar microfone' : 'Ativar microfone'}>
                <IconButton
                  size="small"
                  onClick={togglePreviewMic}
                  sx={{
                    color: '#fff',
                    bgcolor: micOn ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.85)',
                    '&:hover': { bgcolor: micOn ? 'rgba(255,255,255,0.22)' : 'rgba(220,38,38,0.95)' },
                    width: 34,
                    height: 34,
                  }}
                >
                  {micOn ? <MicIcon sx={{ fontSize: 18 }} /> : <MicOffIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Testar som dos alto-falantes">
                <Button
                  size="small"
                  onClick={testAudioSound}
                  startIcon={soundTested ? <CheckCircleIcon sx={{ fontSize: 15, color: '#10b981' }} /> : <VolumeUpIcon sx={{ fontSize: 15 }} />}
                  sx={{
                    color: soundTested ? '#10b981' : '#fff',
                    bgcolor: soundTested ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.12)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: '999px',
                    height: 34,
                    px: 1.25,
                    minWidth: 0,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
                  }}
                >
                  {soundTested ? 'Som OK!' : 'Testar Som'}
                </Button>
              </Tooltip>
            </Stack>

            {camState === 'denied' && (
              <Chip size="small" label="Câmera bloqueada" sx={{ position: 'absolute', top: 8, left: 8, height: 24, fontSize: 12, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
            )}
            {camState === 'nodevice' && (
              <Chip size="small" label="Sem câmera" sx={{ position: 'absolute', top: 8, left: 8, height: 24, fontSize: 12, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
            )}
            {phase === 'loading' && <CircularProgress size={22} sx={{ position: 'absolute', top: 10, right: 10, color: '#5fc9c3' }} />}
          </Box>

          {/* Diagnóstico Rápido de Dispositivo & Reafirmação Clínica */}
          <Box
            sx={{
              p: 1.25,
              borderRadius: '12px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
              border: '1px solid',
              borderColor: 'divider',
              mb: 1.5,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#10b981' }} />
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary' }}>
                Conexão Segura Criptografada (LiveKit E2EE)
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ fontSize: 11.5, color: 'text.secondary', display: 'block' }}>
              Áudio e vídeo de alta fidelidade protegidos conforme Resolução CFM 2.314/2022.
            </Typography>
          </Box>

          {/* CTA de permissão (câmera) — não bloqueia a entrada (exceto mic também negado) */}
          {camState === 'denied' && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Button size="small" variant="outlined" onClick={() => void openPreview()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode), borderColor: 'rgba(32,178,170,.4)' }}>
                Permitir câmera
              </Button>
              <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>
                {micDenied ? 'Libere o microfone também — sem ele a consulta não acontece.' : 'Você também pode entrar só com áudio.'}
              </Typography>
            </Stack>
          )}
          {/* fix #13d: câmera E microfone negados → sem mídia não existe consulta. */}
          {camState === 'denied' && micDenied && (
            <Typography role="alert" sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, mb: 0.5, color: 'error.main' }}>
              Sem câmera nem microfone não é possível consultar. Libere pelo menos um.
            </Typography>
          )}

          {/* Resumo */}
          <Stack spacing={0.25} sx={{ mt: 1.25 }}>
            {doctor?.name ? (
              <Typography sx={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <span>🩺</span><span>{doctor.name}</span>
                {doctor.crm ? <span style={{ fontWeight: 600, color: theme.palette.text.secondary }}>· CRM {doctor.crm}</span> : null}
              </Typography>
            ) : role === 'patient' ? (
              <Typography sx={{ fontSize: 14, fontWeight: 700 }}>🩺 Teleconsulta médica</Typography>
            ) : null}
            {summary?.title && <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>{summary.title}</Typography>}
            {summary?.dueDate && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{dueShort(summary.dueDate)}</Typography>}
          </Stack>

          {/* Card de Presença Clínica & Status Humano da Sala */}
          <Box
            sx={{
              mt: 1.5,
              p: 1.5,
              borderRadius: '16px',
              border: '1.5px solid',
              borderColor: summary?.doctorInRoom || (role === 'doctor' && otherJoined)
                ? 'rgba(16,185,129,0.35)'
                : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(13,148,136,0.18)',
              bgcolor: summary?.doctorInRoom || (role === 'doctor' && otherJoined)
                ? (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.08)' : 'rgba(236,253,245,0.85)'
                : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(240,253,250,0.6)',
              boxShadow: summary?.doctorInRoom
                ? '0 4px 16px rgba(16,185,129,0.12)'
                : 'none',
              transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              {role === 'patient' ? (
                <>
                  <Box sx={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar
                      src={summary?.doctor?.id ? doctorPhotoUrl(summary.doctor.id) : undefined}
                      sx={{
                        width: 46,
                        height: 46,
                        fontSize: 16,
                        fontWeight: 800,
                        bgcolor: 'rgba(32,178,170,.18)',
                        color: (t) => tealText(t.palette.mode),
                        border: '2px solid',
                        borderColor: summary?.doctorInRoom ? '#10b981' : 'rgba(32,178,170,.4)',
                      }}
                    >
                      {initials(doctor?.name)}
                    </Avatar>
                    {/* Indicador pulsante em tempo real */}
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        bgcolor: summary?.doctorInRoom ? '#10b981' : '#f59e0b',
                        border: '2px solid #fff',
                        boxShadow: summary?.doctorInRoom ? '0 0 8px #10b981' : 'none',
                        animation: summary?.doctorInRoom ? 'dxBeaconPulse 1.8s infinite ease-in-out' : 'none',
                        '@keyframes dxBeaconPulse': {
                          '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                          '50%': { transform: 'scale(1.25)', opacity: 0.8 },
                        },
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 800, color: 'text.primary' }}>
                        {doctor?.name || 'Médico(a)'}
                      </Typography>
                      {doctor?.specialty && (
                        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>
                          · {doctor.specialty}
                        </Typography>
                      )}
                    </Stack>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: summary?.doctorInRoom ? '#059669' : 'text.secondary', mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {summary?.doctorInRoom ? (
                        <>
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }} />
                          Dr(a). já está na sala aguardando você!
                        </>
                      ) : (
                        'Aguardando o médico · A sala abre 5 min antes'
                      )}
                    </Typography>
                  </Box>
                </>
              ) : (
                <>
                  <Box sx={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar
                      src={photoUrlFor(summary?.patient?.id || summary?.patientId || '')}
                      sx={{
                        width: 46,
                        height: 46,
                        fontSize: 16,
                        fontWeight: 800,
                        bgcolor: 'rgba(32,178,170,.18)',
                        color: (t) => tealText(t.palette.mode),
                        border: '2px solid rgba(32,178,170,.4)',
                      }}
                    >
                      {initials(summary?.patient?.name || statePatientName)}
                    </Avatar>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 800 }}>
                      {summary?.patient?.name || statePatientName || 'Paciente'}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                      {summary?.consentAt ? 'Telemedicina autorizada pelo paciente' : 'Aguardando confirmação do paciente'}
                    </Typography>
                  </Box>
                  <Tooltip title="Compartilhar link de entrada com o paciente">
                    <IconButton
                      aria-label="Compartilhar link com o paciente"
                      onClick={() => void shareConsult()}
                      sx={{
                        color: (t) => tealText(t.palette.mode),
                        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                      }}
                    >
                      <ShareIcon sx={{ fontSize: 19 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          </Box>

          {/* Dica interativa humanizada do Dr. Exame */}
          <Box
            onClick={() => setPrepTipIdx((prev) => (prev + 1) % PREP_TIPS.length)}
            sx={{
              mt: 1.5,
              p: 1.25,
              borderRadius: '12px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: '1px dashed',
              borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'background-color 0.2s ease',
              '&:hover': {
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
              },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ fontSize: 18, lineHeight: 1 }}>{PREP_TIPS[prepTipIdx].icon}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
                  Dica de Preparo: {PREP_TIPS[prepTipIdx].title}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.35, mt: 0.25 }}>
                  {PREP_TIPS[prepTipIdx].desc}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 10, color: 'text.disabled', fontWeight: 600 }}>
                {prepTipIdx + 1}/{PREP_TIPS.length}
              </Typography>
            </Stack>
          </Box>

          {/* Consentimento (Art. 15 / CFM 2.314/22) — mesmo texto do dialog do Reminders */}
          {showConsent && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.65, mt: 1.5 }}>{CONSENT_TEXT}</Typography>
          )}
          {role === 'patient' && summary?.consentAt && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>✓ Telemedicina autorizada</Typography>
          )}
          {/* F3 §1: gravação p/ transcrição — checkbox SEPARADO do consent Art.15 (divisor
              hairline + 12px), default OFF, sem nudge visual. Opt-in honesto: a consulta
              funciona sem. Médico não vê (o titular do dado é o paciente). Fix 23/10:
              aparece sempre que ainda não há recordConsent — antes vinha só junto do
              Art.15 pendente e quem consentiu na marcação nunca via (gravação morta).
              reviewer-L: some quando o server não transcreve (stt flag do join/summary) —
              ausência é a mensagem, nunca promessa falsa. */}
          {role === 'patient' && !summary?.recordConsentAt && summary?.stt !== false && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <FormControlLabel
                disableTypography
                label={(
                  <Box sx={{ userSelect: 'none' }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>Autorizo gravar o áudio p/ transcrição</Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mt: 0.25 }}>
                      Opcional — a consulta funciona sem. O áudio é apagado assim que o texto da consulta fica pronto.
                    </Typography>
                  </Box>
                )}
                control={(
                  <Checkbox
                    checked={recordAudio}
                    onChange={(e) => setRecordAudio(e.target.checked)}
                    inputProps={{ 'aria-label': 'Autorizo gravar o áudio para gerar transcrição' }}
                    sx={{
                      color: '#20b2aa', p: '10px', borderRadius: '10px',
                      '&.Mui-checked': { color: '#20b2aa' },
                      '& .MuiSvgIcon-root': { fontSize: 24 },
                      '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 2 },
                    }}
                  />
                )}
                sx={{ alignItems: 'flex-start', m: 0 }}
              />
            </Box>
          )}
          {role === 'doctor' && summary && !summary.consentAt && (
            <Chip size="small" label="Paciente ainda não autorizou" sx={{ mt: 1.5, height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(217,119,6,.14)', color: '#b45309', borderRadius: '8px' }} />
          )}

          <Button variant="contained" fullWidth disabled={phase === 'loading' || joinLoading || (camState === 'denied' && micDenied)} onClick={() => void consentAndJoin()} startIcon={joinLoading ? <CircularProgress size={18} sx={{ color: 'rgba(255,255,255,.8)' }} /> : <VideocamIcon />}
            sx={{ ...primaryBtn, mt: 2 }}>
            {ctaLabel}
          </Button>
          <Button
            variant="outlined"
            fullWidth
            onClick={exitTo}
            sx={{
              mt: 1.25,
              borderRadius: '999px',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13.5,
              height: 44,
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover', borderColor: 'text.secondary', color: 'text.primary' },
            }}
          >
            {role === 'doctor' ? 'Voltar ao Portal do Médico' : 'Voltar aos Meus Lembretes'}
          </Button>
          {showConsent && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', mt: 1.25, lineHeight: 1.5 }}>
              Ao entrar, você autoriza a telemedicina (Art. 15, Res. CFM 2.314/2022).
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Toast do pré-join (erros do join) */}
      {toast && (
        <Box sx={{ position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 24px)', left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, borderRadius: '999px', bgcolor: GLASS, backdropFilter: GLASS_FILTER, color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1400, maxWidth: '90%', textAlign: 'center' }} role="status">
          {toast.text}
        </Box>
      )}
    </Box>
  );
};
