// Teleconsulta in-app (LiveKit) — F2, 19/10/26. Spec: docs/design/2026-10-19-livekit-fase2-ux.md
// Rota imersiva /teleconsulta/:id (fora do AppLayout — sem bottom-nav/menu).
// Fases: loading → prejoin → connecting → incall → ended · fallback (501/navegador) · error.
// Degradação da casa: join 501/não suportado → tela fallback com "Abrir no Meet" (linkUrl).
// Regras de ouro: TODOS os hooks antes de qualquer early-return (React #310); nunca
// reload() (crasha o APK); zero jargão ("consulta/chamada", nunca room/track/token).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material';
import CallEndIcon from '@mui/icons-material/CallEnd';
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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Room, RoomEvent, Track, isBrowserSupported, type LocalVideoTrack, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication, type TrackPublication } from 'livekit-client';
import { API_URL, token } from '../config';
import { DrExame } from '../components/DrExame';
import { openTelemedicinaRoom } from '../utils/telemedicina';
import { hapticError, hapticLight, hapticSuccess } from '../utils/haptic';
import { tealText } from '../theme';

// ── Tokens fixos da spec (§5) ──────────────────────────────────────────────────
const CALL_BG = '#0c1818'; // fundo in-call — fixo nos 2 modos (vídeo é o herói)
const GLASS = 'rgba(15,24,24,.68)';
const GLASS_FILTER = 'blur(18px) saturate(160%)';
const COPPER = '#d4a574';
const COPPER_DARK = '#b88a54';
const CONSENT_TEXT =
  'Autorizo o atendimento por telemedicina e a transmissão de imagens e dados nesta consulta, conforme a Resolução CFM 2.314/2022. Sei que posso negar ou revogar este consentimento a qualquer momento, e que ele fica registrado com data e hora.';

type Phase = 'loading' | 'prejoin' | 'connecting' | 'incall' | 'ended' | 'fallback' | 'error';
type CamState = 'pending' | 'ok' | 'denied' | 'nodevice';
interface Summary {
  id: string;
  title?: string;
  dueDate?: string;
  consentAt?: string | null;
  provider?: string | null;
  linkUrl?: string | null;
  doctor?: { name?: string; crm?: string; specialty?: string } | null;
}
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
    return s ? { id: s.id, title: s.title, dueDate: s.dueDate, consentAt: s.consentAt, provider: s.provider, linkUrl: s.linkUrl, doctor: s.doctor } : null;
  });
  const summaryRef = useRef<Summary | null>(summary);
  useEffect(() => { summaryRef.current = summary; }, [summary]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [camState, setCamState] = useState<CamState>('pending');
  const [joinLoading, setJoinLoading] = useState(false);
  const [banner, setBanner] = useState<'connecting' | 'reconnecting' | null>(null);
  const [toast, setToast] = useState<{ text: string; k: number } | null>(null);
  const [remotes, setRemotes] = useState<RemoteView[]>([]);
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
  const sendFeedback = async (rating: number) => {
    setFbRating(rating);
    try {
      await fetch(`${API_URL}/teleconsulta/${reminderId}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ rating, note: fbNote.trim() || undefined }),
      });
    } catch { /* best-effort: a UX não trava por audit */ }
    setFbSent(true);
  };
  const [pipCorner, setPipCorner] = useState<'tr' | 'tl' | 'br' | 'bl'>('tr');
  const [pipDrag, setPipDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

  const roomRef = useRef<Room | null>(null);
  const previewStream = useRef<MediaStream | null>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const audioSink = useRef<HTMLDivElement>(null);
  const wakeLock = useRef<any>(null);
  const startedAtRef = useRef<number | null>(null);
  const endedByUser = useRef(false);
  const noteKey = `dx-teleconsulta-note:${reminderId}`;

  // ── Preview (pré-join) ───────────────────────────────────────────────────────
  const openPreview = useCallback(async () => {
    setCamState('pending');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
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
    const room = roomRef.current;
    roomRef.current = null;
    if (audioSink.current) audioSink.current.innerHTML = '';
    setLocalVideo(null);
    setRemotes([]);
    if (room) {
      try { room.removeAllListeners(); } catch { /* noop */ }
      try { await room.disconnect(); } catch { /* noop */ }
    }
  }, []);

  // ── Conexão LiveKit ──────────────────────────────────────────────────────────
  const connectRoom = useCallback(async (serverUrl: string, lkToken: string) => {
    await teardownRoom();
    endedByUser.current = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const upsertRemote = (p: RemoteParticipant) => {
      const isDoctor = p.identity.startsWith('doctor:');
      setRemotes((cur) => {
        const next = cur.filter((r) => r.identity !== p.identity);
        next.push({ identity: p.identity, name: p.name || p.identity, isDoctor, track: null, muted: false });
        return next;
      });
    };
    const setRemoteVideo = (p: RemoteParticipant, track: RemoteTrack | null) => {
      setRemotes((cur) => cur.map((r) => (r.identity === p.identity ? { ...r, track } : r)));
    };

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === 'audio') {
          try { const el = track.attach(); el.style.display = 'none'; audioSink.current?.appendChild(el); } catch { /* noop */ }
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
        // P3-reviewer: nome de exibição SEM o sufixo CRM (joinName do server é "Dr. Ana (116739/SP)")
        const displayName = (p.name || 'Participante').replace(/\s*\([0-9]+\/?[A-Za-z]{2}\)\s*$/, '');
        setToast({ text: `${displayName} entrou ✨`, k: Date.now() });
        hapticSuccess();
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        setRemotes((cur) => cur.filter((r) => r.identity !== p.identity));
      })
      .on(RoomEvent.Reconnecting, () => setBanner('reconnecting'))
      .on(RoomEvent.Reconnected, () => setBanner(null))
      .on(RoomEvent.Disconnected, () => {
        if (endedByUser.current) return;
        // Caiu sem o usuário encerrar (rede/servidor) → pós-chamada com o tempo corrido.
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
    try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* WebView sem wakelock — ok */ }
  }, [teardownRoom]);

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
  const consentAndJoin = useCallback(async () => {
    const sum = summaryRef.current;
    if (joinLoading) return;
    setJoinLoading(true);
    try {
      if (role === 'patient' && sum && !sum.consentAt) {
        const res = await fetch(`${API_URL}/reminders/${reminderId}/consent`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) throw new Error('consent');
        hapticSuccess();
        const next = { ...sum, consentAt: new Date().toISOString() };
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
  }, [joinLoading, reminderId, role, startJoin]);

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
              if (found) fetched = { id: found.id, title: found.title, dueDate: found.dueDate, consentAt: found.consentAt, provider: found.provider, linkUrl: found.linkUrl, doctor: found.doctor };
            } else if (res.status === 401) { setPhase('error'); return; }
          } catch { /* offline: cai no state se houver */ }
        }
        if (cancelled) return;
        const s = fetched ?? summaryRef.current;
        if (s) setSummary(s);
        if (!s) { setPhase('error'); return; }
        // Spec §1: consentido → pula direto pra chamada.
        if (s.consentAt) { void startJoin(s); return; }
        setPhase('prejoin');
      } else {
        try { setNote(localStorage.getItem(`dx-teleconsulta-note:${reminderId}`) || ''); } catch { /* noop */ }
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

  // ── Ações da chamada ─────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    hapticLight();
    const room = roomRef.current;
    if (!room) return;
    try { await room.localParticipant.setMicrophoneEnabled(!micOn); setMicOn(!micOn); }
    catch { setToast({ text: 'Não deu pra mexer no microfone.', k: Date.now() }); }
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    hapticLight();
    const room = roomRef.current;
    if (!room) return;
    try {
      if (!camOn) { const pub = await room.localParticipant.setCameraEnabled(true); setLocalVideo(pub?.videoTrack ?? null); }
      else { await room.localParticipant.setCameraEnabled(false); setLocalVideo(null); }
      setCamOn(!camOn);
    } catch { setToast({ text: 'Não deu pra mexer na câmera.', k: Date.now() }); }
  }, [camOn]);

  const endCall = useCallback(async () => {
    setEndOpen(false);
    const t0 = startedAtRef.current ?? Date.now();
    endedByUser.current = true;
    setEnded({ sec: Math.round((Date.now() - t0) / 1000) });
    try { wakeLock.current?.release?.(); } catch { /* noop */ }
    wakeLock.current = null;
    await teardownRoom();
    setPhase('ended');
    hapticSuccess();
  }, [teardownRoom]);

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
    return (
      <Box sx={{ position: 'fixed', inset: 0, bgcolor: CALL_BG, zIndex: 1300, overflow: 'hidden', userSelect: 'none' }}>
        {/* Tile principal: o outro participante (médico, p/ paciente) */}
        {mainHasVideo ? (
          <Box sx={{ position: 'absolute', inset: 0 }}>
            <TrackVideo track={main!.track!} />
          </Box>
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <Stack alignItems="center" spacing={1.5} sx={{ textAlign: 'center', px: 3 }}>
              <Box sx={{
                width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center',
                bgcolor: 'rgba(32,178,170,.16)', border: '2px solid rgba(32,178,170,.4)', color: '#5fc9c3',
                fontSize: 32, fontWeight: 800, animation: 'dxCallPulse 2s ease infinite',
                '@keyframes dxCallPulse': { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.1)' } },
              }}>{initials(main?.name)}</Box>
              <Typography sx={{ color: 'rgba(255,255,255,.92)', fontWeight: 700, fontSize: 15 }}>
                Aguardando {role === 'patient' ? (doctor?.name || main?.name || 'o médico') : 'o paciente'}…
              </Typography>
              <CircularProgress size={20} sx={{ color: '#20b2aa' }} />
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

        {/* Header flutuante (vidro) */}
        <Stack
          direction="row" alignItems="center" spacing={1}
          sx={{
            position: 'absolute', top: 0, left: 0, right: 0, px: 1.5, pt: 'calc(env(safe-area-inset-top) + 8px)', pb: 1,
            background: 'rgba(0,0,0,.45)', backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER,
          }}
        >
          <DrExame size={28} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
              {headerName}{headerCrm ? ` · CRM ${headerCrm}` : ''}
            </Typography>
          </Box>
          {role === 'doctor' && (
            <Chip size="small" label="Médico" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(212,165,116,.2)', color: '#e0bc97' }} />
          )}
          {role === 'patient' && summary?.consentAt && (
            <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 13 }} />} label="autorizada" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,.18)', color: '#5fc9c3', '& .MuiChip-icon': { color: '#5fc9c3' } }} />
          )}
          {/* Sala: mesmo código nos DOIS aparelhos (bug 3-salas 19/10) — conferência instantânea */}
          <Tooltip title="Confira: este código é o mesmo no aparelho da outra pessoa">
            <Chip size="small" label={`Sala ${String(reminderId).slice(-5).toUpperCase()}`} sx={{ height: 20, fontSize: 10.5, fontWeight: 800, fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,.30)', color: '#e0bc97', border: '1px dashed rgba(224,188,151,.45)' }} />
          </Tooltip>
          <Typography sx={{ color: 'rgba(255,255,255,.8)', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }} aria-label="Tempo de chamada">
            {clockFmt(elapsedSec)}
          </Typography>
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
          <IconButton aria-label="Encerrar consulta" onClick={() => { hapticLight(); setEndOpen(true); }}
            sx={{ width: 56, height: 56, bgcolor: COPPER, color: '#fff', '&:hover': { bgcolor: COPPER_DARK }, '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 3 } }}>
            <CallEndIcon sx={{ fontSize: 26 }} />
          </IconButton>
        </Stack>

        {/* Sink de áudio remoto (elementos ocultos criados pelo SDK) */}
        <div ref={audioSink} aria-hidden style={{ display: 'none' }} />

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
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: COPPER, '&:hover': { bgcolor: COPPER_DARK } }}>
              Encerrar
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  if (phase === 'ended' && ended) {
    const min = ended.sec >= 30 ? `${Math.max(1, Math.round(ended.sec / 60))} min` : 'menos de 1 min';
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px', textAlign: 'center' }} elevation={4}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ position: 'relative', width: 88, mx: 'auto', mb: 2 }}>
              <DrExame size={72} />
              <CheckCircleIcon sx={{ position: 'absolute', right: -6, bottom: -4, fontSize: 28, color: '#5fc9c3', bgcolor: 'background.paper', borderRadius: '50%' }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: '"Poppins",sans-serif', mb: 0.5 }}>Consulta encerrada</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14 }}>· {min}</Typography>

            {/* Feedback 1-toque (ambos os papéis) — como foi a chamada */}
            {!fbSent ? (
              <Box sx={{ mt: 2.5, p: 1.75, borderRadius: '14px', bgcolor: 'rgba(32,178,170,0.06)', border: '1px solid rgba(32,178,170,0.16)' }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mb: 1 }}>Como foi a chamada?</Typography>
                <Stack direction="row" justifyContent="center" useFlexGap spacing={0.5}>
                  {[
                    { v: 1, icon: <SentimentVeryDissatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Péssima' },
                    { v: 2, icon: <SentimentDissatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Ruim' },
                    { v: 3, icon: <SentimentNeutralIcon sx={{ fontSize: 30 }} />, label: 'Ok' },
                    { v: 4, icon: <SentimentSatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Boa' },
                    { v: 5, icon: <SentimentVerySatisfiedIcon sx={{ fontSize: 30 }} />, label: 'Ótima' },
                  ].map((o) => (
                    <Tooltip key={o.v} title={o.label}>
                      <IconButton aria-label={o.label} onClick={() => void sendFeedback(o.v)}
                        sx={{ color: fbRating === o.v ? '#0f766e' : 'text.secondary', '&:hover': { color: '#0f766e', bgcolor: 'rgba(32,178,170,0.10)' }, width: 46, height: 46 }}>
                        {o.icon}
                      </IconButton>
                    </Tooltip>
                  ))}
                </Stack>
                <TextField multiline minRows={2} maxRows={4} fullWidth size="small" value={fbNote} onChange={(e) => setFbNote(e.target.value)}
                  placeholder={role === 'doctor' ? 'Alguma observação sobre a conexão/áudio? (opcional)' : 'A conexão e o áudio funcionaram bem? (opcional)'}
                  slotProps={{ htmlInput: { 'aria-label': 'Observação sobre a chamada' } }}
                  sx={{ mt: 1.25, '& .MuiInputBase-root': { fontSize: 13.5, borderRadius: '10px' } }} />
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: 10.5, color: 'text.disabled', textAlign: 'left' }}>
                  Registramos sua avaliação para melhorar a teleconsulta — é anônima.
                </Typography>
              </Box>
            ) : (
              <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 13 }} />} label="Obrigado pela avaliação ✓" sx={{ mt: 2, height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />
            )}

            {role === 'doctor' && (
              <Box sx={{ mt: 2.5, textAlign: 'left' }}>
                <TextField multiline minRows={3} maxRows={6} fullWidth value={note} onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }}
                  placeholder="Nota rápida sobre a consulta (opcional)" slotProps={{ htmlInput: { 'aria-label': 'Nota rápida sobre a consulta' } }}
                  sx={{ '& .MuiInputBase-root': { fontSize: 14, borderRadius: '12px' } }} />
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" onClick={saveNote} disabled={!note.trim()} sx={{ textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode) }}>Salvar nota</Button>
                  {noteSaved && <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 13 }} />} label="Nota salva" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />}
                </Stack>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontSize: 11 }}>Fica salva neste aparelho.</Typography>
              </Box>
            )}

            <Button variant="contained" fullWidth onClick={exitTo} sx={{ ...primaryBtn, mt: 3 }}>
              {role === 'doctor' ? 'Voltar à ficha' : 'Voltar aos lembretes'}
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

  // Pré-join + loading
  const showConsent = role === 'patient' && !summary?.consentAt;
  const ctaLabel = role === 'doctor' ? 'Entrar e aguardar' : showConsent ? 'Autorizar e entrar' : 'Entrar na consulta';
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 1.5 }}>
      <Card sx={{ maxWidth: 420, width: '100%', borderRadius: '20px' }} elevation={4}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: '"Poppins",sans-serif', mb: 1.5 }}>Sua consulta vai começar</Typography>

          {/* Preview espelhado */}
          <Box sx={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: '16px', overflow: 'hidden', bgcolor: '#0c1818', mb: 0.5 }}>
            {camState === 'ok' ? (
              <video ref={previewVideo} playsInline autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            ) : (
              <Stack spacing={1} sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', bgcolor: (t) => (t.palette.mode === 'dark' ? '#1a2424' : '#eef7f6') }}>
                <DrExame size={96} />
                {phase === 'prejoin' && camState !== 'pending' && (
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', mt: 1 }}>Sorria, você está pronto ✨</Typography>
                )}
              </Stack>
            )}
            {camState === 'denied' && (
              <Chip size="small" label="Câmera bloqueada" sx={{ position: 'absolute', top: 8, left: 8, height: 24, fontSize: 11, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
            )}
            {camState === 'nodevice' && (
              <Chip size="small" label="Sem câmera" sx={{ position: 'absolute', top: 8, left: 8, height: 24, fontSize: 11, fontWeight: 800, bgcolor: GLASS, color: '#fff', backdropFilter: GLASS_FILTER, borderRadius: '8px' }} />
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
          {role === 'patient' && summary?.consentAt && (
            <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="telemedicina autorizada" sx={{ mt: 1.5, height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,.1)', color: (t) => tealText(t.palette.mode), '& .MuiChip-icon': { color: (t) => tealText(t.palette.mode) } }} />
          )}
          {role === 'doctor' && summary && !summary.consentAt && (
            <Chip size="small" label="Paciente ainda não autorizou" sx={{ mt: 1.5, height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(217,119,6,.14)', color: '#b45309', borderRadius: '8px' }} />
          )}

          <Button variant="contained" fullWidth disabled={phase === 'loading' || joinLoading} onClick={() => void consentAndJoin()} startIcon={joinLoading ? <CircularProgress size={18} sx={{ color: 'rgba(255,255,255,.8)' }} /> : <VideocamIcon />}
            sx={{ ...primaryBtn, mt: 2 }}>
            {ctaLabel}
          </Button>
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
