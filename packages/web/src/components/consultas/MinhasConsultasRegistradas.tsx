import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Chip, IconButton, Menu, MenuItem as MuiMenuItem, Stack, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { confirmDialog } from '../ConfirmDialog';
import { ListSkeleton } from '../Skeleton';
import { hapticLight } from '../../utils/haptic';
import { PatientConsultationForm } from './PatientConsultationForm';
import { CONSULTATION_STATUS_META, type PatientConsultationItem } from '../../types/consultations';

// §2 "Minhas consultas" — lista de consultas REGISTRADAS pelo paciente (presencial ou
// teleconsulta externa). A teleconsulta do Dr. Exame (sala virtual/pagamento) continua
// na aba "Teleconsultas"; aqui é o diário particular do paciente.
// Banner de honestidade: registrar ≠ agendar no consultório (nunca prometemos reserva).

interface Props {
  prefillDoctor?: { doctorId?: string; doctorName?: string; specialty?: string } | null;
}

const fmtDate = (iso: string, tz: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...(tz && tz !== 'America/Sao_Paulo' ? { timeZone: tz } : {}),
  });

export const MinhasConsultasRegistradas = ({ prefillDoctor }: Props) => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<PatientConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatientConsultationItem | null>(null);
  const [menuEl, setMenuEl] = useState<{ item: PatientConsultationItem; el: HTMLElement } | null>(null);
  const [examTitles, setExamTitles] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/my-consultations`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { const d = await r.json(); setItems(d.items ?? []); }
    } catch { /* offline: mantém o que tem */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Títulos dos exames (card mostra nome, não id)
  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/exams?_start=0&_end=100&patientId=${pid}&status=EXTRACTED`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setExamTitles(Object.fromEntries(d.map((e: any) => [e.id, e.title]))); })
      .catch(() => {});
  }, [pid, items.length]);

  // "Registrar consulta com Dr. X" vindo de Meus médicos / Encontrar especialistas
  const [pendingPrefill] = useState(prefillDoctor ?? null);
  useEffect(() => {
    if (!loading && pendingPrefill?.doctorName) { setEditing(null); setFormOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const now = Date.now();
  const proximas = useMemo(() => items
    .filter((i) => i.status === 'scheduled' && new Date(i.scheduledAt).getTime() >= now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const historico = useMemo(() => items
    .filter((i) => !(i.status === 'scheduled' && new Date(i.scheduledAt).getTime() >= now))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)), [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (item: PatientConsultationItem, status: string) => {
    setMenuEl(null);
    await fetch(`${API_URL}/my-consultations/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ status }),
    });
    void load();
  };
  const remove = async (item: PatientConsultationItem) => {
    setMenuEl(null);
    if (!(await confirmDialog({ title: 'Excluir consulta', message: 'Apaga o registro e o lembrete associado. Não afeta nada no consultório.', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/my-consultations/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    void load();
  };

  const ConsultaCard = ({ item }: { item: PatientConsultationItem }) => {
    const meta = CONSULTATION_STATUS_META[item.status] ?? { label: item.status, color: 'text.secondary', bg: 'action.hover' };
    return (
      <Card variant="outlined" sx={{
        borderRadius: '16px', position: 'relative', overflow: 'hidden',
        borderColor: 'divider', bgcolor: 'background.paper',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}>
        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: item.status === 'scheduled' ? '#20b2aa' : item.status === 'completed' ? '#10b981' : '#cbd5e1' }} />
        <CardContent sx={{ pl: 2.5, py: 1.75, '&:last-child': { pb: 1.75 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={1.5}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                  {item.doctorName}
                </Typography>
                <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: meta.bg, color: meta.color }} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5, rowGap: 0.5 }}>
                {item.specialty && <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>🩺 {item.specialty}</Typography>}
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  📅 {fmtDate(item.scheduledAt, item.timezone)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                {item.mode === 'teleconsulta' ? (
                  <Chip size="small" label="🎥 Teleconsulta" sx={chipSx} />
                ) : item.placeName ? (
                  <Chip size="small" label={`🏥 ${item.placeName}`} sx={chipSx} />
                ) : null}
                <Chip size="small" label={item.paymentType === 'convenio' ? `🏥 ${item.insuranceOperator}${item.insurancePlan ? ` • ${item.insurancePlan}` : ''}` : '💳 Particular'} sx={chipSx} />
                {item.priceCents != null && item.priceCents > 0 && (
                  <Chip size="small" label={`R$ ${(item.priceCents / 100).toFixed(2).replace('.', ',')}`} sx={chipSx} />
                )}
                {item.linkUrl && (
                  <Chip size="small" component="a" href={item.linkUrl} target="_blank" rel="noopener" clickable label="Abrir link ↗" sx={chipSx} />
                )}
              </Stack>
              {item.examIds.length > 0 && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                  📄 {item.examIds.map((id) => examTitles[id] ?? 'Exame').slice(0, 3).join(' · ')}{item.examIds.length > 3 ? ` +${item.examIds.length - 3}` : ''}
                </Typography>
              )}
              {item.reason && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary', fontStyle: 'italic' }}>
                  {item.reason}
                </Typography>
              )}
            </Box>
            <IconButton size="small" aria-label={`Opções da consulta com ${item.doctorName}`}
              onClick={(e) => setMenuEl({ item, el: e.currentTarget })} sx={{ flexShrink: 0 }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <Stack spacing={2}>
      {/* Banner honesto (§2): registro ≠ agendamento */}
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{
        p: 1.25, borderRadius: '12px',
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(212,165,116,0.10)' : 'rgba(212,165,116,0.10)',
        border: '1px solid rgba(212,165,116,0.35)',
      }}>
        <InfoOutlinedIcon sx={{ fontSize: 18, color: '#b88a54', mt: 0.25 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
          Aqui você <strong>registra</strong> consultas do seu jeito — isso <strong>não agenda</strong> no consultório.
          Marque com o médico por telefone/WhatsApp e depois registre aqui para levar os exames certos.
        </Typography>
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
          Minhas consultas {items.length > 0 && <Chip size="small" label={items.length} sx={{ height: 20, fontWeight: 800, bgcolor: 'rgba(15,95,90,0.12)', color: '#0f5f5a' }} />}
        </Typography>
        <Button
          variant="contained" startIcon={<AddRoundedIcon />} size="small"
          onClick={() => { hapticLight(); setEditing(null); setFormOpen(true); }}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 2.5, minHeight: 40 }}
        >
          Registrar
        </Button>
      </Stack>

      {loading && <ListSkeleton count={3} />}

      {!loading && items.length === 0 && (
        <Card variant="outlined" sx={{ borderRadius: '20px', borderStyle: 'dashed', textAlign: 'center', py: 4 }}>
          <CardContent>
            <Box sx={{ fontSize: 44, mb: 1 }}>🗓️</Box>
            <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhuma consulta registrada</Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 340, mx: 'auto', fontSize: 13.5 }}>
              Registre consultas passadas (histórico) ou futuras (com lembrete). Dica: salve médicos em <strong>Meus médicos</strong> pra agilizar.
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap">
              <Button variant="contained" onClick={() => { setEditing(null); setFormOpen(true); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}>Registrar consulta</Button>
              <Button variant="outlined" onClick={() => navigate('/medicos')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3, borderColor: '#20b2aa', color: '#0f766e' }}>Meus médicos</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {!loading && proximas.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: 13, color: 'text.primary', mb: 1, fontFamily: '"Poppins",sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Próximas ({proximas.length})
          </Typography>
          <Stack spacing={1.5}>{proximas.map((c) => <ConsultaCard key={c.id} item={c} />)}</Stack>
        </Box>
      )}

      {!loading && historico.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: 13, color: 'text.secondary', mb: 1, fontFamily: '"Poppins",sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Histórico ({historico.length})
          </Typography>
          <Stack spacing={1.25}>{historico.map((c) => <ConsultaCard key={c.id} item={c} />)}</Stack>
        </Box>
      )}

      <Menu anchorEl={menuEl?.el ?? null} open={!!menuEl} onClose={() => setMenuEl(null)}
        slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 210 } } }}>
        <MuiMenuItem onClick={() => { const it = menuEl!.item; setMenuEl(null); setEditing(it); setFormOpen(true); }}>
          <EditOutlinedIcon sx={{ fontSize: 18, mr: 1 }} /> Editar
        </MuiMenuItem>
        {menuEl && menuEl.item.status !== 'completed' && (
          <MuiMenuItem onClick={() => void setStatus(menuEl!.item, 'completed')}>✅ Marcar como realizada</MuiMenuItem>
        )}
        {menuEl && menuEl.item.status === 'scheduled' && (
          <>
            <MuiMenuItem onClick={() => void setStatus(menuEl!.item, 'cancelled')}>🚫 Cancelada</MuiMenuItem>
            <MuiMenuItem onClick={() => void setStatus(menuEl!.item, 'no_show')}>👻 Não compareci</MuiMenuItem>
          </>
        )}
        <MuiMenuItem onClick={() => void remove(menuEl!.item)} sx={{ color: 'error.main' }}>🗑️ Excluir</MuiMenuItem>
      </Menu>

      <PatientConsultationForm
        open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => void load()}
        initial={editing} prefillDoctor={pendingPrefill}
      />
    </Stack>
  );
};

const chipSx = {
  height: 22, fontSize: 11, fontWeight: 700, maxWidth: '100%',
  bgcolor: 'rgba(0,0,0,0.04)', color: 'text.secondary',
  '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
} as const;
