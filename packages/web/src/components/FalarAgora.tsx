/**
 * FalarAgora — fila de teleconsulta IMEDIATA (paciente).
 * Spec: docs/design/2026-10-27-fila-imediata-spec.md §5 + contrato §2.
 *
 * Dois exports:
 *  - <FalarAgora />           — card completo (topo de MinhasConsultas): máquina de
 *    estados idle → confirming → queued → matched_pay → ready | expired. Polling
 *    GET /teleconsulta-queue/status 10s; POST/DELETE na entrada/saída da fila.
 *  - <FalarAgoraCompact />    — strip compacto do dashboard: pill "Falar agora · N
 *    online" que navega p/ /consultas. Some quando não há médicos online e não
 *    há entrada ativa (zero ruído no dashboard).
 *
 * Regras: mobile-first 360-412px, 1 coluna, toque ≥44px, hooks ANTES de qualquer
 * early-return, nunca reload(). Erros via snackbar() (helper global do app).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, FormControlLabel,
  InputBase, Skeleton, Stack, Typography, useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import VerifiedUserRoundedIcon from '@mui/icons-material/VerifiedUserRounded';
import { API_URL, token, doctorPhotoUrl } from '../config';
import { useSelectedPatient } from '../patient-context';
import { CONSENT_TEXT } from '../constants/consent';
import { confirmDialog, snackbar } from './ConfirmDialog';
import { copyText } from '../utils/copyText';
import { hapticError, hapticLight, hapticSuccess } from '../utils/haptic';
import { PixPaymentBlock } from './teleconsulta/PixPaymentBlock';
import { AppCard } from './AppCard';

// ── Contrato (spec §2 — resumo; a spec é a fonte) ────────────────────────────
interface QueueEntry {
  id: string;
  status: string; // waiting|matched|accepted|expired|cancelled|no_doctors|ended
  position: number;
  enteredAt: string;
  etaMin?: number | null;
}
interface QueuePayment { qrCode: string; qrBase64?: string; expiresAt?: string }
/** v1.1: médico online visível na lista (ordenado pelo server — mais atendimentos
 *  hoje primeiro, empate = preço asc). Foto via GET /api/doctor/photo/:id (?t=). */
interface QueueDoctor {
  id: string;
  name: string;
  specialty: string | null;
  city: string | null;
  photoAvailable: boolean;
  priceCents: number;
  crmUf: string | null;
  /** Identidade verificada (KYC aprovado) — só `true` ganha o selo; ausente (server antigo) = sem selo. */
  verified?: boolean;
}
interface QueueStatus {
  online: boolean;
  entry: QueueEntry | null;
  doctorsOnline: number;
  doctors?: QueueDoctor[]; // v1.1 (ausente em server antigo → trata como [])
  priceRangeCents: { min: number; max: number } | null;
  matched: { reminderId: string; doctorName: string; priceCents: number; payment: QueuePayment | null } | null;
}

/** centavos → "X,XX" pt-BR (mesmo padrão do app). */
const fmtBrl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Faixa de preço: "R$ 20,00 – R$ 150,00" (min===max → valor único). */
const fmtRange = (r: { min: number; max: number } | null) => {
  if (!r || !(r.max > 0)) return '';
  return r.min === r.max ? `R$ ${fmtBrl(r.max)}` : `R$ ${fmtBrl(r.min)} – R$ ${fmtBrl(r.max)}`;
};
const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
/** Dot verde pulsante (some com prefers-reduced-motion). */
const pulseDotSx = (size = 8) => ({
  width: size, height: size, borderRadius: '50%', bgcolor: '#22c55e', flexShrink: 0,
  animation: 'faPulse 1.6s infinite ease-in-out',
  '@keyframes faPulse': { '0%, 100%': { opacity: 0.35, transform: 'scale(0.85)' }, '50%': { opacity: 1, transform: 'scale(1.2)' } },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}) as const;

// ── v1.1: lista de médicos (mock T1-T4 aprovado) ─────────────────────────────
/** Ícone por especialidade (match por radical sem acento; fallback 🩻). */
const SPECIALTY_EMOJI_RULES: [string, string][] = [
  ['cardio', '🫀'], ['clinic', '🩺'], ['clin', '🩺'], ['psiq', '🧠'], ['endoc', '🦋'],
  ['ped', '👶'], ['ortop', '🦴'], ['dermat', '✋'], ['ginec', '🌸'], ['nutro', '🥗'],
  ['uro', '💧'], ['neuro', '🧬'], ['oftalmo', '👁️'], ['otorrino', '👂'], ['geria', '🧑‍🦳'],
  ['onco', '🎗️'], ['reuma', '🦾'], ['cirurg', '🔪'], ['anestes', '💉'], ['famil', '🏠'],
];
const specialtyEmoji = (s: string | null | undefined): string => {
  const k = (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [rad, emoji] of SPECIALTY_EMOJI_RULES) if (k.includes(rad)) return emoji;
  return '🩻';
};
/** Gradiente teal DETERMINÍSTICO por id (avatar fallback — sempre família teal). */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#20b2aa,#178f89)', 'linear-gradient(135deg,#2dd4bf,#0f766e)',
  'linear-gradient(135deg,#5fc9c3,#20b2aa)', 'linear-gradient(135deg,#0d9488,#134e4a)',
  'linear-gradient(135deg,#14b8a6,#115e59)',
];
const gradFor = (id: string) => AVATAR_GRADIENTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
/** "Dra. Ana Cardoso" → "A" (inicial do nome próprio). */
const initialOf = (name: string) => (name.trim().split(/\s+/).find((w) => !/^dr[a]?\.?$/i.test(w)) || name).charAt(0).toUpperCase();
/** Título honesto: já vem "Dr./Dra." do cadastro; senão prefixa. */
const doctorTitle = (name: string) => (/^dr[a]?\.?\s/i.test(name.trim()) ? name.trim() : `Dr(a). ${name}`);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Chip de filtro (mock T1/T2): min-height 44px (toque), ativo = gradiente teal. */
const chipSx = (on: boolean, _isDark: boolean) => ({
  height: 44, borderRadius: '999px', flexShrink: 0, px: 0.5,
  fontWeight: 800, fontSize: 12.5,
  bgcolor: on ? 'transparent' : 'transparent',
  ...(on
    ? { background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', border: '1.5px solid transparent' }
    : { color: 'text.secondary', border: '1.5px solid', borderColor: 'rgba(157,180,178,.35)' }),
}) as const;

/** Avatar 52px: foto (rota autenticada existente) SOBRE a inicial em gradiente —
 *  onError esconde o <img> e a inicial fica visível (nunca quebra o layout). */
const DoctorAvatar = ({ d }: { d: QueueDoctor }) => (
  <Box sx={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
    <Box aria-hidden="true" sx={{ width: 52, height: 52, borderRadius: '16px', background: gradFor(d.id), display: 'grid', placeItems: 'center', fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 19, color: '#fff', position: 'absolute', inset: 0 }}>
      {initialOf(d.name)}
    </Box>
    {d.photoAvailable && (
      <Box
        component="img"
        src={doctorPhotoUrl(d.id)}
        alt=""
        loading="lazy"
        onError={(e: SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
        sx={{ position: 'absolute', inset: 0, width: 52, height: 52, borderRadius: '16px', objectFit: 'cover' }}
      />
    )}
    <Box component="span" aria-hidden="true" sx={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: '50%', bgcolor: '#22c55e', border: '2.5px solid', borderColor: 'background.paper' }} />
  </Box>
);

/** Card de médico (mock T1): avatar · nome (+badge) · especialidade·CRM · cidade · preço. */
const DoctorRow = ({ d, fastest, onClick, isDark }: { d: QueueDoctor; fastest?: boolean; onClick: () => void; isDark: boolean }) => (
  <Stack
    component="button"
    type="button"
    onClick={onClick}
    aria-label={`Falar com ${doctorTitle(d.name)} — ${d.specialty ?? 'médico'}${d.priceCents > 0 ? `, R$ ${fmtBrl(d.priceCents)}` : ', grátis'}${d.verified === true ? ', identidade verificada' : ''}`}
    direction="row"
    alignItems="center"
    spacing={1.5}
    sx={{
      display: 'flex', width: '100%', textAlign: 'left', border: 'none', borderTop: '1px solid', borderColor: 'divider',
      bgcolor: 'transparent', cursor: 'pointer', p: '13px 2px', minWidth: 0,
      '&:first-of-type': { borderTop: 'none', pt: '6px' },
      '&:hover': { bgcolor: isDark ? 'rgba(32,178,170,.06)' : 'rgba(32,178,170,.04)' },
    }}
  >
    <DoctorAvatar d={d} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>
          {doctorTitle(d.name)}
        </Typography>
        {fastest && (
          <Box component="span" sx={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', px: 0.8, py: 0.25, borderRadius: '6px', bgcolor: 'rgba(34,197,94,.15)', color: isDark ? '#4ade80' : '#16a34a' }}>
            mais rápido
          </Box>
        )}
      </Stack>
      <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: isDark ? '#5fd8d1' : '#0f766e', mt: 0.25 }}>
        {d.specialty || 'Clínica Geral'}{d.crmUf ? ` · CRM-${d.crmUf}` : ''}
      </Typography>
      {d.verified === true && (
        <Box
          component="span"
          role="img"
          aria-label="Identidade verificada"
          data-testid="identity-verified-badge"
          sx={{
            display: 'inline-flex', alignItems: 'flex-start', gap: 0.5, maxWidth: '100%', mt: 0.4, px: 0.8, py: 0.25, borderRadius: '6px',
            fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, color: isDark ? '#5fd8d1' : '#0f766e',
            bgcolor: isDark ? 'rgba(95,216,209,.12)' : 'rgba(32,178,170,.10)',
          }}
        >
          <VerifiedUserRoundedIcon aria-hidden="true" sx={{ fontSize: 12, flexShrink: 0, mt: '1px' }} />
          {/* quebra de linha em tela estreita (320px) em vez de cortar com "…": é um selo de confiança, tem de ser lido inteiro */}
          <Box component="span" sx={{ minWidth: 0 }}>Identidade verificada</Box>
        </Box>
      )}
      {d.city && (
        <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 500, color: 'text.secondary', mt: 0.15 }}>
          📍 {d.city}
        </Typography>
      )}
    </Box>
    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
      <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>
        {d.priceCents > 0 ? `R$ ${fmtBrl(d.priceCents)}` : 'Grátis'}
      </Typography>
      <Typography sx={{ fontSize: 10.5, fontWeight: 500, color: 'text.secondary' }}>na hora</Typography>
    </Box>
  </Stack>
);

// ── Card completo ─────────────────────────────────────────────────────────────
export const FalarAgora = ({ sx }: { sx?: object }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();

  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ui, setUi] = useState<'idle' | 'confirming'>('idle'); // pré-POST (idle/confirming); pós-POST deriva do entry.status
  const [consentOk, setConsentOk] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [terminalSeen, setTerminalSeen] = useState<'expired' | null>(null); // mantém a tela "expirou" até o usuário tentar de novo
  // v1.1: escolha do médico (mock T1-T4) — chips/grid de especialidade são VISUAIS;
  // o POST leva preferredDoctorId (+ specialty do filtro ativo no toque do card).
  const [espFilter, setEspFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAllEsp, setShowAllEsp] = useState(false);
  const [choice, setChoice] = useState<{ doctorId: string; name: string; priceCents: number; specialty: string | null } | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const copyTimer = useRef<any>(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  // Poll 10s + refresh ao voltar pra aba. Skip silencioso quando aba oculta.
  const poll = useCallback(async () => {
    if (!token()) return;
    try {
      const r = await fetch(`${API_URL}/teleconsulta-queue/status`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
      const d: QueueStatus = await r.json();
      setStatus(d);
      const st = d.entry?.status ?? null;
      // Transição matched/accepted → accepted = pagamento confirmado (avisa 1×).
      if (prevStatusRef.current === 'matched' && st === 'accepted') {
        hapticSuccess();
        snackbar({ message: '✓ Pagamento confirmado — sua consulta está liberada!', severity: 'success' });
      }
      if (st === 'expired' || st === 'no_doctors') setTerminalSeen('expired');
      if (st && st !== 'expired' && st !== 'no_doctors') setTerminalSeen(null);
      prevStatusRef.current = st;
    } catch { /* offline: próximo tick */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void poll();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 10_000);
    const refresh = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [poll]);

  // Cronômetro da espera (1s) — só conta enquanto montado.
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const join = async () => {
    if (!pid) { snackbar({ message: 'Selecione o paciente antes de entrar na fila.', severity: 'warning' }); return; }
    setJoinBusy(true);
    try {
      // Teto da autorização: médico ESCOLHIDO → o preço dele; sem escolha → faixa max.
      const maxPrice = choice
        ? (choice.priceCents > 0 ? choice.priceCents : undefined)
        : status?.priceRangeCents?.max && status.priceRangeCents.max > 0 ? status.priceRangeCents.max : undefined;
      const r = await fetch(`${API_URL}/teleconsulta-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          patientId: pid, consent: true,
          ...(maxPrice != null ? { maxPriceCents: maxPrice } : {}),
          // v1.1: escolha opcional — preferredDoctorId (+ specialty só quando o card
          // foi tocado sob um filtro de especialidade ativo; "Todos" não restringe).
          ...(choice ? { preferredDoctorId: choice.doctorId, ...(choice.specialty ? { specialty: choice.specialty } : {}) } : {}),
        }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (r.status === 409 && d?.code === 'QUEUE_ACTIVE') { snackbar({ message: 'Você já está na fila — mostrando sua posição.', severity: 'info' }); setUi('idle'); void poll(); return; }
      if (!r.ok) throw new Error(d?.error || 'Não foi possível entrar na fila.');
      hapticLight();
      setChoice(null);
      setUi('idle');
      void poll();
    } catch (e: any) {
      hapticError();
      snackbar({ message: e?.message || 'Não foi possível entrar na fila.', severity: 'error' });
    } finally { setJoinBusy(false); }
  };

  // Toque num card → fluxo de consent com o médico escolhido (preferredDoctorId).
  const pickDoctor = (d: QueueDoctor) => {
    hapticLight();
    setConsentOk(false);
    setChoice({ doctorId: d.id, name: d.name, priceCents: d.priceCents, specialty: espFilter });
    setUi('confirming');
  };
  // CTA "sem preferência" — fila FIFO pura (o match decide quem atende).
  const pickNoPreference = () => {
    hapticLight();
    setConsentOk(false);
    setChoice(null);
    setUi('confirming');
  };

  const leaveQueue = async () => {
    if (!(await confirmDialog({ title: 'Sair da fila', message: 'Quer mesmo cancelar sua espera por um médico agora? Você pode voltar quando quiser.', confirmLabel: 'Sair da fila' }))) return;
    setCancelBusy(true);
    try {
      const r = await fetch(`${API_URL}/teleconsulta-queue`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error();
      hapticLight();
      setTerminalSeen(null);
      void poll();
    } catch {
      hapticError();
      snackbar({ message: 'Não conseguimos tirar você da fila. Tente de novo.', severity: 'error' });
    } finally { setCancelBusy(false); }
  };

  const doCopy = async (code: string) => {
    if (!code) return;
    if (await copyText(code)) {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
      try { snackbar({ message: 'Código PIX copiado!', severity: 'success' }); } catch { /* toast nunca derruba o card */ }
    } else {
      hapticLight();
      try { snackbar({ message: 'Não deu pra copiar automático. Copie o código exibido acima.', severity: 'info' }); } catch { /* noop */ }
    }
  };

  // Fase derivada do SERVER (entry.status) — o cliente nunca "inventa" estado:
  //  waiting → queued · matched → matched_pay (PIX) · accepted/ended → ready ·
  //  expired/no_doctors → expired · null → idle (ou expired até "Tentar de novo").
  const entry = status?.entry ?? null;
  const st = entry?.status ?? null;
  const phase: 'loading' | 'idle' | 'confirming' | 'queued' | 'matched_pay' | 'ready' | 'expired' =
    loading ? 'loading'
    : ui === 'confirming' && !entry ? 'confirming'
    : st === 'waiting' ? 'queued'
    : st === 'matched' ? 'matched_pay'
    : st === 'accepted' || st === 'ended' ? 'ready'
    : st === 'expired' || st === 'no_doctors' ? 'expired'
    : terminalSeen === 'expired' ? 'expired'
    : 'idle';

  const doctorsOnline = status?.doctorsOnline ?? 0;
  const range = fmtRange(status?.priceRangeCents ?? null);
  const rangeMax = status?.priceRangeCents?.max ?? 0; // teto da autorização de valor (spec §5)
  // v1.1: lista de médicos online (ordenada pelo server — todos online, melhor primeiro).
  const doctors = status?.doctors ?? [];
  const espCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of doctors) if (d.specialty) m.set(d.specialty, (m.get(d.specialty) ?? 0) + 1);
    return m;
  }, [doctors]);
  const espList = useMemo(() => [...espCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')), [espCounts]);
  // Layout adaptativo (mock aprovado): >7 médicos OU >5 especialidades → grade+bussa.
  const useGrid = doctors.length > 7 || espList.length > 5;
  const visibleDoctors = useMemo(() => {
    let list = doctors;
    if (espFilter) list = list.filter((d) => d.specialty === espFilter);
    const q = norm(search.trim());
    if (q) list = list.filter((d) => norm(d.name).includes(q) || norm(d.specialty ?? '').includes(q));
    return list;
  }, [doctors, espFilter, search]);
  const ctaDoctor = visibleDoctors.length === 1 ? visibleDoctors[0] : null; // CTA vira "falar com ele"
  const firstPrice = doctors[0] ? (doctors[0].priceCents > 0 ? `R$ ${fmtBrl(doctors[0].priceCents)}` : 'grátis') : '';
  const waitSec = entry?.enteredAt ? Math.max(0, Math.floor((nowTick - new Date(entry.enteredAt).getTime()) / 1000)) : 0;
  const matched = status?.matched ?? null;

  // QR do match: enquanto vivo, render inline; sem QR/expirado → PixPaymentBlock
  // (retoma o MESMO PIX pendente via 409+pendingPix ou gera um novo).
  const pay = matched?.payment ?? null;
  const payExpired = !!pay?.expiresAt && new Date(pay.expiresAt).getTime() <= Date.now();

  const gradBtn = {
    minHeight: 46, borderRadius: '12px', textTransform: 'none' as const, fontWeight: 800, fontSize: 14.5,
    background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)', color: '#fff',
    boxShadow: '0 4px 14px rgba(32,178,170,.35)',
    '&:hover': { background: 'linear-gradient(135deg, #1aa39c 0%, #14807b 100%)' },
    '&:disabled': { background: 'rgba(32,178,170,.35)', color: '#fff' },
  };

  return (
    <Card
      elevation={0}
      aria-label="Falar agora com um médico"
      sx={{
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden',
        border: '1.5px solid',
        borderColor: phase === 'matched_pay' || phase === 'ready'
          ? 'rgba(16,185,129,.4)'
          : 'rgba(32,178,170,.3)',
        background: isDark
          ? 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(15,24,24,.6) 60%)'
          : 'linear-gradient(135deg, rgba(32,178,170,.07), rgba(255,255,255,.9) 55%)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 6px 24px rgba(0,0,0,.06)',
        ...sx,
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.25 }, '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
        {/* Header: ícone + título + chip médicos online */}
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box
            aria-hidden="true"
            sx={{ width: 44, height: 44, borderRadius: '14px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.14)', color: '#178f89' }}
          >
            {phase === 'queued' ? <HourglassTopRoundedIcon sx={{ fontSize: 24 }} /> : <BoltRoundedIcon sx={{ fontSize: 24 }} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 16.5, color: 'text.primary', lineHeight: 1.2 }}>
              Falar agora com um médico
            </Typography>
            <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.15 }}>
              {phase === 'ready' ? 'Consulta liberada'
                : phase === 'matched_pay' ? 'Médico confirmado — falta o pagamento'
                : phase === 'queued' ? 'Na fila de atendimento imediato'
                : phase === 'expired' ? 'Atendimento imediato indisponível'
                : 'Atendimento imediato, sem agendamento'}
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={<Box component="span" sx={pulseDotSx(doctorsOnline > 0 ? 7 : 0)} aria-hidden="true" />}
            label={doctorsOnline > 0 ? `${doctorsOnline} online` : '0 online'}
            aria-label={`${doctorsOnline} médicos online agora`}
            sx={{
              height: 24, flexShrink: 0, fontWeight: 800, fontSize: 11,
              bgcolor: doctorsOnline > 0 ? 'rgba(16,185,129,.12)' : 'action.hover',
              color: doctorsOnline > 0 ? (isDark ? '#34d399' : '#059669') : 'text.secondary',
              border: '1px solid', borderColor: doctorsOnline > 0 ? 'rgba(52,211,153,.3)' : 'transparent',
              '& .MuiChip-icon': { ml: 1 },
            }}
          />
        </Stack>

        {/* ── LOADING (skeleton do mesmo footprint) ── */}
        {phase === 'loading' && (
          <Stack spacing={1} sx={{ mt: 2 }} aria-hidden="true">
            <Skeleton variant="rounded" height={18} />
            <Skeleton variant="rounded" height={46} />
          </Stack>
        )}

        {/* ── IDLE ── v1.1: lista de médicos (mock T1-T4) · vazio honesto sem médicos */}
        {phase === 'idle' && doctors.length === 0 && (
          <Box sx={{ mt: 1.75 }}>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55 }}>
              Nenhum médico online agora. A fila imediata funciona quando há médicos em
              plantão — você pode agendar para depois ou voltar mais tarde.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<MedicalServicesRoundedIcon />}
                onClick={() => { hapticLight(); navigate('/medicos'); }}
                sx={gradBtn}
              >
                Agendar para depois
              </Button>
              <Button
                fullWidth
                variant="outlined"
                disabled={joinBusy || !pid}
                onClick={() => pickNoPreference()}
                sx={{ minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, borderColor: 'divider', color: 'text.secondary' }}
              >
                Entrar na fila mesmo assim
              </Button>
            </Stack>
          </Box>
        )}
        {phase === 'idle' && doctors.length > 0 && (
          <Box sx={{ mt: 1.75 }}>
            {/* Hero (mock): N online + faixa de preço */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5 }}>
              <Box component="span" sx={pulseDotSx(9)} aria-hidden="true" />
              <Box sx={{ minWidth: 0 }}>
                <Typography component="h3" noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15.5, color: 'text.primary' }}>
                  {doctors.length} {doctors.length === 1 ? 'médico online agora' : 'médicos online agora'}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.15 }}>
                  Atendimento por vídeo{range ? ` · ${range}` : ' · grátis'} — escolha quem te atende
                </Typography>
              </Box>
            </Stack>

            {/* Muitas especialidades (T4): busca + grade 2col + "ver todas" */}
            {useGrid && (
              <>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mt: 1, px: 1.5, py: 0.25, minHeight: 44, borderRadius: '12px', bgcolor: isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)', border: '1px solid', borderColor: 'divider' }}
                >
                  <SearchRoundedIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                  <InputBase
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar especialidade ou médico…"
                    inputProps={{ 'aria-label': 'Buscar médico por nome ou especialidade' }}
                    sx={{ flex: 1, fontSize: 13, color: 'text.primary' }}
                  />
                </Stack>
                {!search && (
                  <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    {(showAllEsp ? espList : espList.slice(0, 6)).map(([esp, n]) => (
                      <Stack
                        key={esp}
                        component="button"
                        type="button"
                        onClick={() => { hapticLight(); setEspFilter(espFilter === esp ? null : esp); }}
                        aria-label={`Filtrar por ${esp} — ${n} online`}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                          minHeight: 56, p: 1.25, borderRadius: '14px', cursor: 'pointer', textAlign: 'left',
                          border: '1px solid', borderColor: espFilter === esp ? 'rgba(32,178,170,.55)' : 'rgba(32,178,170,.25)',
                          bgcolor: espFilter === esp ? 'rgba(32,178,170,.14)' : 'rgba(32,178,170,.06)',
                        }}
                      >
                        <Box component="span" aria-hidden="true" sx={{ fontSize: 18, flexShrink: 0 }}>{specialtyEmoji(esp)}</Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography noWrap sx={{ fontWeight: 800, fontSize: 12.5, color: 'text.primary' }}>{esp}</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: 10.5, color: isDark ? '#5fd8d1' : '#0f766e' }}>{n} online</Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Box>
                )}
                {!search && espList.length > 6 && (
                  <Button
                    fullWidth
                    variant="text"
                    onClick={() => { hapticLight(); setShowAllEsp((v) => !v); }}
                    sx={{ mt: 0.75, minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: 13, color: isDark ? '#7ce8e0' : '#0f766e', border: '1.5px dashed rgba(45,212,191,.4)' }}
                  >
                    {showAllEsp ? 'Recolher especialidades' : `Ver todas as ${espList.length} especialidades →`}
                  </Button>
                )}
              </>
            )}

            {/* Poucos médicos (T1/T2): chips de especialidade com contagem */}
            {!useGrid && espList.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 0.5, overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                <Chip
                  clickable
                  label={`Todos ${doctors.length}`}
                  aria-pressed={espFilter === null}
                  onClick={() => { hapticLight(); setEspFilter(null); }}
                  sx={chipSx(espFilter === null, isDark)}
                />
                {espList.map(([esp, n]) => (
                  <Chip
                    key={esp}
                    clickable
                    label={`${esp} ${n}`}
                    aria-pressed={espFilter === esp}
                    onClick={() => { hapticLight(); setEspFilter(espFilter === esp ? null : esp); }}
                    sx={{ ...chipSx(espFilter === esp, isDark), flexShrink: 0 }}
                  />
                ))}
              </Stack>
            )}

            {/* Lista (sempre presente no modo chips; no modo grade só com filtro/busca) */}
            {(!useGrid || !!espFilter || !!search.trim()) && (
              <Box sx={{ mt: useGrid ? 1 : 0.5 }}>
                {visibleDoctors.length > 0 ? visibleDoctors.map((d, i) => (
                  <DoctorRow
                    key={d.id}
                    d={d}
                    isDark={isDark}
                    fastest={i === 0 && doctors.length > 1 && !espFilter && !search.trim()}
                    onClick={() => pickDoctor(d)}
                  />
                )) : (
                  <Box sx={{ border: '1.5px dashed', borderColor: 'rgba(157,180,178,.35)', borderRadius: '14px', p: 1.75, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                      Ninguém de {espFilter ? <b>{espFilter}</b> : 'busca'} online agora.
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => { hapticLight(); setEspFilter(null); setSearch(''); }}
                      sx={{ mt: 0.5, textTransform: 'none', fontWeight: 800, fontSize: 12.5, color: isDark ? '#5fd8d1' : '#0f766e' }}
                    >
                      Ver os {doctors.length} de todas as especialidades
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* CTA final (mock): 1 visível → falar com ele; senão "sem preferência" */}
            <Button
              fullWidth
              variant="contained"
              startIcon={<MedicalServicesRoundedIcon />}
              disabled={joinBusy || !pid}
              onClick={() => (ctaDoctor ? pickDoctor(ctaDoctor) : pickNoPreference())}
              sx={{ ...gradBtn, mt: 1.25 }}
            >
              {ctaDoctor
                ? `Falar com ${doctorTitle(ctaDoctor.name)}${ctaDoctor.priceCents > 0 ? ` — R$ ${fmtBrl(ctaDoctor.priceCents)}` : ' — grátis'}`
                : `Sem preferência — falar com o primeiro${firstPrice && firstPrice !== 'grátis' ? ` (R$ ${firstPrice.replace(/^R\$ /, '')})` : firstPrice === 'grátis' ? ' (grátis)' : ''}`}
            </Button>
            <Typography sx={{ mt: 1, fontSize: 11, fontWeight: 500, color: 'text.secondary', textAlign: 'center', lineHeight: 1.5 }}>
              🔒 Consulta registrada · CFM 2.314 · cobrança só quando um médico aceitar
            </Typography>
          </Box>
        )}

        {/* ── CONFIRMING: médico escolhido (v1.1) + consentimento + autorização ── */}
        {phase === 'confirming' && (
          <Box sx={{ mt: 1.75 }} component="section" aria-label="Consentimento e autorização de valor">
            {choice && (
              <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.25, p: 1, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.08)', border: '1px solid rgba(32,178,170,.25)' }}>
                <DoctorAvatar d={{ id: choice.doctorId, name: choice.name, specialty: choice.specialty, city: null, photoAvailable: doctors.find((x) => x.id === choice.doctorId)?.photoAvailable ?? false, priceCents: choice.priceCents, crmUf: null }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 14, color: 'text.primary' }}>
                    {doctorTitle(choice.name)}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.15 }}>
                    {choice.specialty ? `${choice.specialty} · ` : ''}{choice.priceCents > 0 ? `R$ ${fmtBrl(choice.priceCents)} na hora` : 'Atendimento grátis'}
                  </Typography>
                </Box>
              </Stack>
            )}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary' }}>
                {choice
                  ? (choice.priceCents > 0 ? `Valor: R$ ${fmtBrl(choice.priceCents)} (médico escolhido)` : 'Valor: grátis')
                  : range ? `Valor: ${range}` : 'Valor definido pelo médico que atender'}
              </Typography>
              {(choice ? choice.priceCents > 0 : rangeMax > 0) && (
                <Chip size="small" label={`autorizo até R$ ${fmtBrl(choice ? choice.priceCents : rangeMax)}`} sx={{ height: 24, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(212,165,116,.15)', color: isDark ? '#d4a574' : '#8a5a1f', border: '1px solid rgba(212,165,116,.35)' }} />
              )}
            </Stack>
            <Box
              sx={{
                maxHeight: 180, overflowY: 'auto', p: 1.5, borderRadius: '12px',
                bgcolor: isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)',
                border: '1px solid', borderColor: 'divider',
              }}
            >
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.65 }}>{CONSENT_TEXT}</Typography>
            </Box>
            <FormControlLabel
              sx={{ alignItems: 'flex-start', mt: 1.25, '& .MuiFormControlLabel-label': { fontSize: 12.5, lineHeight: 1.5, color: 'text.secondary' } }}
              control={<Checkbox checked={consentOk} onChange={(e) => setConsentOk(e.target.checked)} sx={{ pt: 0.25, mt: -0.5, color: 'primary.main', '&.Mui-checked': { color: '#178f89' } }} />}
              label={(choice ? choice.priceCents : rangeMax) > 0
                ? `Li e aceito o consentimento acima e autorizo a cobrança de até R$ ${fmtBrl(choice ? choice.priceCents : rangeMax)} pelo atendimento (pago por PIX só quando um médico aceitar).`
                : 'Li e aceito o consentimento acima. O valor, se houver cobrança, será combinado e pago por PIX só quando um médico aceitar.'}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
              <Button
                fullWidth
                variant="contained"
                disabled={!consentOk || joinBusy || !pid}
                startIcon={joinBusy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <MedicalServicesRoundedIcon />}
                onClick={() => void join()}
                sx={gradBtn}
              >
                {joinBusy ? 'Entrando na fila…' : 'Entrar na fila'}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                disabled={joinBusy}
                onClick={() => { hapticLight(); setUi('idle'); }}
                sx={{ minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, borderColor: 'divider', color: 'text.secondary' }}
              >
                Voltar
              </Button>
            </Stack>
          </Box>
        )}

        {/* ── QUEUED: posição + cronômetro + cancelar ── */}
        {phase === 'queued' && entry && (
          <Box sx={{ mt: 1.75 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              <Chip size="small" label={`Posição ${entry.position || 1} na fila`} sx={{ height: 26, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: isDark ? '#2dd4bf' : '#0f766e', border: '1px solid rgba(32,178,170,.3)' }} />
              <Chip size="small" label={`esperando há ${mmss(waitSec)}`} sx={{ height: 26, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', bgcolor: 'action.hover', color: 'text.secondary' }} />
              {entry.etaMin != null && entry.etaMin > 0 && (
                <Chip size="small" label={`~${entry.etaMin} min de espera`} sx={{ height: 26, fontSize: 12, fontWeight: 800, bgcolor: 'action.hover', color: 'text.secondary' }} />
              )}
            </Stack>
            {doctorsOnline === 0 && (
              <Typography sx={{ mt: 1.25, fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                Nenhum médico online agora — você pode esperar ou tentar mais tarde.
              </Typography>
            )}
            <Typography sx={{ mt: 1.25, fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
              Avisaremos quando um médico aceitar. Mantenha o app aberto ou volte para esta tela.
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              disabled={cancelBusy}
              startIcon={cancelBusy ? <CircularProgress size={16} color="inherit" /> : <EventBusyRoundedIcon sx={{ fontSize: 18 }} />}
              onClick={() => void leaveQueue()}
              sx={{ mt: 1.5, minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'text.secondary', borderColor: 'divider', '&:hover': { color: 'error.main', borderColor: 'error.light', bgcolor: 'rgba(239,68,68,.05)' } }}
            >
              {cancelBusy ? 'Cancelando…' : 'Cancelar espera'}
            </Button>
          </Box>
        )}

        {/* ── MATCHED_PAY: médico aceitou → PIX ── */}
        {phase === 'matched_pay' && matched && (
          <Box sx={{ mt: 1.75 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25, px: 1.25, py: 1, borderRadius: '12px', bgcolor: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)' }}>
              <Box component="span" sx={pulseDotSx(8)} aria-hidden="true" />
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13, fontWeight: 800, color: isDark ? '#34d399' : '#059669' }}>
                  {matched.doctorName?.toLowerCase().startsWith('dr') ? matched.doctorName : `Dr(a). ${matched.doctorName || 'médico'}`} vai te atender
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                  {matched.priceCents > 0 ? `Conclua o pagamento de R$ ${fmtBrl(matched.priceCents)} para liberar a sala.` : 'Sala liberada — entre na consulta.'}
                </Typography>
              </Box>
            </Stack>

            {matched.priceCents > 0 && (pay && !payExpired ? (
              <>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                  <Stack direction="row" alignItems="baseline" spacing={0.5}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary' }}>R$</Typography>
                    <Typography sx={{ fontSize: 24, fontWeight: 900, color: 'text.primary', letterSpacing: '-0.02em', fontFamily: '"Poppins",sans-serif' }}>
                      {fmtBrl(matched.priceCents)}
                    </Typography>
                  </Stack>
                  {pay.expiresAt && <PixCountdown expiresAt={pay.expiresAt} />}
                </Stack>
                {pay.qrBase64 && (
                  <Box
                    component="img"
                    src={pay.qrBase64}
                    alt="QR Code PIX da consulta"
                    sx={{ width: 190, height: 190, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: '#fff', p: 1, mx: 'auto', display: 'block', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}
                  />
                )}
                {pay.qrCode && (
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.25, p: 1.25, px: 1.5, borderRadius: '10px', bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider' }}>
                    <Typography noWrap sx={{ fontSize: 11.5, fontFamily: 'monospace', color: 'text.secondary', maxWidth: '78%' }}>
                      {pay.qrCode.slice(0, 24)}…{pay.qrCode.slice(-12)}
                    </Typography>
                    <Button
                      size="small"
                      startIcon={copied ? <CheckCircleOutlineRoundedIcon /> : <ContentCopyRoundedIcon />}
                      onClick={() => void doCopy(pay.qrCode!)}
                      sx={{ textTransform: 'none', fontWeight: 800, fontSize: 12, color: '#178f89', flexShrink: 0 }}
                    >
                      {copied ? 'Copiado!' : 'Copiar'}
                    </Button>
                  </Stack>
                )}
                <Button
                  fullWidth
                  size="small"
                  disabled={recheckBusy}
                  startIcon={recheckBusy ? <CircularProgress size={14} color="inherit" /> : null}
                  onClick={() => { setRecheckBusy(true); void poll().finally(() => setRecheckBusy(false)); }}
                  sx={{ mt: 1.25, minHeight: 40, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12.5, color: 'text.secondary', borderColor: 'divider' }}
                >
                  {recheckBusy ? 'Verificando…' : 'Já paguei — verificar de novo'}
                </Button>
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1.25 }}>
                  <Box component="span" sx={pulseDotSx(8)} aria-hidden="true" />
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Aguardando confirmação bancária…</Typography>
                </Stack>
              </>
            ) : (
              // Sem QR vivo no status → PixPaymentBlock (retoma o mesmo PIX ou gera novo).
              <PixPaymentBlock
                reminderId={matched.reminderId}
                priceCents={matched.priceCents}
                onPaid={() => void poll()}
              />
            ))}

            <Button
              fullWidth
              variant="outlined"
              disabled={cancelBusy}
              onClick={() => void leaveQueue()}
              sx={{ mt: 1.5, minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12.5, color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: 'rgba(239,68,68,.05)' } }}
            >
              {cancelBusy ? 'Cancelando…' : 'Desistir da consulta'}
            </Button>
          </Box>
        )}

        {/* ── READY: pagamento ok (ou consulta gratuita) ── */}
        {phase === 'ready' && (
          <Box sx={{ mt: 1.75, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 1.5, lineHeight: 1.55 }}>
              {matched?.doctorName ? `${matched.doctorName} está esperando por você.` : 'Sua consulta está liberada.'} Entre na sala agora.
            </Typography>
            <Button
              fullWidth
              variant="contained"
              startIcon={<VideocamRoundedIcon />}
              onClick={() => { hapticSuccess(); navigate(matched?.reminderId ? `/teleconsulta/${matched.reminderId}` : '/consultas'); }}
              sx={{ ...gradBtn, background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', '&:hover': { background: 'linear-gradient(135deg, #047857 0%, #059669 100%)' } }}
            >
              Entrar na consulta
            </Button>
          </Box>
        )}

        {/* ── EXPIRED ── */}
        {phase === 'expired' && (
          <Box sx={{ mt: 1.75, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 1.5, lineHeight: 1.55 }}>
              Nenhum médico pôde atender agora. Nenhuma cobrança foi feita — você pode tentar de novo ou agendar com seu médico.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<ReplayRoundedIcon />}
                onClick={() => { hapticLight(); setTerminalSeen(null); setChoice(null); setUi('confirming'); setConsentOk(false); void poll(); }}
                sx={gradBtn}
              >
                Tentar de novo
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => { hapticLight(); navigate('/medicos'); }}
                sx={{ minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: 13.5, borderColor: 'divider', color: 'text.secondary' }}
              >
                Agendar com meu médico
              </Button>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

/** Countdown MM:SS do PIX (determinado pelo expiresAt do server). */
const PixCountdown = ({ expiresAt }: { expiresAt: string }) => {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const iv = setInterval(() => setSecs(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  return (
    <Chip
      size="small"
      label={`Vence em ${mmss(secs)}`}
      sx={{ height: 24, borderRadius: '999px', fontWeight: 800, fontSize: 11, fontVariantNumeric: 'tabular-nums', bgcolor: 'rgba(23,143,137,.12)', color: '#0d5f5a', border: '1px solid rgba(23,143,137,.3)' }}
    />
  );
};

// ── Strip compacto do dashboard ──────────────────────────────────────────────
/** Polling leve do MESMO /status (10s, só com a aba visível). Renderiza apenas
 *  quando há médicos online OU entrada ativa — dashboard limpo, zero ruído. */
export const FalarAgoraCompact = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token()) { setLoaded(true); return; }
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${API_URL}/teleconsulta-queue/status`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return;
        const d: QueueStatus = await r.json();
        if (alive) setStatus(d);
      } catch { /* offline: próximo tick */ }
      finally { if (alive) setLoaded(true); }
    };
    void poll();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 10_000);
    const refresh = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  if (!loaded || !status) return null;
  const doctorsOnline = status.doctorsOnline ?? 0;
  const entry = status.entry;
  const active = !!entry && ['waiting', 'matched', 'accepted'].includes(entry.status ?? '');
  if (doctorsOnline === 0 && !active) return null;

  const label = active
    ? entry!.status === 'accepted' ? 'Consulta liberada — entre agora'
      : entry!.status === 'matched' ? 'Médico confirmado — concluir pagamento'
      : `Na fila · posição ${entry!.position || 1}`
    : `Falar agora · ${doctorsOnline} online`;

  return (
    <AppCard
      kind="interactive"
      onClick={() => navigate('/consultas')}
      aria-label={`${label} — abrir Minhas Consultas`}
      sx={{ p: 1.5, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1.25 }}
    >
      <Box aria-hidden="true" sx={{ width: 36, height: 36, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89' }}>
        <BoltRoundedIcon sx={{ fontSize: 20 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 13.5, color: 'text.primary', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
          {active ? 'Acompanhar na tela Minhas Consultas' : 'Teleconsulta imediata, sem agendamento'}
        </Typography>
      </Box>
      {doctorsOnline > 0 && !active && <Box component="span" sx={pulseDotSx(8)} aria-hidden="true" />}
      <ChevronRightRoundedIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
    </AppCard>
  );
};
