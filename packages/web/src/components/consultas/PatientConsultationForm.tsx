import { useEffect, useMemo, useState } from 'react';
import { plural } from '../../utils/format';
import {
  Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { hapticLight } from '../../utils/haptic';
import { INSURANCE_OPERATOR_NAMES, SPECIALTIES } from '../../utils/medicalData';
import type { MyDoctorItem, PatientConsultationItem } from '../../types/consultations';

// §2 "Minhas consultas" (28/10/26): registro PRIVADO do paciente. O aviso de honestidade
// ("registrar não agenda no consultório") vive na lista e no rodapé — aqui o botão diz
// "Registrar"/"Salvar", nunca "Agendar", pra não prometer o que não entregamos.
// Redesenho 30/10/26 (mock aprovado, base ReUI schedule-10 + schedule-9): atalhos
// Hoje/Amanhã/Próx. semana + calendário do mês + grade de horários no lugar do
// datetime-local; fuso e campos raros atrás de "Detalhes"; zero emoji nos labels.

const TIMEZONES_BR = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (GMT-4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (GMT-4)' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const brlToCents = (v: string): number | null => {
  const s = v.trim().replace(/\./g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

const centsToBrl = (c?: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

// Grade de horários (07:00–19:30, passo 30min) — registro pessoal: todos habilitados.
const SLOTS = Array.from({ length: 26 }, (_, i) => `${pad2(7 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: PatientConsultationItem | null;
  prefillDoctor?: { doctorId?: string; doctorName?: string; specialty?: string } | null;
}

export const PatientConsultationForm = ({ open, onClose, onSaved, initial, prefillDoctor }: Props) => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [myDoctors, setMyDoctors] = useState<MyDoctorItem[]>([]);
  const [exams, setExams] = useState<{ id: string; title: string; performedAt: string | null }[]>([]);

  const editing = !!initial;
  const [fromList, setFromList] = useState(true);
  const [doctor, setDoctor] = useState<MyDoctorItem | null>(null);
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [mode, setMode] = useState<'presencial' | 'teleconsulta'>('presencial');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [paymentType, setPaymentType] = useState<'particular' | 'convenio'>('particular');
  const [operator, setOperator] = useState<string | null>(null);
  const [plan, setPlan] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [examIds, setExamIds] = useState<string[]>([]);
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);
  // UI do redesenho: mês exibido no calendário + "Detalhes" recolhido por padrão
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Opções: médicos salvos + exames do paciente (mesma fonte do form de compartilhar)
  useEffect(() => {
    if (!open) return;
    fetch(`${API_URL}/my-doctors`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setMyDoctors(d.items ?? []))
      .catch(() => {});
    if (pid) {
      fetch(`${API_URL}/exams?_start=0&_end=50&patientId=${pid}&status=EXTRACTED`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setExams(d.map((e: any) => ({ id: e.id, title: e.title, performedAt: e.performedAt }))); })
        .catch(() => {});
    }
  }, [open, pid]);

  // Prefill: edição OU "Registrar consulta com Dr. X" vindo de Meus médicos/Encontrar
  useEffect(() => {
    if (!open) return;
    if (initial) {
      const fromDirectory = initial.doctorId ? myDoctors.find((d) => d.doctor.id === initial.doctorId) ?? null : null;
      setFromList(!!fromDirectory);
      setDoctor(fromDirectory);
      setDoctorName(fromDirectory ? '' : initial.doctorName);
      setSpecialty(initial.specialty ?? '');
      setScheduledAt(toLocalInput(initial.scheduledAt));
      setTimezone(initial.timezone || 'America/Sao_Paulo');
      setMode(initial.mode === 'teleconsulta' ? 'teleconsulta' : 'presencial');
      setPlaceName(initial.placeName ?? '');
      setAddress(initial.address ?? '');
      setLinkUrl(initial.linkUrl ?? '');
      setPaymentType(initial.paymentType === 'convenio' ? 'convenio' : 'particular');
      setOperator(initial.insuranceOperator ?? null);
      setPlan(initial.insurancePlan ?? '');
      setPrice(centsToBrl(initial.priceCents));
      setReason(initial.reason ?? '');
      setNotes(initial.privateNotes ?? '');
      setExamIds(initial.examIds ?? []);
      setRemind(initial.status === 'scheduled');
      setCalMonth(new Date(initial.scheduledAt));
      // Editar: abre Detalhes se algum campo "raro" já está preenchido
      setDetailsOpen(!!(initial.placeName || initial.address || initial.linkUrl || initial.priceCents != null
        || initial.reason || initial.privateNotes || (initial.examIds?.length ?? 0) > 0
        || (initial.timezone && initial.timezone !== 'America/Sao_Paulo')));
    } else {
      setFromList(true); setDoctor(null); setDoctorName(''); setSpecialty(''); setScheduledAt('');
      setTimezone('America/Sao_Paulo'); setMode('presencial'); setPlaceName(''); setAddress('');
      setLinkUrl(''); setPaymentType('particular'); setOperator(null); setPlan(''); setPrice('');
      setReason(''); setNotes(''); setExamIds([]); setRemind(true);
      setCalMonth(new Date()); setDetailsOpen(false);
      if (prefillDoctor?.doctorId) {
        const match = myDoctors.find((d) => d.doctor.id === prefillDoctor.doctorId);
        if (match) { setFromList(true); setDoctor(match); }
        else { setFromList(false); setDoctorName(prefillDoctor.doctorName ?? ''); setSpecialty(prefillDoctor.specialty ?? ''); }
      }
    }
    // myDoctors entra na dependência p/ resolver o match do prefill depois do fetch
  }, [open, initial, prefillDoctor, myDoctors.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFuture = useMemo(() => scheduledAt && new Date(scheduledAt).getTime() > Date.now(), [scheduledAt]);

  // Data/hora derivadas do scheduledAt ('YYYY-MM-DDTHH:mm')
  const dateObj = scheduledAt ? new Date(scheduledAt) : null;
  const timeStr = scheduledAt ? scheduledAt.slice(11, 16) : '';

  const setDatePart = (d: Date) => {
    hapticLight();
    setScheduledAt(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${timeStr || '09:00'}`);
    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const setTimePart = (t: string) => {
    hapticLight();
    if (!scheduledAt) {
      const today = new Date();
      setScheduledAt(`${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}T${t}`);
    } else {
      setScheduledAt(`${scheduledAt.slice(0, 10)}T${t}`);
    }
  };
  const shortcut = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDatePart(d);
  };

  const submit = async () => {
    if (!scheduledAt) { notify('Escolha a data e o horário da consulta.', { type: 'warning' }); return; }
    const name = fromList && doctor ? doctor.doctor.name : doctorName.trim();
    if (!name) { notify('Informe o médico da consulta.', { type: 'warning' }); return; }
    if (paymentType === 'convenio' && !operator?.trim()) { notify('Informe a operadora do convênio.', { type: 'warning' }); return; }
    if (mode === 'teleconsulta' && linkUrl.trim() && !/^https?:\/\//i.test(linkUrl.trim())) {
      notify('Link de teleconsulta deve começar com http:// ou https://', { type: 'warning' }); return;
    }
    setSaving(true);
    try {
      const body = {
        doctorId: fromList && doctor ? doctor.doctor.id : undefined,
        doctorName: fromList && doctor ? undefined : name,
        specialty: fromList && doctor ? undefined : (specialty || undefined),
        scheduledAt: new Date(scheduledAt).toISOString(),
        timezone, mode, placeName: placeName || undefined, address: address || undefined,
        linkUrl: mode === 'teleconsulta' && linkUrl ? linkUrl.trim() : undefined,
        paymentType,
        insuranceOperator: paymentType === 'convenio' ? operator : undefined,
        insurancePlan: paymentType === 'convenio' && plan ? plan : undefined,
        priceCents: price.trim() ? brlToCents(price) : undefined,
        reason: reason || undefined, privateNotes: notes || undefined,
        examIds, remind: remind && isFuture,
      };
      const r = await fetch(`${API_URL}/my-consultations${editing ? `/${initial!.id}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      notify(editing ? 'Consulta atualizada.' : 'Consulta registrada na sua agenda!', { type: 'success' });
      onSaved(); onClose();
    } catch (e: any) { notify(e.message || 'Falha ao salvar', { type: 'error' }); }
    finally { setSaving(false); }
  };

  const pill = (on: boolean) => ({
    minHeight: 38, px: 1.5, borderRadius: '999px', textTransform: 'none' as const, fontWeight: on ? 700 : 500, fontSize: 12.5,
    flex: 1,
    color: on ? '#fff' : 'text.secondary',
    background: on ? 'linear-gradient(135deg,#20b2aa,#178f89)' : 'transparent',
    border: '1px solid', borderColor: on ? 'transparent' : 'divider',
    boxShadow: on ? '0 4px 14px rgba(32,178,170,.3)' : 'none',
    transition: 'all 0.18s ease',
  });

  const sectionLabel = (text: string) => (
    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.75, color: 'text.secondary', letterSpacing: '0.05em' }}>
      {text}
    </Typography>
  );

  // Calendário do mês (estilo ReUI schedule-10): grade 7 colunas, dia selecionado em gradiente.
  const renderCalendar = () => {
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const startDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array.from({ length: startDow }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    const now = new Date();
    const isSel = (day: number) => !!dateObj && dateObj.getFullYear() === y && dateObj.getMonth() === m && dateObj.getDate() === day;
    const isToday = (day: number) => now.getFullYear() === y && now.getMonth() === m && now.getDate() === day;
    const monthLabel = calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return (
      <Box sx={{ flex: '1.25 1 0', minWidth: 0, borderRadius: '16px', bgcolor: 'background.paper', boxShadow: (t) => `0 1px 2px rgba(10,60,58,0.06), inset 0 0 0 1px ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(31,45,45,0.06)'}`, p: 1.25 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
          <IconButton size="small" aria-label="Mês anterior" onClick={() => setCalMonth(new Date(y, m - 1, 1))}>
            <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize' }}>{monthLabel}</Typography>
          <IconButton size="small" aria-label="Próximo mês" onClick={() => setCalMonth(new Date(y, m + 1, 1))}>
            <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', mb: 0.5 }}>
          {WEEKDAY_INITIALS.map((w, i) => (
            <Typography key={`${w}-${i}`} sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.disabled', textAlign: 'center' }}>{w}</Typography>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {cells.map((day, i) => day == null ? <Box key={`e${i}`} /> : (
            <Box
              key={day}
              component="button"
              type="button"
              aria-label={`Dia ${day}`}
              aria-pressed={isSel(day)}
              onClick={() => setDatePart(new Date(y, m, day))}
              sx={{
                height: 30, border: 0, borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: isSel(day) ? 700 : 500,
                color: isSel(day) ? '#fff' : 'text.primary',
                background: isSel(day) ? 'linear-gradient(135deg,#20b2aa,#178f89)' : 'transparent',
                boxShadow: isSel(day)
                  ? '0 6px 12px -4px rgba(23,143,137,.6)'
                  : isToday(day) ? 'inset 0 0 0 1px rgba(32,178,170,.5)' : 'none',
                '&:hover': { background: isSel(day) ? undefined : 'rgba(32,178,170,0.1)' },
              }}
            >
              {day}
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  const saveLabel = dateObj
    ? `Salvar · ${dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '')}${timeStr ? ` · ${timeStr}` : ''}`
    : 'Salvar';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper"
      sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }}
      PaperProps={{ sx: { borderRadius: { xs: '28px 28px 0 0', sm: '24px' }, m: { xs: 0, sm: 4 }, width: { xs: '100%', sm: undefined }, maxHeight: { xs: '94dvh', sm: '90vh' } } }}>
      {/* Alça + título do bottom-sheet (mock aprovado) */}
      <Box sx={{ pt: 1, px: 2.5 }}>
        <Box sx={{ width: 44, height: 5, borderRadius: '999px', bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(31,45,45,0.14)', mx: 'auto', mb: 1, display: { sm: 'none' } }} />
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700, fontFamily: '"Poppins",sans-serif', fontSize: 17 }}>
            {editing ? 'Editar consulta' : 'Registrar consulta'}
          </Typography>
          <IconButton size="small" aria-label="Fechar" onClick={onClose} sx={{ bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(31,45,45,0.05)' }}>
            <CloseRoundedIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Stack>
      </Box>
      <DialogContent sx={{ px: 2.5, pt: 1.5 }}>
        <Stack spacing={2}>
          {/* Médico */}
          <Box>
            {sectionLabel('MÉDICO')}
            <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
              <Button size="small" onClick={() => { hapticLight(); setFromList(true); }} sx={{ ...pill(fromList), flex: '0 0 auto', px: 2 }}>
                Dos meus médicos
              </Button>
              <Button size="small" onClick={() => { hapticLight(); setFromList(false); setDoctor(null); }} sx={{ ...pill(!fromList), flex: '0 0 auto', px: 2 }}>
                Outro médico
              </Button>
            </Stack>
            {fromList ? (
              <Autocomplete
                options={myDoctors} value={doctor} onChange={(_, v) => setDoctor(v)}
                getOptionLabel={(o) => o.doctor.name}
                renderOption={(props, o) => {
                  const { key, ...rest } = props as any;
                  return (
                    <Box component="li" key={key} {...rest}>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{o.doctor.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          CRM {o.doctor.crm}{o.doctor.specialty ? ` • ${o.doctor.specialty}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }}
                renderInput={(p) => <TextField {...p} label="Selecione o médico" size="small" required placeholder="Escolha um médico da sua lista" />}
                noOptionsText="Nenhum médico salvo — use “Outro médico” ou salve em Meus Médicos"
              />
            ) : (
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <TextField label="Nome do médico" required value={doctorName} onChange={(e) => setDoctorName(e.target.value)} size="small" sx={{ flex: '1 1 180px' }} placeholder="Ex.: Dr. Roberto Silva" />
                <TextField select label="Especialidade" value={specialty} onChange={(e) => setSpecialty(e.target.value)} size="small" sx={{ flex: '1 1 160px' }}>
                  <MenuItem value=""><em>Não especificada</em></MenuItem>
                  {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </TextField>
              </Stack>
            )}
          </Box>

          {/* Quando (ReUI schedule-10: atalhos + calendário + horários) */}
          <Box>
            {sectionLabel('QUANDO')}
            <Stack direction="row" spacing={0.75} sx={{ mb: 1.25 }}>
              {([['Hoje', 0], ['Amanhã', 1], ['Próx. semana', 7]] as const).map(([l, days]) => (
                <Button key={l} size="small" onClick={() => shortcut(days)} sx={{
                  flex: 1, minHeight: 34, borderRadius: '999px', textTransform: 'none', fontSize: 12, fontWeight: 600,
                  color: 'text.secondary', bgcolor: 'background.paper',
                  boxShadow: (t) => `inset 0 0 0 1px ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(31,45,45,0.1)'}`,
                  '&:hover': { bgcolor: 'rgba(32,178,170,0.08)', color: '#0b5c57' },
                }}>
                  {l}
                </Button>
              ))}
            </Stack>
            <Stack direction="row" spacing={1.25} alignItems="stretch">
              {renderCalendar()}
              <Box sx={{ flex: '1 1 0', minWidth: 86, borderRadius: '16px', bgcolor: 'background.paper', boxShadow: (t) => `0 1px 2px rgba(10,60,58,0.06), inset 0 0 0 1px ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(31,45,45,0.06)'}`, p: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'text.disabled', textAlign: 'center', mb: 0.5 }}>
                  {dateObj ? dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '').toUpperCase() : 'HORÁRIO'}
                </Typography>
                <Box sx={{ flex: 1, overflowY: 'auto', maxHeight: 216, display: 'flex', flexDirection: 'column', gap: 0.5, pr: 0.25 }}>
                  {SLOTS.map((t) => {
                    const on = timeStr === t;
                    return (
                      <Box key={t} component="button" type="button" aria-pressed={on} onClick={() => setTimePart(t)} sx={{
                        flexShrink: 0, height: 30, border: 0, borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: on ? 700 : 500,
                        color: on ? '#fff' : 'text.primary',
                        background: on ? 'linear-gradient(135deg,#20b2aa,#178f89)' : (tm: any) => tm.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(31,45,45,0.03)',
                        boxShadow: on ? '0 8px 14px -6px rgba(23,143,137,.6)' : 'none',
                        '&:hover': { background: on ? undefined : 'rgba(32,178,170,0.12)' },
                      }}>
                        {t}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Stack>
          </Box>

          {/* Como + Pagamento */}
          <Stack direction="row" spacing={1.25}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {sectionLabel('COMO')}
              <Stack direction="row" spacing={0.75}>
                <Button size="small" onClick={() => { hapticLight(); setMode('presencial'); }} sx={pill(mode === 'presencial')}>Presencial</Button>
                <Button size="small" onClick={() => { hapticLight(); setMode('teleconsulta'); }} sx={pill(mode === 'teleconsulta')}>Vídeo</Button>
              </Stack>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {sectionLabel('PAGAMENTO')}
              <Stack direction="row" spacing={0.75}>
                <Button size="small" onClick={() => { hapticLight(); setPaymentType('particular'); }} sx={pill(paymentType === 'particular')}>Particular</Button>
                <Button size="small" onClick={() => { hapticLight(); setPaymentType('convenio'); }} sx={pill(paymentType === 'convenio')}>Convênio</Button>
              </Stack>
            </Box>
          </Stack>

          {paymentType === 'convenio' && (
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Autocomplete
                freeSolo options={INSURANCE_OPERATOR_NAMES} value={operator}
                onChange={(_, v) => setOperator(typeof v === 'string' ? v : v ?? null)}
                onInputChange={(_, v) => { if (typeof v === 'string') setOperator(v); }}
                renderInput={(p) => <TextField {...p} label="Operadora / Convênio" required size="small" placeholder="Ex.: Unimed, Bradesco, Amil..." />}
                sx={{ flex: '1 1 180px' }}
              />
              <TextField label="Nome do plano (opcional)" placeholder="Ex.: Nacional, Especial" value={plan} onChange={(e) => setPlan(e.target.value)} size="small" sx={{ flex: '1 1 150px' }} />
            </Stack>
          )}

          {/* Detalhes (recolhido): local/link, valor, fuso, motivo, notas, exames, lembrete */}
          <Box>
            <Box
              component="button"
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((o) => !o)}
              sx={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                p: '11px 12px', border: 0, borderRadius: '14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)',
                boxShadow: (t) => `inset 0 0 0 1px ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(31,45,45,0.07)'}`,
              }}
            >
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>
                Detalhes: local, valor, exames, notas
              </Typography>
              <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.disabled', transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
            </Box>
            <Collapse in={detailsOpen} timeout={240}>
              <Stack spacing={1.75} sx={{ pt: 1.75 }}>
                {mode === 'presencial' ? (
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    <TextField label="Clínica / Consultório (opcional)" placeholder="Ex.: Centro Médico São Lucas" value={placeName} onChange={(e) => setPlaceName(e.target.value)} size="small" sx={{ flex: '1 1 180px' }} />
                    <TextField label="Endereço (opcional)" placeholder="Ex.: Av. Brasil, 500 - Sala 32" value={address} onChange={(e) => setAddress(e.target.value)} size="small" sx={{ flex: '2 1 220px' }} />
                  </Stack>
                ) : (
                  <TextField label="Link da videochamada (opcional)" placeholder="https://meet.google.com/… ou link do consultório" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} size="small" helperText="Você pode colar o link do WhatsApp, Meet ou Teams enviado pelo médico" />
                )}
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <TextField
                    label="Valor ou coparticipação (R$)" placeholder="Ex.: 150,00" value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, ''))} size="small"
                    sx={{ flex: '1 1 150px' }} inputProps={{ inputMode: 'decimal' }}
                  />
                  <TextField select label="Fuso horário" value={timezone} onChange={(e) => setTimezone(e.target.value)} size="small" sx={{ flex: '1 1 160px' }}>
                    {TIMEZONES_BR.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                </Stack>
                <TextField label="Motivo da consulta (opcional)" placeholder="Ex.: Retorno com exames de sangue, checkup anual..." value={reason} onChange={(e) => setReason(e.target.value)} size="small" />
                <TextField label="Anotações pessoais (perguntas para o médico)" placeholder="Ex.: Perguntar sobre a dosagem da vitamina D..." multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} size="small" />
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.75, color: 'text.secondary', letterSpacing: '0.05em' }}>
                    EXAMES PARA LEVAR
                  </Typography>
                  {exams.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">Nenhum exame cadastrado no Dr. Exame ainda.</Typography>
                  ) : (
                    <Box sx={{ maxHeight: 160, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 0.75, bgcolor: 'background.default' }}>
                      {exams.map((ex) => (
                        <FormControlLabel key={ex.id} sx={{ display: 'flex', m: 0, px: 0.5, borderRadius: '8px', '&:hover': { bgcolor: 'action.hover' } }}
                          control={<Checkbox size="small" sx={{ p: 0.5, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }} checked={examIds.includes(ex.id)}
                            onChange={() => setExamIds((p) => p.includes(ex.id) ? p.filter((x) => x !== ex.id) : [...p, ex.id])} />}
                          label={<Typography variant="caption" sx={{ wordBreak: 'break-word', fontWeight: examIds.includes(ex.id) ? 700 : 500 }}>{ex.title}{ex.performedAt ? ` — ${new Date(ex.performedAt).toLocaleDateString('pt-BR')}` : ''}</Typography>} />
                      ))}
                    </Box>
                  )}
                  {examIds.length > 0 && <Chip size="small" sx={{ mt: 0.75, fontWeight: 700, bgcolor: 'rgba(15,118,110,0.12)', color: '#0f766e' }} label={plural(examIds.length, 'exame separado', 'exames separados')} onDelete={() => setExamIds([])} />}
                </Box>
                <FormControlLabel
                  control={<Switch size="small" checked={remind && !!isFuture} disabled={!isFuture}
                    onChange={(e) => setRemind(e.target.checked)} sx={{ '& .Mui-checked': { color: '#0f766e' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#0f766e' } }} />}
                  label={<Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                    {isFuture ? 'Lembrete no celular antes da consulta' : 'Consulta no passado (histórico — sem lembrete)'}
                  </Typography>}
                />
              </Stack>
            </Collapse>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2, pt: 0.5, flexDirection: 'column', gap: 0.75, alignItems: 'stretch' }}>
        <Button variant="contained" onClick={submit} disabled={saving} startIcon={saving ? undefined : <CheckRoundedIcon />}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 14.5, minHeight: 50, background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: 'inset 1px 1px 0 rgba(255,255,255,.35), 0 16px 30px -12px rgba(23,143,137,.7)', '&:hover': { background: 'linear-gradient(135deg,#1ba39c,#137e79)' } }}>
          {saving ? <CircularProgress size={20} color="inherit" /> : saveLabel}
        </Button>
        <Typography sx={{ fontSize: 10.5, color: 'text.disabled', textAlign: 'center' }}>
          Registro pessoal — não reserva horário no consultório.
        </Typography>
      </DialogActions>
    </Dialog>
  );
};
