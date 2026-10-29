// "ATENDER AGORA" — serviço singleton da presença do médico na fila imediata.
// Bug 29/10 (teste real Enrico/Heloisa): o heartbeat/polling morava DENTRO do
// DoctorPortal — navegar pra sala (ou qualquer rota) desmontava o componente e o
// cleanup mandava online:false ("mudando de tela fica offline"); e o polling de
// chamados era bloqueado com a aba em segundo plano, então o médico aparecia
// online pro paciente mas a offer expirava sem ele nunca ver ("clica entrar na
// fila e pro médico acontece nada" — médico não tem push).
//
// Aqui os timers vivem no MÓDULO (sobrevivem à troca de rota do SPA); o portal
// liga/desliga e assina o estado p/ UI. Chamado novo alerta MESMO fora do portal:
// som (WebAudio — destravado pelo clique do toggle) + Notification + vibração.
// A intenção "estou atendendo" persiste em localStorage com timestamp: reload/
// reabertura recente (<10min) retoma sozinha; depois disso exige o toggle de novo.
import { API_URL } from '../config';

export interface QueueCallOffer {
  callId: string;
  patientName: string;
  patientAge?: number | null;
  queueWaitSec?: number | null;
  priceCents?: number | null;
  netPriceCents?: number | null;
  acceptDeadlineIso?: string | null;
  briefUrl?: string | null;
}

export interface AtenderAgoraState {
  on: boolean;
  offer: QueueCallOffer | null;
  stats: { waiting: number; myAccepted: number };
  /** Aviso one-shot pro portal (snackbar) — consumido via takeNotice(). */
  notice: { message: string; severity: 'warning' | 'success' } | null;
}

const FLAG_KEY = 'dx-atender-agora'; // JSON { on: true, at: epoch-ms } — intenção do médico
const RESUME_WINDOW_MS = 10 * 60_000; // reload/volta em <10min retoma sem perguntar
const HB_MS = 30_000; // heartbeat (TTL do server = 90s)
const POLL_MS = 5_000; // chamados — roda TAMBÉM com a aba oculta (o alerta é o ponto)

const state: AtenderAgoraState = { on: false, offer: null, stats: { waiting: 0, myAccepted: 0 }, notice: null };
const subs = new Set<(s: AtenderAgoraState) => void>();
let hbTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let hbFails = 0;
let prevOfferId: string | null = null;
let actx: AudioContext | null = null;

const docToken = (): string | null => { try { return localStorage.getItem('doctorToken'); } catch { return null; } };
const headers = () => ({ Authorization: `Bearer ${docToken()}` });
const emit = () => { const snap = { ...state }; subs.forEach((fn) => { try { fn(snap); } catch { /* assinante quebrado não derruba os demais */ } }); };
const setFlag = (on: boolean) => { try { on ? localStorage.setItem(FLAG_KEY, JSON.stringify({ on: true, at: Date.now() })) : localStorage.removeItem(FLAG_KEY); } catch { /* noop */ } };
const touchFlag = () => { try { if (localStorage.getItem(FLAG_KEY)) localStorage.setItem(FLAG_KEY, JSON.stringify({ on: true, at: Date.now() })); } catch { /* noop */ } };

/** Som de chamado (2 bipes) — AudioContext nasce no clique do toggle (gesto),
 *  então tocar depois em background funciona nos navegadores de desktop. */
function unlockAudio(): void {
  try {
    if (!actx) actx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (actx.state === 'suspended') void actx.resume().catch(() => {});
  } catch { actx = null; }
}
function ringOffer(): void {
  try {
    if (!actx || actx.state !== 'running') return;
    const t0 = actx.currentTime;
    for (const [at, f] of [[0, 880], [0.25, 1175]] as const) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
      osc.connect(gain).connect(actx.destination);
      osc.start(t0 + at); osc.stop(t0 + at + 0.25);
    }
  } catch { /* som é best-effort */ }
}
function notifyOffer(offer: QueueCallOffer): void {
  try { (navigator as any).vibrate?.([200, 100, 200]); } catch { /* noop */ }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      // Neutro (LGPD): primeiro nome apenas, nada clínico.
      const first = (offer.patientName || 'Paciente').split(' ')[0];
      const n = new Notification('📞 Novo chamado na fila', { body: `${first} aguarda atendimento — abra o portal para aceitar.`, tag: 'dx-queue-offer' });
      n.onclick = () => { try { window.focus(); n.close(); } catch { /* noop */ } };
    }
  } catch { /* Notification é best-effort */ }
}

async function pollCalls(): Promise<void> {
  if (!state.on || !docToken()) return;
  try {
    const r = await fetch(`${API_URL}/doctor/queue/calls`, { headers: headers() });
    if (!r.ok) return;
    const d = await r.json();
    const offer: QueueCallOffer | null = d?.offer ?? null;
    state.offer = offer;
    state.stats = { waiting: d?.stats?.waiting ?? 0, myAccepted: d?.stats?.myAccepted ?? 0 };
    if (offer && offer.callId !== prevOfferId) { ringOffer(); notifyOffer(offer); }
    if (prevOfferId && !offer) state.notice = { message: 'Chamado expirou.', severity: 'warning' };
    prevOfferId = offer?.callId ?? null;
    emit();
  } catch { /* offline: próximo tick */ }
}

async function heartbeat(): Promise<void> {
  if (!state.on || !docToken()) return;
  try {
    const r = await fetch(`${API_URL}/doctor/online-presence/heartbeat`, { method: 'POST', headers: headers() });
    if (!r.ok) throw new Error('offline');
    hbFails = 0;
    touchFlag(); // intenção continua fresca — reload dentro da janela retoma sozinho
  } catch {
    hbFails += 1;
    if (hbFails >= 3) {
      stopTimers();
      state.on = false; state.offer = null; prevOfferId = null;
      state.notice = { message: 'Conexão instável — "Atender agora" foi pausado. Ative de novo quando estabilizar.', severity: 'warning' };
      setFlag(false);
      emit();
    }
  }
}

function startTimers(): void {
  stopTimers();
  hbFails = 0;
  hbTimer = setInterval(() => void heartbeat(), HB_MS);
  pollTimer = setInterval(() => void pollCalls(), POLL_MS);
  void pollCalls();
}
function stopTimers(): void {
  if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function putPresence(online: boolean): Promise<{ ok: boolean; error?: string; agendaConflict?: boolean }> {
  try {
    const r = await fetch(`${API_URL}/doctor/online-presence`, {
      method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ online }),
    });
    const d = await r.json().catch(() => ({} as any));
    if (!r.ok || d?.online !== online) return { ok: false, error: d?.error };
    return { ok: true, agendaConflict: d?.agendaConflict === true };
  } catch { return { ok: false }; }
}

/** Liga a presença (chamado do toggle do portal — gesto destrava o som e pede Notification). */
export async function enableAtenderAgora(): Promise<{ ok: boolean; error?: string; agendaConflict?: boolean }> {
  unlockAudio();
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => {}); } catch { /* noop */ }
  const res = await putPresence(true);
  if (!res.ok) return res;
  state.on = true; state.offer = null; prevOfferId = null;
  setFlag(true);
  startTimers();
  emit();
  return res;
}

/** Desliga (toggle OFF ou logout). */
export async function disableAtenderAgora(): Promise<void> {
  stopTimers();
  state.on = false; state.offer = null; prevOfferId = null;
  setFlag(false);
  emit();
  await putPresence(false).catch(() => {});
}

/** Retomada pós-reload: intenção recente em localStorage + token → religa sozinho.
 *  Chamar no mount do portal (idempotente — on já ligado = no-op). */
export function resumeAtenderAgora(): void {
  if (state.on || !docToken()) return;
  try {
    const raw = localStorage.getItem(FLAG_KEY);
    if (!raw) return;
    const { at } = JSON.parse(raw) as { at?: number };
    if (!at || Date.now() - at > RESUME_WINDOW_MS) { setFlag(false); return; }
  } catch { return; }
  void enableAtenderAgora();
}

/** Offer consumida pelo portal (aceite/recusa) — limpa sem derrubar presença. */
export function clearAtenderOffer(): void {
  state.offer = null; prevOfferId = null; emit();
}

/** Snapshot atual + inscrição (retorna unsubscribe). O aviso one-shot sai via takeNotice. */
export function subscribeAtenderAgora(fn: (s: AtenderAgoraState) => void): () => void {
  subs.add(fn);
  fn({ ...state });
  return () => subs.delete(fn);
}
export function getAtenderAgora(): AtenderAgoraState { return { ...state }; }
export function takeAtenderNotice(): AtenderAgoraState['notice'] {
  const n = state.notice; state.notice = null; return n;
}

// Fechar a ABA/navegador de verdade → presença cai no server (keepalive); a
// intenção (flag) fica — reabrir em <10min retoma. Navegação SPA NÃO passa aqui.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!state.on || !docToken()) return;
    try {
      fetch(`${API_URL}/doctor/online-presence`, {
        method: 'PUT', keepalive: true,
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: false }),
      }).catch(() => {});
    } catch { /* presença expira sozinha em 90s */ }
  });
}
