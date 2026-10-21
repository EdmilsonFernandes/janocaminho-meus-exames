import { useEffect, useState, type ReactElement } from 'react';
import {
  Card, CardContent, Typography, Button, TextField, IconButton, Checkbox,
  Stack, Chip, Box, Collapse, Accordion, AccordionSummary, AccordionDetails,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Avatar
} from '@mui/material';
import { keyframes } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { confirmDialog } from '../components/ConfirmDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import BellIcon from '@mui/icons-material/NotificationsActive';
import AddAlarmIcon from '@mui/icons-material/AddAlarm';
import HistoryIcon from '@mui/icons-material/History';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ScienceIcon from '@mui/icons-material/Science';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MedicationIcon from '@mui/icons-material/Medication';
import VideocamIcon from '@mui/icons-material/Videocam';
import RepeatIcon from '@mui/icons-material/Repeat';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_URL, token, doctorPhotoUrl } from '../config';
import { hapticSuccess, hapticError, hapticLight } from '../utils/haptic';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { tealText } from '../theme';
import { openTelemedicinaRoom } from '../utils/telemedicina';

const pulse = keyframes`0%,100%{transform:scale(1)}50%{transform:scale(1.12)}`;
const livePulse = keyframes`0%{transform:scale(0.85);opacity:1}100%{transform:scale(2.2);opacity:0}`;

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
  { v: 'teleconsulta', l: 'Teleconsulta', icon: <VideocamIcon sx={{ fontSize: 16 }} />, color: '#0d9488', sug: [['Teleconsulta com meu médico', null]] },
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
  const currentTab = (searchParams.get('tab') || 'consultas') as 'consultas' | 'medicamentos' | 'lembretes';
  const setTab = (tab: 'consultas' | 'medicamentos' | 'lembretes') => {
    setSearchParams({ tab });
    if (tab === 'consultas') setRtype('teleconsulta');
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

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };

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
        navigate(`/teleconsulta/${r.id}`);
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

  const upcomingConsultations = consultations.filter((r) => new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const pastConsultations = consultations.filter((r) => new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const upcomingRoutine = routineList.filter((r) => new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const pastRoutine = routineList.filter((r) => new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const groups = [
    { key: 'today', label: 'Hoje', list: upcomingRoutine.filter((r) => groupOf(r.dueDate) === 'today') },
    { key: 'week', label: 'Próximos 7 dias', list: upcomingRoutine.filter((r) => groupOf(r.dueDate) === 'week') },
    { key: 'later', label: 'Depois', list: upcomingRoutine.filter((r) => groupOf(r.dueDate) === 'later') },
  ].filter((g) => g.list.length > 0);

  // 1. RENDERIZADOR DE CONSULTA / TELEMEDICINA (Ticket Clínico Oficial)
  const renderConsultationCard = (r: any) => {
    const isPast = new Date(r.dueDate) < now;
    const diffMs = new Date(r.dueDate).getTime() - now.getTime();
    const isLive = !isPast && diffMs <= 15 * 60 * 1000 && diffMs >= -60 * 60 * 1000;
    const docId = r.doctor?.id || r.createdByDoctorId || r.doctorId;
    const docPhoto = docId ? doctorPhotoUrl(docId) : undefined;
    const docName = r.doctor?.name ? (r.doctor.name.toLowerCase().startsWith('dr') ? r.doctor.name : `Dr(a). ${r.doctor.name}`) : r.title;

    return (
      <Card
        key={r.id}
        variant="outlined"
        sx={(t) => ({
          borderRadius: '20px',
          overflow: 'hidden',
          borderColor: isLive ? '#20b2aa' : isPast ? t.palette.divider : 'rgba(32,178,170,0.3)',
          bgcolor: isLive ? (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.06)' : 'rgba(240,253,250,0.7)') : 'background.paper',
          boxShadow: isLive ? '0 6px 22px rgba(32,178,170,0.2)' : '0 2px 10px rgba(0,0,0,0.04)',
          transition: 'all .2s ease',
          opacity: isPast ? 0.78 : 1,
          '&:hover': {
            boxShadow: '0 8px 24px rgba(32,178,170,0.15)',
            transform: 'translateY(-2px)',
          },
        })}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            {/* Foto / Avatar do Médico */}
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Avatar
                src={docPhoto}
                alt={docName}
                sx={{
                  width: { xs: 52, sm: 58 },
                  height: { xs: 52, sm: 58 },
                  fontSize: 20,
                  fontWeight: 800,
                  bgcolor: 'rgba(32,178,170,0.12)',
                  color: '#0d9488',
                  border: '2px solid rgba(32,178,170,0.3)',
                  boxShadow: '0 4px 12px rgba(32,178,170,0.15)',
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
                    '&::after': {
                      content: '""', position: 'absolute', inset: 0,
                      borderRadius: '50%', bgcolor: '#10b981',
                      animation: `${livePulse} 1.6s infinite`,
                    },
                  }}
                />
              )}
            </Box>

            {/* Informações Clínicas da Consulta */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
                  {docName}
                </Typography>
                {r.doctor?.crm && (
                  <Chip
                    size="small"
                    label={`CRM ${r.doctor.crm}${r.doctor.crmUf ? `-${r.doctor.crmUf}` : ''}`}
                    sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,0.1)', color: '#0d9488', borderRadius: '6px' }}
                  />
                )}
                {isLive && (
                  <Chip
                    size="small"
                    label="AO VIVO AGORA"
                    sx={{ height: 22, fontSize: 12, fontWeight: 900, bgcolor: '#b91c1c', color: '#fff', borderRadius: '6px' }}
                  />
                )}
              </Stack>

              <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" sx={{ mb: 0.75 }}>
                {r.doctor?.specialty && (
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#0d9488' }}>
                    🩺 {r.doctor.specialty}
                  </Typography>
                )}
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>
                    {fmtDate(r.dueDate)}
                  </Typography>
                </Stack>
                {timeAgo(r.dueDate) && !isPast && (
                  <Chip size="small" label={timeAgo(r.dueDate)} sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: '#0d9488', borderRadius: '6px' }} />
                )}
              </Stack>

              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                {r.consentAt && (r.type === 'teleconsulta' || r.provider === 'livekit' || r.linkUrl) && (
                  <Chip
                    size="small"
                    icon={<VerifiedIcon sx={{ fontSize: 13 }} />}
                    label="Telemedicina autorizada"
                    sx={{
                      height: 24,
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: '6px',
                      bgcolor: 'rgba(15,118,110,.12)',
                      color: '#178f89',
                      '& .MuiChip-icon': { color: '#178f89' },
                    }}
                  />
                )}
                {(pendingReqs[r.id] ?? 0) > 0 && (
                  <Chip
                    size="small"
                    clickable
                    label={`${pendingReqs[r.id]} pedido(s) de exame`}
                    onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                    sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(245,158,11,.15)', color: '#b45309', borderRadius: '6px' }}
                  />
                )}
              </Stack>
            </Box>

            {/* Ações da Consulta — FIX 2: 1 contained por card; consent é chip; WhatsApp é ícone discreto no canto */}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, justifyContent: { xs: 'flex-end', sm: 'flex-start' }, pt: { xs: 1, sm: 0 } }}>
              {!isPast ? (
                r.consentAt ? (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<VideocamIcon />}
                    onClick={() => {
                      hapticLight();
                      if (r.linkUrl) void openTelemedicinaRoom(r.linkUrl);
                      else navigate(`/teleconsulta/${r.id}`);
                    }}
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: 13,
                      px: 2.2,
                      py: 0.7,
                      bgcolor: '#178f89',
                      '&:hover': { bgcolor: '#137a74' },
                      boxShadow: '0 4px 14px rgba(15,118,110,.35)',
                    }}
                  >
                    Entrar na consulta
                  </Button>
                ) : (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<VideocamIcon />}
                      onClick={() => { hapticLight(); setConsentFor(r); }}
                      sx={{
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 13,
                        px: 2.2,
                        py: 0.7,
                        bgcolor: '#178f89',
                        '&:hover': { bgcolor: '#137a74' },
                        boxShadow: '0 4px 14px rgba(15,118,110,.35)',
                      }}
                    >
                      Entrar na consulta
                    </Button>
                    <Chip
                      size="small"
                      icon={<HourglassEmptyIcon sx={{ fontSize: 14 }} />}
                      label="autorizar ao entrar"
                      sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(245,158,11,.12)', color: '#d97706', borderRadius: '8px', '& .MuiChip-icon': { color: '#d97706' } }}
                    />
                  </>
                )
              ) : (r.type === 'teleconsulta' || r.provider === 'livekit') ? (
                /* Consulta realizada → hub pós-consulta ("Ver consulta" é a única primária do card) */
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AssignmentIcon />}
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                  sx={{
                    borderRadius: '999px',
                    textTransform: 'none',
                    fontWeight: 800,
                    fontSize: 13,
                    px: 2.2,
                    py: 0.7,
                    bgcolor: '#178f89',
                    '&:hover': { bgcolor: '#137a74' },
                    boxShadow: '0 4px 14px rgba(15,118,110,.35)',
                  }}
                >
                  Ver consulta
                </Button>
              ) : null}

              {r.linkUrl && (
                <IconButton
                  size="small"
                  aria-label="Compartilhar no WhatsApp"
                  title="Compartilhar agendamento no WhatsApp"
                  onClick={() => {
                    const dt = fmtDate(r.dueDate);
                    window.open(`https://wa.me/?text=${encodeURIComponent(`Teleconsulta "${r.title}" com ${docName} agendada para ${dt}. Link de acesso: ${r.linkUrl}`)}`, '_blank', 'noopener');
                  }}
                  sx={{ color: '#25d366', '&:hover': { bgcolor: 'rgba(37,211,102,.12)' } }}
                >
                  <WhatsAppIcon sx={{ fontSize: 20 }} />
                </IconButton>
              )}

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
          startIcon={<VideocamIcon />}
          sx={{
            py: 1,
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: { xs: 12.5, sm: 14 },
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
          startIcon={<MedicationIcon />}
          sx={{
            py: 1,
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: { xs: 12.5, sm: 14 },
            bgcolor: currentTab === 'medicamentos' ? '#d97706' : 'transparent',
            color: currentTab === 'medicamentos' ? '#fff' : 'text.secondary',
            boxShadow: currentTab === 'medicamentos' ? '0 4px 14px rgba(217,119,6,.3)' : 'none',
            '&:hover': {
              bgcolor: currentTab === 'medicamentos' ? '#b45309' : 'action.hover',
            },
          }}
        >
          Medicamentos ({medications.length})
        </Button>

        <Button
          fullWidth
          onClick={() => setTab('lembretes')}
          startIcon={<BellIcon />}
          sx={{
            py: 1,
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: { xs: 12.5, sm: 14 },
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
              onClick={() => { setRtype('teleconsulta'); setFormOpen(true); }}
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

          {upcomingConsultations.length === 0 ? (
            <Card variant="outlined" sx={{ borderRadius: '20px', mb: 3, borderStyle: 'dashed', textAlign: 'center', py: 4 }}>
              <CardContent>
                <Box sx={{ fontSize: 44, mb: 1, opacity: 0.6 }}>🩺</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhuma consulta agendada</Typography>
                <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 360, mx: 'auto', fontSize: 13.5 }}>
                  Suas teleconsultas com médicos e consultas de rotina aparecerão aqui com sala virtual e prontuário.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => { setRtype('teleconsulta'); setFormOpen(true); }}
                  startIcon={<AddAlarmIcon />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0d9488', px: 3 }}
                >
                  Agendar consulta
                </Button>
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
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: '#0d9488' }}>
                <AddAlarmIcon fontSize="small" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 16 }}>
                {currentTab === 'consultas' ? 'Novo agendamento de consulta' : currentTab === 'medicamentos' ? 'Novo horário de remédio' : 'Novo lembrete de saúde'}
              </Typography>
            </Stack>
            <Button
              size="small"
              onClick={() => setFormOpen((o) => !o)}
              endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}
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
    </PageContainer>
  );
};
