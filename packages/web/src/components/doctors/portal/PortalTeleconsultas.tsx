import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  CardContent,
  Typography,
  Button,
  Stack,
  Chip,
  Avatar,
  IconButton,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  useTheme,
  useMediaQuery,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import SearchIcon from '@mui/icons-material/Search';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SummarizeIcon from '@mui/icons-material/Summarize';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import HistoryIcon from '@mui/icons-material/History';
import StarIcon from '@mui/icons-material/Star';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { AppCard } from '../../AppCard';
import { tealText, COPPER, copperText } from '../../../theme';
import { snackbar } from '../../ConfirmDialog';
import { photoUrlFor, APP_WEB_URL } from '../../../config';
import { copyText } from '../../../utils/copyText';
import type { TeleconsultaSummary } from '../../teleconsulta/types';

interface PortalTeleconsultasProps {
  teleconsultas: any[];
  patients: any[];
  onOpenPatient: (p: any, tab?: string) => void;
  onEnterTele: (tc: any, patientName?: string) => void;
  onCancelTele: (reminderId: string, patientId?: string) => void;
  onOpenPost: (teleId: string) => void;
  onNewTele: (patientId?: string) => void;
  teleSummaries?: Record<string, TeleconsultaSummary>;
  initialSearch?: string;
}

// Lifecycle 24/10 (spec §1): teleStatus do server. Concluída (completed/no_show/
// cancelled/technical) = NUNCA mais "Entrar" (o server bloqueia o join de todo
// modo). Drift-safe: linha legada sem a coluna → undefined → só endedAt decide.
const TELE_CONCLUDED = new Set(['completed', 'no_show', 'cancelled', 'technical']);
const isTeleConcluded = (tc: any) => !!tc.endedAt || TELE_CONCLUDED.has(tc.teleStatus);
/** Chip de estado do lifecycle — null = agendada (sem chip, sem ruído).
 *  Dono 26/10: 'cancelled' (cancelamento manual vira histórico, não apaga) e no_show
 *  diferenciado por QUEM faltou ("Paciente ausente" quando faltou o MÉDICO era mentira). */
const teleStatusChip = (status: unknown, noShowBy?: unknown): { label: string; sx: any } | null => {
  if (status === 'in_progress') return { label: 'Em andamento', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.14)', color: '#0d9488', borderRadius: '6px' } };
  if (status === 'completed') return { label: 'Realizada', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(16,185,129,0.15)', color: '#059669', borderRadius: '6px' } };
  if (status === 'cancelled') return { label: 'Cancelada', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(100,116,139,0.15)', color: '#64748b', borderRadius: '6px' } };
  if (status === 'no_show') {
    // noShowBy explícito diz QUEM faltou; legado sem o campo → neutro (não acusa
    // o paciente de ausência que talvez seja do médico — coerência dono 26/10).
    if (noShowBy === 'doctor') return { label: 'Médico ausente', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(239,68,68,0.12)', color: '#b91c1c', borderRadius: '6px' } };
    if (noShowBy === 'patient') return { label: 'Paciente ausente', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.14)', color: '#b45309', borderRadius: '6px' } };
    return { label: 'Não realizada', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.14)', color: '#b45309', borderRadius: '6px' } };
  }
  if (status === 'technical') return { label: 'Problema técnico', sx: { height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(100,116,139,0.15)', color: '#64748b', borderRadius: '6px' } };
  return null;
};

export const PortalTeleconsultas = ({
  teleconsultas = [],
  patients = [],
  onOpenPatient,
  onEnterTele,
  onCancelTele,
  onOpenPost,
  onNewTele,
  teleSummaries = {},
  initialSearch = '',
}: PortalTeleconsultasProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');
  const [search, setSearch] = useState(initialSearch);
  // FIX 2 (1 ação primária por card): copiar/cancelar saem da linha de ação → menu ⋮.
  const [teleMenu, setTeleMenu] = useState<{ id: string; el: HTMLElement } | null>(null);

  useEffect(() => {
    if (initialSearch !== undefined) setSearch(initialSearch);
  }, [initialSearch]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000;

  // Separação por categorias
  // F4: teleconsulta ENCERRADA (endedAt) sai de hoje/próximas — vive só no Histórico
  // (nunca mais "Entrar na consulta"; o join do server bloquearia de todo modo).
  const todayList = useMemo(() => {
    return teleconsultas.filter((tc) => {
      const t = new Date(tc.dueDate).getTime();
      return !isTeleConcluded(tc) && t >= todayStart && t < todayEnd;
    });
  }, [teleconsultas, todayStart, todayEnd]);

  const upcomingList = useMemo(() => {
    return teleconsultas.filter((tc) => {
      const t = new Date(tc.dueDate).getTime();
      return !isTeleConcluded(tc) && t >= now.getTime();
    });
  }, [teleconsultas, now]);

  const pastList = useMemo(() => {
    return teleconsultas
      .filter((tc) => {
        if (isTeleConcluded(tc)) return true; // encerrada/concluída → Histórico, mesmo agendada p/ hoje
        const t = new Date(tc.dueDate).getTime();
        return t < now.getTime() && !(t >= todayStart && t < todayEnd);
      })
      // Dono 26/10: histórico do MAIS RECENTE pro mais antigo (vinha asc — o caso
      // de hoje ficava no fim, abaixo de consultas de 4 dias atrás).
      .sort((a, b) => {
        const ta = new Date(a.endedAt ?? a.dueDate).getTime();
        const tb = new Date(b.endedAt ?? b.dueDate).getTime();
        return tb - ta;
      });
  }, [teleconsultas, now, todayStart, todayEnd]);

  // Lista filtrada atual
  const filtered = useMemo(() => {
    let base = teleconsultas;
    if (filter === 'today') base = todayList;
    else if (filter === 'upcoming') base = upcomingList;
    else if (filter === 'past') base = pastList;

    if (!search.trim()) return base;
    const q = search.toLowerCase().trim();
    return base.filter((tc) => {
      const pName = tc.patient?.fullName || '';
      const title = tc.title || '';
      const code = String(tc.id || '').toLowerCase();
      return pName.toLowerCase().includes(q) || title.toLowerCase().includes(q) || code.includes(q);
    });
  }, [teleconsultas, filter, search, todayList, upcomingList, pastList]);

  // F4: split ativas × encerradas — as encerradas renderizam na seção "Histórico"
  // do fim (nunca misturadas com as agendadas, nem com botão de entrar).
  const filteredActive = useMemo(() => filtered.filter((tc) => !isTeleConcluded(tc)), [filtered]);
  const filteredEnded = useMemo(() => filtered.filter((tc) => isTeleConcluded(tc)), [filtered]);

  return (
    <Box sx={{ maxWidth: 1040, mx: 'auto', width: '100%', pb: 4 }}>
      {/* HEADER DA SEÇÃO */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                bgcolor: 'rgba(15,118,110,0.12)',
                display: 'grid',
                placeItems: 'center',
                color: '#178f89',
              }}
            >
              <VideocamIcon />
            </Box>
            <Typography
              component="h1"
              sx={{
                fontWeight: 800,
                fontFamily: 'Poppins, sans-serif',
                fontSize: { xs: 20, sm: 24 },
                color: 'text.primary',
                letterSpacing: '-0.01em',
              }}
            >
              Agenda de Teleconsultas
            </Typography>
          </Stack>
          <Typography sx={{ color: 'text.secondary', fontSize: 13.5 }}>
            Gerencie seus atendimentos online, inicie chamadas com um clique e acesse o resumo da consulta.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => onNewTele()}
          sx={{
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: 13.5,
            px: 2.5,
            py: 0.9,
            background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
            boxShadow: '0 2px 8px rgba(15,118,110,0.25)',
            '&:hover': { background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' },
            alignSelf: { xs: 'stretch', sm: 'auto' },
          }}
        >
          Agendar Teleconsulta
        </Button>
      </Stack>

      {/* 3 MINI CARDS DE STATUS EQUILIBRADOS */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: { xs: 1, sm: 1.5 },
          mb: 3,
        }}
      >
        <AppCard
          kind="interactive"
          onClick={() => setFilter('today')}
          sx={{
            borderRadius: '14px',
            border: '1px solid',
            borderColor: filter === 'today' ? '#0d9488' : 'divider',
            bgcolor: filter === 'today' ? 'rgba(13,148,136,0.06)' : 'background.paper',
            p: { xs: 1.25, sm: 1.75 },
          }}
        >
          <Typography sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 700, color: 'text.secondary', mb: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Consultas Hoje
          </Typography>
          <Stack direction="row" alignItems="baseline" spacing={0.75}>
            <Typography sx={{ fontSize: { xs: 20, sm: 26 }, fontWeight: 800, color: todayList.length > 0 ? '#0d9488' : 'text.primary', lineHeight: 1 }}>
              {todayList.length}
            </Typography>
            {todayList.length > 0 && (
              <Chip size="small" label="Hoje" sx={{ height: 18, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.12)', color: '#0d9488', borderRadius: '4px' }} />
            )}
          </Stack>
        </AppCard>

        <AppCard
          kind="interactive"
          onClick={() => setFilter('upcoming')}
          sx={{
            borderRadius: '14px',
            border: '1px solid',
            borderColor: filter === 'upcoming' ? 'secondary.dark' : 'divider',
            bgcolor: filter === 'upcoming' ? 'rgba(212,165,116,0.06)' : 'background.paper',
            p: { xs: 1.25, sm: 1.75 },
          }}
        >
          <Typography sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 700, color: 'text.secondary', mb: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Próximas
          </Typography>
          <Typography sx={{ fontSize: { xs: 20, sm: 26 }, fontWeight: 800, color: 'text.primary', lineHeight: 1 }}>
            {upcomingList.length}
          </Typography>
        </AppCard>

        <AppCard
          kind="interactive"
          onClick={() => setFilter('all')}
          sx={{
            borderRadius: '14px',
            border: '1px solid',
            borderColor: filter === 'all' ? 'primary.main' : 'divider',
            bgcolor: filter === 'all' ? 'rgba(32,178,170,0.06)' : 'background.paper',
            p: { xs: 1.25, sm: 1.75 },
          }}
        >
          <Typography sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 700, color: 'text.secondary', mb: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Total Geral
          </Typography>
          <Typography sx={{ fontSize: { xs: 20, sm: 26 }, fontWeight: 800, color: 'text.primary', lineHeight: 1 }}>
            {teleconsultas.length}
          </Typography>
        </AppCard>
      </Box>

      {/* FILTROS E BUSCA */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2.5 }}
      >
        <Tabs
          value={filter}
          onChange={(_, v) => setFilter(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 38,
            '& .MuiTabs-indicator': { height: 3, borderRadius: '3px', bgcolor: '#178f89' },
            '& .MuiTab-root': {
              minHeight: 38,
              py: 0.75,
              px: 1.75,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13,
              color: 'text.secondary',
              '&.Mui-selected': { color: '#178f89' },
            },
          }}
        >
          <Tab value="all" label={`Todas (${teleconsultas.length})`} />
          <Tab value="today" label={`Hoje (${todayList.length})`} />
          <Tab value="upcoming" label={`Próximas (${upcomingList.length})`} />
          <Tab value="past" label={`Histórico (${pastList.length})`} />
        </Tabs>

        <TextField
          size="small"
          placeholder="Buscar paciente ou sala…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              sx: { borderRadius: '999px', bgcolor: 'background.paper', fontSize: 13 },
            },
          }}
          sx={{ width: { xs: '100%', sm: 260 } }}
        />
      </Stack>

      {/* LISTA DE CARDS DE TELECONSULTA */}
      {filtered.length === 0 ? (
        <AppCard sx={{ p: 5, textAlign: 'center', borderRadius: '18px', border: '1px dashed', borderColor: 'divider' }}>
          <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 1.5, borderRadius: '50%', bgcolor: 'rgba(15,118,110,0.1)', display: 'grid', placeItems: 'center', color: '#178f89' }}>
            <EventAvailableIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5, fontFamily: 'Poppins, sans-serif' }}>
            Nenhuma teleconsulta encontrada
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13.5, maxWidth: 400, mx: 'auto', mb: 2.5 }}>
            {search ? 'Nenhum resultado corresponde à sua busca.' : 'Você não possui consultas agendadas nesta categoria.'}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => onNewTele()}
            sx={{
              borderRadius: '999px',
              textTransform: 'none',
              fontWeight: 700,
              color: '#178f89',
              borderColor: 'rgba(15,118,110,0.4)',
              '&:hover': { borderColor: '#178f89', bgcolor: 'rgba(15,118,110,0.06)' },
            }}
          >
            Agendar nova teleconsulta
          </Button>
        </AppCard>
      ) : (
        <Stack spacing={2}>
          {filteredActive.map((tc) => {
            const matchedPatient = patients.find((p: any) => (p?.patient?.id || p?.id) === tc.patientId);
            const pat = tc.patient || matchedPatient?.patient || matchedPatient;
            const patId = pat?.id || matchedPatient?.patient?.id || matchedPatient?.id || tc.patientId;
            const pName = pat?.fullName || pat?.name || 'Paciente';
            // G2 (spec §19): mesma identidade do prontuário — SEMPRE Patient.id via photoUrlFor
          // (token). REF crua (pat.photoUrl) nunca em <img> (é chave S3/caminho de disco,
          // não URL). Sem foto real → undefined → iniciais (fallback só sem foto/falha).
          const hasPhoto = !!(pat?.photoUrl || tc.patient?.photoUrl);
          const pPhoto = patId && hasPhoto ? photoUrlFor(String(patId), pat?.photoUrl || tc.patient?.photoUrl) : undefined;
            const dateObj = new Date(tc.dueDate);
            const dayNum = dateObj.toLocaleDateString('pt-BR', { day: '2-digit' });
            const monthShort = dateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const dt = dateObj.toLocaleString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const criada = new Date(tc.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const s: TeleconsultaSummary | undefined = teleSummaries[tc.id];
            const pend = (s?.examRequests ?? []).filter((r) => r.status === 'pending').length;
            const hasTr = !!s?.transcript?.at;

            const isToday = new Date(tc.dueDate).getTime() >= todayStart && new Date(tc.dueDate).getTime() < todayEnd;

            return (
              <AppCard
                key={tc.id}
                id={`tele-card-${tc.id}`}
                sx={{
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: '16px',
                  border: '1px solid',
                  borderColor: isToday ? 'rgba(16,185,129,0.35)' : 'divider',
                  borderLeft: '4px solid',
                  borderLeftColor: isToday ? '#10b981' : '#0d9488',
                  bgcolor: isToday
                    ? (theme.palette.mode === 'dark' ? 'rgba(16,185,129,0.04)' : 'rgba(240,253,250,0.6)')
                    : 'background.paper',
                  boxShadow: isToday ? '0 4px 20px rgba(16,185,129,0.08)' : '0 2px 10px rgba(0,0,0,0.03)',
                  transition: 'all .2s ease',
                  '&:hover': {
                    boxShadow: isToday ? '0 8px 24px rgba(16,185,129,0.15)' : '0 6px 18px rgba(0,0,0,0.06)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Stack spacing={1.75}>
                  {/* LINHA 1: Paciente, Horário e Código da Sala */}
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    spacing={1.25}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, flex: 1 }}>
                      <Avatar
                        src={pPhoto}
                        sx={{
                          width: { xs: 44, sm: 48 },
                          height: { xs: 44, sm: 48 },
                          fontSize: 17,
                          fontWeight: 800,
                          bgcolor: 'rgba(13,148,136,0.12)',
                          color: '#0d9488',
                          border: '2px solid rgba(13,148,136,0.25)',
                          borderRadius: '12px',
                          flexShrink: 0,
                        }}
                      >
                        {pName.charAt(0).toUpperCase()}
                      </Avatar>

                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                          <Typography sx={{ fontWeight: 800, fontSize: { xs: 15.5, sm: 16.5 }, color: 'text.primary', lineHeight: 1.2 }}>
                            {pName}
                          </Typography>
                          {(pat?.id || tc.patientId) && (
                            <Button
                              size="small"
                              startIcon={<PersonOutlineIcon sx={{ fontSize: 13 }} />}
                              onClick={() => onOpenPatient(matchedPatient || { patient: pat, id: pat?.id || tc.patientId })}
                              sx={{
                                py: 0.1,
                                px: 0.75,
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: 'none',
                                color: (t) => tealText(t.palette.mode),
                                borderRadius: '6px',
                                bgcolor: 'rgba(13,148,136,0.08)',
                                '&:hover': { bgcolor: 'rgba(13,148,136,0.16)' },
                                height: 20,
                              }}
                            >
                              Prontuário
                            </Button>
                          )}
                        </Stack>
                        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tc.title || 'Teleconsulta médica'} {tc.recurrence ? `• Repete ${tc.recurrence}` : ''}
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Data / Hora & Código da Sala */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0.75}
                      sx={{
                        alignSelf: { xs: 'flex-start', sm: 'center' },
                        flexShrink: 0,
                      }}
                    >
                      <Chip
                        size="small"
                        icon={<AccessTimeIcon sx={{ fontSize: '13px !important' }} />}
                        label={isToday ? `Hoje · ${timeStr}` : `${dayNum}/${monthShort} · ${timeStr}`}
                        sx={{
                          height: 24,
                          fontSize: 11.5,
                          fontWeight: 800,
                          bgcolor: isToday ? 'rgba(16,185,129,0.14)' : 'rgba(13,148,136,0.10)',
                          color: isToday ? '#059669' : '#0d9488',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: isToday ? 'rgba(16,185,129,0.3)' : 'rgba(13,148,136,0.2)',
                          '& .MuiChip-icon': { color: isToday ? '#059669' : '#0d9488' },
                        }}
                      />
                      <Chip
                        size="small"
                        label={`Sala #${String(tc.id).slice(-5).toUpperCase()}`}
                        sx={{
                          height: 24,
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          color: 'text.secondary',
                          border: '1px dashed',
                          borderColor: 'divider',
                        }}
                      />
                    </Stack>
                  </Stack>

                  {/* LINHA 2: Badges Clínicos, Pagamento e Consentimento */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{
                      p: 1.1,
                      borderRadius: '10px',
                      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {/* Status de Pagamento */}
                    {(tc.consultPriceCents ?? 0) > 0 && (
                      tc.paidAt ? (
                        <Chip
                          size="small"
                          icon={<CheckCircleOutlineIcon sx={{ fontSize: '13px !important' }} />}
                          label="Consulta Paga"
                          sx={{ height: 22, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(16,185,129,0.12)', color: '#059669', borderRadius: '6px', '& .MuiChip-icon': { color: '#059669' } }}
                        />
                      ) : (
                        <Chip
                          size="small"
                          icon={<HourglassEmptyIcon sx={{ fontSize: '13px !important' }} />}
                          label={`Aguardando R$ ${(tc.consultPriceCents / 100).toFixed(2).replace('.', ',')}`}
                          sx={{ height: 22, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.14)', color: '#b45309', borderRadius: '6px', '& .MuiChip-icon': { color: '#b45309' } }}
                        />
                      )
                    )}

                    {/* Status de Consentimento CFM */}
                    <Chip
                      size="small"
                      icon={tc.consentAt ? <CheckCircleOutlineIcon sx={{ fontSize: '13px !important' }} /> : <HourglassEmptyIcon sx={{ fontSize: '13px !important' }} />}
                      label={tc.consentAt ? 'Autorizado CFM' : 'Aguardando aceite'}
                      sx={{
                        height: 22,
                        fontSize: 11.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        bgcolor: tc.consentAt ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                        color: tc.consentAt ? '#059669' : '#d97706',
                        borderRadius: '6px',
                        '& .MuiChip-icon': { color: tc.consentAt ? '#059669' : '#d97706' },
                      }}
                    />

                    {/* Canal de Atendimento */}
                    {tc.provider === 'livekit' ? (
                      <Chip size="small" label="Vídeo HD no App" sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: 'rgba(13,148,136,0.10)', color: '#0d9488', borderRadius: '6px' }} />
                    ) : tc.linkUrl?.includes('meet.google.com') ? (
                      <Chip size="small" label="Google Meet" sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: 'rgba(212,165,116,0.2)', color: 'secondary.dark', borderRadius: '6px' }} />
                    ) : (
                      <Chip size="small" label="Link Externo" sx={{ height: 22, fontSize: 11.5, fontWeight: 700, borderRadius: '6px' }} />
                    )}

                    {/* Exames Anexados */}
                    {pend > 0 && (
                      <Chip
                        size="small"
                        label={`${pend} exames anexados`}
                        onClick={() => onOpenPost(tc.id)}
                        sx={{ height: 22, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(59,130,246,0.12)', color: '#2563eb', borderRadius: '6px' }}
                      />
                    )}

                    {/* Transcrição Gravada */}
                    {hasTr && (
                      <Chip
                        size="small"
                        label="Transcrição gravada"
                        onClick={() => onOpenPost(tc.id)}
                        sx={{ height: 22, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(13,148,136,0.12)', color: '#0d9488', borderRadius: '6px' }}
                      />
                    )}

                    {/* Feedback */}
                    {s?.feedback && (
                      <Chip
                        size="small"
                        icon={<StarIcon sx={{ fontSize: '13px !important', color: '#f59e0b !important' }} />}
                        label={`${s.feedback.rating}/5`}
                        onClick={() => onOpenPost(tc.id)}
                        sx={{ height: 22, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706', borderRadius: '6px' }}
                      />
                    )}
                  </Stack>

                  {/* LINHA 3: AÇÕES DIRETAS (DESIGN MÉDICO PREMIUM E RESPONSIVO) */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}
                  >
                    <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0 }} alignItems="center">
                      <Button
                        variant="contained"
                        size="medium"
                        startIcon={<VideocamIcon sx={{ fontSize: 18 }} />}
                        onClick={() => onEnterTele(tc, pName)}
                        sx={{
                          borderRadius: '10px',
                          textTransform: 'none',
                          fontWeight: 800,
                          fontSize: { xs: 12.5, sm: 13.5 },
                          background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                          color: '#ffffff',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                          },
                          px: { xs: 1.5, sm: 2.5 },
                          py: 0.85,
                          boxShadow: '0 2px 8px rgba(15,118,110,0.25)',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: { xs: 1, sm: 'none' },
                        }}
                      >
                        {isToday ? 'Atender Agora' : 'Entrar na Sala'}
                      </Button>

                      <Button
                        variant="outlined"
                        size="medium"
                        startIcon={<SummarizeIcon sx={{ fontSize: 16 }} />}
                        onClick={() => onOpenPost(tc.id)}
                        sx={{
                          borderRadius: '10px',
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: { xs: 12.5, sm: 13 },
                          borderColor: 'divider',
                          color: 'text.primary',
                          px: { xs: 1.25, sm: 2 },
                          py: 0.85,
                          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                          '&:hover': {
                            borderColor: 'primary.main',
                            bgcolor: 'action.hover',
                          },
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: { xs: 1, sm: 'none' },
                        }}
                      >
                        {isMobile ? 'Resumo' : 'Resumo da Consulta'}
                      </Button>
                    </Stack>

                    <Tooltip title="Mais opções">
                      <IconButton
                        size="small"
                        aria-label={`Mais ações da teleconsulta de ${pName}`}
                        onClick={(e) => setTeleMenu({ id: tc.id, el: e.currentTarget })}
                        sx={{ color: 'text.secondary', flexShrink: 0 }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </AppCard>
            );
          })}
        </Stack>
      )}

      {/* F4 — HISTÓRICO DE CONSULTAS ENCERRADAS (seção separada no fim): sem "Entrar
          na consulta"; "Ver resumo" (outlined) abre o dialog com transcrição +
          pedidos + duração. Chip "✓ Encerrada {data}" no lugar do botão de entrar. */}
      {filteredEnded.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <HistoryIcon sx={{ fontSize: 20, color: '#178f89' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: 'Poppins, sans-serif' }}>
              Histórico ({filteredEnded.length})
            </Typography>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
          </Stack>
          <Stack spacing={1.25}>
            {filteredEnded.map((tc) => {
              const matchedPatient = patients.find((p: any) => (p?.patient?.id || p?.id) === tc.patientId);
              const pat = tc.patient || matchedPatient?.patient || matchedPatient;
              const patId = pat?.id || matchedPatient?.patient?.id || matchedPatient?.id || tc.patientId;
              const pName = pat?.fullName || pat?.name || 'Paciente';
              // G2 (spec §19): mesma identidade do prontuário — SEMPRE Patient.id via photoUrlFor
          // (token). REF crua (pat.photoUrl) nunca em <img> (é chave S3/caminho de disco,
          // não URL). Sem foto real → undefined → iniciais (fallback só sem foto/falha).
          const hasPhoto = !!(pat?.photoUrl || tc.patient?.photoUrl);
          const pPhoto = patId && hasPhoto ? photoUrlFor(String(patId), pat?.photoUrl || tc.patient?.photoUrl) : undefined;
              const ended = new Date(tc.endedAt);
              const endedFmt = Number.isNaN(ended.getTime())
                ? ''
                : ended.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const sched = new Date(tc.dueDate);
              const schedFmt = Number.isNaN(sched.getTime())
                ? ''
                : sched.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const s: TeleconsultaSummary | undefined = teleSummaries[tc.id];
              const pend = (s?.examRequests ?? []).filter((r) => r.status === 'pending').length;
              const hasTr = !!s?.transcript?.at;
              return (
                <AppCard key={tc.id} sx={{ p: 1.75, borderRadius: '16px', border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                      <Avatar src={pPhoto} sx={{ width: 38, height: 38, fontSize: 14, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.10)', color: '#178f89', flexShrink: 0 }}>
                        {pName.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                          <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>{pName}</Typography>
                          <Chip
                            size="small"
                            icon={<CheckCircleOutlineIcon sx={{ fontSize: 13 }} />}
                            // Dono 26/10: coerência — consulta que NÃO rolou não diz "Encerrada":
                            // realizada → Encerrada; cancelada → Cancelada; resto → Não realizada.
                            label={(() => {
                              const base = tc.teleStatus === 'cancelled' ? 'Cancelada'
                                : tc.teleStatus === 'completed' || !tc.teleStatus ? 'Encerrada'
                                  : 'Não realizada';
                              return endedFmt ? `${base} ${endedFmt}` : base;
                            })()}
                            sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.12)', color: '#178f89', '& .MuiChip-icon': { color: '#178f89' } }}
                          />
                            {/* Lifecycle 24/10: como a consulta TERMINOU (realizada / ausente / técnica). */}
                            {(() => { const c = teleStatusChip(tc.teleStatus, tc.noShowBy); return c ? <Chip size="small" label={c.label} sx={c.sx} /> : null; })()}
                          {pend > 0 && (
                            <Chip size="small" label={`${pend} pedido(s)`} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#d97706' }} />
                          )}
                          {hasTr && (
                            <Chip size="small" label="Transcrição ✓" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(15,118,110,.10)', color: '#178f89' }} />
                          )}
                          {/* §14.1: status do resumo pós-consulta — rascunho (âmbar, ainda
                              privado) vs aprovado (teal, visível ao paciente). CTA leva à
                              área do médico (gerar/editar/aprovar) quando a consulta é do app. */}
                          {tc.consultSummary?.status === 'approved' && (
                            <Chip
                              size="small"
                              label="Resumo aprovado ✓"
                              onClick={() => (tc.provider === 'livekit' || !tc.linkUrl ? onEnterTele(tc, pName) : onOpenPost(tc.id))}
                              sx={{ height: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(15,118,110,.14)', color: '#0d9488' }}
                            />
                          )}
                          {tc.consultSummary?.status === 'draft' && (
                            <Chip
                              size="small"
                              label="Resumo · rascunho"
                              onClick={() => (tc.provider === 'livekit' || !tc.linkUrl ? onEnterTele(tc, pName) : onOpenPost(tc.id))}
                              sx={{ height: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(245,158,11,.14)', color: '#b45309' }}
                            />
                          )}
                          {/* Consulta particular: pagamento concluído (ou cancelado se não realizada). */}
                          {(tc.consultPriceCents ?? 0) > 0 && (
                            tc.paidAt ? (
                              <Chip size="small" icon={<CheckCircleOutlineIcon sx={{ fontSize: 13 }} />} label="Consulta paga" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(16,185,129,0.15)', color: '#059669', '& .MuiChip-icon': { color: '#059669' } }} />
                            ) : isTeleConcluded(tc) || (new Date(tc.dueDate).getTime() + 5 * 60 * 1000 < Date.now()) ? (
                              <Chip size="small" label="Pagamento cancelado" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(100,116,139,0.12)', color: '#64748b' }} />
                            ) : (
                              <Chip size="small" icon={<HourglassEmptyIcon sx={{ fontSize: 13 }} />} label={`Pagamento pendente — R$ ${(tc.consultPriceCents / 100).toFixed(2).replace('.', ',')}`} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.14)', color: '#b45309', '& .MuiChip-icon': { color: '#b45309' } }} />
                            )
                          )}
                        </Stack>
                        <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                          {tc.title || 'Teleconsulta médica'}{schedFmt ? ` · agendada p/ ${schedFmt}` : ''}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SummarizeIcon />}
                        onClick={() => onOpenPost(tc.id)}
                        sx={{
                          borderRadius: '999px',
                          textTransform: 'none',
                          fontWeight: 800,
                          fontSize: 13,
                          borderColor: 'rgba(32,178,170,.45)',
                          color: (t) => tealText(t.palette.mode),
                          px: 2,
                          '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.06)' },
                        }}
                      >
                        Ver resumo
                      </Button>
                      <Button
                        size="small"
                        startIcon={<PersonOutlineIcon sx={{ fontSize: 14 }} />}
                        onClick={() => onOpenPatient(matchedPatient || { patient: pat, id: pat?.id || tc.patientId })}
                        sx={{ py: 0.2, px: 1, fontSize: 12, fontWeight: 700, textTransform: 'none', color: (t) => tealText(t.palette.mode), borderRadius: '999px', bgcolor: 'rgba(32,178,170,0.08)', '&:hover': { bgcolor: 'rgba(32,178,170,0.16)' } }}
                      >
                        Prontuário
                      </Button>
                    </Stack>
                  </Stack>
                </AppCard>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* FIX 2 — copiar/cancelar no menu ⋮ (regra de 1 ação primária por card) */}
      <Menu
        anchorEl={teleMenu?.el}
        open={!!teleMenu}
        onClose={() => setTeleMenu(null)}
        slotProps={{ paper: { sx: { borderRadius: '14px', minWidth: 220, mt: 1, boxShadow: '0 10px 28px rgba(0,0,0,.12)' } } }}
      >
        {(() => {
          const tc = filtered.find((t) => t.id === teleMenu?.id);
          if (!tc) return null;
          return (
            <>
              {tc.linkUrl && (
                <MenuItem onClick={() => {
                  navigator.clipboard.writeText(tc.linkUrl);
                  snackbar({ message: 'Link da teleconsulta copiado!', severity: 'info' });
                  setTeleMenu(null);
                }}>
                  <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Copiar link da reunião</ListItemText>
                </MenuItem>
              )}
              {/* §6 share: WhatsApp + copiar link do APP (drexame/#/teleconsulta/:id) —
                  link direto autenticável, independe de link externo (Meet) existir. */}
              {(() => {
                const matched = patients.find((p: any) => (p?.patient?.id || p?.id) === tc.patientId);
                const pat = tc.patient || matched?.patient || matched;
                const pName = pat?.fullName || pat?.name || 'Paciente';
                const due = new Date(tc.dueDate);
                const appLink = `${APP_WEB_URL}/#/teleconsulta/${tc.id}`;
                const shareMsg = `Teleconsulta com ${pName} está agendada para ${due.toLocaleDateString('pt-BR')}, às ${due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (horário de Brasília). Acesse pelo link: ${appLink}`;
                return (
                  <>
                    <MenuItem onClick={() => {
                      window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg)}`, '_blank', 'noopener');
                      setTeleMenu(null);
                    }}>
                      <ListItemIcon><WhatsAppIcon fontSize="small" sx={{ color: '#25d366' }} /></ListItemIcon>
                      <ListItemText>Compartilhar no WhatsApp</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={() => {
                      setTeleMenu(null);
                      void copyText(appLink).then((ok) => {
                        snackbar(ok
                          ? { message: 'Link da teleconsulta copiado!', severity: 'success' }
                          : { message: 'Não deu pra copiar automático — copie manualmente.', severity: 'info' });
                      });
                    }}>
                      <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
                      <ListItemText>Copiar link da teleconsulta</ListItemText>
                    </MenuItem>
                  </>
                );
              })()}
              <MenuItem onClick={() => { onCancelTele(tc.id, tc.patientId); setTeleMenu(null); }} sx={{ color: 'error.main' }}>
                <ListItemIcon><DeleteOutlinedIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
                <ListItemText>Cancelar consulta</ListItemText>
              </MenuItem>
            </>
          );
        })()}
      </Menu>
    </Box>
  );
};
