import { useEffect, useState, useMemo, type ReactNode } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Avatar,
  TextField,
  InputAdornment,
  Grid,
  LinearProgress,
  Rating,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useTheme,
  Button,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import SearchIcon from '@mui/icons-material/Search';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt';
import RateReviewIcon from '@mui/icons-material/RateReview';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import VideocamIcon from '@mui/icons-material/Videocam';
import TimerIcon from '@mui/icons-material/Timer';
import ReplayIcon from '@mui/icons-material/Replay';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { API_URL, token, photoUrlFor, doctorPhotoUrl } from '../../config';
import { TabLoader, SectionError, PhotoZoom } from './parts';
import { tealText, COPPER } from '../../theme';

const H = () => ({ Authorization: `Bearer ${token()}` });

interface FeedbackItem {
  id: string;
  teleId: string;
  createdAt: string;
  rating: number;
  audioQuality: 'otimo' | 'ok' | 'ruim' | null;
  note: string | null;
  role: 'patient' | 'doctor';
  patient: { id: string; name: string; photoUrl?: string } | null;
  doctor: { id: string; name: string; specialty?: string; crm?: string; photoUrl?: string } | null;
  reminder: { title: string; dueDate?: string; endedAt?: string } | null;
}

interface FeedbacksResponse {
  total: number;
  avgRating: number;
  positivePct: number;
  ratingCounts: Record<number, number>;
  audioQualityCounts: { otimo: number; ok: number; ruim: number };
  audioRated: number;
  items: FeedbackItem[];
}

interface FunnelResponse {
  days: number;
  total: number;
  realizadas: number;
  noShow: number;
  pendentes: number;
  realizacaoPct: number;
  avgDurationMin: number | null;
  retorno30d: number;
  consentPct: number;
}

/** Card KPI do funil de teleconsulta (mesma linguagem visual dos KPIs de feedback). */
function FunnelKpi({ icon, color, label, value, hint }: { icon: ReactNode; color: string; label: string; value: string | number; hint: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', height: '100%' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: `${color}1f`, color, display: 'grid', placeItems: 'center' }}>
              {icon}
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                {label}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1 }}>
                {value}
              </Typography>
            </Box>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

export const TeleconsultasTab = () => {
  const theme = useTheme();
  const [data, setData] = useState<FeedbacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [funnelErr, setFunnelErr] = useState(false);

  const load = () => {
    setLoading(true);
    setErr(false);
    fetch(`${API_URL}/admin/teleconsultas/feedbacks`, { headers: H() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((res: FeedbacksResponse) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setErr(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const loadFunnel = (d: number) => {
    setFunnelErr(false);
    fetch(`${API_URL}/admin/teleconsultas/funnel?days=${d}`, { headers: H() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((res: FunnelResponse) => setFunnel(res))
      .catch(() => setFunnelErr(true));
  };

  useEffect(() => {
    loadFunnel(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      if (ratingFilter !== 'all' && item.rating !== ratingFilter) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const patName = item.patient?.name?.toLowerCase() || '';
      const docName = item.doctor?.name?.toLowerCase() || '';
      const note = item.note?.toLowerCase() || '';
      return patName.includes(s) || docName.includes(s) || note.includes(s);
    });
  }, [data?.items, search, ratingFilter]);

  if (loading && !data) return <TabLoader />;
  if (err && !data) return <SectionError message="Não foi possível carregar os feedbacks de teleconsultas." onRetry={load} />;

  const total = data?.total || 0;
  const avg = data?.avgRating || 5.0;
  const posPct = data?.positivePct || 100;
  // T1 insights: o server sempre mandou `ratingCounts` (o front lia `counts` —
  // distribuição ficava zerada). Corrigido junto com o agregado de áudio.
  const counts = data?.ratingCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const audioCounts = data?.audioQualityCounts || { otimo: 0, ok: 0, ruim: 0 };
  const audioRated = data?.audioRated || 0;

  return (
    <Box sx={{ width: '100%' }}>
      {/* Cabeçalho */}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideoCameraFrontIcon sx={{ color: '#0d9488' }} /> Teleconsultas & Avaliações
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Monitore a experiência clínica, NPS e feedbacks deixados por pacientes e médicos pós-atendimento.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={load}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}
        >
          Atualizar
        </Button>
      </Stack>

      {/* KPIs no Topo */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* KPI 1: Média Geral */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706', display: 'grid', placeItems: 'center' }}>
                  <StarIcon />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Nota Média Geral
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1 }}>
                    {avg.toFixed(1)} <Typography component="span" sx={{ fontSize: 18, color: 'text.secondary', fontWeight: 600 }}>/ 5.0</Typography>
                  </Typography>
                </Box>
              </Stack>
              <Rating value={avg} precision={0.1} readOnly size="small" sx={{ color: '#f59e0b' }} />
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 2: Total de Avaliações */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'rgba(13,148,136,0.12)', color: '#0d9488', display: 'grid', placeItems: 'center' }}>
                  <RateReviewIcon />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Avaliadas
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1 }}>
                    {total}
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Consultas com feedback registrado
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 3: Satisfação Positiva */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'rgba(16,185,129,0.12)', color: '#059669', display: 'grid', placeItems: 'center' }}>
                  <SentimentSatisfiedAltIcon />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Aprovação (4 e 5 ★)
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif', color: '#059669', lineHeight: 1 }}>
                    {posPct}%
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Avaliações positivas de experiência
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 4: Distribuição de Estrelas */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 0.75 }}>
                Distribuição de Notas
              </Typography>
              <Stack spacing={0.5}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = counts[star] || 0;
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <Stack key={star} direction="row" alignItems="center" spacing={1}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, width: 22 }}>{star}★</Typography>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          flex: 1,
                          height: 6,
                          borderRadius: '3px',
                          bgcolor: 'action.hover',
                          '& .MuiLinearProgress-bar': {
                            bgcolor: star >= 4 ? '#10b981' : star === 3 ? '#f59e0b' : '#ef4444',
                          },
                        }}
                      />
                      <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 28, textAlign: 'right' }}>
                        {count}
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
              {/* T1 insights (27/10): CSAT de áudio pós-consulta — agregado simples */}
              {audioRated > 0 && (
                <>
                  <Box sx={{ height: 1, bgcolor: 'divider', my: 1 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                    Áudio das consultas
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    <Chip size="small" label={`Ótimo 🎧 ${audioCounts.otimo}`} sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,0.12)', color: '#0d9488' }} />
                    <Chip size="small" label={`OK ${audioCounts.ok}`} sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(212,165,116,0.14)', color: '#b88a54' }} />
                    <Chip size="small" label={`Ruim ${audioCounts.ruim}`} sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(239,68,68,0.10)', color: '#dc2626' }} />
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Funil de Teleconsulta — conversão de agendamentos em chamadas reais */}
      <Box sx={{ mb: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={1.5}
          sx={{ mb: 1.5 }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}>
              Funil de teleconsulta
            </Typography>
            {funnel && (
              <Chip
                size="small"
                label={`${funnel.pendentes} pendentes`}
                sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706' }}
              />
            )}
          </Stack>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={days}
            onChange={(_e, v) => {
              if (v != null) setDays(v);
            }}
            sx={{
              '& .MuiToggleButton-root': {
                px: 2,
                py: 0.25,
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 12,
              },
            }}
          >
            <ToggleButton value={7}>7d</ToggleButton>
            <ToggleButton value={30}>30d</ToggleButton>
            <ToggleButton value={90}>90d</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {funnelErr ? (
          <SectionError message="Não foi possível carregar o funil de teleconsultas." onRetry={() => loadFunnel(days)} />
        ) : !funnel ? (
          <LinearProgress sx={{ height: 6, borderRadius: '999px' }} />
        ) : (
          <Grid container spacing={2}>
            <FunnelKpi icon={<EventAvailableIcon />} color="#0d9488" label="Agendadas" value={funnel.total} hint="Teleconsultas criadas no período" />
            <FunnelKpi icon={<VideocamIcon />} color="#059669" label="Realizadas" value={funnel.realizadas} hint="Chamada com os 2 participantes" />
            <FunnelKpi icon={<EventBusyIcon />} color="#dc2626" label="No-show" value={funnel.noShow} hint="Vencidas +24h sem chamada" />
            <FunnelKpi icon={<TrendingUpIcon />} color="#2563eb" label="% Realização" value={`${funnel.realizacaoPct}%`} hint="Agendadas que viraram chamada" />
            <FunnelKpi icon={<TimerIcon />} color="#d97706" label="Duração Média" value={funnel.avgDurationMin != null ? `${funnel.avgDurationMin} min` : '—'} hint="Do 1º join ao encerramento" />
            <FunnelKpi icon={<ReplayIcon />} color="#b88a54" label="Retorno 30d" value={funnel.retorno30d} hint="Pacientes com nova consulta em até 30d" />
            <FunnelKpi icon={<VerifiedUserIcon />} color="#0d9488" label="% Consent" value={`${funnel.consentPct}%`} hint="Aceite Art. 15 (telemedicina)" />
          </Grid>
        )}
      </Box>

      {/* Barra de Filtros */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          size="small"
          placeholder="Buscar por paciente, médico ou comentário…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: { sm: 400 } }}
        />

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Filtrar por Nota</InputLabel>
          <Select
            value={ratingFilter}
            label="Filtrar por Nota"
            onChange={(e) => setRatingFilter(e.target.value as any)}
          >
            <MenuItem value="all">Todas as Notas</MenuItem>
            <MenuItem value={5}>⭐⭐⭐⭐⭐ (5 estrelas)</MenuItem>
            <MenuItem value={4}>⭐⭐⭐⭐ (4 estrelas)</MenuItem>
            <MenuItem value={3}>⭐⭐⭐ (3 estrelas)</MenuItem>
            <MenuItem value={2}>⭐⭐ (2 estrelas)</MenuItem>
            <MenuItem value={1}>⭐ (1 estrela)</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Lista de Feedbacks */}
      <Stack spacing={1.5}>
        {filteredItems.map((item, idx) => {
          const dateStr = new Date(item.createdAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const rawDocName = item.doctor?.name || '';
          const cleanDocName = rawDocName
            ? (rawDocName.toLowerCase().startsWith('dr') ? rawDocName : `Dr(a). ${rawDocName}`)
            : 'Médico da Consulta';
          const cleanCrm = item.doctor?.crm
            ? item.doctor.crm.replace(/(\/|-)([A-Za-z]{2})\/\2$/i, '-$2')
            : '';
          const cleanSpecialtyCrm = `${item.doctor?.specialty || 'Clínica Geral'}${cleanCrm ? ` · ${cleanCrm}` : ''}`;
          const patPhoto = item.patient?.id ? photoUrlFor(item.patient.id) : undefined;
          const docPhoto = item.doctor?.id ? doctorPhotoUrl(item.doctor.id) : undefined;

          return (
            <Card
              key={item.id}
              variant="outlined"
              sx={{
                borderRadius: '16px',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                transition: 'all .15s ease',
                '&:hover': {
                  borderColor: 'rgba(32,178,170,0.4)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                },
                animation: `fbIn .25s ease ${idx * 0.03}s both`,
                '@keyframes fbIn': {
                  from: { opacity: 0, transform: 'translateY(6px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.25 }, '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={{ xs: 1.5, md: 2 }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'stretch', md: 'center' }}
                >
                  {/* Participantes: Paciente & Médico */}
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={{ xs: 1.25, sm: 2 }}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {/* Paciente */}
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                      <Avatar
                        src={patPhoto}
                        sx={{
                          width: 44,
                          height: 44,
                          bgcolor: 'rgba(32,178,170,0.12)',
                          color: '#0d9488',
                          fontWeight: 800,
                          fontSize: 16,
                          borderRadius: '12px',
                          flexShrink: 0,
                        }}
                      >
                        {(item.patient?.name || 'P').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary', lineHeight: 1.25 }} noWrap>
                          {item.patient?.name || 'Paciente'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                          <PersonIcon sx={{ fontSize: 13 }} /> Paciente
                        </Typography>
                      </Box>
                    </Stack>

                    <Typography sx={{ color: 'text.disabled', fontSize: 18, display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}>→</Typography>

                    {/* Médico */}
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                      <Avatar
                        src={docPhoto}
                        sx={{
                          width: 44,
                          height: 44,
                          bgcolor: 'rgba(212,165,116,0.16)',
                          color: '#b88a54',
                          fontWeight: 800,
                          fontSize: 16,
                          borderRadius: '12px',
                          flexShrink: 0,
                        }}
                      >
                        {(item.doctor?.name || 'M').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary', lineHeight: 1.25 }} noWrap>
                          {cleanDocName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }} noWrap>
                          <LocalHospitalIcon sx={{ fontSize: 13 }} /> {cleanSpecialtyCrm}
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>

                  {/* Avaliação & Data */}
                  <Stack
                    direction={{ xs: 'row', md: 'column' }}
                    alignItems={{ xs: 'center', md: 'flex-end' }}
                    justifyContent={{ xs: 'space-between', md: 'center' }}
                    spacing={0.5}
                    sx={{
                      minWidth: { xs: 0, md: 140 },
                      pt: { xs: 1, md: 0 },
                      borderTop: { xs: '1px dashed', md: 'none' },
                      borderColor: 'divider',
                      flexShrink: 0,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Rating value={item.rating} readOnly size="small" sx={{ color: '#f59e0b' }} />
                      <Typography sx={{ fontWeight: 900, fontSize: 14.5, color: 'text.primary' }}>
                        {item.rating}/5
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                      {dateStr}
                    </Typography>
                  </Stack>
                </Stack>

                {/* Comentário / Observação deixada */}
                {item.note && (
                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      borderRadius: '12px',
                      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                      borderLeft: '3px solid',
                      borderLeftColor: item.rating >= 4 ? '#10b981' : item.rating === 3 ? '#f59e0b' : '#ef4444',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: 'text.primary', fontStyle: 'italic', lineHeight: 1.5 }}>
                      “{item.note}”
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontWeight: 700 }}>
                      — Enviado por: {item.role === 'doctor' ? 'Médico' : 'Paciente'}
                    </Typography>
                  </Box>
                )}

                {/* Tags extras da chamada */}
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                  {item.reminder?.title && (
                    <Chip size="small" label={item.reminder.title} sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
                  )}
                  <Chip
                    size="small"
                    label={`Sala #${String(item.teleId || '').slice(-5).toUpperCase()}`}
                    sx={{ height: 20, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}
                  />
                  {item.rating >= 4 ? (
                    <Chip size="small" label="Satisfação Alta" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(16,185,129,0.12)', color: '#059669' }} />
                  ) : item.rating <= 2 ? (
                    <Chip size="small" label="Atenção / Risco de Churn" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(239,68,68,0.12)', color: '#dc2626' }} />
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          );
        })}

        {filteredItems.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6, bgcolor: 'background.paper', borderRadius: '16px', border: '1px dashed', borderColor: 'divider' }}>
            <RateReviewIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Nenhum feedback encontrado
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {search || ratingFilter !== 'all'
                ? 'Nenhum resultado corresponde aos filtros selecionados.'
                : 'Assim que as teleconsultas forem realizadas e avaliadas, as notas aparecerão aqui.'}
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
};
