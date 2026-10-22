// Teleconsulta in-app (LiveKit) — F2, 19/10/26. Spec: docs/design/2026-10-19-livekit-fase2-ux.md
// Rota imersiva /teleconsulta/:id (fora do AppLayout — sem bottom-nav/menu).
// Fases: loading → prejoin → connecting → incall → ended · fallback (501/navegador) · error.
// Degradação da casa: join 501/não suportado → tela fallback com "Abrir no Meet" (linkUrl).
// Regras de ouro: TODOS os hooks antes de qualquer early-return (React #310); nunca
// reload() (crasha o APK); zero jargão ("consulta/chamada", nunca room/track/token).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography, useTheme, Avatar } from '@mui/material';
import CallEndIcon from '@mui/icons-material/CallEnd';
import AssignmentIcon from '@mui/icons-material/Assignment';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import VerifiedIcon from '@mui/icons-material/Verified';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import SentimentSatisfiedIcon from '@mui/icons-material/SentimentSatisfied';
import SentimentVerySatisfiedIcon from '@mui/icons-material/SentimentVerySatisfied';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Room, RoomEvent, Track, isBrowserSupported, type LocalVideoTrack, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication, type TrackPublication } from 'livekit-client';
import { API_URL, token, photoUrlFor, doctorPhotoUrl } from '../config';
import { Capacitor } from '@capacitor/core';
import { DrExame } from '../components/DrExame';
import { openTelemedicinaRoom } from '../utils/telemedicina';
import { hapticError, hapticLight, hapticSuccess } from '../utils/haptic';
import { tealText } from '../theme';
// F3 — componentes compartilhados da área de teleconsulta (fe2): 1 padrão só p/
// médico e paciente. Contratos: docs/research/2026-10-20-f3-arquitetura.md §3.
import { ExamRequestCard } from '../components/teleconsulta/ExamRequestCard';
import { TranscriptView } from '../components/teleconsulta/TranscriptView';
import type { ExamRequest, ExamRequestAction, TeleconsultaSummary as TeleSummary } from '../components/teleconsulta/types';

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
const CONSENT_TEXT =
  'Autorizo o atendimento por telemedicina e a transmissão de imagens e dados nesta consulta, conforme a Resolução CFM 2.314/2022. Sei que posso negar ou revogar este consentimento a qualquer momento, e que ele fica registrado com data e hora.';

type Phase = 'loading' | 'prejoin' | 'connecting' | 'incall' | 'ended' | 'readonly' | 'fallback' | 'error';
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
  doctor?: { id?: string; name?: string; crm?: string; specialty?: string; photoUrl?: string } | null;
  patient?: { id?: string; name?: string; photoUrl?: string } | null;
  patientId?: string;
  doctorInRoom?: boolean; // WhatsApp-style: médico já entrou → pré-join vira "chamada recebida"
  stt?: boolean; // reviewer-L: server transcreve? false esconde o checkbox de gravação
}
// Data rápida p/ "Agendar" (§2b): 09:00 do dia escolhido, fuso do usuário.
const dueAtDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return d.toISOString(); };
interface RemoteView {
  identity: string;
  name: string;
  isDoctor: boolean;
  track: RemoteTrack | null;
  muted: boolean;
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

  const [phase, setPhase] = useState<Phase>('loading');
  const [camState, setCamState] = useState<CamState>('pending');
  const [joinLoading, setJoinLoading] = useState(false);
  const [banner, setBanner] = useState<'connecting' | 'reconnecting' | null>(null);
  const [toast, setToast] = useState<{ text: string; k: number } | null>(null);
  const [remotes, setRemotes] = useState<RemoteView[]>([]);
  const [otherJoined, setOtherJoined] = useState(false); // alguém já entrou (para diferenciar "aguardando" de "saiu")
  const [remoteLeft, setRemoteLeft] = useState<string | null>(null); // nome de quem saiu ("Dr(a). X saiu da chamada")
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [ended, setEnded] = useState<{ sec: number } | null>(null);
  const [fallbackLink, setFallbackLink] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  // Feedback pós-chamada (dono 19/10: "quando encerra tem que ter algo pronto pra falar
  // se a chamada foi boa ou não") — 1 toque + nota opcional → audit TELECONSULTA_FEEDBACK.
  const [fbRating, setFbRating] = useState<number | null>(null);
  const [fbNote, setFbNote] = useState('');
  const [fbSent, setFbSent] = useState(false);
  const sendFeedback = async (rating: number, customNote?: string) => {
    setFbRating(rating);
    const text = customNote !== undefined ? customNote : fbNote;
    try {
      // reviewer-J: authToken() é role-aware — token() mandaria Bearer null no portal.
      await fetch(`${API_URL}/teleconsulta/${reminderId}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ rating, note: text.trim() || undefined }),
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
  const [examQueue, setExamQueue] = useState<ExamRequest[]>([]); // pedidos novos chegando in-call
  const [reqBusy, setReqBusy] = useState<string | null>(null);
  const [schedFor, setSchedFor] = useState<string | null>(null); // req com quick-chips "Agendar" abertos (§3a)
  const [areaSummary, setAreaSummary] = useState<TeleSummary | null>(null); // §3 — área "Resumo da consulta"
  const [txState, setTxState] = useState<'pending' | 'ready' | 'error'>('pending'); // §3b transcrição
  const [txText, setTxText] = useState<string | null>(null);
  const [txAt, setTxAt] = useState<string | null>(null);
  const [txRetry, setTxRetry] = useState(0); // "Tentar de novo" religa o poll
  const seenReqIds = useRef<Set<string>>(new Set()); // ids já notificados (diff do poll 20s)
  const dismissedReqIds = useRef<Set<string>>(new Set()); // "Depois" — não reacende o painel nesta sessão

  // ── F3 reviewer-A (alto): gravação da chamada pelo LADO MÉDICO (contrato §4).
  // MediaRecorder captura mic local + áudio remoto (webm/opus) → upload no encerrar
  // → server transcreve (Groq) → transcript cifrado. Áudio efêmero (LGPD).
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recUpload, setRecUpload] = useState<'idle' | 'up' | 'ok' | 'fail'>('idle');
  // ── F3 reviewer-B (alto): botão "Solicitar exame" IN-CALL do médico.
  const [reqOpen, setReqOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [docReqBusy, setDocReqBusy] = useState(false);

  const collectRoomAudioTracks = (room: Room): MediaStreamTrack[] => {
    const tracks: MediaStreamTrack[] = [];
    try {
      room.localParticipant.audioTrackPublications.forEach((p: any) => { if (p.track?.mediaStreamTrack) tracks.push(p.track.mediaStreamTrack); });
      room.remoteParticipants.forEach((p: any) => p.audioTrackPublications.forEach((pub: any) => { if (pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack); }));
    } catch { /* best-effort */ }
    return tracks;
  };
  const startRoomRecording = useCallback((room: Room) => {
    if (typeof MediaRecorder === 'undefined' || mediaRecorderRef.current) return;
    try {
      const tracks = collectRoomAudioTracks(room);
      if (!tracks.length) return;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(new MediaStream(tracks), { mimeType: mime });
      mr.ondataavailable = (e) => { if (e.data?.size) recordChunksRef.current.push(e.data); };
      mr.start(5000);
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch { /* gravação é best-effort — nunca derruba a consulta */ }
  }, []);
  // Participante entrou depois do recorder ligado: restart p/ incluir o áudio novo
  // (MediaRecorder não aceita track adicionada após start; chunks preservados).
  const restartRoomRecording = useCallback((room: Room) => {
    const old = mediaRecorderRef.current;
    if (!old) return;
    try {
      old.onstop = () => { setTimeout(() => { mediaRecorderRef.current = null; startRoomRecording(room); }, 60); };
      old.stop();
    } catch { mediaRecorderRef.current = null; startRoomRecording(room); }
  }, [startRoomRecording]);
  const stopAndUploadRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mediaRecorderRef.current = null;
    setRecording(false);
    await new Promise<void>((res) => {
      try { mr.onstop = () => res(); mr.stop(); setTimeout(res, 2000); } catch { res(); }
    });
    const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
    recordChunksRef.current = [];
    if (blob.size < 3000) return; // vazio/curto demais — nem envia
    setRecUpload('up');
    try {
      const fd = new FormData();
      fd.append('file', blob, `${reminderId}.webm`);
      const r = await fetch(`${API_URL}/teleconsulta/${reminderId}/recording`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` }, body: fd });
      setRecUpload(r.ok ? 'ok' : 'fail');
    } catch { setRecUpload('fail'); }
  }, [authToken, reminderId]);

  // Encerramento SERVER-SIDE: marca a consulta como encerrada no banco (done +
  // endedAt, rota do agent1). Sem isto o card ficava "Entrar na consulta" pra
  // sempre (dono 21/10: "ela nunca encerra"). keepalive sobrevive ao unload.
  // Chamado no endCall, no disconnect de rede E no unload (agent3 a/b).
  const markEnded = useCallback(() => {
    fetch(`${API_URL}/teleconsulta/${reminderId}/end`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` }, keepalive: true })
      .catch(() => { /* best-effort: rede caída — server fecha sozinho pelo audit */ });
  }, [authToken, reminderId]);

  const roomRef = useRef<Room | null>(null);
  const previewStream = useRef<MediaStream | null>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const audioSink = useRef<HTMLDivElement>(null);
  const wakeLock = useRef<any>(null);
  const startedAtRef = useRef<number | null>(null);
  const endedByUser = useRef(false);
  const noteKey = `dx-teleconsulta-note:${reminderId}`;

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

  // ── Preview (pré-join) ───────────────────────────────────────────────────────
  // Dono 20/10: audio JUNTO com vídeo — o browser permissa AMBOS de uma vez
  // (se audio:false, o mic só era pedido pelo LiveKit JÁ DENTRO da chamada,
  // quando o usuário menos espera e o Chrome às vezes bloqueia).
  const openPreview = useCallback(async () => {
    setCamState('pending');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      previewStream.current?.getTracks().forEach((t) => t.stop());
      previewStream.current = stream;
      if (previewVideo.current) { previewVideo.current.srcObject = stream; previewVideo.current.play().catch(() => {}); }
      setCamState('ok');
    } catch (e: any) {
      setCamState(e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'nodevice' : 'denied');
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
      try { room.removeAllListeners(); } catch { /* noop */ }
      try { await room.disconnect(); } catch { /* noop */ }
    }
  }, [stopAndUploadRecording, stopRingback, stopRecordingBeep]);

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
        next.push({ identity: p.identity, name: p.name || p.identity, isDoctor, track: existing?.track ?? null, muted: existing?.muted ?? false });
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
          // Gravando e alguém entrou depois: reinclui o áudio novo no recorder.
          if (mediaRecorderRef.current) restartRoomRecording(roomRef.current!);
          return;
        }
        if (pub.source === Track.Source.Camera) setRemoteVideo(p, track);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === 'audio') { try { track.detach().forEach((el) => el.remove()); } catch { /* noop */ } return; }
        if (pub.source === Track.Source.Camera) setRemoteVideo(p, null);
      })
      .on(RoomEvent.TrackMuted, (pub: TrackPublication, p: Participant) => {
        if (pub.source === Track.Source.Camera) setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, muted: true } : r)));
      })
      .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, p: Participant) => {
        if (pub.source === Track.Source.Camera) setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, muted: false } : r)));
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        upsertRemote(p);
        const displayName = (p.name || 'Participante').replace(/\s*\([0-9]+\/?[A-Za-z]{2}\)\s*$/, '');
        setToast({ text: `${displayName} entrou`, k: Date.now() });
        setOtherJoined(true);
        setRemoteLeft(null);
        playJoinChime();
        hapticSuccess();
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        const displayName = (p.name || 'Participante').replace(/\s*\([0-9]+\/?[A-Za-z]{2}\)\s*$/, '');
        setRemotes((cur) => cur.filter((r) => r.identity !== p.identity));
        setRemoteLeft(displayName);
        playLeaveChime();
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

    // Publica mídia local — cada uma degrada sozinha (câmera travada ≠ consulta perdida).
    let camOk = true;
    let micOk = true;
    try { await room.localParticipant.setMicrophoneEnabled(true); } catch { micOk = false; }
    try {
      const pub = await room.localParticipant.setCameraEnabled(true);
      setLocalVideo(pub?.videoTrack ?? null);
    } catch { camOk = false; }
    setMicOn(micOk);
    setCamOn(camOk);
    if (!micOk || !camOk) setToast({ text: camOk ? 'Sem microfone — entre com o que tiver.' : 'Câmera bloqueada — você também pode entrar só com áudio.', k: Date.now() });

    setStartedAt(Date.now());
    startedAtRef.current = Date.now();
    setPhase('incall');
    setBanner(null);
    // F3 §4: médico grava automaticamente quando o PACIENTE consentiu a gravação
    // (checkbox no pré-join dele). Sem consent → nada grava (ausência é a mensagem).
    if (role === 'doctor' && summaryRef.current?.recordConsentAt) startRoomRecording(room);
    try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* WebView sem wakelock — ok */ }
  }, [markEnded, playJoinChime, playLeaveChime, restartRoomRecording, role, startRoomRecording, stopAndUploadRecording, teardownRoom]);

  // ── Join via backend ─────────────────────────────────────────────────────────
  const startJoin = useCallback(async (s?: Summary | null) => {
    const sum = s ?? summaryRef.current;
    stopPreview();
    setPhase('connecting');
    setBanner('connecting');
    try {
      const res = await fetch(`${API_URL}/teleconsulta/${reminderId}/join`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (res.status === 501) {
        const d = await res.json().catch(() => ({} as any));
        setFallbackLink(d?.linkUrl || sum?.linkUrl || '');
        setPhase('fallback');
        setBanner(null);
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
      const data = await res.json();
      await connectRoom(data.serverUrl, data.token);
    } catch {
      setBanner(null);
      setToast({ text: 'Não deu pra entrar. Tenta de novo em instantes.', k: Date.now() });
      hapticError();
      setPhase('prejoin');
    }
  }, [authToken, connectRoom, reminderId, stopPreview]);

  // Botão do pré-join (paciente): consent Art.15 (só se ainda não consenter) + join.
  // F3 §1: se marcou o checkbox de gravação, registra o record-consent logo após o
  // consent Art.15 (3a — PUT; PATCH de fallback até be2 consolidar o verbo). Best-effort:
  // falha aqui NUNCA derruba a entrada na chamada.
  const consentAndJoin = useCallback(async () => {
    const sum = summaryRef.current;
    if (joinLoading) return;
    setJoinLoading(true);
    try {
      if (role === 'patient' && sum && !sum.consentAt) {
        const res = await fetch(`${API_URL}/reminders/${reminderId}/consent`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) throw new Error('consent');
        hapticSuccess();
        let next = { ...sum, consentAt: new Date().toISOString() };
        if (recordAudio) {
          const rcUrl = `${API_URL}/teleconsulta/${reminderId}/record-consent`;
          const rcHeaders = { Authorization: `Bearer ${token()}` };
          let rc: Response | null = null;
          try {
            rc = await fetch(rcUrl, { method: 'PUT', headers: rcHeaders });
            if (!rc.ok && (rc.status === 404 || rc.status === 405)) rc = await fetch(rcUrl, { method: 'PATCH', headers: rcHeaders });
          } catch { rc = null; }
          if (rc?.ok) next = { ...next, recordConsentAt: new Date().toISOString() };
        }
        setSummary(next);
        await startJoin(next);
      } else {
        await startJoin(sum);
      }
    } catch {
      hapticError();
      setToast({ text: 'Não deu pra entrar. Tenta de novo em instantes.', k: Date.now() });
      setPhase('prejoin');
    } finally {
      setJoinLoading(false);
    }
  }, [joinLoading, recordAudio, reminderId, role, startJoin]);

  // ── Bootstrap: resumo + decisão da fase inicial ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isBrowserSupported()) { setUnsupported(true); setPhase('fallback'); return; }
      if (role === 'patient') {
        const pid = (() => { try { return localStorage.getItem('selPatientId') || localStorage.getItem('patientId'); } catch { return null; } })();
        let fetched: Summary | null = null;
        if (pid) {
          try {
            const res = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
              const list = await res.json();
              const found = Array.isArray(list) ? list.find((x: any) => x?.id === reminderId) : null;
              if (found) fetched = { id: found.id, patientId: found.patientId, title: found.title, dueDate: found.dueDate, consentAt: found.consentAt, recordConsentAt: found.recordConsentAt, provider: found.provider, linkUrl: found.linkUrl, doctor: found.doctor, endedAt: found.endedAt };
            } else if (res.status === 401) { setPhase('error'); return; }
          } catch { /* offline: cai no state se houver */ }
        }
        if (cancelled) return;
        const s = fetched ?? summaryRef.current;
        if (s) setSummary(s);
        if (!s) { setPhase('error'); return; }
        // reviewer-L: capability de transcrição + dados de paciente/médico (foto e nome).
        fetch(`${API_URL}/teleconsulta/${reminderId}/summary`, { headers: { Authorization: `Bearer ${authToken()}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!cancelled && d) {
              setSummary((cur) => (cur ? {
                ...cur,
                stt: typeof d.stt === 'boolean' ? d.stt : cur.stt,
                patient: d.patient || cur.patient,
                doctor: d.doctor || cur.doctor,
                doctorInRoom: d.doctorInRoom ?? false,
                endedAt: d.endedAt ?? cur.endedAt,
              } : cur));
              // F4: race do fetch — endedAt chegou DEPOIS do bootstrap ir pro pré-join.
              if (d.endedAt) setPhase((p) => (p === 'loading' || p === 'prejoin' ? 'readonly' : p));
            }
          })
          .catch(() => {});
        // F4 pós-consulta (agent2): ENCERRADA → área read-only direto (sem pré-join,
        // sem preview de câmera, sem consent — o join do server bloquearia de todo modo).
        if (s.endedAt) { setPhase('readonly'); return; }
        // Spec §1: consentido → pula direto pra chamada.
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

  // Beep de gravação: só enquanto gravando (LGPD — cortesia auditiva).
  useEffect(() => {
    if (recording) startRecordingBeep();
    else stopRecordingBeep();
    return () => { stopRecordingBeep(); };
  }, [recording, startRecordingBeep, stopRecordingBeep]);

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
    void teardownRoom();
  }, [stopPreview, teardownRoom]);

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
      };
    } catch { return null; }
  }, [authToken, reminderId]);

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
      if (tries >= 12) { if (!stop) setTxState('error'); return; } // ~3 min e nada → estado erro
      timer = setTimeout(() => void tick(), 15000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, role, summary?.recordConsentAt, txRetry]);

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

  const endCall = useCallback(async () => {
    setEndOpen(false);
    const t0 = startedAtRef.current ?? Date.now();
    endedByUser.current = true;
    setEnded({ sec: Math.round((Date.now() - t0) / 1000) });
    try { wakeLock.current?.release?.(); } catch { /* noop */ }
    wakeLock.current = null;
    // F3: para o recorder ANTES de derrubar os tracks (o flush precisa deles vivos)
    // e sobe a gravação — o upload acontece de fundo; a área pós-chamada mostra
    // o estado (enviando → transcrição em minutos).
    await stopAndUploadRecording();
    markEnded(); // encerramento server-side (done + endedAt) — a consulta PARA de ser re-entrável
    await teardownRoom();
    setPhase('ended');
    hapticSuccess();
  }, [markEnded, stopAndUploadRecording, teardownRoom]);

  const exitTo = useCallback(() => {
    hapticLight();
    if (onExited) { onExited(); return; }
    navigate(role === 'doctor' ? '/doctor' : '/lembretes');
  }, [navigate, onExited, role]);

  const saveNote = useCallback(() => {
    // DÍVIDA (P2-reviewer 19/10): nota clínica só neste aparelho. F3 = persistir no
    // reminder via endpoint do médico (ex.: PUT /api/doctor/patients/:pid/teleconsulta/:id
    // {doctorNote}) para entrar no prontuário — até lá o caption avisa "neste aparelho".
    try { localStorage.setItem(noteKey, note); } catch { /* noop */ }
    setNoteSaved(true);
    hapticSuccess();
  }, [note, noteKey]);

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
  // P2-reviewer: header do MÉDICO mostra o NOME do paciente (state do portal), não o
  // título do lembrete; fallback = quem está na sala.
  const statePatientName = (location.state as any)?.patientName as string | undefined;
  const headerName = role === 'doctor'
    ? (`Paciente: ${statePatientName || main?.name || '—'}`)
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
    height: 48, borderRadius: '999px', textTransform: 'none' as const, fontWeight: 800, fontSize: 15,
    background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff',
    boxShadow: '0 4px 12px rgba(32,178,170,.30)',
    '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 3 },
    '&:hover': { background: 'linear-gradient(135deg,#1aa39b,#12706b)' },
    '&:disabled': { color: 'rgba(255,255,255,.7)' },
  };

  // ══ FASES ════════════════════════════════════════════════════════════════════
  if (phase === 'incall') {
    const mainHasVideo = main?.track && !main.muted;
    const otherName = role === 'doctor'
      ? (summary?.patient?.name || (location.state as any)?.patientName || (location.state as any)?.patient?.fullName || 'o paciente')
      : (doctor?.name || main?.name || 'o médico');
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
                src={role === 'doctor'
                  ? photoUrlFor(summary?.patientId || '')
                  : doctorPhotoUrl(summary?.doctor?.id || '')}
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
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3 }}>
            <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', maxWidth: 360 }}>
              <Box sx={{ position: 'relative' }}>
                <Avatar
                  src={role === 'doctor'
                    ? photoUrlFor((location.state as any)?.patient?.id || (location.state as any)?.reminder?.patientId || '')
                    : doctorPhotoUrl(summary?.doctor?.id || '')}
                  sx={{
                    width: 96,
                    height: 96,
                    fontSize: 34,
                    fontWeight: 800,
                    bgcolor: 'rgba(32,178,170,.18)',
                    color: '#5fc9c3',
                    border: '3px solid rgba(32,178,170,.5)',
                    boxShadow: '0 0 32px rgba(32,178,170,0.35)',
                    animation: 'dxCallPulse 2.4s ease-in-out infinite',
                    '@keyframes dxCallPulse': {
                      '0%,100%': { transform: 'scale(1)', boxShadow: '0 0 20px rgba(32,178,170,0.25)' },
                      '50%': { transform: 'scale(1.05)', boxShadow: '0 0 36px rgba(32,178,170,0.5)' },
                    },
                  }}
                >
                  {initials(role === 'doctor'
                    ? (summary?.patient?.name || (location.state as any)?.patientName || (location.state as any)?.patient?.fullName || main?.name)
                    : (doctor?.name || main?.name))}
                </Avatar>
                <CircularProgress
                  size={108}
                  thickness={1.5}
                  sx={{
                    color: '#20b2aa',
                    position: 'absolute',
                    top: -6,
                    left: -6,
                    opacity: 0.6,
                  }}
                />
              </Box>
              <Box>
                <Typography sx={{ color: 'rgba(255,255,255,.95)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
                  Aguardando {otherName}…
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.65)', fontSize: 13, mt: 0.5, lineHeight: 1.4 }}>
                  {role === 'doctor'
                    ? 'A sala já está conectada. Assim que o paciente entrar, o vídeo iniciará automaticamente.'
                    : (doctor?.specialty ? `${doctor.specialty} · ` : '') + 'Conexão segura criptografada'}
                </Typography>
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
            {role === 'patient' && summary?.consentAt && <Chip size="small" label="✓ autorizada" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.18)', color: '#5fc9c3' }} />}
            {!!summary?.recordConsentAt && <Chip size="small" label="● gravando" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(239,68,68,.15)', color: '#fca5a5' }} />}
          </Stack>
        </Stack>

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
          {/* F3 reviewer-B (alto): "Solicitar exame" IN-CALL — 4º controle do médico.
              Pedido chega na tela do paciente em tempo real (poll do summary). */}
          {role === 'doctor' && (
            <IconButton aria-label="Solicitar exame ao paciente" onClick={() => { hapticLight(); setReqOpen(true); }}
              sx={{ width: 56, height: 56, bgcolor: 'rgba(255,255,255,.14)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,.22)' } }}>
              <AssignmentIcon sx={{ fontSize: 24 }} />
            </IconButton>
          )}
          <IconButton aria-label="Encerrar consulta" onClick={() => { hapticLight(); setEndOpen(true); }}
            sx={{ width: 56, height: 56, bgcolor: '#dc2626', color: '#fff', '&:hover': { bgcolor: '#b91c1c' }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 3 } }}>
            <CallEndIcon sx={{ fontSize: 26 }} />
          </IconButton>
        </Stack>

        {/* Sink de áudio remoto (elementos ocultos criados pelo SDK) */}
        <div ref={audioSink} aria-hidden style={{ display: 'none' }} />

        {/* F3: indicador de gravação (só quando gravando de fato) — ponto pulsante
            discreto + hint "áudio apagado após gerar o texto" (spec §2). */}
        {recording && (
          <Chip
            size="small"
            label="● gravando transcrição"
            sx={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top) + 148px)', left: 14,
              height: 24, fontSize: 12, fontWeight: 800, color: '#e0bc97',
              bgcolor: 'rgba(0,0,0,.35)', border: '1px solid rgba(224,188,151,.35)',
              '& .MuiChip-label': { px: 1 },
              '@media (prefers-reduced-motion: no-preference)': {
                animation: 'dxRecPulse 2s ease-in-out infinite',
                '@keyframes dxRecPulse': { '0%,100%': { opacity: 0.75 }, '50%': { opacity: 1 } },
              },
            }}
          />
        )}
        {recUpload === 'up' && (
          <Chip size="small" label="enviando gravação…" sx={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 96px)', left: '50%', transform: 'translateX(-50%)', height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(0,0,0,.4)', color: '#cfe8e6' }} />
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

    // Feedback 1-toque (F2) com opções prontas — reaproveitado nas duas áreas.
    const feedbackBlock = !fbSent ? (
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
    ) : (
      <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 13 }} />} label="Obrigado pela avaliação ✓" sx={{ mt: 2, height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />
    );

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

            {/* §3b — Transcrição (só se houve consent de gravação; reader = TranscriptView) */}
            {hasRecording && (
              <Box sx={{ mt: 3 }}>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, mb: 1.25 }}>Transcrição</Typography>
                {txState === 'pending' && (
                  <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', borderColor: 'divider', boxShadow: 'none' }} >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box aria-label="Transcrição chegando" role="status">
                        <Stack spacing={1}>
                          {[86, 70, 78].map((w, i) => (
                            <Box key={i} sx={{
                              height: 14, width: `${w}%`, borderRadius: '7px',
                              bgcolor: 'rgba(32,178,170,.08)',
                              animation: `dxTxShimmer 1.6s ease ${i * 0.18}s infinite`,
                              '@keyframes dxTxShimmer': { '0%,100%': { opacity: 0.55 }, '50%': { opacity: 1 } },
                            }} />
                          ))}
                        </Stack>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1.5, lineHeight: 1.55 }}>
                          A transcrição chega em alguns minutos — pode sair, avisamos quando estiver pronta.
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
                        <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>Não deu pra gerar a transcrição.</Typography>
                        <Button size="small" variant="outlined" onClick={() => setTxRetry((n) => n + 1)} sx={quickBtnSx}>Tentar de novo</Button>
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}

            {/* §3c — feedback 1-toque fecha a área. READ-ONLY: feedback só se JÁ dado
                (histórico não re-avalia — o ato passou). */}
            {readOnly
              ? (areaSummary?.feedback ? (
                <Chip
                  size="small"
                  icon={<VerifiedIcon sx={{ fontSize: 13 }} />}
                  label={`Avaliação registrada (${areaSummary.feedback.rating}/5) ✓`}
                  sx={{ mt: 2.5, height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }}
                />
              ) : null)
              : feedbackBlock}

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

    // Médico — card F2 premium com avaliação 1-toque, chips rápidos e anotações unificadas
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ maxWidth: 440, width: '100%', borderRadius: '22px', textAlign: 'center', boxShadow: '0 12px 36px rgba(0,0,0,0.08)' }} elevation={4}>
          <CardContent sx={{ p: 3.5 }}>
            <Box sx={{ position: 'relative', width: 88, mx: 'auto', mb: 2 }}>
              <DrExame size={72} />
              <CheckCircleIcon sx={{ position: 'absolute', right: -6, bottom: -4, fontSize: 28, color: '#5fc9c3', bgcolor: 'background.paper', borderRadius: '50%' }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 22, fontFamily: '"Poppins",sans-serif', mb: 0.5 }}>Consulta encerrada</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14 }}>Duração · {min}</Typography>

            <Box sx={{ mt: 2.75, p: 2, borderRadius: '16px', bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(32,178,170,0.06)', border: '1px solid', borderColor: 'rgba(32,178,170,0.18)', textAlign: 'left' }}>
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

              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { void sendFeedback(fbRating ?? 5, note || fbNote); saveNote(); }}
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
            src={doctorPhotoUrl(summary?.doctor?.id || '')}
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
              disabled={joinLoading}
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
      </Box>
    );
  }
  const ctaLabel = 'Entrar na consulta';
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 1.5 }}>
      <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px' }} elevation={4}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1.5 }}>Sua consulta vai começar</Typography>

          {/* Preview espelhado */}
          <Box sx={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: '16px', overflow: 'hidden', bgcolor: '#0c1818', mb: 0.5 }}>
            {camState === 'ok' ? (
              <>
                <video ref={previewVideo} playsInline autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                {phase === 'prejoin' && (
                  <Chip size="small" label="Pré-visualização da câmera" sx={{ position: 'absolute', bottom: 8, left: 8, height: 24, fontSize: 12, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
                )}
              </>
            ) : (
              <Stack spacing={1} sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', bgcolor: (t) => (t.palette.mode === 'dark' ? '#1a2424' : '#eef7f6') }}>
                <DrExame size={96} />
              </Stack>
            )}
            {camState === 'denied' && (
              <Chip size="small" label="Câmera bloqueada" sx={{ position: 'absolute', top: 8, left: 8, height: 24, fontSize: 12, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
            )}
            {camState === 'nodevice' && (
              <Chip size="small" label="Sem câmera" sx={{ position: 'absolute', top: 8, left: 8, height: 24, fontSize: 12, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
            )}
            {phase === 'loading' && <CircularProgress size={22} sx={{ position: 'absolute', top: 10, right: 10, color: '#5fc9c3' }} />}
          </Box>

          {/* CTA de permissão (câmera) — não bloqueia a entrada */}
          {camState === 'denied' && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Button size="small" variant="outlined" onClick={() => void openPreview()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode), borderColor: 'rgba(32,178,170,.4)' }}>
                Permitir câmera
              </Button>
              <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>Você também pode entrar só com áudio.</Typography>
            </Stack>
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

          {/* Consentimento (Art. 15 / CFM 2.314/22) — mesmo texto do dialog do Reminders */}
          {showConsent && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.65, mt: 1.5 }}>{CONSENT_TEXT}</Typography>
          )}
          {/* F3 §1: gravação p/ transcrição — checkbox SEPARADO do consent Art.15 (divisor
              hairline + 12px), default OFF, sem nudge visual. Opt-in honesto: a consulta
              funciona sem. Médico não vê (o titular do dado é o paciente).
              reviewer-L: some quando o server não transcreve (stt flag do join/summary) —
              ausência é a mensagem, nunca promessa falsa. */}
          {showConsent && summary?.stt !== false && (
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
          {role === 'patient' && summary?.consentAt && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>✓ Telemedicina autorizada</Typography>
          )}
          {role === 'doctor' && summary && !summary.consentAt && (
            <Chip size="small" label="Paciente ainda não autorizou" sx={{ mt: 1.5, height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(217,119,6,.14)', color: '#b45309', borderRadius: '8px' }} />
          )}

          <Button variant="contained" fullWidth disabled={phase === 'loading' || joinLoading} onClick={() => void consentAndJoin()} startIcon={joinLoading ? <CircularProgress size={18} sx={{ color: 'rgba(255,255,255,.8)' }} /> : <VideocamIcon />}
            sx={{ ...primaryBtn, mt: 2 }}>
            {ctaLabel}
          </Button>
          {showConsent && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', mt: 1, lineHeight: 1.5 }}>
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
