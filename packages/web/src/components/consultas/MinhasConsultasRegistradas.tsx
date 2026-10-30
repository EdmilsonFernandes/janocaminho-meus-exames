import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar, Box, Button, Card, CardContent, Chip, IconButton, ListItemIcon, Menu, MenuItem as MuiMenuItem, Stack, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { plural } from '../../utils/format';
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

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/my-consultations`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { const d = await r.json(); setItems(d.items ?? []); }
    } catch { /* offline: mantém o que tem */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Card no padrão do mock aprovado: sem emoji (ícones de traço), tile de data NOV/12,
  // selo verde no avatar quando o médico é da lista (doctorId), histórico compacto.
  const ConsultaCard = ({ item }: { item: PatientConsultationItem }) => {
    const meta = CONSULTATION_STATUS_META[item.status] ?? { label: item.status, color: 'text.secondary', bg: 'action.hover' };
    const d = new Date(item.scheduledAt);
    const tzOpt = item.timezone && item.timezone !== 'America/Sao_Paulo' ? { timeZone: item.timezone } : {};
    const monthAbbr = d.toLocaleDateString('pt-BR', { month: 'short', ...tzOpt }).replace('.', '').toUpperCase();
    const dayNum = d.toLocaleDateString('pt-BR', { day: '2-digit', ...tzOpt });
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long', ...tzOpt });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...tzOpt });
    const isVideo = item.mode === 'teleconsulta';
    const where = isVideo ? 'Por vídeo (externa)' : (item.placeName || 'Presencial');
    const pay = item.paymentType === 'convenio'
      ? `${item.insuranceOperator ?? 'Convênio'}${item.insurancePlan ? ` · ${item.insurancePlan}` : ''}`
      : 'particular';
    const upcoming = item.status === 'scheduled' && d.getTime() >= Date.now();
    return (
      <Card variant="outlined" sx={{
        borderRadius: '20px',
        borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,90,86,0.08)',
        bgcolor: (t) => upcoming
          ? t.palette.background.paper
          : t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.75)',
        boxShadow: upcoming
          ? '0 1px 2px rgba(10,60,58,0.06), 0 12px 28px -18px rgba(10,60,58,0.35)'
          : '0 1px 2px rgba(10,60,58,0.05)',
        transition: 'all 0.15s ease',
        '&:hover': { borderColor: 'rgba(13,148,136,0.35)', boxShadow: '0 6px 18px rgba(13,148,136,0.10)' },
      }}>
        <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 }, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Avatar sx={{ width: 44, height: 44, fontSize: 16, fontWeight: 700, bgcolor: 'rgba(32,178,170,0.14)', color: '#0b5c57', border: '2px solid rgba(32,178,170,0.3)' }}>
                {item.doctorName.charAt(0)?.toUpperCase()}
              </Avatar>
              {item.doctorId && (
                <Box title="Médico da sua lista" sx={{ position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: '50%', bgcolor: '#10b981', border: '2px solid', borderColor: 'background.paper', display: 'grid', placeItems: 'center' }}>
                  <CheckRoundedIcon sx={{ fontSize: 10, color: '#fff' }} />
                </Box>
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 600, fontSize: 15, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                {item.doctorName}
              </Typography>
              {item.specialty && (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                  <MedicalServicesOutlinedIcon sx={{ fontSize: 12, color: '#0e6f69' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{item.specialty}</Typography>
                </Stack>
              )}
            </Box>
            <Chip size="small" label={meta.label} sx={{ height: 24, fontSize: 11.5, fontWeight: 600, bgcolor: meta.bg, color: meta.color, borderRadius: '999px', flexShrink: 0 }} />
            <IconButton size="small" aria-label={`Opções da consulta com ${item.doctorName}`}
              onClick={(e) => setMenuEl({ item, el: e.currentTarget })} sx={{ flexShrink: 0, ml: '-4px !important' }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Stack>

          {upcoming ? (
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ p: '10px 12px', borderRadius: '14px', bgcolor: 'rgba(32,178,170,0.08)', boxShadow: 'inset 0 0 0 1px rgba(32,178,170,0.16)' }}>
              <Box sx={{ width: 42, flexShrink: 0, textAlign: 'center', borderRadius: '10px', bgcolor: 'background.paper', boxShadow: 'inset 0 0 0 1px rgba(32,178,170,0.2)', py: 0.5 }}>
                <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#b4542c', lineHeight: 1.2 }}>{monthAbbr}</Typography>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{dayNum}</Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: (t) => t.palette.mode === 'dark' ? '#8ff0e8' : '#0b5c57' }}>
                  {weekday} · {time}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                  {isVideo
                    ? <VideocamOutlinedIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                    : <PlaceOutlinedIcon sx={{ fontSize: 12, color: 'text.secondary' }} />}
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{where} · {pay}</Typography>
                </Stack>
              </Box>
              {item.priceCents != null && item.priceCents > 0 && (
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', flexShrink: 0 }}>
                  R$ {(item.priceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {dayNum} {monthAbbr.toLowerCase()} · {time} · {where} · {pay}
            </Typography>
          )}

          {(item.examIds.length > 0 || item.linkUrl || item.reason) && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 0.5 }}>
              {item.examIds.length > 0 && (
                <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
                  <DescriptionOutlinedIcon sx={{ fontSize: 13, color: '#0e6f69', flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                    {plural(item.examIds.length, 'exame separado', 'exames separados')} pra levar
                  </Typography>
                </Stack>
              )}
              {item.linkUrl && (
                <Chip size="small" component="a" href={item.linkUrl} target="_blank" rel="noopener" clickable
                  icon={<OpenInNewRoundedIcon sx={{ fontSize: '13px !important' }} />} label="Abrir chamada"
                  sx={{ height: 24, fontSize: 11.5, fontWeight: 600, color: '#0b5c57', bgcolor: 'rgba(32,178,170,0.1)', borderRadius: '999px' }} />
              )}
              {item.reason && (
                <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', minWidth: 0 }} noWrap>
                  {item.reason}
                </Typography>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Stack spacing={2}>
      {/* Aviso de honestidade em 1 linha (mock aprovado) — o banner gordo saiu */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5 }}>
        <InfoOutlinedIcon sx={{ fontSize: 15, color: '#178f89', flexShrink: 0 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11.5, lineHeight: 1.4 }}>
          Registro pessoal — não agenda no consultório. Organize exames e receba lembretes.
        </Typography>
      </Stack>

      {loading && <ListSkeleton count={3} />}

      {!loading && items.length === 0 && (
        <Card variant="outlined" sx={{ borderRadius: '20px', borderStyle: 'dashed', textAlign: 'center', py: 4, px: 2 }}>
          <CardContent>
            <EventAvailableOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhuma consulta registrada</Typography>
            <Typography color="text.secondary" sx={{ mb: 2.5, maxWidth: 360, mx: 'auto', fontSize: 13.5 }}>
              Já tem uma consulta marcada com seu médico? Registre aqui para saber quais exames levar no dia e receber lembretes.
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              <Button startIcon={<AddRoundedIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}
                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3, minHeight: 44, color: '#fff', background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: 'inset 1px 1px 0 rgba(255,255,255,.35), 0 10px 20px -10px rgba(23,143,137,.7)', '&:hover': { background: 'linear-gradient(135deg,#1ba39c,#137e79)' } }}>
                Registrar consulta
              </Button>
              <Button variant="outlined" onClick={() => navigate('/medicos')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3, minHeight: 44, borderColor: 'rgba(32,178,170,0.45)', color: '#0b5c57' }}>
                Ver meus médicos
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {!loading && proximas.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 13, color: 'text.primary', fontFamily: '"Poppins",sans-serif', letterSpacing: '0.04em' }}>
              PRÓXIMAS · {proximas.length}
            </Typography>
            <Chip size="small" label={plural(items.length, 'registrada', 'registradas')} sx={{ height: 22, fontSize: 11.5, fontWeight: 600, bgcolor: 'rgba(32,178,170,0.14)', color: (t) => t.palette.mode === 'dark' ? '#7fe0d9' : '#0b5c57', borderRadius: '999px' }} />
          </Stack>
          <Stack spacing={1.5}>{proximas.map((c) => <ConsultaCard key={c.id} item={c} />)}</Stack>
        </Box>
      )}

      {!loading && historico.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 13, color: 'text.secondary', mb: 1, fontFamily: '"Poppins",sans-serif', letterSpacing: '0.04em' }}>
            HISTÓRICO · {historico.length}
          </Typography>
          <Stack spacing={1.25}>{historico.map((c) => <ConsultaCard key={c.id} item={c} />)}</Stack>
        </Box>
      )}

      {/* CTA único no rodapé da lista (mock aprovado): "Registrar", nunca "Agendar/Anotar" */}
      {!loading && items.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
          <Button
            startIcon={<AddRoundedIcon />}
            onClick={() => { hapticLight(); setEditing(null); setFormOpen(true); }}
            sx={{ height: 52, px: 3.5, borderRadius: '999px', textTransform: 'none', fontSize: 14.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: 'inset 1px 1px 0 rgba(255,255,255,.35), 0 16px 30px -12px rgba(23,143,137,.7)', '&:hover': { background: 'linear-gradient(135deg,#1ba39c,#137e79)' } }}
          >
            Registrar consulta
          </Button>
        </Box>
      )}

      <Menu anchorEl={menuEl?.el ?? null} open={!!menuEl} onClose={() => setMenuEl(null)}
        slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 210 } } }}>
        <MuiMenuItem onClick={() => { const it = menuEl!.item; setMenuEl(null); setEditing(it); setFormOpen(true); }}>
          <ListItemIcon><EditOutlinedIcon sx={{ fontSize: 18 }} /></ListItemIcon> Editar
        </MuiMenuItem>
        {menuEl && menuEl.item.status !== 'completed' && (
          <MuiMenuItem onClick={() => void setStatus(menuEl!.item, 'completed')}>
            <ListItemIcon><CheckCircleOutlineRoundedIcon sx={{ fontSize: 18, color: '#0f766e' }} /></ListItemIcon> Marcar como realizada
          </MuiMenuItem>
        )}
        {menuEl && menuEl.item.status === 'scheduled' && (
          <>
            <MuiMenuItem onClick={() => void setStatus(menuEl!.item, 'cancelled')}>
              <ListItemIcon><BlockRoundedIcon sx={{ fontSize: 18 }} /></ListItemIcon> Cancelada
            </MuiMenuItem>
            <MuiMenuItem onClick={() => void setStatus(menuEl!.item, 'no_show')}>
              <ListItemIcon><PersonOffOutlinedIcon sx={{ fontSize: 18 }} /></ListItemIcon> Não compareci
            </MuiMenuItem>
          </>
        )}
        <MuiMenuItem onClick={() => void remove(menuEl!.item)} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteOutlineRoundedIcon sx={{ fontSize: 18, color: 'inherit' }} /></ListItemIcon> Excluir
        </MuiMenuItem>
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
