import { useEffect, useState, useMemo, type ReactNode } from 'react';
import {
  Box,
  Typography,
  Stack,
  Avatar,
  TextField,
  InputAdornment,
  LinearProgress,
  Button,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';
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
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import VerifiedIcon from '@mui/icons-material/Verified';
import { API_URL, token, photoUrlFor, doctorPhotoUrl } from '../../config';
import { TabLoader, SectionError } from './parts';
import { Badge, type BadgeProps } from '@/components/reui/badge';
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FrameFooter,
} from '@/components/reui/frame';
import { IconTile } from '@/components/reui/icon-tile';
import { Rating } from '@/components/reui/rating';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { tealText } from '../../theme';

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

/** Card KPI do funil de teleconsulta com ReUI Frame + IconTile (mobile-first 2 colunas). */
function FunnelKpi({
  icon,
  toneClass,
  badge,
  badgeVariant = 'primary-light',
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  toneClass: string;
  badge?: string;
  badgeVariant?: BadgeProps['variant'];
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Frame spacing="sm" className="h-full">
      <FramePanel className="flex h-full flex-col justify-between gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-muted-foreground block text-xs font-bold tracking-wider uppercase">
              {label}
            </span>
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-foreground font-['Poppins',sans-serif] text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl">
                {value}
              </span>
              {badge && (
                <Badge variant={badgeVariant} size="xs">
                  {badge}
                </Badge>
              )}
            </div>
          </div>
          <IconTile variant="soft" size="sm" className={toneClass}>
            {icon}
          </IconTile>
        </div>
        <p className="text-muted-foreground m-0 text-xs leading-snug">
          {hint}
        </p>
      </FramePanel>
    </Frame>
  );
}

export const TeleconsultasTab = () => {
  useReuiThemeSync();
  const [data, setData] = useState<FeedbacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'patient' | 'doctor'>('all');
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
      if (roleFilter !== 'all' && item.role !== roleFilter) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const patName = item.patient?.name?.toLowerCase() || '';
      const docName = item.doctor?.name?.toLowerCase() || '';
      const spec = item.doctor?.specialty?.toLowerCase() || '';
      const note = item.note?.toLowerCase() || '';
      return patName.includes(s) || docName.includes(s) || spec.includes(s) || note.includes(s);
    });
  }, [data?.items, search, ratingFilter, roleFilter]);

  const roleCounts = useMemo(() => {
    const items = data?.items || [];
    let patients = 0;
    let doctors = 0;
    let withNotes = 0;
    let lowRatings = 0;
    for (const it of items) {
      if (it.role === 'doctor') doctors++;
      else patients++;
      if (it.note && it.note.trim()) withNotes++;
      if (it.rating <= 2) lowRatings++;
    }
    return { patients, doctors, withNotes, lowRatings };
  }, [data?.items]);

  if (loading && !data) return <TabLoader />;
  if (err && !data)
    return (
      <SectionError
        message="Não foi possível carregar os feedbacks de teleconsultas."
        onRetry={load}
      />
    );

  const total = data?.total || 0;
  const avg = data?.avgRating || 5.0;
  const posPct = data?.positivePct || 100;
  const counts = data?.ratingCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const audioCounts = data?.audioQualityCounts || { otimo: 0, ok: 0, ruim: 0 };
  const audioRated = data?.audioRated || 0;

  return (
    <Box sx={{ width: '100%' }}>
      {/* Cabeçalho */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <div className="flex flex-wrap items-center gap-2">
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: 'Poppins, sans-serif',
                color: 'text.primary',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <VideoCameraFrontIcon sx={{ color: (t) => tealText(t.palette.mode) }} /> Teleconsultas & Avaliações
            </Typography>
            <Badge variant="primary-light" size="sm">
              CSAT & NPS Clínico
            </Badge>
          </div>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Monitore a conversão da sala de vídeo, qualidade de áudio e avaliações cruzadas entre pacientes e médicos.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => {
            load();
            loadFunnel(days);
          }}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, minHeight: 38 }}
        >
          Atualizar dados
        </Button>
      </Stack>

      {/* Funil de Teleconsulta — conversão de agendamentos em chamadas reais */}
      <Box sx={{ mb: 3.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={1.5}
          sx={{ mb: 1.5 }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}
            >
              Funil de Teleconsulta
            </Typography>
            {funnel && (
              <Badge variant={funnel.pendentes > 0 ? 'warning-light' : 'success-light'} size="sm">
                {funnel.pendentes} pendentes
              </Badge>
            )}
          </div>
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
                py: 0.4,
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 12,
              },
            }}
          >
            <ToggleButton value={7}>7 dias</ToggleButton>
            <ToggleButton value={30}>30 dias</ToggleButton>
            <ToggleButton value={90}>90 dias</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {funnelErr ? (
          <SectionError
            message="Não foi possível carregar o funil de teleconsultas."
            onRetry={() => loadFunnel(days)}
          />
        ) : !funnel ? (
          <LinearProgress sx={{ height: 6, borderRadius: '999px' }} />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <FunnelKpi
              icon={<EventAvailableIcon sx={{ fontSize: 18 }} />}
              toneClass="text-primary"
              label="Agendadas"
              value={funnel.total}
              hint="Criadas no período"
            />
            <FunnelKpi
              icon={<VideocamIcon sx={{ fontSize: 18 }} />}
              toneClass="text-emerald-600 dark:text-emerald-400"
              badge={`${funnel.realizacaoPct}%`}
              badgeVariant="success-light"
              label="Realizadas"
              value={funnel.realizadas}
              hint="Com os 2 participantes"
            />
            <FunnelKpi
              icon={<EventBusyIcon sx={{ fontSize: 18 }} />}
              toneClass="text-rose-600 dark:text-rose-400"
              badge={funnel.noShow > 0 ? 'atenção' : 'zero'}
              badgeVariant={funnel.noShow > 0 ? 'destructive-light' : 'success-light'}
              label="No-show"
              value={funnel.noShow}
              hint="Vencidas +24h sem chamada"
            />
            <FunnelKpi
              icon={<TrendingUpIcon sx={{ fontSize: 18 }} />}
              toneClass="text-sky-600 dark:text-sky-400"
              label="Conversão"
              value={`${funnel.realizacaoPct}%`}
              hint="Agendadas → realizadas"
            />
            <FunnelKpi
              icon={<TimerIcon sx={{ fontSize: 18 }} />}
              toneClass="text-amber-600 dark:text-amber-400"
              label="Duração Média"
              value={funnel.avgDurationMin != null ? `${funnel.avgDurationMin}m` : '—'}
              hint="Do 1º join ao fim"
            />
            <FunnelKpi
              icon={<ReplayIcon sx={{ fontSize: 18 }} />}
              toneClass="text-secondary"
              label="Retorno 30d"
              value={funnel.retorno30d}
              hint="Nova consulta em 30d"
            />
            <FunnelKpi
              icon={<VerifiedUserIcon sx={{ fontSize: 18 }} />}
              toneClass="text-primary"
              badge="TCLE"
              badgeVariant="info-light"
              label="Consentimento"
              value={`${funnel.consentPct}%`}
              hint="Aceite Art. 15 CFM"
            />
          </div>
        )}
      </Box>

      {/* Seção ReUI review-3 + c-rating-6: Sumário Lateral + Lista Filtrável de Avaliações */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Coluna Esquerda: Rating Summary Card (review-3 / c-rating-6) */}
        <Frame className="w-full lg:sticky lg:top-4">
          <FrameHeader>
            <div className="flex items-center justify-between gap-2">
              <FrameTitle>Resumo de Avaliações</FrameTitle>
              <Badge variant="success-light" size="sm">
                {posPct}% aprovação
              </Badge>
            </div>
            <FrameDescription>
              Clique em uma faixa de estrelas para filtrar os relatos
            </FrameDescription>
          </FrameHeader>

          <FramePanel className="flex flex-col gap-4">
            {/* Nota Geral Grande + Estrelas Parciais */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3.5">
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-foreground font-['Poppins',sans-serif] text-4xl leading-none font-extrabold tabular-nums">
                    {avg.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground text-xs font-semibold">
                    / 5.0
                  </span>
                </div>
                <Rating rating={avg} size="sm" />
              </div>
              <div className="flex flex-col items-end text-right">
                <span className="text-foreground text-lg font-extrabold tabular-nums">
                  {total}
                </span>
                <span className="text-muted-foreground text-xs">
                  avaliações verificadas
                </span>
              </div>
            </div>

            {/* Distribuição de Estrelas Interativa (5★ a 1★) */}
            <div className="flex flex-col gap-1.5" role="list" aria-label="Distribuição por estrelas">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = counts[star] || 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const isSelected = ratingFilter === star;
                const barColor =
                  star >= 4
                    ? 'bg-emerald-500'
                    : star === 3
                      ? 'bg-amber-500'
                      : 'bg-rose-500';
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingFilter(isSelected ? 'all' : star)}
                    className={
                      'group grid w-full grid-cols-[2.2rem_minmax(0,1fr)_3.2rem] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer border ' +
                      (isSelected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-transparent bg-transparent hover:bg-muted/60')
                    }
                    title={
                      isSelected
                        ? 'Limpar filtro de estrelas'
                        : `Filtrar por ${star} estrelas (${count})`
                    }
                  >
                    <span className="text-foreground text-xs font-bold tabular-nums">
                      {star} ★
                    </span>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-right text-xs font-semibold tabular-nums">
                      {count} <span className="opacity-65">({pct}%)</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* CSAT de Áudio pós-consulta */}
            <div className="border-t border-border/70 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1 text-xs font-bold tracking-wider uppercase">
                  <GraphicEqIcon sx={{ fontSize: 15 }} /> Qualidade de Áudio
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {audioRated} reportados
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="success-light" size="default" radius="full">
                  🎧 Ótimo · {audioCounts.otimo}
                </Badge>
                <Badge variant="warning-light" size="default" radius="full">
                  OK · {audioCounts.ok}
                </Badge>
                <Badge variant="destructive-light" size="default" radius="full">
                  Ruim · {audioCounts.ruim}
                </Badge>
              </div>
            </div>

            {/* Top Sinais / Filtros Rápidos (review-3 Top Mentions) */}
            <div className="border-t border-border/70 pt-3">
              <span className="text-muted-foreground mb-2 block text-xs font-bold tracking-wider uppercase">
                Recortes Rápidos
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setRoleFilter(roleFilter === 'patient' ? 'all' : 'patient')}
                  className="cursor-pointer border-0 bg-transparent p-0"
                >
                  <Badge
                    variant={roleFilter === 'patient' ? 'default' : 'outline'}
                    size="default"
                    radius="full"
                  >
                    Pacientes · {roleCounts.patients}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter(roleFilter === 'doctor' ? 'all' : 'doctor')}
                  className="cursor-pointer border-0 bg-transparent p-0"
                >
                  <Badge
                    variant={roleFilter === 'doctor' ? 'default' : 'outline'}
                    size="default"
                    radius="full"
                  >
                    Médicos · {roleCounts.doctors}
                  </Badge>
                </button>
                {roleCounts.lowRatings > 0 && (
                  <button
                    type="button"
                    onClick={() => setRatingFilter(ratingFilter === 1 || ratingFilter === 2 ? 'all' : 2)}
                    className="cursor-pointer border-0 bg-transparent p-0"
                  >
                    <Badge variant="destructive-light" size="default" radius="full">
                      Risco / Atenção · {roleCounts.lowRatings}
                    </Badge>
                  </button>
                )}
              </div>
            </div>
          </FramePanel>

          {(ratingFilter !== 'all' || roleFilter !== 'all' || search.trim() !== '') && (
            <FrameFooter>
              <button
                type="button"
                onClick={() => {
                  setRatingFilter('all');
                  setRoleFilter('all');
                  setSearch('');
                }}
                className="text-primary hover:underline w-full cursor-pointer border-0 bg-transparent py-1 text-center text-xs font-bold"
              >
                Limpar filtros ativos ({filteredItems.length} exibidos)
              </button>
            </FrameFooter>
          )}
        </Frame>

        {/* Coluna Direita: Barra de Busca + Lista de Feedbacks */}
        <div className="flex min-w-0 flex-col gap-3.5">
          {/* Barra de Busca e Pílulas Mobile-First */}
          <Frame spacing="sm">
            <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TextField
                size="small"
                placeholder="Buscar paciente, médico, especialidade ou comentário…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary', fontSize: 19 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': { borderRadius: '10px' },
                }}
              />

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
                {(['all', 5, 4, 3, 2, 1] as const).map((st) => {
                  const active = ratingFilter === st;
                  return (
                    <button
                      key={String(st)}
                      type="button"
                      onClick={() => setRatingFilter(st)}
                      className={
                        'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors cursor-pointer border ' +
                        (active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground')
                      }
                    >
                      {st === 'all' ? 'Todas' : `${st}★`}
                    </button>
                  );
                })}
              </div>
            </FramePanel>
          </Frame>

          {/* Lista de Feedbacks (review-3 ReviewRow) */}
          <div className="flex flex-col gap-3">
            {filteredItems.map((item) => {
              const dateStr = new Date(item.createdAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const rawDocName = item.doctor?.name || '';
              const cleanDocName = rawDocName
                ? rawDocName.toLowerCase().startsWith('dr')
                  ? rawDocName
                  : `Dr(a). ${rawDocName}`
                : 'Médico da Consulta';
              const cleanCrm = item.doctor?.crm
                ? item.doctor.crm.replace(/(\/|-)([A-Za-z]{2})\/\2$/i, '-$2')
                : '';
              const cleanSpecialtyCrm = `${item.doctor?.specialty || 'Clínica Geral'}${
                cleanCrm ? ` · CRM ${cleanCrm}` : ''
              }`;
              const patPhoto = item.patient?.id ? photoUrlFor(item.patient.id) : undefined;
              const docPhoto = item.doctor?.id ? doctorPhotoUrl(item.doctor.id) : undefined;
              const isDoctorAuthor = item.role === 'doctor';

              return (
                <Frame key={item.id} spacing="sm">
                  <FramePanel className="flex flex-col gap-3">
                    {/* Topo: Paciente ⇄ Médico + Avaliação */}
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      {/* Participantes */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center md:flex-1">
                        {/* Paciente */}
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar
                            src={patPhoto}
                            sx={{
                              width: 42,
                              height: 42,
                              bgcolor: 'rgba(32,178,170,0.12)',
                              color: '#0d9488',
                              fontWeight: 800,
                              fontSize: 15,
                              borderRadius: '12px',
                              flexShrink: 0,
                            }}
                          >
                            {(item.patient?.name || 'P').charAt(0).toUpperCase()}
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-foreground truncate text-sm font-bold">
                                {item.patient?.name || 'Paciente'}
                              </span>
                              {!isDoctorAuthor && (
                                <Badge variant="primary-light" size="xs">
                                  Avaliador
                                </Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground flex items-center gap-1 text-xs">
                              <PersonIcon sx={{ fontSize: 13 }} /> Paciente
                            </span>
                          </div>
                        </div>

                        <span
                          aria-hidden="true"
                          className="text-muted-foreground hidden text-sm font-bold sm:inline"
                        >
                          →
                        </span>

                        {/* Médico */}
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar
                            src={docPhoto}
                            sx={{
                              width: 42,
                              height: 42,
                              bgcolor: 'rgba(184,138,84,0.16)',
                              color: '#b88a54',
                              fontWeight: 800,
                              fontSize: 15,
                              borderRadius: '12px',
                              flexShrink: 0,
                            }}
                          >
                            {(item.doctor?.name || 'M').charAt(0).toUpperCase()}
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-foreground truncate text-sm font-bold">
                                {cleanDocName}
                              </span>
                              {isDoctorAuthor && (
                                <Badge variant="info-light" size="xs">
                                  Avaliador
                                </Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                              <LocalHospitalIcon sx={{ fontSize: 13 }} /> {cleanSpecialtyCrm}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Nota Estrelas + Data */}
                      <div className="flex items-center justify-between gap-3 border-t border-dashed border-border pt-2.5 md:flex-col md:items-end md:justify-center md:border-t-0 md:pt-0">
                        <div className="flex items-center gap-2">
                          <Rating rating={item.rating} size="sm" />
                          <span className="text-foreground text-sm font-extrabold tabular-nums">
                            {item.rating.toFixed(1)}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {dateStr}
                        </span>
                      </div>
                    </div>

                    {/* Relato / Observação em Pull-Quote (review-3) */}
                    {item.note && (
                      <blockquote
                        className={
                          'm-0 rounded-xl border-l-4 bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed break-words ' +
                          (item.rating >= 4
                            ? 'border-l-emerald-500'
                            : item.rating === 3
                              ? 'border-l-amber-500'
                              : 'border-l-rose-500')
                        }
                      >
                        <p className="text-foreground m-0 italic">“{item.note}”</p>
                        <footer className="text-muted-foreground mt-1 text-xs font-semibold">
                          — Relato enviado pelo {isDoctorAuthor ? 'Médico' : 'Paciente'}
                        </footer>
                      </blockquote>
                    )}

                    {/* Rodapé de Metadados e Badges Semânticos */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge variant="success-outline" size="sm">
                        <VerifiedIcon sx={{ fontSize: 12 }} /> Consulta Verificada
                      </Badge>
                      <Badge variant="outline" size="sm" className="font-mono">
                        Sala #{String(item.teleId || '').slice(-5).toUpperCase()}
                      </Badge>
                      {item.reminder?.title && (
                        <Badge variant="outline" size="sm">
                          {item.reminder.title}
                        </Badge>
                      )}
                      {item.audioQuality && (
                        <Badge
                          variant={
                            item.audioQuality === 'otimo'
                              ? 'info-light'
                              : item.audioQuality === 'ok'
                                ? 'warning-light'
                                : 'destructive-light'
                          }
                          size="sm"
                        >
                          🎧 Áudio:{' '}
                          {item.audioQuality === 'otimo'
                            ? 'Ótimo'
                            : item.audioQuality === 'ok'
                              ? 'Regular'
                              : 'Ruim'}
                        </Badge>
                      )}
                      {item.rating >= 4 ? (
                        <Badge variant="success-light" size="sm">
                          Satisfação Alta
                        </Badge>
                      ) : item.rating <= 2 ? (
                        <Badge variant="destructive-light" size="sm">
                          Atenção / Risco de Churn
                        </Badge>
                      ) : null}
                    </div>
                  </FramePanel>
                </Frame>
              );
            })}

            {filteredItems.length === 0 && (
              <Frame>
                <FramePanel className="flex flex-col items-center justify-center py-10 text-center">
                  <RateReviewIcon sx={{ fontSize: 42, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Nenhum feedback encontrado
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 420 }}>
                    {search || ratingFilter !== 'all' || roleFilter !== 'all'
                      ? 'Nenhum resultado corresponde aos filtros selecionados.'
                      : 'Assim que as teleconsultas forem realizadas e avaliadas, as notas aparecerão aqui.'}
                  </Typography>
                </FramePanel>
              </Frame>
            )}
          </div>
        </div>
      </div>
    </Box>
  );
};
