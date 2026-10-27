import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Card, CardContent, Typography, Button, TextField, IconButton, Checkbox,
  Stack, Chip, Box, Collapse, Accordion, AccordionSummary, AccordionDetails,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Avatar, CircularProgress
} from '@mui/material';
import { keyframes } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { confirmDialog, snackbar } from '../components/ConfirmDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BellIcon from '@mui/icons-material/NotificationsActive';
import SummarizeIcon from '@mui/icons-material/Summarize';
import AddAlarmIcon from '@mui/icons-material/AddAlarm';
import HistoryIcon from '@mui/icons-material/History';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ScienceIcon from '@mui/icons-material/Science';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MedicationIcon from '@mui/icons-material/Medication';
import VideocamIcon from '@mui/icons-material/Videocam';
import RepeatIcon from '@mui/icons-material/Repeat';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PaymentsIcon from '@mui/icons-material/Payments';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_URL, APP_WEB_URL, token, doctorPhotoUrl } from '../config';
import { hapticSuccess, hapticError, hapticLight } from '../utils/haptic';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { tealText } from '../theme';
import { openTelemedicinaRoom } from '../utils/telemedicina';
import { copyText } from '../utils/copyText';

const pulse = keyframes`0%,100%{transform:scale(1)}50%{transform:scale(1.12)}`;
const livePulse = keyframes`0%{transform:scale(0.85);opacity:1}100%{transform:scale(2.2);opacity:0}`;
// INCOMING CALL: anel verde expandindo no card quando o médico está chamando
const callingPulse = keyframes`0%,100%{box-shadow:0 0 0 0 rgba(5,150,105,.55)}50%{box-shadow:0 0 0 12px rgba(5,150,105,0)}`;

// Antecedências oferecidas (minutos antes) — estilo Agenda do Google. Default: 1 dia + 5h + na hora.
const OFFSET_PALETTE: { o: number; l: string }[] = [
  { o: 10080, l: '1 semana antes' },
  { o: 1440, l: '1 dia antes' },
  { o: 720, l: '12 h antes' },
  { o: 300, l: '5 h antes' },
  { o: 60, l: '1 hora antes' },
  { o: 0, l: 'Na hora' },
];
const DEFAULT_OFFSETS = [1440, 300, 0];
const offsetShort = (o: number) => OFFSET_PALETTE.find((p) => p.o === o)?.l ?? (o >= 1440 ? `${Math.round(o / 1440)} dias antes` : o >= 60 ? `${Math.round(o / 60)} h antes` : 'Na hora');

const TYPES: { v: string; l: string; icon: ReactElement; color: string; sug: [string, string | null][] }[] = [
  // fix dono 23/10: 'teleconsulta' SAIU da lista do paciente — consulta por vídeo
  // é agendada SÓ pelo médico (portal). Paciente cria consulta PRESENCIAL como
  // lembrete; as teleconsultas do médico continuam aparecendo na aba Consultas.
  { v: 'consulta', l: 'Consulta presencial', icon: <MedicalServicesIcon sx={{ fontSize: 16 }} />, color: '#7c3aed', sug: [['Consulta de rotina', 'anual'], ['Retorno com especialista', null]] },
  { v: 'medicamento', l: 'Medicamento', icon: <MedicationIcon sx={{ fontSize: 16 }} />, color: '#d97706', sug: [['Tomar medicação diária', 'diario'], ['Renovar receita', 'mensal']] },
  { v: 'exame', l: 'Exame / Jejum', icon: <ScienceIcon sx={{ fontSize: 16 }} />, color: '#0284c7', sug: [['Refazer exame de sangue', 'semestral'], ['Jejum de 8h para exames', null], ['Buscar resultado de laudo', null]] },
];
const typeMeta = (v?: string | null) => TYPES.find((t) => t.v === v) ?? null;

const RECUR: { v: string | null; l: string }[] = [
  { v: null, l: 'Não repete' },
  { v: 'diario', l: 'Diário' },
  { v: 'semanal', l: 'Semanal' },
  { v: 'mensal', l: 'Mensal' },
  { v: 'semestral', l: '6 meses' },
  { v: 'anual', l: 'Anual' },
];
const recurLabel = (v?: string | null) => RECUR.find((r) => r.v === v)?.l ?? null;
// Consulta particular (23/10): centavos → "R$ X,XX" (pt-BR, sem módulo de moeda).
const fmtBrl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const groupOf = (due: string): 'today' | 'week' | 'later' => {
  const d = new Date(due);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ms = d.getTime();
  if (ms < startToday + 86400000) return 'today';
  if (ms < startToday + 7 * 86400000) return 'week';
  return 'later';
};

export const RemindersPage = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Abas de separação clínica: Consultas | Medicamentos | Lembretes de Rotina
  const tabParam = searchParams.get('tab') as 'consultas' | 'medicamentos' | 'lembretes' | null;
  const setTab = (tab: 'consultas' | 'medicamentos' | 'lembretes') => {
    setSearchParams({ tab });
    if (tab === 'consultas') setRtype('consulta');
    else if (tab === 'medicamentos') setRtype('medicamento');
    else setRtype('exame');
  };

  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [offsets, setOffsets] = useState<number[]>(DEFAULT_OFFSETS);
  const [rtype, setRtype] = useState<string>('teleconsulta');
  const [recur, setRecur] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [consentFor, setConsentFor] = useState<any | null>(null);
  const [pendingReqs, setPendingReqs] = useState<Record<string, number>>({});
  // INCOMING CALL (dono 21/10: "quando chama é simplório, chama e depois para"):
  // médico na sala + paciente em OUTRA página → o card acende "te chamando AGORA".
  const [callingIds, setCallingIds] = useState<Record<string, boolean>>({});
  const callingRef = useRef<Record<string, boolean>>({}); // p/ haptic só na transição

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };

  // fix dono 23/10: consulta agendada pelo MÉDICO não aparecia sem sair/entrar —
  // refetch no focus + a cada 60s visível (o push chega antes da lista atualizar sozinha).
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const iv = setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); clearInterval(iv); };
  }, []);
  const loadExamRequests = async () => {
    if (!pid) return;
    try {
      const r = await fetch(`${API_URL}/exam-requests?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
      const d = await r.json();
      const list: any[] = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
      const counts: Record<string, number> = {};
      list.forEach((x) => { if (x?.status === 'pending' && x.reminderId) counts[x.reminderId] = (counts[x.reminderId] || 0) + 1; });
      setPendingReqs(counts);
    } catch {}
  };

  useEffect(() => { load(); loadExamRequests(); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOffset = (o: number) => setOffsets((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]));

  const add = async () => {
    if (!title.trim() || !date) return;
    setErr(null);
    const iso = new Date(`${date}T${time || '09:00'}`).toISOString();
    try {
      const r = await fetch(`${API_URL}/reminders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId: pid, title: title.trim(), dueDate: iso, notifyOffsetsMin: offsets, type: rtype, recurrence: recur, linkUrl: rtype === 'teleconsulta' ? linkUrl.trim() : undefined }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        hapticError();
        setErr(d?.message || d?.error || 'Não foi possível salvar. Tente novamente.');
        return;
      }
      setTitle(''); setDate(''); setTime('09:00'); setOffsets(DEFAULT_OFFSETS); setRecur(null); setLinkUrl(''); setFormOpen(false);
      await load();
      hapticSuccess();
    } catch {
      hapticError();
      setErr('Sem conexão — verifique sua internet.');
    }
  };

  const toggle = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ done: !r.done }),
    });
    load();
  };

  const consentAndOpen = async (r: any) => {
    try {
      const res = await fetch(`${API_URL}/reminders/${r.id}/consent`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error();
      hapticSuccess();
      setConsentFor(null);
      if (r.linkUrl) {
        await openTelemedicinaRoom(r.linkUrl);
      } else {
        navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } });
      }
      load();
    } catch {
      hapticError();
      setConsentFor(null);
    }
  };

  const del = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const timeAgo = (d: string) => {
    const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return null;
    if (days === 0) return 'hoje';
    if (days === 1) return 'amanhã';
    if (days < 7) return `em ${days} dias`;
    if (days < 30) return `em ${Math.floor(days / 7)} sem.`;
    return `em ${Math.floor(days / 30)} mês(es)`;
  };

  // Separação dos domínios
  const isConsultation = (r: any) => r.type === 'teleconsulta' || r.type === 'consulta' || r.provider === 'livekit';
  const isMedication = (r: any) => r.type === 'medicamento';
  const isRoutineReminder = (r: any) => !isConsultation(r) && !isMedication(r);

  const now = new Date();
  const consultations = items.filter(isConsultation);
  const medications = items.filter(isMedication);
  const routineList = items.filter(isRoutineReminder);

  // Se o usuário não especificou ?tab= na URL, prioriza a aba com conteúdo real ativo
  const currentTab: 'consultas' | 'medicamentos' | 'lembretes' =
    tabParam || (consultations.length > 0 ? 'consultas' : routineList.length > 0 ? 'lembretes' : medications.length > 0 ? 'medicamentos' : 'consultas');

  // F4 pós-consulta: teleconsulta ENCERRADA (endedAt) sai das agendadas e vai direto
  // pro "Histórico de consultas" — nunca mistura com consulta futura nem mostra "Entrar".
  // G1 (spec §19, 24/10): consulta ATIVA/PRÓXIMA pinada no TOPO da aba — nunca mais
  // escondida atrás da seta do accordion. Ativa = aberta (!endedAt && !done) com hora
  // já chegada ou chegando em até 24h (inclui a atrasada de hoje esperando médico/
  // paciente — era ela que se perdia em "Consultas anteriores"). Várias ativas: a
  // mais próxima primeiro. Encerradas saem do topo (ficam só no Histórico). Render
  // deriva 100% do payload do GET /reminders (teleStatus/consultPriceCents/paidAt/
  // endedAt) → consulta nova, reagendamento e cancelamento aparecem no refetch
  // focus+60s sem sair/entrar na página.
  const activeConsultations = consultations
    .filter((r) => !r.endedAt && !r.done
      && new Date(r.dueDate).getTime() >= now.getTime() - 2 * 60 * 60 * 1000   // atrasada ≤2h = ainda viva (janela da consulta)
      && new Date(r.dueDate).getTime() <= now.getTime() + 24 * 60 * 60 * 1000) // hoje/amanhã — mais longe fica na lista normal
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const activeIds = new Set(activeConsultations.map((r) => r.id));
  const endedConsultations = consultations.filter((r) => !!r.endedAt).sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  const upcomingConsultations = consultations.filter((r) => !r.endedAt && !activeIds.has(r.id) && new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const pastConsultations = consultations.filter((r) => !r.endedAt && !activeIds.has(r.id) && new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  // §13 complemento UX: aviso in-app "Sua consulta começa em 5 minutos". Sem polling
  // novo — a lista já refetcha a cada 60s (focus + interval); banner = compute do estado.
  const startingSoon = consultations.find((r) => {
    if (r.endedAt || r.done || !(r.type === 'teleconsulta' || r.provider === 'livekit')) return false;
    const due = new Date(r.dueDate).getTime();
    return due >= now.getTime() && due <= now.getTime() + 5 * 60 * 1000;
  });

  const upcomingRoutine = routineList.filter((r) => new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const pastRoutine = routineList.filter((r) => new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const groups = [
    { key: 'today', label: 'Hoje', list: upcomingRoutine.filter((r) => groupOf(r.dueDate) === 'today') },
    { key: 'week', label: 'Próximos 7 dias', list: upcomingRoutine.filter((r) => groupOf(r.dueDate) === 'week') },
    { key: 'later', label: 'Depois', list: upcomingRoutine.filter((r) => groupOf(r.dueDate) === 'later') },
  ].filter((g) => g.list.length > 0);

  // Poll doctorInRoom (5s) — espelha o poll do Teleconsulta.tsx para o paciente
  // que está em OUTRA página: só teleconsultas não-done na janela da consulta
  // (atrasadas ≤2h — fora disso ninguém chama; evita hammer da API).
  // Quando o médico sai da sala (doctorInRoom=false) o destaque some sozinho:
  // o map é REFEITO a cada tick, não acumulado.
  useEffect(() => {
    const cands = consultations.filter((r) =>
      !r.done && !r.endedAt && !r.linkUrl && (r.type === 'teleconsulta' || r.provider === 'livekit') &&
      new Date(r.dueDate).getTime() >= Date.now() - 2 * 60 * 60 * 1000);
    if (!cands.length) { setCallingIds({}); callingRef.current = {}; return; }
    let stop = false;
    const poll = async () => {
      const next: Record<string, boolean> = {};
      await Promise.all(cands.map(async (r) => {
        try {
          const res = await fetch(`${API_URL}/teleconsulta/${r.id}/summary`, { headers: { Authorization: `Bearer ${token()}` } });
          if (!res.ok) return;
          const d = await res.json();
          if (d?.doctorInRoom) next[r.id] = true;
        } catch { /* offline: o próximo tick tenta de novo */ }
      }));
      if (stop) return;
      const startedCalling = Object.keys(next).some((id) => !callingRef.current[id]);
      callingRef.current = next;
      setCallingIds(next);
      if (startedCalling) hapticSuccess(); // começou a chamar AGORA — feedback tátil 1x
    };
    void poll();
    const iv = setInterval(() => void poll(), 5000);
    return () => { stop = true; clearInterval(iv); };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CONSULTA PARTICULAR (23/10/26): paciente paga a teleconsulta no app (PIX).
  // POST /billing/teleconsulta/:id cria a cobrança no padrão do relatório avulso;
  // 409 + pendingPix = retomada do MESMO QR (não gera ordem nova). O poll em
  // /billing/payment-status/:id detecta a aprovação do webhook e marca "Paga ✓".
  const [payTele, setPayTele] = useState<any | null>(null);
  const [payBusyId, setPayBusyId] = useState<string | null>(null);
  // Countdown + copy do PIX do dialog (24/10): expiração visível e clipboard à prova de WebView.
  const [paySecs, setPaySecs] = useState(0);
  const [pixCopied, setPixCopied] = useState(false);
  const pixCodeRef = useRef<HTMLInputElement | null>(null);
  const pixCopyTimer = useRef<any>(null);

  const payTeleconsulta = async (r: any) => {
    setPayBusyId(r.id);
    try {
      const res = await fetch(`${API_URL}/billing/teleconsulta/${r.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      const d: any = await res.json().catch(() => ({}));
      if (res.status === 409 && d.pendingPix) {
        hapticLight();
        // Retomada ESTÁVEL (bug dono 24/10): MESMO QR/lembrete já no dialog → não
        // troca o estado (zero re-render/reabrir). paymentId vazio → undefined p/ o
        // poll não bater em /payment-status com id de subscription.
        const p: any = d.pendingPix;
        if (payTele?.reminderId === r.id && payTele?.qrCode === p.qrCode) return;
        setPayTele({ ...p, paymentId: p.paymentId || undefined, reminderId: r.id });
        return;
      }
      // 409 SEM pendingPix = "Consulta já paga." (paga em outra aba/device) → comemora, não é erro.
      if (res.status === 409 && d.paidAt) {
        setPayTele(null);
        setItems((list) => list.map((it) => (it.id === r.id ? { ...it, paidAt: d.paidAt } : it)));
        snackbar({ message: '✓ Consulta paga! Pagamento confirmado.', severity: 'success' });
        return;
      }
      if (!res.ok) throw new Error(d.error || 'Falha ao gerar a cobrança.');
      hapticLight();
      setPayTele({ reminderId: r.id, paymentId: d.paymentId, qrCode: d.qrCode, qrBase64: d.qrBase64, expiresAt: d.expiresAt, priceCents: d.priceCents });
    } catch (e: any) {
      hapticError();
      snackbar({ message: e?.message || 'Falha ao gerar a cobrança.', severity: 'error' });
    } finally { setPayBusyId(null); }
  };

  useEffect(() => {
    if (!payTele?.paymentId) return;
    const rid = payTele.reminderId;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/billing/payment-status/${payTele.paymentId}`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (d?.approved) {
          clearInterval(iv);
          setPayTele(null);
          setItems((list) => list.map((it) => (it.id === rid ? { ...it, paidAt: new Date().toISOString() } : it)));
          hapticSuccess();
          snackbar({ message: '✓ Consulta paga! Pagamento confirmado.', severity: 'success' });
        }
      } catch { /* offline: o próximo tick tenta de novo */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [payTele?.paymentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown do PIX (server expira em 10min): zera → dialog vira "expirado" com botão
  // "Gerar novo" (POST de novo: server só retoma PIX VIVO; expirado cria charge nova).
  useEffect(() => {
    const ms = payTele?.expiresAt ? new Date(payTele.expiresAt).getTime() : NaN;
    if (!ms || isNaN(ms)) { setPaySecs(0); return; }
    setPaySecs(Math.max(0, Math.floor((ms - Date.now()) / 1000)));
    const tick = setInterval(() => setPaySecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, [payTele?.paymentId, payTele?.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(pixCopyTimer.current), []);

  /** Copy do código PIX à prova de WebView (bug dono 24/10: "copiar no APP dá erro" —
   *  navigator.clipboard falha/rejeita no Capacitor e o toast antigo mentia "copiado").
   *  copyText tenta Clipboard API → execCommand; se os 2 falharem, SELECIONA o código
   *  no campo readOnly (toque-e-segure copia nativo) — feedback claro em TODO caminho.
   *  Regra de ouro (26/10): NENHUM caminho do copy pode derrubar a tela — snackbar em
   *  try/catch e o dialog preserva QR + código + validade mesmo se algo falhar. */
  const doCopyPix = async () => {
    const code = String(payTele?.qrCode ?? '');
    if (!code) return;
    try {
      if (await copyText(code)) {
        setPixCopied(true);
        clearTimeout(pixCopyTimer.current);
        pixCopyTimer.current = setTimeout(() => setPixCopied(false), 2500);
        try { snackbar({ message: 'Código PIX copiado!', severity: 'success' }); } catch { /* toast nunca derruba o pagamento */ }
      } else {
        pixCodeRef.current?.focus();
        pixCodeRef.current?.select();
        hapticLight();
        try { snackbar({ message: 'Não deu pra copiar automático. Toque e segure o código acima para copiar.', severity: 'info' }); } catch { /* idem */ }
      }
    } catch { /* copyText nunca lança; defesa extra p/ nenhum path quebrar o dialog */ }
  };
  const payExpired = !!payTele?.expiresAt && paySecs <= 0;
  const payMm = String(Math.floor(paySecs / 60)).padStart(2, '0');
  const paySs = String(paySecs % 60).padStart(2, '0');

  // 0. G1 (spec §19): HERO de consulta ATIVA/PRÓXIMA — topo da aba, acima de qualquer
// agrupamento. Médico (foto+nome+CRM), data/hora, situação da consulta E do
// pagamento, e UMA próxima ação como CTA primário (44px): Pagar consulta →
// Entrar na consulta (janela abre dueDate−5min, spec §1) → Aguardando liberação.
  const renderActiveConsultationHero = (r: any) => {
    const due = new Date(r.dueDate);
    const isTele = r.type === 'teleconsulta' || r.provider === 'livekit' || !!r.linkUrl;
    const inProgress = r.teleStatus === 'in_progress';
    const isCalling = !!callingIds[r.id];
    const opensAt = new Date(due.getTime() - 5 * 60 * 1000); // janela de entrada (§1)
    const windowOpen = inProgress || isCalling || now >= opensAt;
    const price = r.consultPriceCents ?? 0;
    const needsPay = price > 0 && !r.paidAt;
    const minsToOpen = Math.ceil((opensAt.getTime() - now.getTime()) / 60000);
    const docId = r.doctor?.id || r.createdByDoctorId;
    const docPhoto = docId ? doctorPhotoUrl(docId) : undefined;
    const docName = r.doctor?.name
      ? (r.doctor.name.toLowerCase().startsWith('dr') ? r.doctor.name : `Dr(a). ${r.doctor.name}`)
      : (r.title || 'Consulta');
    const crm = r.doctor?.crm ? `CRM ${r.doctor.crm}${r.doctor?.crmUf ? `-${r.doctor.crmUf}` : ''}` : null;
    const when = due.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const opensAtStr = opensAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const enterConsult = () => {
      hapticLight();
      if (!r.consentAt) { setConsentFor(r); return; }
      if (r.linkUrl) void openTelemedicinaRoom(r.linkUrl);
      else navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } });
    };
    return (
      <Card
        key={`active-hero-${r.id}`}
        sx={(t) => {
          const isDark = t.palette.mode === 'dark';
          return {
            borderRadius: '16px',
            border: '1px solid',
            borderLeft: '4px solid',
            borderColor: isCalling ? '#059669' : isDark ? 'rgba(32,178,170,0.38)' : 'rgba(32,178,170,0.28)',
            borderLeftColor: isCalling ? '#059669' : '#20b2aa',
            bgcolor: isCalling
              ? (isDark ? 'rgba(5,150,105,0.10)' : 'rgba(236,253,245,0.95)')
              : isDark ? '#13201f' : '#ffffff',
            boxShadow: isDark ? '0 6px 22px rgba(0,0,0,0.35)' : '0 6px 22px rgba(32,178,170,0.14)',
            p: { xs: 2, sm: 2.5 },
            ...(isCalling ? { animation: `${callingPulse} 1.5s ease-in-out infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } } : {}),
          };
        }}
      >
        <Stack spacing={1.5}>
          {/* Médico: foto + nome + CRM · data/hora */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar
              src={docPhoto}
              alt={docName}
              sx={{ width: 48, height: 48, borderRadius: '14px', fontSize: 18, fontWeight: 800, bgcolor: 'rgba(32,178,170,0.12)', color: (t) => tealText(t.palette.mode), flexShrink: 0 }}
            >
              {docName.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 15.5, sm: 17 }, color: 'text.primary', lineHeight: 1.25 }}>
                {docName}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
                {crm && (
                  <Stack direction="row" alignItems="center" spacing={0.25}>
                    <VerifiedIcon sx={{ fontSize: 13, color: '#20b2aa' }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{crm}</Typography>
                  </Stack>
                )}
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {crm ? ' · ' : ''}{when}
                </Typography>
              </Stack>
            </Box>
          </Stack>
          {/* Situação da consulta + situação do pagamento */}
          <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
            {isCalling ? (
              <Chip size="small" icon={<PhoneInTalkIcon sx={{ fontSize: 13 }} />} label="Te chamando agora" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(5,150,105,0.14)', color: '#059669', borderRadius: '8px', '& .MuiChip-icon': { color: '#059669' } }} />
            ) : inProgress ? (
              <Chip size="small" icon={<VideocamIcon sx={{ fontSize: 13 }} />} label="Em andamento" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.14)', color: '#0d9488', borderRadius: '8px', '& .MuiChip-icon': { color: '#0d9488' } }} />
            ) : (
              <Chip size="small" icon={<EventAvailableIcon sx={{ fontSize: 13 }} />} label={due.getTime() < now.getTime() ? 'Hora marcada chegou' : 'Agendada'} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.10)', color: '#0d9488', borderRadius: '8px', '& .MuiChip-icon': { color: '#0d9488' } }} />
            )}
            {price > 0 ? (
              r.paidAt ? (
                <Chip size="small" icon={<CheckCircleOutlineIcon sx={{ fontSize: 13 }} />} label="Consulta paga" sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(16,185,129,0.14)', color: '#059669', borderRadius: '8px', '& .MuiChip-icon': { color: '#059669' } }} />
              ) : (
                <Chip size="small" icon={<PaymentsIcon sx={{ fontSize: 13 }} />} label={`Pagamento pendente — R$ ${fmtBrl(price)}`} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(212,165,116,0.20)', color: '#a16207', borderRadius: '8px', '& .MuiChip-icon': { color: '#a16207' } }} />
              )
            ) : (
              <Chip size="small" label="Sem cobrança" sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(148,163,184,0.14)', color: 'text.secondary', borderRadius: '8px' }} />
            )}
          </Stack>
          {/* Próxima ação — CTA primário único */}
          {isCalling ? (
            <Button size="medium" variant="contained" startIcon={<PhoneInTalkIcon />} onClick={enterConsult}
              sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 14, px: 2.5, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', alignSelf: { xs: 'stretch', sm: 'flex-start' }, '&:hover': { background: 'linear-gradient(135deg,#059669,#047857)' } }}>
              Atender chamada
            </Button>
          ) : needsPay ? (
            <Button size="medium" variant="contained" disabled={payBusyId === r.id} startIcon={<PaymentsIcon />}
              onClick={() => { hapticLight(); void payTeleconsulta(r); }}
              sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 14, px: 2.5, background: 'linear-gradient(135deg,#d4a574,#b88a54)', color: '#fff', alignSelf: { xs: 'stretch', sm: 'flex-start' }, '&:hover': { background: 'linear-gradient(135deg,#e0b183,#c49260)' } }}>
              {payBusyId === r.id ? 'Gerando PIX…' : `Pagar consulta — R$ ${fmtBrl(price)}`}
            </Button>
          ) : isTele && windowOpen ? (
            <Button size="medium" variant="contained" startIcon={<VideocamIcon />} onClick={enterConsult}
              sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 14, px: 2.5, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', boxShadow: '0 4px 14px rgba(32,178,170,0.35)', alignSelf: { xs: 'stretch', sm: 'flex-start' }, '&:hover': { background: 'linear-gradient(135deg,#178f89,#137a74)' } }}>
              Entrar na consulta
            </Button>
          ) : isTele ? (
            <Stack spacing={0.25} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, width: { xs: '100%', sm: 'auto' } }}>
              <Button size="medium" variant="outlined" disabled startIcon={<HourglassEmptyIcon />}
                sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 13.5, px: 2.5, width: '100%', borderColor: 'rgba(32,178,170,0.4)', color: 'text.secondary' }}>
                Aguardando liberação — abre {opensAtStr}
              </Button>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', pl: 1 }}>
                {minsToOpen > 0 ? (minsToOpen >= 60 ? `Libera a entrada em ${Math.floor(minsToOpen / 60)}h${minsToOpen % 60 ? ` ${minsToOpen % 60}min` : ''}` : `Libera a entrada em ${minsToOpen} min`) : 'Abrindo…'}
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      </Card>
    );
  };
// 1. RENDERIZADOR DE CONSULTA / TELEMEDICINA (Ticket Clínico Oficial Padrão Global)
  const renderConsultationCard = (r: any) => {
    const hasEnded = !!r.endedAt; // F4: encerrada no server → área read-only, nunca "Entrar na consulta"
    const isPast = new Date(r.dueDate) < now || hasEnded;
    const diffMs = new Date(r.dueDate).getTime() - now.getTime();
    const isLive = !isPast && diffMs <= 15 * 60 * 1000 && diffMs >= -60 * 60 * 1000;
    // Médico já está na sala (poll 5s acima) — chamada entrando AGORA
    const isCalling = !!callingIds[r.id];
    const docId = r.doctor?.id || r.createdByDoctorId || r.doctorId;
    const docPhoto = docId ? doctorPhotoUrl(docId) : undefined;
    const docName = r.doctor?.name ? (r.doctor.name.toLowerCase().startsWith('dr') ? r.doctor.name : `Dr(a). ${r.doctor.name}`) : r.title;
    const roomCodeStr = String(r.id || '').slice(-5).toUpperCase();

    return (
      <Card
        key={r.id}
        variant="outlined"
        sx={(t) => {
          const isDark = t.palette.mode === 'dark';
          return {
            borderRadius: '20px',
            overflow: 'hidden',
            borderColor: isCalling
              ? '#059669'
              : isLive
              ? '#0d9488'
              : isPast
              ? t.palette.divider
              : isDark
              ? 'rgba(13,148,136,0.35)'
              : 'rgba(13,148,136,0.22)',
            bgcolor: isCalling
              ? isDark ? 'rgba(5,150,105,0.12)' : 'rgba(236,253,245,0.95)'
              : isLive
              ? isDark ? 'rgba(13,148,136,0.08)' : 'rgba(240,253,250,0.85)'
              : isDark ? '#0f172a' : '#ffffff',
            boxShadow: isCalling
              ? '0 8px 28px rgba(5,150,105,0.35)'
              : isLive
              ? '0 8px 24px rgba(13,148,136,0.2)'
              : isDark ? '0 4px 18px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.04)',
            transition: 'all .25s ease',
            opacity: isPast && !isCalling ? 0.85 : 1,
            ...(isCalling ? {
              animation: `${callingPulse} 1.5s ease-in-out infinite`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            } : {}),
            '&:hover': {
              borderColor: '#0d9488',
              boxShadow: isDark
                ? '0 10px 30px rgba(0,0,0,0.5)'
                : '0 8px 26px rgba(13,148,136,0.12)',
              transform: 'translateY(-2px)',
            },
          };
        }}
      >
        {/* Ticket Header Band: Tipo de Atendimento + Sala / Protocolo */}
        <Box
          sx={(t) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: { xs: 2, sm: 2.5 },
            py: 1.25,
            bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
            borderBottom: '1px dashed',
            borderColor: t.palette.divider,
          })}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            {isCalling ? (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#059669',
                    animation: `${pulse} 1.2s ease-in-out infinite`,
                  }}
                />
                <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#059669', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Chamada Entrando Agora
                </Typography>
              </Stack>
            ) : isLive ? (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#10b981',
                    animation: `${livePulse} 1.6s infinite`,
                  }}
                />
                <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#059669', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Teleconsulta Online • Médico na Sala
                </Typography>
              </Stack>
            ) : hasEnded ? (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <CheckCircleOutlineIcon sx={{ fontSize: 15, color: '#0d9488' }} />
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                  Consulta Concluída • Prontuário Arquivado
                </Typography>
              </Stack>
            ) : (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <CalendarMonthIcon sx={{ fontSize: 15, color: '#0d9488' }} />
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#0d9488', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Teleconsulta Agendada
                </Typography>
              </Stack>
            )}
          </Stack>

          <Typography
            sx={{
              fontSize: 11.5,
              fontWeight: 800,
              fontFamily: 'monospace',
              color: 'text.secondary',
              letterSpacing: '0.05em',
            }}
          >
            SALA #{roomCodeStr}
          </Typography>
        </Box>

        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          {isCalling && (
            <Stack
              direction="row" alignItems="center" spacing={1}
              aria-live="polite"
              sx={{ mb: 1.75, px: 1.5, py: 1.25, borderRadius: '12px', bgcolor: 'rgba(5,150,105,.12)', border: '1px solid rgba(5,150,105,.35)' }}
            >
              <PhoneInTalkIcon sx={{ fontSize: 20, color: '#059669', '@media (prefers-reduced-motion: no-preference)': { animation: `${pulse} 1.2s ease-in-out infinite` } }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#047857', lineHeight: 1.3 }}>
                📞 {docName} está te chamando AGORA para entrar na consulta
              </Typography>
            </Stack>
          )}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            {/* Foto e Metadados do Médico */}
            <Stack direction="row" spacing={1.75} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <Avatar
                  src={docPhoto}
                  alt={docName}
                  sx={{
                    width: { xs: 54, sm: 60 },
                    height: { xs: 54, sm: 60 },
                    fontSize: 20,
                    fontWeight: 800,
                    bgcolor: 'rgba(13,148,136,0.12)',
                    color: '#0d9488',
                    border: '2px solid rgba(13,148,136,0.25)',
                    borderRadius: '16px',
                  }}
                >
                  {docName.charAt(0)?.toUpperCase() || '👨‍⚕️'}
                </Avatar>
                {isLive && (
                  <Box
                    sx={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 14, height: 14, borderRadius: '50%',
                      bgcolor: '#10b981', border: '2px solid #fff',
                    }}
                  />
                )}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.25 }}>
                  <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
                    {docName}
                  </Typography>
                  <VerifiedIcon sx={{ fontSize: 16, color: '#0d9488' }} />
                  {r.doctor?.crm && (() => {
                    const crmStr = String(r.doctor.crm).trim();
                    const hasUf = /-?\b[A-Za-z]{2}$/.test(crmStr);
                    const label = `CRM ${crmStr}${!hasUf && r.doctor.crmUf ? `-${r.doctor.crmUf}` : ''}`;
                    return (
                      <Chip
                        size="small"
                        label={label}
                        sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(13,148,136,0.1)', color: '#0d9488', borderRadius: '6px', fontFamily: 'monospace' }}
                      />
                    );
                  })()}
                </Stack>

                <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap" sx={{ mb: 0.75 }}>
                  {r.doctor?.specialty && (
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#0d9488' }}>
                      {r.doctor.specialty}
                    </Typography>
                  )}
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>
                      {fmtDate(r.dueDate)}
                    </Typography>
                  </Stack>
                  {timeAgo(r.dueDate) && !isPast && (
                    <Chip size="small" label={timeAgo(r.dueDate)} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(13,148,136,.12)', color: '#0d9488', borderRadius: '6px' }} />
                  )}
                </Stack>

                {/* Badges de Documentos e Segurança */}
                <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                  {r.consentAt && (
                    <Chip
                      size="small"
                      icon={<VerifiedIcon sx={{ fontSize: 13 }} />}
                      label="Telemedicina autorizada"
                      sx={{
                        height: 22,
                        fontSize: 11.5,
                        fontWeight: 700,
                        borderRadius: '6px',
                        bgcolor: 'rgba(13,148,136,.10)',
                        color: '#0d9488',
                        '& .MuiChip-icon': { color: '#0d9488' },
                      }}
                    />
                  )}
                  {(pendingReqs[r.id] ?? 0) > 0 && (
                    <Chip
                      size="small"
                      clickable
                      label={`${pendingReqs[r.id]} pedido(s) de exame`}
                      onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } }); }}
                      sx={{ height: 22, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(245,158,11,.15)', color: '#b45309', borderRadius: '6px' }}
                    />
                  )}
                  {hasEnded && (
                    <Chip
                      size="small"
                      label="✓ Prontuário Assinado"
                      sx={{ height: 22, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(13,148,136,.12)', color: '#0d9488', borderRadius: '6px' }}
                    />
                  )}
                  {/* §14.1: consulta encerrada com resumo APROVADO pelo médico → CTA
                      discreto (sem promessa quando ainda é rascunho). */}
                  {hasEnded && r.consultSummaryApproved && (
                    <Chip
                      size="small"
                      clickable
                      icon={<SummarizeIcon sx={{ fontSize: 14 }} />}
                      label="Ver resumo da consulta"
                      onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } }); }}
                      sx={{ height: 22, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(13,148,136,.16)', color: '#0d9488', borderRadius: '6px', '& .MuiChip-icon': { color: '#0d9488' } }}
                    />
                  )}
                </Stack>
              </Box>
            </Stack>

            {/* Ações da Consulta */}
            {/* Ações da Consulta */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              spacing={1}
              sx={{
                alignSelf: { xs: 'stretch', md: 'center' },
                justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                pt: { xs: 1.5, md: 0 },
                width: { xs: '100%', md: 'auto' },
              }}
            >
              {isCalling ? (
                <Button
                  size="medium"
                  variant="contained"
                  startIcon={<PhoneInTalkIcon />}
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } }); }}
                  sx={{
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 800,
                    fontSize: 13.5,
                    px: 2.75,
                    py: 1,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    '&:hover': { background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' },
                    boxShadow: '0 4px 14px rgba(5,150,105,.4)',
                    whiteSpace: 'nowrap',
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Atender Chamada
                </Button>
              ) : hasEnded ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AssignmentIcon />}
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } }); }}
                  sx={{
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 800,
                    fontSize: 13,
                    px: 2.2,
                    py: 0.8,
                    borderColor: '#0d9488',
                    color: '#0d9488',
                    '&:hover': { bgcolor: 'rgba(13,148,136,0.08)', borderColor: '#0f766e' },
                    whiteSpace: 'nowrap',
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Ver Resumo & Documentos
                </Button>
              ) : !isPast ? (
                r.consentAt ? (
                  <Button
                    size="medium"
                    variant="contained"
                    startIcon={<VideocamIcon />}
                    onClick={() => {
                      hapticLight();
                      if (r.linkUrl) void openTelemedicinaRoom(r.linkUrl);
                      else navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } });
                    }}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: 13.5,
                      px: 2.5,
                      py: 1,
                      background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                      color: '#ffffff',
                      boxShadow: '0 4px 14px rgba(13,148,136,0.35)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #0f766e 0%, #047857 100%)',
                        boxShadow: '0 6px 18px rgba(13,148,136,0.45)',
                      },
                      whiteSpace: 'nowrap',
                      width: { xs: '100%', sm: 'auto' },
                    }}
                  >
                    Entrar na Sala
                  </Button>
                ) : (
                  <Button
                    size="medium"
                    variant="contained"
                    startIcon={<VideocamIcon />}
                    onClick={() => { hapticLight(); setConsentFor(r); }}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: 13.5,
                      px: 2.5,
                      py: 1,
                      background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                      color: '#ffffff',
                      boxShadow: '0 4px 14px rgba(13,148,136,0.35)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #0f766e 0%, #047857 100%)',
                      },
                      whiteSpace: 'nowrap',
                      width: { xs: '100%', sm: 'auto' },
                    }}
                  >
                    Entrar na Sala
                  </Button>
                )
              ) : (r.type === 'teleconsulta' || r.provider === 'livekit') ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AssignmentIcon />}
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`, { state: { reminder: r, doctor: r.doctor } }); }}
                  sx={{
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 800,
                    fontSize: 13,
                    px: 2,
                    py: 0.8,
                    borderColor: 'divider',
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Ver Consulta
                </Button>
              ) : null}

              {/* Linha secundária de status e ações rápidas */}
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
                sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}
              >
                {/* Consulta particular: "Pagar consulta" (cobre) ou "Paga ✓" (verde) */}
                {(r.consultPriceCents ?? 0) > 0 && (
                  (r.paidAt || hasEnded) ? (
                    <Chip
                      size="small"
                      icon={<CheckCircleOutlineIcon />}
                      label={r.paidAt ? 'Consulta paga' : 'Concluída'}
                      sx={{
                        height: 26,
                        fontSize: 11.5,
                        fontWeight: 800,
                        bgcolor: 'rgba(16,185,129,.14)',
                        color: '#059669',
                        borderRadius: '9px',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        '& .MuiChip-label': { px: 1, whiteSpace: 'nowrap' },
                      }}
                    />
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PaymentsIcon />}
                      disabled={payBusyId === r.id}
                      onClick={() => { hapticLight(); void payTeleconsulta(r); }}
                      sx={{
                        borderRadius: '12px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 12.5,
                        px: 1.75,
                        py: 0.6,
                        background: 'linear-gradient(135deg, #d4a574 0%, #b88a54 100%)',
                        color: '#fff',
                        boxShadow: '0 4px 14px rgba(212,165,116,.4)',
                        '&:hover': { background: 'linear-gradient(135deg, #e0b183 0%, #c49260 100%)' },
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {payBusyId === r.id ? 'Gerando PIX…' : `Pagar — R$ ${fmtBrl(r.consultPriceCents)}`}
                    </Button>
                  )
                )}

                {/* Ações de utilidade: WhatsApp, Copiar, Excluir */}
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}>
                  {(r.type === 'teleconsulta' || r.provider === 'livekit' || r.linkUrl) && (() => {
                    const due = new Date(r.dueDate);
                    const shareLink = r.linkUrl || `${APP_WEB_URL}/#/teleconsulta/${r.id}`;
                    const shareMsg = `Sua teleconsulta com ${docName} está agendada para ${due.toLocaleDateString('pt-BR')}, às ${due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (horário de Brasília). Acesse pelo link: ${shareLink}`;
                    return (
                      <>
                        <IconButton
                          size="small"
                          aria-label="Compartilhar no WhatsApp"
                          title="Compartilhar agendamento no WhatsApp"
                          onClick={() => {
                            hapticLight();
                            window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg)}`, '_blank', 'noopener');
                          }}
                          sx={{ color: '#25d366', '&:hover': { bgcolor: 'rgba(37,211,102,.12)' } }}
                        >
                          <WhatsAppIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Copiar link da consulta"
                          title="Copiar link da consulta"
                          onClick={async () => {
                            hapticLight();
                            if (await copyText(shareLink)) snackbar({ message: 'Link da consulta copiado!', severity: 'success' });
                            else snackbar({ message: 'Não deu pra copiar automático. Use "Compartilhar no WhatsApp" ou copie manualmente.', severity: 'info' });
                          }}
                          sx={{ color: 'text.secondary', '&:hover': { color: '#0d9488' } }}
                        >
                          <ContentCopyIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </>
                    );
                  })()}

                  <IconButton
                    size="small"
                    aria-label={`Cancelar agendamento`}
                    title="Cancelar agendamento"
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Cancelar agendamento', message: `Deseja cancelar o agendamento com ${docName}?`, confirmLabel: 'Cancelar agendamento' })) del(r);
                    }}
                    sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // 2. RENDERIZADOR DE MEDICAMENTO (Adesão de Tratamento e Dosagem)
  const renderMedicationCard = (r: any) => {
    return (
      <Card
        key={r.id}
        variant="outlined"
        sx={{
          borderRadius: '16px',
          bgcolor: r.done ? 'rgba(0,0,0,.02)' : 'background.paper',
          borderColor: r.done ? 'divider' : 'rgba(217,119,6,0.3)',
          transition: 'all .2s ease',
          '&:hover': { boxShadow: '0 4px 16px rgba(217,119,6,.12)' },
        }}
      >
        <CardContent sx={{ py: 1.75, px: 2.25, '&:last-child': { pb: 1.75 } }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '12px',
                bgcolor: 'rgba(217,119,6,0.12)',
                color: '#d97706',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <MedicationIcon sx={{ fontSize: 24 }} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography sx={{ fontWeight: 800, fontSize: 15, textDecoration: r.done ? 'line-through' : 'none', color: r.done ? 'text.secondary' : 'text.primary' }}>
                  {r.title}
                </Typography>
                {recurLabel(r.recurrence) && (
                  <Chip size="small" icon={<RepeatIcon sx={{ fontSize: 13 }} />} label={recurLabel(r.recurrence)} sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(217,119,6,0.1)', color: '#d97706' }} />
                )}
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Horário programado: {fmtDate(r.dueDate)}
                </Typography>
              </Stack>
            </Box>

            <Button
              size="small"
              variant={r.done ? 'outlined' : 'contained'}
              onClick={() => toggle(r)}
              startIcon={<CheckCircleOutlineIcon />}
              sx={{
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 800,
                fontSize: 12,
                px: 1.75,
                bgcolor: r.done ? 'transparent' : '#d97706',
                color: r.done ? 'text.secondary' : '#fff',
                borderColor: r.done ? 'divider' : 'transparent',
                '&:hover': { bgcolor: r.done ? 'action.hover' : '#b45309' },
              }}
            >
              {r.done ? 'Tomado' : 'Tomar dose'}
            </Button>

            <IconButton size="small" onClick={async () => { if (await confirmDialog({ title: 'Excluir horário', message: `Apagar lembrete "${r.title}"?`, confirmLabel: 'Excluir' })) del(r); }} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // 3. RENDERIZADOR DE LEMBRETE DE ROTINA / EXAMES (Tarefas de Saúde)
  const renderRoutineCard = (r: any) => {
    const isPast = new Date(r.dueDate) < now;
    const isOverdue = isPast && !r.done;
    const ta = timeAgo(r.dueDate);
    const tm = typeMeta(r.type);
    const rl = recurLabel(r.recurrence);

    return (
      <Card
        key={r.id}
        variant="outlined"
        sx={{
          borderRadius: '16px',
          borderColor: isOverdue ? '#ef4444' : 'divider',
          bgcolor: isOverdue ? 'rgba(239,68,68,.03)' : r.done ? 'rgba(0,0,0,.02)' : 'background.paper',
          transition: 'all .2s ease',
          opacity: r.done ? 0.72 : 1,
          '&:hover': { boxShadow: '0 4px 14px rgba(0,0,0,.05)', transform: 'translateY(-1px)' },
        }}
      >
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={1.25}>
            <Checkbox checked={!!r.done} onChange={() => toggle(r)} sx={{ p: 0.5, color: 'text.disabled', '&.Mui-checked': { color: (t) => tealText(t.palette.mode) } }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                {tm && (
                  <Chip size="small" icon={tm.icon} label={tm.l} sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: `${tm.color}14`, color: tm.color, '& .MuiChip-icon': { color: tm.color }, borderRadius: '6px' }} />
                )}
                <Typography sx={{ fontWeight: 700, fontSize: 14.5, textDecoration: r.done ? 'line-through' : 'none', color: r.done ? 'text.secondary' : 'text.primary' }}>
                  {r.title}
                </Typography>
                {rl && (
                  <Chip size="small" icon={<RepeatIcon sx={{ fontSize: 13 }} />} label={rl} sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary', borderRadius: '6px' }} />
                )}
                {ta && !isPast && (
                  <Chip size="small" label={ta} sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode), borderRadius: '6px' }} />
                )}
                {isOverdue && (
                  <Chip size="small" label="Atrasado" color="error" sx={{ height: 22, fontSize: 12, fontWeight: 800, borderRadius: '6px' }} />
                )}
              </Stack>

              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">{fmtDate(r.dueDate)}</Typography>
              </Stack>

              {Array.isArray(r.notifyOffsetsMin) && r.notifyOffsetsMin.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                  <BellIcon sx={{ fontSize: 13, color: 'text.disabled', mt: 0.25 }} />
                  {r.notifyOffsetsMin.map((o: number) => <Chip key={o} size="small" variant="outlined" label={offsetShort(o)} sx={{ height: 22, fontSize: 12, borderColor: 'divider', borderRadius: '6px' }} />)}
                </Stack>
              )}
            </Box>

            <IconButton size="small" onClick={async () => { if (await confirmDialog({ title: 'Excluir lembrete', message: `Apagar "${r.title}"?`, confirmLabel: 'Excluir' })) del(r); }} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<EventAvailableIcon />}
        title="Agenda e Compromissos"
        subtitle="Consultas médicas, horários de remédios e lembretes de exames organizados com precisão."
      />

      {/* ABAS SEGMENTADAS DE CLASSE MÉDICA (Consultas vs Medicamentos vs Lembretes) */}
      <Box
        sx={{
          mb: 3,
          p: 0.5,
          borderRadius: '16px',
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          border: '1px solid',
          borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          display: 'flex',
          gap: 0.75,
        }}
      >
        <Button
          fullWidth
          onClick={() => setTab('consultas')}
          startIcon={<VideocamIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
          sx={{
            py: 1,
            px: { xs: 0.75, sm: 1.5 },
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: { xs: 12, sm: 13.5 },
            whiteSpace: 'nowrap',
            minWidth: 0,
            bgcolor: currentTab === 'consultas' ? (t) => t.palette.mode === 'dark' ? '#178f89' : '#0d9488' : 'transparent',
            color: currentTab === 'consultas' ? '#fff' : 'text.secondary',
            boxShadow: currentTab === 'consultas' ? '0 4px 14px rgba(13,148,136,.3)' : 'none',
            '&:hover': {
              bgcolor: currentTab === 'consultas' ? (t) => t.palette.mode === 'dark' ? '#147b76' : '#0b7a70' : 'action.hover',
            },
          }}
        >
          Consultas ({consultations.length})
        </Button>

        <Button
          fullWidth
          onClick={() => setTab('medicamentos')}
          startIcon={<MedicationIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
          sx={{
            py: 1,
            px: { xs: 0.75, sm: 1.5 },
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: { xs: 12, sm: 13.5 },
            whiteSpace: 'nowrap',
            minWidth: 0,
            bgcolor: currentTab === 'medicamentos' ? '#d97706' : 'transparent',
            color: currentTab === 'medicamentos' ? '#fff' : 'text.secondary',
            boxShadow: currentTab === 'medicamentos' ? '0 4px 14px rgba(217,119,6,.3)' : 'none',
            '&:hover': {
              bgcolor: currentTab === 'medicamentos' ? '#b45309' : 'action.hover',
            },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Medicamentos</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Remédios</Box> ({medications.length})
        </Button>

        <Button
          fullWidth
          onClick={() => setTab('lembretes')}
          startIcon={<BellIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
          sx={{
            py: 1,
            px: { xs: 0.75, sm: 1.5 },
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: { xs: 12, sm: 13.5 },
            whiteSpace: 'nowrap',
            minWidth: 0,
            bgcolor: currentTab === 'lembretes' ? '#0284c7' : 'transparent',
            color: currentTab === 'lembretes' ? '#fff' : 'text.secondary',
            boxShadow: currentTab === 'lembretes' ? '0 4px 14px rgba(2,132,199,.3)' : 'none',
            '&:hover': {
              bgcolor: currentTab === 'lembretes' ? '#0369a1' : 'action.hover',
            },
          }}
        >
          Lembretes ({routineList.length})
        </Button>
      </Box>

      {/* §13: "Sua consulta começa em 5 minutos" — banner discreto em TODAS as abas
          (a consulta pode estar a 5 min com o usuário em outro lugar da página). */}
      {startingSoon && (
        <Alert
          severity="info"
          icon={<VideocamIcon sx={{ fontSize: 20 }} />}
          sx={{
            mb: 2, borderRadius: '14px', alignItems: 'center',
            border: '1px solid', borderColor: 'rgba(13,148,136,.35)',
            bgcolor: 'rgba(13,148,136,.10)',
            '& .MuiAlert-icon': { color: '#0d9488' },
          }}
          action={
            <Button
              color="inherit" size="small"
              onClick={() => { hapticLight(); navigate(`/teleconsulta/${startingSoon.id}`, { state: { reminder: startingSoon, doctor: startingSoon.doctor } }); }}
              sx={{ fontWeight: 800, borderRadius: '999px', bgcolor: '#0d9488', color: '#fff', '&:hover': { bgcolor: '#0f766e' } }}
            >
              Ir para a consulta
            </Button>
          }
        >
          <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: 'text.primary' }}>
            Sua teleconsulta{startingSoon.doctor?.name ? ` com ${startingSoon.doctor.name}` : ''} começa em {Math.max(1, Math.ceil((new Date(startingSoon.dueDate).getTime() - now.getTime()) / 60000))} min
          </Typography>
        </Alert>
      )}

      {/* CONTEÚDO DA ABA 1: CONSULTAS & TELEMEDICINA */}
      {currentTab === 'consultas' && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: 'Poppins, sans-serif' }}>
              Minhas Consultas Agendadas
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => { setRtype('consulta'); setFormOpen(true); }}
              startIcon={<AddAlarmIcon />}
              sx={{
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 800,
                bgcolor: '#0d9488',
                '&:hover': { bgcolor: '#0f766e' },
              }}
            >
              Nova Consulta
            </Button>
          </Stack>

          {/* G1 (spec §19): consultas ATIVAS/PRÓXIMAS no topo — acima de qualquer agrupamento.
            A teleconsulta criada pelo médico aparece aqui direto (refetch focus+60s),
            sem precisar expandir seção nenhuma. */}
          {activeConsultations.length > 0 && (
            <Stack spacing={2} sx={{ mb: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <VideocamIcon sx={{ fontSize: 18, color: '#20b2aa' }} />
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 14, color: 'text.primary' }}>
                  {activeConsultations.length > 1 ? `Consultas ativas (${activeConsultations.length})` : 'Sua consulta'}
                </Typography>
              </Stack>
              {activeConsultations.map((r) => renderActiveConsultationHero(r))}
            </Stack>
          )}
          {upcomingConsultations.length === 0 && activeConsultations.length === 0 ? (
            <Card variant="outlined" sx={{ borderRadius: '20px', mb: 3, borderStyle: 'dashed', textAlign: 'center', py: 4 }}>
              <CardContent>
                <Box sx={{ fontSize: 44, mb: 1, opacity: 0.6 }}>🩺</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhuma consulta agendada</Typography>
                <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 360, mx: 'auto', fontSize: 13.5 }}>
                  Suas teleconsultas com médicos e consultas de rotina aparecerão aqui com sala virtual e prontuário.
                </Typography>
                <Stack direction="row" spacing={1.25} justifyContent="center" flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained"
                    onClick={() => { setRtype('consulta'); setFormOpen(true); }}
                    startIcon={<AddAlarmIcon />}
                    sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0d9488', px: 3 }}
                  >
                    Agendar consulta
                  </Button>
                  {routineList.length > 0 && (
                    <Button
                      variant="outlined"
                      onClick={() => setTab('lembretes')}
                      sx={{
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 800,
                        borderColor: '#0284c7',
                        color: '#0284c7',
                        px: 2.5,
                        '&:hover': { bgcolor: 'rgba(2,132,199,0.08)' },
                      }}
                    >
                      Ver {routineList.length} lembretes ativos →
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={2} sx={{ mb: 3 }}>
              {upcomingConsultations.map((r) => renderConsultationCard(r))}
            </Stack>
          )}

          {pastConsultations.length > 0 && (
            <Accordion elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '16px !important', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <HistoryIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                    Consultas anteriores ({pastConsultations.length})
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Stack spacing={1.5}>
                  {pastConsultations.map((r) => renderConsultationCard(r))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}

          {/* F4: HISTÓRICO DE CONSULTAS ENCERRADAS — separado das agendadas (spec: não
              misturar). Cada card abre a área read-only (transcrição, pedidos, feedback). */}
          {endedConsultations.length > 0 && (
            <Accordion elevation={0} sx={{ mt: 1.5, border: '1px solid', borderColor: 'rgba(15,118,110,0.25)', borderRadius: '16px !important', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <HistoryIcon sx={{ color: '#178f89', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                    Histórico de consultas ({endedConsultations.length})
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Stack spacing={1.5}>
                  {endedConsultations.map((r) => renderConsultationCard(r))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      )}

      {/* CONTEÚDO DA ABA 2: MEDICAMENTOS */}
      {currentTab === 'medicamentos' && (
        <Box>
          {/* Banner conectando à Central Completa de Medicamentos */}
          <Card
            sx={{
              mb: 3,
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #78350f 0%, #b45309 50%, #d97706 100%)',
              color: '#fff',
              boxShadow: '0 8px 24px rgba(217,119,6,.25)',
            }}
          >
            <CardContent sx={{ py: 2.25, px: 2.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>
                    Central de Medicamentos & Receitas
                  </Typography>
                  <Typography sx={{ fontSize: 13, opacity: 0.9, maxWidth: 520, lineHeight: 1.4 }}>
                    Consulte bulas completas, interações contraindicadas e compare preços em 9 redes de farmácias com desconto.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  onClick={() => navigate('/medicamentos')}
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    bgcolor: '#fff',
                    color: '#78350f',
                    borderRadius: '999px',
                    fontWeight: 800,
                    textTransform: 'none',
                    px: 2.5,
                    whiteSpace: 'nowrap',
                    '&:hover': { bgcolor: '#fef3c7' },
                  }}
                >
                  Abrir Medicamentos
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: 'Poppins, sans-serif' }}>
              Horários de Tomar Remédio
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => { setRtype('medicamento'); setFormOpen(true); }}
              startIcon={<AddAlarmIcon />}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}
            >
              Adicionar Horário
            </Button>
          </Stack>

          {medications.length === 0 ? (
            <Card variant="outlined" sx={{ borderRadius: '20px', mb: 3, borderStyle: 'dashed', textAlign: 'center', py: 4 }}>
              <CardContent>
                <Box sx={{ fontSize: 44, mb: 1, opacity: 0.6 }}>💊</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhum remédio programado</Typography>
                <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 360, mx: 'auto', fontSize: 13.5 }}>
                  Cadastre o horário dos seus remédios para receber alertas push e confirmar cada dose tomada.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => { setRtype('medicamento'); setFormOpen(true); }}
                  startIcon={<AddAlarmIcon />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#d97706', px: 3 }}
                >
                  Adicionar horário
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={1.5} sx={{ mb: 3 }}>
              {medications.map((r) => renderMedicationCard(r))}
            </Stack>
          )}
        </Box>
      )}

      {/* CONTEÚDO DA ABA 3: LEMBRETES DE ROTINA & EXAMES */}
      {currentTab === 'lembretes' && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: 'Poppins, sans-serif' }}>
              Tarefas e Lembretes Preventivos
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => { setRtype('exame'); setFormOpen(true); }}
              startIcon={<AddAlarmIcon />}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' } }}
            >
              Novo Lembrete
            </Button>
          </Stack>

          {upcomingRoutine.length === 0 ? (
            <Card variant="outlined" sx={{ borderRadius: '20px', mb: 3, borderStyle: 'dashed', textAlign: 'center', py: 4 }}>
              <CardContent>
                <Box sx={{ fontSize: 44, mb: 1, opacity: 0.6 }}>📋</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhum lembrete pendente</Typography>
                <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 360, mx: 'auto', fontSize: 13.5 }}>
                  Ex.: "Jejum de 8h para exame de glicemia" ou "Buscar resultado de laudo no laboratório".
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => { setRtype('exame'); setFormOpen(true); }}
                  startIcon={<AddAlarmIcon />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0284c7', px: 3 }}
                >
                  Criar lembrete
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={2} sx={{ mb: 3 }}>
              {groups.map((g) => (
                <Box key={g.key}>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                      {g.label}
                    </Typography>
                    <Chip size="small" label={g.list.length} sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                  </Stack>
                  <Stack spacing={1.25}>
                    {g.list.map((r) => renderRoutineCard(r))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          {pastRoutine.length > 0 && (
            <Accordion elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '16px !important', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <HistoryIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                    Lembretes concluídos ({pastRoutine.length})
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Stack spacing={1}>
                  {pastRoutine.map((r) => renderRoutineCard(r))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      )}

      {/* FORMULÁRIO DE CADASTRO ADAPTADO */}
      <Card
        sx={{
          mt: 3,
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: formOpen ? '#20b2aa' : 'divider',
          boxShadow: formOpen ? '0 8px 24px rgba(32,178,170,.12)' : '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: '#0d9488', flexShrink: 0 }}>
                <AddAlarmIcon fontSize="small" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 14.5, sm: 16 }, lineHeight: 1.25 }}>
                {currentTab === 'consultas' ? 'Novo agendamento de consulta' : currentTab === 'medicamentos' ? 'Novo horário de remédio' : 'Novo lembrete de saúde'}
              </Typography>
            </Stack>
            <Button
              size="small"
              onClick={() => setFormOpen((o) => !o)}
              endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
            >
              {formOpen ? 'Fechar' : 'Cadastrar'}
            </Button>
          </Stack>

          <Collapse in={formOpen}>
            <Stack spacing={1.75} sx={{ mt: 2.5 }}>
              {/* TIPO */}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75 }}>Categoria</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {TYPES.map((t) => {
                    const on = rtype === t.v;
                    return (
                      <Chip
                        key={t.v}
                        component="button"
                        aria-pressed={on}
                        icon={t.icon}
                        label={t.l}
                        onClick={() => setRtype(t.v)}
                        sx={{
                          fontWeight: 800,
                          height: { xs: 38, sm: 34 },
                          fontSize: 13,
                          borderRadius: '10px',
                          bgcolor: on ? `${t.color}18` : 'transparent',
                          color: on ? t.color : 'text.secondary',
                          border: '1.5px solid',
                          borderColor: on ? t.color : 'divider',
                          '& .MuiChip-icon': { color: on ? t.color : 'text.disabled' },
                        }}
                      />
                    );
                  })}
                </Stack>
              </Box>

              <TextField
                label={rtype === 'teleconsulta' || rtype === 'consulta' ? 'Médico ou Motivo da Consulta (ex.: Dr. Roberto Silva - Cardiologia)' : rtype === 'medicamento' ? 'Nome do Remédio e Dose (ex.: Losartana 50mg)' : 'O que lembrar (ex.: Jejum 8h para exame de sangue)'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
              />

              {/* SUGESTÕES RÁPIDAS */}
              {typeMeta(rtype)?.sug && !title.trim() && (
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {typeMeta(rtype)!.sug.map(([s, rec]) => (
                    <Chip
                      key={s}
                      size="small"
                      variant="outlined"
                      label={s}
                      onClick={() => { setTitle(s); if (rec) setRecur(rec); }}
                      sx={{ height: 28, fontSize: 12, fontWeight: 700, borderRadius: '8px', '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.05)' } }}
                    />
                  ))}
                </Stack>
              )}

              {/* Data + Hora */}
              <Stack direction="row" spacing={1.5}>
                <TextField type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                <TextField type="time" label="Hora" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
              </Stack>

              {/* Link externo se teleconsulta */}
              {rtype === 'teleconsulta' && (
                <TextField
                  label="Link da chamada de vídeo (Meet, Teams, Zoom, WhatsApp…)"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  fullWidth
                  placeholder="https://meet.google.com/..."
                  helperText="Opcional se a consulta for pelo LiveKit integrado do app. Se tiver link externo, toque para abrir na hora."
                />
              )}

              {/* RECORRÊNCIA */}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75 }}>Repetição</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {RECUR.map((r) => {
                    const on = recur === r.v;
                    return (
                      <Chip
                        key={r.l}
                        component="button"
                        aria-pressed={on}
                        label={r.l}
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() => setRecur(r.v)}
                        sx={{ fontWeight: 700, height: 32, fontSize: 12.5, borderRadius: '8px' }}
                      />
                    );
                  })}
                </Stack>
              </Box>

              {/* ANTECEDÊNCIAS */}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75 }}>Alertas de antecedência</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {OFFSET_PALETTE.map((p) => {
                    const on = offsets.includes(p.o);
                    return (
                      <Chip
                        key={p.o}
                        component="button"
                        aria-pressed={on}
                        label={p.l}
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() => toggleOffset(p.o)}
                        sx={{ fontWeight: 700, height: 32, fontSize: 12.5, borderRadius: '8px' }}
                      />
                    );
                  })}
                </Stack>
              </Box>

              {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: '12px' }} onClose={() => setErr(null)}>{err}</Alert>}

              <Button
                variant="contained"
                onClick={add}
                disabled={!title.trim() || !date || offsets.length === 0}
                startIcon={<AddAlarmIcon />}
                sx={{
                  alignSelf: 'flex-start',
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontWeight: 800,
                  px: 3.5,
                  py: 1,
                  bgcolor: '#0d9488',
                  boxShadow: '0 4px 14px rgba(13,148,136,.3)',
                  '&:hover': { bgcolor: '#0f766e' },
                }}
              >
                Salvar agendamento
              </Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      {/* MODAL DE CONSENTIMENTO TELEMEDICINA ART. 15 */}
      <Dialog open={!!consentFor} onClose={() => setConsentFor(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17, display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
          <VideocamIcon sx={{ fontSize: 20, color: '#0d9488' }} /> Autorizar teleconsulta
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary', lineHeight: 1.65, fontSize: 14 }}>
            Autorizo o atendimento por <strong>telemedicina</strong> e a transmissão de imagens e dados nesta consulta, conforme a Resolução CFM 2.314/2022. Sei que posso negar ou revogar este consentimento a qualquer momento.
          </Typography>
          {consentFor && (
            <Alert severity="info" icon={false} sx={{ mt: 1.5, borderRadius: '12px', fontSize: 13 }}>
              {consentFor.title} · {fmtDate(consentFor.dueDate)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConsentFor(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Agora não</Button>
          <Button
            variant="contained"
            onClick={() => void consentAndOpen(consentFor)}
            endIcon={<OpenInNewIcon />}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
          >
            Entrar na consulta
          </Button>
        </DialogActions>
      </Dialog>

      {/* CONSULTA PARTICULAR (23/10): PIX da teleconsulta — QR + copia-e-cola.
          O poll acima detecta a aprovação e fecha sozinho ("Consulta paga"), sem reload.
          24/10: countdown de expiração + estado "expirado" com gerar novo + copy WebView-safe. */}
      <Dialog open={!!payTele} onClose={() => setPayTele(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17, display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
          <PaymentsIcon sx={{ fontSize: 20, color: '#d4a574' }} /> Pagar consulta
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          {payTele?.priceCents != null && (
            <Typography sx={{ fontWeight: 800, fontSize: 22, color: 'text.primary', mb: 0.5 }}>
              R$ {fmtBrl(Number(payTele.priceCents))}
            </Typography>
          )}
          {payExpired ? (
            <Box sx={{ py: 1 }}>
              <Alert severity="warning" icon={<HourglassEmptyIcon fontSize="small" />} sx={{ borderRadius: '12px', textAlign: 'left', fontSize: 13.5 }}>
                O tempo deste PIX acabou e ele não pode mais ser pago. Gere um novo código para concluir o pagamento.
              </Alert>
              <Button
                fullWidth
                variant="contained"
                disabled={payBusyId === payTele?.reminderId}
                onClick={() => { const it = items.find((x) => x.id === payTele?.reminderId); if (it) void payTeleconsulta(it); }}
                sx={{
                  mt: 1.5, minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 800,
                  background: 'linear-gradient(135deg, #d4a574 0%, #b88a54 100%)', color: '#fff',
                  '&:hover': { background: 'linear-gradient(135deg, #e0b183 0%, #c49260 100%)' },
                }}
              >
                {payBusyId === payTele?.reminderId ? 'Gerando novo PIX…' : 'Gerar novo PIX'}
              </Button>
            </Box>
          ) : (
            <>
              <Chip
                size="small"
                icon={<HourglassEmptyIcon sx={{ fontSize: '15px !important' }} />}
                label={`Expira em ${payMm}:${paySs}`}
                sx={{ mb: 1.5, borderRadius: '999px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', bgcolor: 'rgba(212,165,116,.14)', color: 'text.primary', border: '1px solid rgba(212,165,116,.3)' }}
              />
              <Typography sx={{ color: 'text.secondary', fontSize: 13, mb: 1.5 }}>
                Escaneie o QR ou use o copia-e-cola. A confirmação é automática — pode fechar e voltar depois.
              </Typography>
              {payTele?.qrBase64 ? (
                <Box component="img" src={payTele.qrBase64} alt="QR Code PIX da consulta" sx={{ width: 210, height: 210, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: '#fff', p: 1, mx: 'auto', display: 'block' }} />
              ) : null}
              {payTele?.qrCode && (
                <Box sx={{ mt: 2 }}>
                  <Box
                    onClick={() => void doCopyPix()}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.25,
                      px: 1.75,
                      borderRadius: '10px',
                      bgcolor: 'action.hover',
                      border: '1px dashed',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      transition: 'all .2s ease',
                      '&:hover': { bgcolor: 'action.selected', borderColor: '#178f89' },
                    }}
                  >
                    <Typography
                      noWrap
                      sx={{
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: 'text.secondary',
                        maxWidth: '85%',
                      }}
                    >
                      {payTele.qrCode.slice(0, 24)}…{payTele.qrCode.slice(-12)}
                    </Typography>
                    <ContentCopyIcon sx={{ fontSize: 16, color: '#178f89' }} />
                  </Box>

                  {/* Hidden / accessible input for fallback selection on WebView */}
                  <input
                    ref={pixCodeRef}
                    value={payTele.qrCode}
                    readOnly
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0 }}
                  />

                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    startIcon={pixCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                    onClick={() => void doCopyPix()}
                    sx={{
                      mt: 1.5,
                      minHeight: 46,
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: 14.5,
                      background: pixCopied
                        ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                        : 'linear-gradient(135deg, #178f89 0%, #0d5f5a 100%)',
                      color: '#fff',
                      boxShadow: '0 4px 14px rgba(23, 143, 137, 0.3)',
                      transition: 'all .2s ease',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
                        boxShadow: '0 6px 18px rgba(23, 143, 137, 0.4)',
                      },
                    }}
                  >
                    {pixCopied ? 'Código PIX Copiado!' : 'Copiar Código PIX'}
                  </Button>
                </Box>
              )}
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 2 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#22c55e',
                    animation: 'radarPing 1.6s infinite ease-in-out',
                    '@keyframes radarPing': {
                      '0%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
                      '50%': { opacity: 1, transform: 'scale(1.2)' },
                    },
                  }}
                />
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, fontWeight: 500 }}>
                  Aguardando confirmação bancária…
                </Typography>
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPayTele(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
