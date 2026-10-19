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
  Tooltip,
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
import { AppCard } from '../../AppCard';
import { tealText, COPPER, copperText } from '../../../theme';
import { snackbar } from '../../ConfirmDialog';
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
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    if (initialSearch !== undefined) setSearch(initialSearch);
  }, [initialSearch]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000;

  // Separação por categorias
  const todayList = useMemo(() => {
    return teleconsultas.filter((tc) => {
      const t = new Date(tc.dueDate).getTime();
      return t >= todayStart && t < todayEnd;
    });
  }, [teleconsultas, todayStart, todayEnd]);

  const upcomingList = useMemo(() => {
    return teleconsultas.filter((tc) => {
      const t = new Date(tc.dueDate).getTime();
      return t >= now.getTime();
    });
  }, [teleconsultas, now]);

  const pastList = useMemo(() => {
    return teleconsultas.filter((tc) => {
      const t = new Date(tc.dueDate).getTime();
      return t < now.getTime() && !(t >= todayStart && t < todayEnd);
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
                color: '#0f766e',
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
            Gerencie seus atendimentos online, inicie chamadas com um clique e acesse o pós-consulta.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => onNewTele()}
          sx={{
            borderRadius: '999px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: 14,
            px: 2.75,
            py: 1,
            background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
            boxShadow: '0 4px 14px rgba(15,118,110,0.3)',
            '&:hover': { background: 'linear-gradient(135deg, #0d655f, #0f766e)' },
            alignSelf: { xs: 'stretch', sm: 'auto' },
          }}
        >
          + Agendar Teleconsulta
        </Button>
      </Stack>

      {/* 3 MINI CARDS DE STATUS */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <AppCard
          kind="interactive"
          onClick={() => setFilter('today')}
          sx={{
            borderRadius: '14px',
            border: '1px solid',
            borderColor: filter === 'today' ? '#0f766e' : 'divider',
            bgcolor: filter === 'today' ? 'rgba(15,118,110,0.06)' : 'background.paper',
          }}
        >
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
              Consultas Hoje
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: todayList.length > 0 ? '#0f766e' : 'text.primary', lineHeight: 1 }}>
                {todayList.length}
              </Typography>
              {todayList.length > 0 && (
                <Chip size="small" label="Ativo hoje" sx={{ height: 18, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.12)', color: '#0f766e' }} />
              )}
            </Stack>
          </CardContent>
        </AppCard>

        <AppCard
          kind="interactive"
          onClick={() => setFilter('upcoming')}
          sx={{
            borderRadius: '14px',
            border: '1px solid',
            borderColor: filter === 'upcoming' ? 'secondary.dark' : 'divider',
            bgcolor: filter === 'upcoming' ? 'rgba(212,165,116,0.06)' : 'background.paper',
          }}
        >
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
              Próximas Agendadas
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: 'text.primary', lineHeight: 1 }}>
              {upcomingList.length}
            </Typography>
          </CardContent>
        </AppCard>

        <AppCard
          kind="interactive"
          onClick={() => setFilter('all')}
          sx={{
            gridColumn: { xs: 'span 2', sm: 'span 1' },
            borderRadius: '14px',
            border: '1px solid',
            borderColor: filter === 'all' ? 'primary.main' : 'divider',
            bgcolor: filter === 'all' ? 'rgba(32,178,170,0.06)' : 'background.paper',
          }}
        >
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
              Total Geral
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: 'text.primary', lineHeight: 1 }}>
              {teleconsultas.length}
            </Typography>
          </CardContent>
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
            '& .MuiTabs-indicator': { height: 3, borderRadius: '3px', bgcolor: '#0f766e' },
            '& .MuiTab-root': {
              minHeight: 38,
              py: 0.75,
              px: 1.75,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13,
              color: 'text.secondary',
              '&.Mui-selected': { color: '#0f766e' },
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
          <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 1.5, borderRadius: '50%', bgcolor: 'rgba(15,118,110,0.1)', display: 'grid', placeItems: 'center', color: '#0f766e' }}>
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
              color: '#0f766e',
              borderColor: 'rgba(15,118,110,0.4)',
              '&:hover': { borderColor: '#0f766e', bgcolor: 'rgba(15,118,110,0.06)' },
            }}
          >
            Agendar nova teleconsulta
          </Button>
        </AppCard>
      ) : (
        <Stack spacing={2}>
          {filtered.map((tc) => {
            const matchedPatient = patients.find((p: any) => (p?.patient?.id || p?.id) === tc.patientId);
            const pat = tc.patient || matchedPatient?.patient || matchedPatient;
            const pName = pat?.fullName || pat?.name || 'Paciente';
            const pPhoto = pat?.photoUrl || tc.patient?.photoUrl;
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
                  borderColor: isToday ? 'rgba(15,118,110,0.4)' : 'divider',
                  boxShadow: isToday ? '0 4px 18px rgba(15,118,110,0.08)' : '0 2px 8px rgba(0,0,0,0.02)',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
              >
                <Stack spacing={2}>
                  {/* LINHA SUPERIOR: Data/Calendário, Paciente com Foto, Sala e Status */}
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                    spacing={1.5}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                      {/* Outlook-style Calendar Tile */}
                      <Box
                        sx={{
                          minWidth: 54,
                          width: 54,
                          height: 54,
                          borderRadius: '12px',
                          textAlign: 'center',
                          bgcolor: isToday ? 'rgba(15,118,110,0.12)' : 'rgba(212,165,116,0.12)',
                          border: '1.5px solid',
                          borderColor: isToday ? '#0f766e' : 'rgba(212,165,116,0.35)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Typography sx={{ fontSize: 9.5, fontWeight: 800, color: isToday ? '#0f766e' : 'secondary.dark', letterSpacing: '0.04em', lineHeight: 1 }}>
                          {monthShort}
                        </Typography>
                        <Typography sx={{ fontSize: 18, fontWeight: 900, lineHeight: 1.15, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                          {dayNum}
                        </Typography>
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.secondary', lineHeight: 1 }}>
                          {timeStr}
                        </Typography>
                      </Box>

                      <Avatar
                        src={pPhoto}
                        sx={{
                          width: 44,
                          height: 44,
                          fontSize: 16,
                          fontWeight: 800,
                          bgcolor: 'rgba(15,118,110,0.14)',
                          color: '#0f766e',
                          border: '2px solid rgba(15,118,110,0.25)',
                          flexShrink: 0,
                        }}
                      >
                        {pName.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                          <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary' }}>
                            {pName}
                          </Typography>
                          {(pat?.id || tc.patientId) && (
                            <Button
                              size="small"
                              startIcon={<PersonOutlineIcon sx={{ fontSize: 14 }} />}
                              onClick={() => onOpenPatient(matchedPatient || { patient: pat, id: pat?.id || tc.patientId })}
                              sx={{
                                py: 0.2,
                                px: 1,
                                fontSize: 11.5,
                                fontWeight: 700,
                                textTransform: 'none',
                                color: (t) => tealText(t.palette.mode),
                                borderRadius: '999px',
                                bgcolor: 'rgba(32,178,170,0.08)',
                                '&:hover': { bgcolor: 'rgba(32,178,170,0.16)' },
                              }}
                            >
                              Ver prontuário
                            </Button>
                          )}
                        </Stack>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
                          {tc.title || 'Teleconsulta médica'} {tc.recurrence ? `• Repete ${tc.recurrence}` : ''}
                        </Typography>
                      </Box>
                    </Stack>

                    <Tooltip title="Código da sala — conferido entre médico e paciente">
                      <Chip
                        size="small"
                        label={`Sala ${String(tc.id).slice(-5).toUpperCase()}`}
                        sx={{
                          height: 24,
                          fontSize: 11.5,
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          bgcolor: 'rgba(212,165,116,.18)',
                          color: 'secondary.dark',
                          border: '1px dashed rgba(212,165,116,.5)',
                          alignSelf: { xs: 'flex-start', sm: 'center' },
                        }}
                      />
                    </Tooltip>
                  </Stack>

                  {/* LINHA DO MEIO: Data/Hora e Badges de Consentimento / Provedor */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{
                      p: 1.25,
                      borderRadius: '10px',
                      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mr: 1 }}>
                      <AccessTimeIcon sx={{ fontSize: 16, color: '#0f766e' }} />
                      <Typography sx={{ fontWeight: 800, fontSize: 14, color: isToday ? '#0f766e' : 'text.primary' }}>
                        {isToday ? `Hoje · ${dt.split('·')[1] || dt}` : dt}
                      </Typography>
                    </Stack>

                    <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
                      (agendada {criada})
                    </Typography>

                    {tc.provider === 'livekit' ? (
                      <Chip size="small" label="Vídeo no App ✨" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(32,178,170,0.16)', color: '#0f766e' }} />
                    ) : tc.linkUrl?.includes('meet.google.com') ? (
                      <Chip size="small" label="Google Meet ✨" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(212,165,116,0.2)', color: 'secondary.dark' }} />
                    ) : (
                      <Chip size="small" label="Link Externo" sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />
                    )}

                    <Chip
                      size="small"
                      icon={tc.consentAt ? <CheckCircleOutlineIcon sx={{ fontSize: 13 }} /> : <HourglassEmptyIcon sx={{ fontSize: 13 }} />}
                      label={tc.consentAt ? 'Paciente autorizou (CFM)' : 'Aguardando aceite do paciente'}
                      sx={{
                        height: 22,
                        fontSize: 11,
                        fontWeight: 700,
                        bgcolor: tc.consentAt ? 'rgba(15,118,110,0.12)' : 'rgba(245,158,11,0.12)',
                        color: tc.consentAt ? '#0f766e' : '#d97706',
                        '& .MuiChip-icon': { color: tc.consentAt ? '#0f766e' : '#d97706' },
                      }}
                    />

                    {pend > 0 && (
                      <Chip
                        size="small"
                        label={`${pend} pedido(s)`}
                        onClick={() => onOpenPost(tc.id)}
                        sx={{ height: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(245,158,11,.14)', color: '#d97706' }}
                      />
                    )}

                    {hasTr && (
                      <Chip
                        size="small"
                        label="Transcrição ✓"
                        onClick={() => onOpenPost(tc.id)}
                        sx={{ height: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer', bgcolor: 'rgba(15,118,110,.12)', color: '#0f766e' }}
                      />
                    )}
                  </Stack>

                  {/* LINHA INFERIOR: AÇÕES CLARAS E DIRETAS */}
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    spacing={1.25}
                  >
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<VideocamIcon />}
                        onClick={() => onEnterTele(tc, pName)}
                        sx={{
                          borderRadius: '999px',
                          textTransform: 'none',
                          fontWeight: 800,
                          fontSize: 13.5,
                          bgcolor: '#0f766e',
                          '&:hover': { bgcolor: '#0d655f' },
                          px: 2.5,
                          py: 0.8,
                          boxShadow: '0 3px 10px rgba(15,118,110,0.3)',
                          flex: { xs: 1, sm: 'none' },
                        }}
                      >
                        Entrar na sala
                      </Button>

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SummarizeIcon />}
                        onClick={() => onOpenPost(tc.id)}
                        sx={{
                          borderRadius: '999px',
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: 13,
                          borderColor: 'rgba(32,178,170,.45)',
                          color: (t) => tealText(t.palette.mode),
                          px: 1.75,
                          flex: { xs: 1, sm: 'none' },
                        }}
                      >
                        Pós-consulta
                      </Button>

                      {tc.linkUrl && (
                        <IconButton
                          size="small"
                          title="Copiar link da reunião"
                          onClick={() => {
                            navigator.clipboard.writeText(tc.linkUrl);
                            snackbar({ message: 'Link da teleconsulta copiado!', severity: 'info' });
                          }}
                          sx={{ color: 'text.secondary', border: '1px solid', borderColor: 'divider' }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>

                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlinedIcon />}
                      onClick={() => onCancelTele(tc.id, tc.patientId || pat?.id)}
                      sx={{
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: 13,
                        borderColor: 'rgba(239,68,68,0.35)',
                        color: 'error.main',
                        '&:hover': { borderColor: 'error.main', bgcolor: 'rgba(239,68,68,0.06)' },
                        px: 2,
                        alignSelf: { xs: 'flex-start', sm: 'center' },
                      }}
                    >
                      Cancelar consulta
                    </Button>
                  </Stack>
                </Stack>
              </AppCard>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};
