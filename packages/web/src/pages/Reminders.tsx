import { useEffect, useState, type ReactElement } from 'react';
import { Card, CardContent, Typography, Button, TextField, IconButton, Checkbox, Stack, Chip, Box, Collapse, Accordion, AccordionSummary, AccordionDetails, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Avatar, Tooltip } from '@mui/material';
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
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { hapticSuccess, hapticError, hapticLight } from '../utils/haptic';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { tealText } from '../theme';
import { openTelemedicinaRoom } from '../utils/telemedicina';

const pulse = keyframes`0%,100%{transform:scale(1)}50%{transform:scale(1.12)}`;

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

// ── Lote "encontro estilo Teams" (18/10/26) ────────────────────────────────────
/** Tipos de lembrete (chip + ícone + sugestões rápidas por tipo — "surpresa" premium:
 *  1 toque preenche título + recorrência sugerida com bom senso clínico). */
const TYPES: { v: string; l: string; icon: ReactElement; color: string; sug: [string, string | null][] }[] = [
  { v: 'exame', l: 'Exame', icon: <ScienceIcon sx={{ fontSize: 16 }} />, color: '#0369a1', sug: [['Refazer exame de sangue', 'semestral'], ['Consultar resultado com médico', null]] },
  { v: 'consulta', l: 'Consulta', icon: <MedicalServicesIcon sx={{ fontSize: 16 }} />, color: '#7c3aed', sug: [['Consulta de rotina', 'anual'], ['Retorno com especialista', null]] },
  { v: 'medicamento', l: 'Medicamento', icon: <MedicationIcon sx={{ fontSize: 16 }} />, color: '#d97706', sug: [['Tomar medicação diária', 'diario'], ['Renovar receita', 'mensal']] },
  { v: 'teleconsulta', l: 'Teleconsulta', icon: <VideocamIcon sx={{ fontSize: 16 }} />, color: '#0f766e', sug: [['Teleconsulta com meu médico', null]] },
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

/** Agrupamento estilo agenda/Teams: Hoje · Esta semana · Depois. */
const groupOf = (due: string): 'today' | 'week' | 'later' => {
  const d = new Date(due);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ms = d.getTime();
  if (ms < startToday + 86400000) return 'today';      // hoje (ou já venceu hoje)
  if (ms < startToday + 7 * 86400000) return 'week';
  return 'later';
};

export const RemindersPage = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate(); // teleconsulta LiveKit: entra pela rota /teleconsulta/:id (consent acontece lá)
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [offsets, setOffsets] = useState<number[]>(DEFAULT_OFFSETS);
  const [rtype, setRtype] = useState<string>('exame');
  const [recur, setRecur] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false); // colapsado: agendados primeiro
  const [consentFor, setConsentFor] = useState<any | null>(null); // teleconsulta aguardando aceite
  // F3 §4: pedidos de exame pendentes do médico, por teleconsulta (chip âmbar no card).
  const [pendingReqs, setPendingReqs] = useState<Record<string, number>>({});

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  // Fetch leve dos pedidos (3g GET /api/exam-requests — role-aware no server). Fora do
  // ar (404 pré-be1) ou offline → chip simplesmente não aparece (degradação da casa).
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
    } catch { /* offline — sem chip */ }
  };
  useEffect(() => { load(); loadExamRequests(); /* eslint-disable-next-line */ }, [pid]);

  const toggleOffset = (o: number) => setOffsets((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]));

  const add = async () => {
    if (!title.trim() || !date) return;
    setErr(null);
    // Combina data + hora no fuso do usuário -> instante absoluto (ISO) p/ o job calcular certo.
    const iso = new Date(`${date}T${time || '09:00'}`).toISOString();
    try {
      const r = await fetch(`${API_URL}/reminders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId: pid, title: title.trim(), dueDate: iso, notifyOffsetsMin: offsets, type: rtype, recurrence: recur, linkUrl: rtype === 'teleconsulta' ? linkUrl.trim() : undefined }),
      });
      if (!r.ok) {
        // Antes falhava silencioso (limpava o form e o lembrete sumia sem mensagem) — agora mostra o erro.
        const d = await r.json().catch(() => ({}));
        hapticError();
        setErr(d?.message || d?.error || 'Não foi possível salvar o lembrete. Tente novamente.');
        return; // mantém o form preenchido pra não perder o que digitou
      }
      setTitle(''); setDate(''); setTime('09:00'); setOffsets(DEFAULT_OFFSETS); setRtype('exame'); setRecur(null); setLinkUrl(''); await load();
      hapticSuccess();
    } catch {
      hapticError();
      setErr('Sem conexão — o lembrete não foi salvo. Reconecte e tente novamente.');
    }
  };
  const toggle = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ done: !r.done }),
    });
    load();
  };

  /** Consentimento Art. 15 (teleconsulta): registra o aceite e abre a chamada.
   *  No mobile nativo usa In-App Browser (@capacitor/browser); no desktop abre popup. */
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
  const overdue = (d: string) => new Date(d) < new Date();
  const timeAgo = (d: string) => {
    const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return null;
    if (days === 0) return 'hoje';
    if (days === 1) return 'amanhã';
    if (days < 7) return `em ${days} dias`;
    if (days < 30) return `em ${Math.floor(days / 7)} sem.`;
    return `em ${Math.floor(days / 30)} mês(es)`;
  };

  // Separa FUTUROS (agendados) de PASSADOS (histórico) — não se misturam.
  const now = new Date();
  const upcoming = items.filter((r) => new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const past = items.filter((r) => new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const renderItem = (r: any, _i: number) => {
    const isPast = new Date(r.dueDate) < now;
    const isOverdue = isPast && !r.done;
    const ta = timeAgo(r.dueDate);
    const tm = typeMeta(r.type);
    const rl = recurLabel(r.recurrence);
    const isTele = r.type === 'teleconsulta';
    return (
      <Card key={r.id} variant="outlined" sx={{
        borderRadius: '20px', overflow: 'hidden',
        borderColor: isOverdue ? '#ef4444' : isTele ? 'rgba(15,118,110,.35)' : 'divider',
        bgcolor: isOverdue ? 'rgba(239,68,68,.03)' : r.done ? 'rgba(0,0,0,.02)' : 'background.paper',
        boxShadow: '0 1px 3px rgba(0,0,0,.03), 0 4px 12px rgba(0,0,0,.03)',
        transition: 'all .2s ease',
        opacity: r.done ? 0.72 : 1,
        '&:hover': { boxShadow: '0 8px 24px rgba(32,178,170,.1)', transform: 'translateY(-2px)' },
      }}>
        <CardContent sx={{ py: 1.75, px: 2.25, '&:last-child': { pb: 1.75 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={1.5}>
            <Checkbox checked={!!r.done} onChange={() => toggle(r)} sx={{ p: 0.5, color: 'text.disabled', '&.Mui-checked': { color: (t) => tealText(t.palette.mode) } }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                {tm && (
                  <Chip size="small" icon={tm.icon} label={tm.l} sx={{ height: 24, fontSize: 11.5, fontWeight: 800, bgcolor: `${tm.color}14`, color: tm.color, '& .MuiChip-icon': { color: tm.color }, borderRadius: '8px' }} />
                )}
                <Typography sx={{
                  fontWeight: 700, fontSize: 15, lineHeight: 1.3,
                  textDecoration: r.done ? 'line-through' : 'none',
                  color: r.done ? 'text.secondary' : 'text.primary',
                }}>{r.title}</Typography>
                {rl && (
                  <Chip size="small" icon={<RepeatIcon sx={{ fontSize: 13 }} />} label={rl} sx={{ height: 22, fontSize: 11, fontWeight: 800, bgcolor: 'action.hover', color: 'text.secondary', borderRadius: '6px' }} />
                )}
                {ta && !isPast && (
                  <Chip size="small" label={ta} sx={{
                    height: 22, fontSize: 12, fontWeight: 800,
                    bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode),
                    borderRadius: '6px',
                  }} />
                )}
                {isOverdue && (
                  <Chip size="small" label="Atrasado" color="error" sx={{ height: 22, fontSize: 12, fontWeight: 800, borderRadius: '6px' }} />
                )}
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary">{fmtDate(r.dueDate)}</Typography>
              </Stack>
              {Array.isArray(r.notifyOffsetsMin) && r.notifyOffsetsMin.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                  <BellIcon sx={{ fontSize: 14, color: 'text.disabled', mt: 0.25 }} />
                  {r.notifyOffsetsMin.map((o: number) => <Chip key={o} size="small" variant="outlined" label={offsetShort(o)} sx={{ height: 22, fontSize: 12, borderColor: 'divider', borderRadius: '6px' }} />)}
                </Stack>
              )}

              {/* TELECONSULTA — ação paciente×médico: consentimento (Art. 15) desbloqueia a
                  entrada na chamada. Código da sala (5 finais do id) aparece AQUI e no header
                  da chamada — médico e paciente conferem se estão na MESMA (bug 3-salas 19/10). */}
              {isTele && (
                <Box sx={{ mt: 1, p: 1.25, borderRadius: '12px', bgcolor: 'rgba(15,118,110,0.06)', border: '1px solid rgba(15,118,110,0.15)' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Avatar sx={{ width: 34, height: 34, fontSize: 14, fontWeight: 800, bgcolor: 'rgba(32,178,170,0.16)', color: '#0f766e', border: '1.5px solid rgba(32,178,170,0.35)' }}>
                      {(r.doctor?.name || 'D').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      {r.doctor ? (
                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
                          {r.doctor.name} <span style={{ fontWeight: 600, color: 'text.secondary' }}>· CRM {r.doctor.crm}{r.doctor.crmUf ? `-${r.doctor.crmUf}` : ''}</span>
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f766e' }}>🩺 Teleconsulta agendada</Typography>
                      )}
                      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                        {r.doctor?.specialty ? `${r.doctor.specialty} · ` : ''}criada {new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </Box>
                    <Tooltip title="Confira este código com seu médico — precisa ser igual nos dois aparelhos">
                      <Chip size="small" label={`Sala ${String(r.id).slice(-5).toUpperCase()}`} sx={{ height: 24, fontSize: 11.5, fontWeight: 800, fontFamily: 'monospace', bgcolor: 'rgba(212,165,116,.18)', color: 'secondary.dark', border: '1px dashed rgba(212,165,116,.5)' }} />
                    </Tooltip>
                  </Stack>
                  {(r.type === 'teleconsulta' || r.provider === 'livekit' || r.linkUrl) && (
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75 }}>
                      {(r.provider === 'livekit' || (!r.linkUrl && r.type === 'teleconsulta')) ? (
                        /* Videochamada DENTRO do app (LiveKit F2): botão leva pra rota
                           /teleconsulta/:id — consent Art.15 + câmera + chamada acontecem lá. */
                        <>
                          <Chip size="small" label="No app ✨" sx={{ height: 22, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(212,165,116,.2)', color: 'secondary.dark' }} />
                          {/* F3 §4: pendência do médico — chip âmbar clicável → área da consulta. */}
                          {(pendingReqs[r.id] ?? 0) > 0 && (
                            <Chip
                              size="small" clickable
                              aria-label={`${pendingReqs[r.id]} pedido${pendingReqs[r.id] > 1 ? 's' : ''} do médico — abrir consulta`}
                              label={`${pendingReqs[r.id]} pedido${pendingReqs[r.id] > 1 ? 's' : ''} do médico`}
                              onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                              sx={{
                                height: 24, fontSize: 11, fontWeight: 800, borderRadius: '8px',
                                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(245,158,11,.14)' : 'rgba(245,158,11,.15)'),
                                color: (t) => (t.palette.mode === 'dark' ? '#fbbf24' : '#92400e'),
                                '&:hover': { bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(245,158,11,.24)' : 'rgba(245,158,11,.25)') },
                                '&:focus-visible': { outline: '2px solid #f59e0b', outlineOffset: 1 },
                              }}
                            />
                          )}
                          {r.consentAt ? (
                            <>
                              <Button size="small" variant="contained" startIcon={<VideocamIcon />} onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: '0 4px 12px rgba(15,118,110,.25)' }}>
                                Entrar na consulta
                              </Button>
                              <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="telemedicina autorizada" sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,118,110,.1)', color: '#0f766e', '& .MuiChip-icon': { color: '#0f766e' } }} />
                            </>
                          ) : (
                            <Button size="small" variant="outlined" startIcon={<VideocamIcon />} onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, color: '#0f766e', borderColor: 'rgba(15,118,110,.4)', '&:hover': { bgcolor: 'rgba(15,118,110,.06)', borderColor: '#0f766e' } }}>
                              Autorizar e entrar
                            </Button>
                          )}
                        </>
                      ) : (
                        /* Fluxo link externo (Meet/Teams/WhatsApp) */
                        <>
                          {r.linkUrl?.includes('meet.google.com') && (
                            <Chip size="small" label="Google Meet ✨" sx={{ height: 22, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(212,165,116,.2)', color: 'secondary.dark' }} />
                          )}
                          {r.consentAt ? (
                            <>
                              <Button size="small" variant="contained" startIcon={<VideocamIcon />} onClick={() => { hapticLight(); if (r.linkUrl) void openTelemedicinaRoom(r.linkUrl); else navigate(`/teleconsulta/${r.id}`); }}
                                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: '0 4px 12px rgba(15,118,110,.25)' }}>
                                Entrar na consulta
                              </Button>
                              <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="telemedicina autorizada" sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,118,110,.1)', color: '#0f766e', '& .MuiChip-icon': { color: '#0f766e' } }} />
                            </>
                          ) : (
                            <Button size="small" variant="outlined" startIcon={<VideocamIcon />} onClick={() => { hapticLight(); setConsentFor(r); }}
                              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, color: '#0f766e', borderColor: 'rgba(15,118,110,.4)', '&:hover': { bgcolor: 'rgba(15,118,110,.06)', borderColor: '#0f766e' } }}>
                              Autorizar e entrar
                            </Button>
                          )}
                        </>
                      )}
                      {r.linkUrl && (
                        <IconButton size="small" aria-label="Compartilhar no WhatsApp" title="Compartilhar no WhatsApp" onClick={() => {
                          const dt = new Date(r.dueDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                          window.open(`https://wa.me/?text=${encodeURIComponent(`Teleconsulta "${r.title}"${r.doctor?.name ? ` com ${r.doctor.name}` : ''} — ${dt}. Link: ${r.linkUrl}`)}`, '_blank', 'noopener');
                        }} sx={{ color: '#25d366', bgcolor: 'rgba(37,211,102,.08)', '&:hover': { bgcolor: 'rgba(37,211,102,.16)' } }}>
                          <WhatsAppIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      )}
                    </Stack>
                  )}
                </Box>
              )}
            </Box>
            <IconButton size="small" aria-label={`Excluir lembrete ${r.title}`} onClick={async () => { if (await confirmDialog({ title: 'Excluir lembrete', message: `Apagar "${r.title}"? O aviso programado deixa de ser enviado.`, confirmLabel: 'Excluir' })) del(r); }} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // Agrupamento estilo Teams/agenda: a semana na frente, o resto depois.
  const groups: { key: string; label: string; list: any[] }[] = [
    { key: 'today', label: 'Hoje', list: upcoming.filter((r) => groupOf(r.dueDate) === 'today') },
    { key: 'week', label: 'Próximos 7 dias', list: upcoming.filter((r) => groupOf(r.dueDate) === 'week') },
    { key: 'later', label: 'Depois', list: upcoming.filter((r) => groupOf(r.dueDate) === 'later') },
  ].filter((g) => g.list.length > 0);

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<BellIcon />} title="Lembretes" subtitle="Exames, consultas, medicamentos e teleconsultas — avisamos por push, e-mail e notificação." />

      <Card sx={{
        mb: 2.5, borderRadius: '20px', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0c4a46 0%, #137a72 50%, #178f89 100%)',
        color: '#fff', position: 'relative',
        boxShadow: '0 10px 26px rgba(15,61,58,.2)',
      }}>
        <CardContent sx={{ py: 2, px: { xs: 2, sm: 2.5 }, position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} useFlexGap flexWrap="wrap">
            <BellIcon sx={{ fontSize: 22, opacity: 0.9 }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 150, lineHeight: 1.45 }}>
              {upcoming.length} agendado{upcoming.length === 1 ? '' : 's'}
              {(() => { const n = past.filter((r) => !r.done).length; return n > 0 ? ` · ${n} atrasado${n > 1 ? 's' : ''}` : ''; })()}
              {(() => { const n = upcoming.filter((r) => r.recurrence).length; return n > 0 ? ` · ${n} recorrente${n > 1 ? 's' : ''}` : ''; })()}
              {(() => { const n = past.filter((r) => r.done).length; return n > 0 ? ` · ${n} concluído${n > 1 ? 's' : ''}` : ''; })()}
            </Typography>
            <Button size="small" disableElevation onClick={() => document.getElementById('proximos')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 2, bgcolor: 'rgba(255,255,255,.16)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,.24)' } }}>Ver lembretes</Button>
          </Stack>
        </CardContent>
      </Card>

      <Stack id="proximos" direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <EventAvailableIcon sx={{ color: (t) => tealText(t.palette.mode), fontSize: 22 }} />
        <Typography sx={{ fontWeight: 900, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>Próximos lembretes</Typography>
        {upcoming.length > 0 && <Chip size="small" label={upcoming.length} sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: (t) => tealText(t.palette.mode), fontWeight: 800, height: 24, borderRadius: '999px' }} />}
      </Stack>

      {upcoming.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: '20px', mb: 2.5, borderStyle: 'dashed', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ fontSize: 48, mb: 1, opacity: 0.4, animation: `${pulse} 2s ease infinite` }}>⏰</Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 0.5 }}>Nenhum lembrete agendado</Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 320, mx: 'auto', fontSize: 14 }}>
              Ex.: "Refazer hemograma em 6 meses" ou "Teleconsulta dia 15 às 14h"
            </Typography>
            <Button variant="contained" startIcon={<AddAlarmIcon />} onClick={() => setFormOpen(true)} sx={{
              borderRadius: '999px', textTransform: 'none', fontWeight: 800,
              bgcolor: '#20b2aa', px: 3, boxShadow: '0 6px 16px rgba(32,178,170,.3)',
              '&:hover': { bgcolor: 'primary.dark' },
            }}>Criar lembrete</Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2} sx={{ mb: 2.5 }}>
          {groups.map((g) => (
            <Box key={g.key}>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>{g.label}</Typography>
                <Chip size="small" label={g.list.length} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
              </Stack>
              <Stack spacing={1.25}>
                {g.list.map((r, i) => renderItem(r, i))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* NOVO LEMBRETE — colapsado, abaixo dos agendados */}
      <Card sx={{ mb: 2.5, borderRadius: '16px', overflow: 'hidden', border: '1px solid', borderColor: formOpen ? '#20b2aa' : 'divider', transition: 'border-color .3s', boxShadow: formOpen ? '0 8px 24px rgba(32,178,170,.1)' : '0 4px 16px rgba(0,0,0,0.03)' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }}>
                <AddAlarmIcon fontSize="small" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Novo lembrete</Typography>
            </Stack>
            <Button size="small" onClick={() => setFormOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
              {formOpen ? 'Fechar' : 'Criar'}
            </Button>
          </Stack>
          <Collapse in={formOpen}>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {/* TIPO — define ícone, cor e o que a teleconsulta precisa (link + consentimento) */}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75 }}>Tipo</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {TYPES.map((t) => {
                    const on = rtype === t.v;
                    return (
                      <Chip key={t.v} component="button" aria-pressed={on} icon={t.icon} label={t.l}
                        onClick={() => setRtype(t.v)}
                        sx={{ fontWeight: 800, height: { xs: 40, sm: 34 }, fontSize: 13, borderRadius: '10px',
                          bgcolor: on ? `${t.color}18` : 'transparent', color: on ? t.color : 'text.secondary',
                          border: '1px solid', borderColor: on ? t.color : 'divider',
                          '& .MuiChip-icon': { color: on ? t.color : 'text.disabled' } }} />
                    );
                  })}
                </Stack>
              </Box>

              <TextField label="O que (ex.: Refazer hemograma)" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />

              {/* SUGESTÕES do tipo — 1 toque preenche título (+recorrência com bom senso) */}
              {typeMeta(rtype)?.sug && !title.trim() && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {typeMeta(rtype)!.sug.map(([s, rec]) => (
                    <Chip key={s} size="small" variant="outlined" label={s} onClick={() => { setTitle(s); if (rec) setRecur(rec); }}
                      sx={{ height: 30, fontSize: 12.5, fontWeight: 700, borderRadius: '8px', borderColor: 'divider', '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.05)' } }} />
                  ))}
                </Stack>
              )}

              {/* Data + Hora lado a lado com a MESMA largura (alinhamento — antes desalinhavam no mobile) */}
              <Stack direction={{ xs: 'row', sm: 'row' }} spacing={1}>
                <TextField type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                <TextField type="time" label="Hora" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
              </Stack>

              {/* TELECONSULTA: link externo obrigatório (Meet/Teams/WhatsApp) — nunca hospedamos a chamada */}
              {rtype === 'teleconsulta' && (
                <TextField label="Link da chamada (Meet, Teams, WhatsApp…)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} fullWidth
                  placeholder="https://meet.google.com/…" helperText="Quem entra na hora é você, pelo link — o consentimento de telemedicina é pedido antes de abrir." />
              )}

              {/* RECORRÊNCIA — vencido/feito, o lembrete rola pra próxima data sozinho (estilo série do Teams) */}
              <Box>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 0.75 }}>
                  <RepeatIcon fontSize="small" color="action" sx={{ mr: 0.5 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Repetir</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {RECUR.map((r) => {
                    const on = recur === r.v;
                    return (
                      <Chip key={r.l} component="button" aria-pressed={on} label={r.l} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                        onClick={() => setRecur(r.v)} sx={{ fontWeight: 700, height: { xs: 40, sm: 32 }, fontSize: 13, borderRadius: '10px' }} />
                    );
                  })}
                </Stack>
              </Box>

              <Box>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 0.75 }}>
                  <BellIcon fontSize="small" color="action" sx={{ mr: 0.5 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Quando avisar?</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {OFFSET_PALETTE.map((p) => {
                    const on = offsets.includes(p.o);
                    // Seletor PRINCIPAL do recurso: alvo 40px no touch (piso WCAG p/ dedo) +
                    // semântica de toggle (component button + aria-pressed) p/ leitor de tela.
                    return (
                      <Chip key={p.o} component="button" aria-pressed={on} label={p.l} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                        onClick={() => toggleOffset(p.o)} sx={{ fontWeight: 700, height: { xs: 40, sm: 32 }, fontSize: 13 }} />
                    );
                  })}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Avisamos por <strong>notificação no app</strong>, <strong>push</strong> e <strong>e-mail</strong> em cada antecedência escolhida.
                </Typography>
              </Box>
              {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: '12px' }} onClose={() => setErr(null)}>{err}</Alert>}
              <Button variant="contained" onClick={add} disabled={!title.trim() || !date || offsets.length === 0 || (rtype === 'teleconsulta' && !/^https?:\/\//i.test(linkUrl.trim()))}
                startIcon={<AddAlarmIcon />}
                sx={{
                  alignSelf: 'flex-start', borderRadius: '999px', textTransform: 'none',
                  fontWeight: 800, px: 3, bgcolor: '#20b2aa',
                  boxShadow: '0 6px 16px rgba(32,178,170,.3)',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      {/* HISTÓRICO (passados) — colapsável, não briga com os agendados */}
      {past.length > 0 && (
        <Card sx={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
          <CardContent sx={{ pb: '8px !important' }}>
            <Accordion elevation={0} sx={{ '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 40, '& .MuiAccordionSummary-content': { my: 0 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <HistoryIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Typography component="div" sx={{ fontWeight: 800, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Poppins, sans-serif' }}>
                    Histórico <Chip size="small" label={past.length} sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700 }} />
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0 }}>
                <Stack spacing={1}>
                  {past.map((r, i) => renderItem(r, i))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* CONSENTIMENTO DE TELEMEDICINA (Art. 15, Res. CFM 2.314/2022) — aceite livre e
          esclarecido ANTES de abrir a chamada externa. Carimbo fica no registro. */}
      <Dialog open={!!consentFor} onClose={() => setConsentFor(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 17, display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
          <VideocamIcon sx={{ fontSize: 20, color: '#0f766e' }} /> Autorizar teleconsulta
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary', lineHeight: 1.65, fontSize: 14 }}>
            Autorizo o atendimento por <strong>telemedicina</strong> e a transmissão de imagens e dados nesta consulta, conforme a Resolução CFM 2.314/2022. Sei que posso negar ou revogar este consentimento a qualquer momento, e que ele fica registrado com data e hora.
          </Typography>
          {consentFor && (
            <Alert severity="info" icon={false} sx={{ mt: 1.5, borderRadius: '12px', fontSize: 13 }}>
              {consentFor.title} · {fmtDate(consentFor.dueDate)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConsentFor(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Agora não</Button>
          <Button variant="contained" onClick={() => void consentAndOpen(consentFor)} endIcon={<OpenInNewIcon />}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
            Autorizar e entrar
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
