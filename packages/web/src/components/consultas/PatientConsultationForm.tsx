import { useEffect, useMemo, useState } from 'react';
import { plural } from '../../utils/format';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { hapticLight } from '../../utils/haptic';
import { INSURANCE_OPERATOR_NAMES, SPECIALTIES } from '../../utils/medicalData';
import { tealText } from '../../theme';
import type { MyDoctorItem, PatientConsultationItem } from '../../types/consultations';

// §2 "Minhas consultas" (28/10/26): registro PRIVADO do paciente. O banner de honestidade
// ("registrar não agenda no consultório") vive na lista — aqui o botão diz "Registrar",
// nunca "Agendar", pra não prometer o que não entregamos.

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

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const brlToCents = (v: string): number | null => {
  const s = v.trim().replace(/\./g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

const centsToBrl = (c?: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

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
    } else {
      setFromList(true); setDoctor(null); setDoctorName(''); setSpecialty(''); setScheduledAt('');
      setTimezone('America/Sao_Paulo'); setMode('presencial'); setPlaceName(''); setAddress('');
      setLinkUrl(''); setPaymentType('particular'); setOperator(null); setPlan(''); setPrice('');
      setReason(''); setNotes(''); setExamIds([]); setRemind(true);
      if (prefillDoctor?.doctorId) {
        const match = myDoctors.find((d) => d.doctor.id === prefillDoctor.doctorId);
        if (match) { setFromList(true); setDoctor(match); }
        else { setFromList(false); setDoctorName(prefillDoctor.doctorName ?? ''); setSpecialty(prefillDoctor.specialty ?? ''); }
      }
    }
    // myDoctors entra na dependência p/ resolver o match do prefill depois do fetch
  }, [open, initial, prefillDoctor, myDoctors.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFuture = useMemo(() => scheduledAt && new Date(scheduledAt).getTime() > Date.now(), [scheduledAt]);

  const submit = async () => {
    if (!scheduledAt) { notify('Informe data e hora da consulta.', { type: 'warning' }); return; }
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
      notify(editing ? 'Consulta atualizada.' : 'Consulta anotada na sua agenda!', { type: 'success' });
      onSaved(); onClose();
    } catch (e: any) { notify(e.message || 'Falha ao salvar', { type: 'error' }); }
    finally { setSaving(false); }
  };

  const pill = (on: boolean) => ({
    minHeight: 40, px: 2, borderRadius: '999px', textTransform: 'none' as const, fontWeight: 800, fontSize: 13,
    flex: 1,
    color: on ? '#fff' : 'text.secondary',
    background: on ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'transparent',
    border: '1px solid', borderColor: on ? 'transparent' : 'divider',
    boxShadow: on ? '0 4px 14px rgba(15,118,110,.25)' : 'none',
    transition: 'all 0.18s ease',
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="body"
      PaperProps={{ sx: { borderRadius: '20px', p: { xs: 0.5, sm: 1 } } }}>
      <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18, pb: 0.5 }}>
        {editing ? '✏️ Editar consulta anotada' : '📅 Anotar consulta médica'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info" sx={{ borderRadius: '14px', fontSize: 12.5, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.12)' : 'rgba(240,253,250,0.85)', color: (t) => t.palette.mode === 'dark' ? '#5eead4' : '#0f766e', border: '1px solid rgba(32,178,170,0.3)', '& .MuiAlert-icon': { color: '#0f766e' } }}>
            <strong>Diário pessoal de saúde:</strong> anote aqui as consultas que você já marcou no consultório ou convênio. Assim você separa os exames certos para levar no dia e recebe lembretes no celular.
          </Alert>

          {/* Médico: lista Meus médicos + livre */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.75, color: 'text.secondary' }}>
              Profissional que vai te atender:
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
              <Button size="small" onClick={() => { hapticLight(); setFromList(true); }} sx={{ ...pill(fromList), flex: '0 0 auto', px: 2 }}>
                👨‍⚕️ Dos meus médicos
              </Button>
              <Button size="small" onClick={() => { hapticLight(); setFromList(false); setDoctor(null); }} sx={{ ...pill(!fromList), flex: '0 0 auto', px: 2 }}>
                ✍️ Digitar outro médico
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
                noOptionsText="Nenhum médico salvo — use “Digitar outro médico” ou salve em Meus Médicos"
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

          {/* Data/hora + fuso */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.75, color: 'text.secondary' }}>
              Quando será a consulta?
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField
                label="Data e horário agendado" type="datetime-local" required value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)} size="small"
                sx={{ flex: '1 1 210px' }} slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField select label="Fuso horário" value={timezone} onChange={(e) => setTimezone(e.target.value)} size="small" sx={{ flex: '1 1 160px' }}>
                {TIMEZONES_BR.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
            </Stack>
          </Box>

          {/* Formato do atendimento */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.75, color: 'text.secondary' }}>
              Formato da consulta:
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
              <Button size="small" onClick={() => { hapticLight(); setMode('presencial'); }} sx={pill(mode === 'presencial')}>
                🏥 No consultório (Presencial)
              </Button>
              <Button size="small" onClick={() => { hapticLight(); setMode('teleconsulta'); }} sx={pill(mode === 'teleconsulta')}>
                💻 Por vídeo (Teleconsulta externa)
              </Button>
            </Stack>
            {mode === 'presencial' ? (
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <TextField label="Clínica / Consultório (opcional)" placeholder="Ex.: Centro Médico São Lucas" value={placeName} onChange={(e) => setPlaceName(e.target.value)} size="small" sx={{ flex: '1 1 180px' }} />
                <TextField label="Endereço (opcional)" placeholder="Ex.: Av. Brasil, 500 - Sala 32" value={address} onChange={(e) => setAddress(e.target.value)} size="small" sx={{ flex: '2 1 220px' }} />
              </Stack>
            ) : (
              <TextField label="Link da videochamada (opcional)" placeholder="https://meet.google.com/… ou link do consultório" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} size="small" helperText="Você pode colar o link do WhatsApp, Meet ou Teams enviado pelo médico" />
            )}
          </Box>

          {/* Pagamento */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.75, color: 'text.secondary' }}>
              Forma de atendimento:
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
              <Button size="small" onClick={() => { hapticLight(); setPaymentType('particular'); }} sx={pill(paymentType === 'particular')}>
                💳 Consulta Particular
              </Button>
              <Button size="small" onClick={() => { hapticLight(); setPaymentType('convenio'); }} sx={pill(paymentType === 'convenio')}>
                🛡️ Pelo Convênio / Plano
              </Button>
            </Stack>
            {paymentType === 'convenio' && (
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.25 }}>
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
            <TextField
              label="Valor pago ou coparticipação (R$, opcional)" placeholder="Ex.: 150,00" value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, ''))} size="small"
              sx={{ maxWidth: 240 }} inputProps={{ inputMode: 'decimal' }}
            />
          </Box>

          <Divider />

          {/* Motivo e notas */}
          <TextField label="Motivo da consulta (opcional)" placeholder="Ex.: Retorno com exames de sangue, checkup anual..." value={reason} onChange={(e) => setReason(e.target.value)} size="small" />
          <TextField label="Anotações pessoais (perguntas para fazer ao médico)" placeholder="Ex.: Perguntar sobre a dosagem da vitamina D, relatar dores de cabeça..." multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} size="small" />

          {/* Exames selecionados */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.75, color: (t) => tealText(t.palette.mode) }}>
              📋 Exames para ter em mãos nesta consulta:
            </Typography>
            {exams.length === 0 ? (
              <Typography variant="caption" color="text.secondary">Nenhum exame cadastrado no Dr. Exame ainda.</Typography>
            ) : (
              <Box sx={{ maxHeight: 160, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 0.75, bgcolor: 'background.default' }}>
                {exams.map((ex) => (
                  <FormControlLabel key={ex.id} sx={{ display: 'flex', m: 0, px: 0.5, borderRadius: '8px', '&:hover': { bgcolor: 'action.hover' } }}
                    control={<Checkbox size="small" sx={{ p: 0.5, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }} checked={examIds.includes(ex.id)}
                      onChange={() => setExamIds((p) => p.includes(ex.id) ? p.filter((x) => x !== ex.id) : [...p, ex.id])} />}
                    label={<Typography variant="caption" sx={{ wordBreak: 'break-word', fontWeight: examIds.includes(ex.id) ? 700 : 500 }}>📄 {ex.title}{ex.performedAt ? ` — ${new Date(ex.performedAt).toLocaleDateString('pt-BR')}` : ''}</Typography>} />
                ))}
              </Box>
            )}
            {examIds.length > 0 && <Chip size="small" sx={{ mt: 0.75, fontWeight: 700, bgcolor: 'rgba(15,118,110,0.12)', color: '#0f766e' }} label={plural(examIds.length, 'exame separado', 'exames separados')} onDelete={() => setExamIds([])} />}
          </Box>

          {/* Lembrete */}
          <FormControlLabel
            control={<Switch size="small" checked={remind && !!isFuture} disabled={!isFuture}
              onChange={(e) => setRemind(e.target.checked)} sx={{ '& .Mui-checked': { color: '#0f766e' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#0f766e' } }} />}
            label={<Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              {isFuture ? '🔔 Ativar lembrete no celular antes da consulta' : 'Consulta no passado (histórico — sem lembrete)'}
            </Typography>}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={saving}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3.5, py: 1, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
          {saving ? <CircularProgress size={20} color="inherit" /> : editing ? 'Salvar alterações' : 'Salvar na minha agenda'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
