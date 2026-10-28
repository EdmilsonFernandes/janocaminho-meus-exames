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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, FormControlLabel,
  Skeleton, Stack, Typography, useTheme,
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
import { API_URL, token } from '../config';
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
interface QueueStatus {
  online: boolean;
  entry: QueueEntry | null;
  doctorsOnline: number;
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
      const maxPrice = status?.priceRangeCents?.max && status.priceRangeCents.max > 0 ? status.priceRangeCents.max : undefined;
      const r = await fetch(`${API_URL}/teleconsulta-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId: pid, consent: true, ...(maxPrice != null ? { maxPriceCents: maxPrice } : {}) }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (r.status === 409 && d?.code === 'QUEUE_ACTIVE') { snackbar({ message: 'Você já está na fila — mostrando sua posição.', severity: 'info' }); setUi('idle'); void poll(); return; }
      if (!r.ok) throw new Error(d?.error || 'Não foi possível entrar na fila.');
      hapticLight();
      setUi('idle');
      void poll();
    } catch (e: any) {
      hapticError();
      snackbar({ message: e?.message || 'Não foi possível entrar na fila.', severity: 'error' });
    } finally { setJoinBusy(false); }
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

        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <Box sx={{ mt: 1.75 }}>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55 }}>
              {range ? `Atendimento por vídeo agora, ${range}. ` : 'Atendimento por vídeo agora. '}
              {doctorsOnline > 0
                ? 'Você vê a posição na fila em tempo real e pode cancelar quando quiser.'
                : 'Nenhum médico online agora — você pode esperar na fila ou tentar mais tarde.'}
            </Typography>
            <Button
              fullWidth
              variant="contained"
              startIcon={<MedicalServicesRoundedIcon />}
              disabled={joinBusy || !pid}
              onClick={() => { hapticLight(); setConsentOk(false); setUi('confirming'); }}
              sx={{ ...gradBtn, mt: 1.5 }}
            >
              Entrar na fila
            </Button>
          </Box>
        )}

        {/* ── CONFIRMING: faixa + consentimento integral + autorização de valor ── */}
        {phase === 'confirming' && (
          <Box sx={{ mt: 1.75 }} component="section" aria-label="Consentimento e autorização de valor">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary' }}>
                {range ? `Valor: ${range}` : 'Valor definido pelo médico que atender'}
              </Typography>
              {rangeMax > 0 && (
                <Chip size="small" label={`autorizo até R$ ${fmtBrl(rangeMax)}`} sx={{ height: 24, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(212,165,116,.15)', color: isDark ? '#d4a574' : '#8a5a1f', border: '1px solid rgba(212,165,116,.35)' }} />
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
              label={rangeMax > 0
                ? `Li e aceito o consentimento acima e autorizo a cobrança de até R$ ${fmtBrl(rangeMax)} pelo atendimento (pago por PIX só quando um médico aceitar).`
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
                onClick={() => { hapticLight(); setTerminalSeen(null); setUi('confirming'); setConsentOk(false); void poll(); }}
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
