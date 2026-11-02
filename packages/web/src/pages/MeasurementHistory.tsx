import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Button,
  Alert,
} from '@mui/material';
/** Reduced-motion 1× (charts draw-in e afins) — Recharts não tem gate global. */
const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
import { alpha, useTheme } from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { AppCard } from '../components/AppCard';
import { ListSkeleton } from '../components/Skeleton';
import { confirmDialog } from '../components/ConfirmDialog';
import { TYPES } from './Measurements';
import { tealText } from '../theme';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

/**
 * Histórico por métrica (/medicoes/historico/:type) — detalhe da "central de sinais"
 * elevado com o padrão ReUI solution-analytics-8 & chart-6 (KPI Rail 4-up + ComposedChart
 * com gradiente de área, linha de média e linha fantasma do período anterior).
 */
type Period = 'today' | '7d' | '30d' | '90d';
const PERIODS: Array<{ v: Period; l: string; days: number }> = [
  { v: 'today', l: 'Hoje', days: 1 },
  { v: '7d', l: '7 dias', days: 7 },
  { v: '30d', l: '30 dias', days: 30 },
  { v: '90d', l: '90 dias', days: 90 },
];

const fmtDate = (d: string) =>
  new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
const fmtVal = (m: any) =>
  m.valueSecondary != null ? `${m.value}/${m.valueSecondary}` : `${m.value}`;

export const MeasurementHistoryPage = () => {
  useReuiThemeSync();
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const [pid] = useSelectedPatient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [period, setPeriod] = useState<Period>('30d');

  const t = TYPES.find((x) => x.v === type);

  const load = async () => {
    if (!pid || !t) {
      setRows([]);
      return;
    }
    const r = await fetch(
      `${API_URL}/measurements?patientId=${pid}&type=${t.v}&take=400`,
      { headers: { Authorization: `Bearer ${token()}` } }
    );
    setRows(r.ok ? await r.json() : []);
  };
  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, type]);

  const del = async (id: string) => {
    if (
      !(await confirmDialog({
        title: 'Excluir medição',
        message: 'Apagar esta medição do histórico?',
        confirmLabel: 'Excluir',
      }))
    )
      return;
    await fetch(`${API_URL}/measurements/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    load();
  };

  // Série do GRÁFICO: dedup por dia (valor mais recente do dia) — 1 ponto/dia.
  const series = useMemo(() => {
    if (!rows) return [];
    const per = new Map<string, any>();
    for (const m of [...rows].sort(
      (a, b) =>
        new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
    )) {
      const key = String(m.measuredAt).slice(0, 10);
      if (!per.has(key)) per.set(key, m);
    }
    return [...per.entries()]
      .map(([date, m]) => ({ date, value: Number(m.value) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [rows]);

  const daysN = PERIODS.find((p) => p.v === period)!.days;
  const todayISO = new Date().toISOString().slice(0, 10);
  const inWindow = (isoDate: string) =>
    period === 'today'
      ? isoDate.slice(0, 10) === todayISO
      : new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).getTime() >=
        Date.now() - daysN * 86400000;
  const cur = series.filter((e) => inWindow(e.date));
  const prev =
    period === 'today'
      ? []
      : series.filter((e) => !inWindow(e.date)).slice(-cur.length || -daysN);
  const avg = (arr: { value: number }[]) =>
    arr.length ? arr.reduce((s, e) => s + e.value, 0) / arr.length : null;
  const avgCur = avg(cur);
  const avgPrev = avg(prev);
  const deltaPct =
    avgCur != null && avgPrev && avgPrev > 0
      ? Math.round(((avgCur - avgPrev) / avgPrev) * 100)
      : null;
  const fmt = (n: number) =>
    t?.u === 'km'
      ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
      : Math.round(n).toLocaleString('pt-BR');

  // Dados combinados para o gráfico (chart-6: atual + fantasma do período anterior alinhado por índice)
  const chartData = useMemo(() => {
    return cur.map((e, idx) => ({
      date: fmtDate(e.date),
      v: e.value,
      vArea: e.value,
      prevV: prev[idx]?.value ?? null,
    }));
  }, [cur, prev]);

  const maxPoint = useMemo(() => {
    if (!cur.length) return null;
    return cur.reduce((best, p) => (p.value > best.value ? p : best), cur[0]);
  }, [cur]);

  const minPoint = useMemo(() => {
    if (!cur.length) return null;
    return cur.reduce((best, p) => (p.value < best.value ? p : best), cur[0]);
  }, [cur]);

  // Tabela diária: TODAS as rows do período (manuais + HC no mesmo dia convivem).
  const tableRows = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .filter((m) => inWindow(String(m.measuredAt)))
      .sort(
        (a, b) =>
          new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, period]);

  if (!t) {
    return (
      <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
        <Alert severity="warning" sx={{ borderRadius: '12px' }}>
          Métrica desconhecida.
        </Alert>
        <Button
          onClick={() => navigate('/medicoes')}
          sx={{ mt: 2, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}
        >
          Voltar às medições
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<Box sx={{ display: 'inline-flex', color: t.color }}>{t.icon}</Box>}
        title={t.l}
        subtitle={
          rows
            ? `${tableRows.length} registro${
                tableRows.length === 1 ? '' : 's'
              } no período selecionado`
            : undefined
        }
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => navigate('/medicoes')}
            sx={{
              borderRadius: '999px',
              textTransform: 'none',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Registrar
          </Button>
        }
      />

      <ToggleButtonGroup
        exclusive
        size="small"
        value={period}
        onChange={(_, v) => {
          if (v) setPeriod(v as Period);
        }}
        aria-label="Período do histórico"
        sx={{
          mb: 2.5,
          '& .MuiToggleButton-root': {
            px: 1.75,
            py: { xs: 0.75, sm: 0.4 },
            minHeight: { xs: 40, sm: 34 },
            borderRadius: '99px !important',
            border: '1px solid',
            borderColor: 'divider',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: 13,
            color: 'text.secondary',
            '&.Mui-selected': {
              bgcolor: alpha(theme.palette.primary.main, 0.15),
              color: (th) => tealText(th.palette.mode),
              borderColor: alpha(theme.palette.primary.main, 0.4),
            },
          },
        }}
      >
        {PERIODS.map((p) => (
          <ToggleButton key={p.v} value={p.v} aria-pressed={period === p.v}>
            {p.l}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {rows === null && <ListSkeleton count={4} />}

      {rows !== null && rows.length === 0 && (
        <AppCard sx={{ p: 4, textAlign: 'center' }}>
          <Typography
            sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', mb: 0.5 }}
          >
            Nenhum registro de {t.l.toLowerCase()}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2, fontSize: 14 }}>
            {t.synced
              ? 'Os dados chegam pelo Health Connect — abra o app Dr. Exame no celular para sincronizar.'
              : 'Registre pela página de Medições e a tendência aparece aqui.'}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate('/medicoes')}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}
          >
            Ir às medições
          </Button>
        </AppCard>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* ReUI solution-analytics-8: 4-Up KPI Rail (Média, Máximo, Mínimo, Leituras) */}
          {cur.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Frame spacing="sm">
                <FramePanel className="flex flex-col justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                    Média no Período
                  </span>
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-foreground font-['Poppins',sans-serif] text-2xl font-extrabold tabular-nums">
                      {avgCur != null ? fmt(avgCur) : '—'}
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold">
                      {t.u}
                    </span>
                    {deltaPct != null && deltaPct !== 0 && (
                      <Badge
                        variant={deltaPct > 0 ? 'warning-light' : 'success-light'}
                        size="xs"
                      >
                        {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {avgPrev != null
                      ? `vs. ${fmt(avgPrev)} ${t.u} no período anterior`
                      : 'Base do período atual'}
                  </span>
                </FramePanel>
              </Frame>

              <Frame spacing="sm">
                <FramePanel className="flex flex-col justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                    Pico (Máximo)
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-foreground font-['Poppins',sans-serif] text-2xl font-extrabold tabular-nums">
                      {maxPoint ? fmt(maxPoint.value) : '—'}
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold">
                      {t.u}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {maxPoint ? `Registrado em ${fmtDate(maxPoint.date)}` : '—'}
                  </span>
                </FramePanel>
              </Frame>

              <Frame spacing="sm">
                <FramePanel className="flex flex-col justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                    Mínimo
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-foreground font-['Poppins',sans-serif] text-2xl font-extrabold tabular-nums">
                      {minPoint ? fmt(minPoint.value) : '—'}
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold">
                      {t.u}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {minPoint ? `Registrado em ${fmtDate(minPoint.date)}` : '—'}
                  </span>
                </FramePanel>
              </Frame>

              <Frame spacing="sm">
                <FramePanel className="flex flex-col justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                    Leituras
                  </span>
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-foreground font-['Poppins',sans-serif] text-2xl font-extrabold tabular-nums">
                      {tableRows.length}
                    </span>
                    <Badge
                      variant={t.synced ? 'primary-light' : 'outline'}
                      size="xs"
                    >
                      {t.synced ? 'Smartwatch' : 'Manual'}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {cur.length} dia{cur.length === 1 ? '' : 's'} com medição
                  </span>
                </FramePanel>
              </Frame>
            </div>
          )}

          {/* ReUI solution-analytics-8 + chart-6: ComposedChart com Área Gradiente + Linha + Média + Período Anterior */}
          {cur.length >= 2 && (
            <Frame>
              <FrameHeader className="flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <FrameTitle>Curva de Tendência · {t.l}</FrameTitle>
                  <FrameDescription>
                    Evolução diária com linha tracejada da média do período
                  </FrameDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-foreground font-semibold">{t.l}</span>
                  </span>
                  {prev.length >= 2 && (
                    <span className="flex items-center gap-1.5">
                      <span className="bg-muted-foreground/45 size-2 rounded-full" />
                      <span className="text-muted-foreground">Período anterior</span>
                    </span>
                  )}
                </div>
              </FrameHeader>

              <FramePanel>
                <Box sx={{ height: { xs: 210, sm: 250 }, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 10, right: 12, bottom: 4, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={t.color} stopOpacity={0.24} />
                          <stop offset="100%" stopColor={t.color} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="4 4"
                        stroke="var(--border)"
                        strokeOpacity={0.6}
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        tickMargin={8}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        width={38}
                      />
                      {avgCur != null && (
                        <ReferenceLine
                          y={Math.round(avgCur * 100) / 100}
                          stroke={t.color}
                          strokeDasharray="4 4"
                          strokeOpacity={0.55}
                          ifOverflow="extendDomain"
                        />
                      )}
                      <Tooltip
                        cursor={{
                          stroke: t.color,
                          strokeWidth: 1,
                          strokeDasharray: '4 3',
                        }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as {
                            v: number;
                            prevV: number | null;
                            date: string;
                          };
                          return (
                            <div className="bg-popover border-border min-w-[140px] rounded-xl border p-2.5 shadow-md">
                              <div className="text-muted-foreground mb-1.5 text-[11px] font-bold tracking-wider uppercase">
                                {d.date}
                              </div>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  <span className="text-muted-foreground">Atual</span>
                                </span>
                                <span className="text-foreground font-extrabold tabular-nums">
                                  {fmt(d.v)} {t.u}
                                </span>
                              </div>
                              {d.prevV != null && (
                                <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                                  <span className="text-muted-foreground">Anterior</span>
                                  <span className="text-muted-foreground font-semibold tabular-nums">
                                    {fmt(d.prevV)} {t.u}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="vArea"
                        fill="url(#metricGrad)"
                        stroke="transparent"
                        isAnimationActive={!REDUCED_MOTION}
                      />
                      {prev.length >= 2 && (
                        <Line
                          type="monotone"
                          dataKey="prevV"
                          stroke="var(--muted-foreground)"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          strokeOpacity={0.45}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={t.color}
                        strokeWidth={2.5}
                        dot={{
                          r: 3,
                          fill: 'var(--background)',
                          stroke: t.color,
                          strokeWidth: 2,
                        }}
                        activeDot={{
                          r: 5,
                          fill: t.color,
                          stroke: 'var(--background)',
                          strokeWidth: 2,
                        }}
                        isAnimationActive={!REDUCED_MOTION}
                        animationDuration={800}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
              </FramePanel>

              {avgCur != null && (
                <FrameFooter className="flex-row flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    Linha tracejada indica a média do período:{' '}
                    <strong className="text-foreground font-bold tabular-nums">
                      {fmt(avgCur)} {t.u}
                    </strong>
                  </span>
                  <Badge variant="outline" size="xs">
                    1 leitura consolidada por dia no gráfico
                  </Badge>
                </FrameFooter>
              )}
            </Frame>
          )}

          {/* Tabela diária de leituras em ReUI Frame */}
          <Frame>
            <FrameHeader>
              <div className="flex items-center justify-between gap-2">
                <FrameTitle>Histórico Detalhado de Leituras</FrameTitle>
                <Badge variant="outline" size="xs">
                  {tableRows.length} registro{tableRows.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <FrameDescription>
                Todas as medições manuais e sincronizadas do período selecionado
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="p-0">
              {tableRows.length === 0 ? (
                <Typography
                  sx={{
                    p: 3,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontSize: 14,
                  }}
                >
                  Nenhum registro neste período.
                </Typography>
              ) : (
                tableRows.map((m) => (
                  <Stack
                    key={m.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      px: 2,
                      py: 1.35,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography
                          sx={{
                            fontWeight: 800,
                            fontSize: 14.5,
                            color: 'text.primary',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmtVal(m)}{' '}
                          <Typography
                            component="span"
                            sx={{ fontSize: 12, color: 'text.disabled' }}
                          >
                            {m.unit}
                          </Typography>
                        </Typography>
                        {m.note?.toLowerCase().includes('health connect') && (
                          <Badge variant="primary-light" size="xs">
                            Health Connect
                          </Badge>
                        )}
                      </div>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block', mt: 0.2 }}
                      >
                        {new Date(m.measuredAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        {m.note ? ` · ${m.note}` : ''}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      aria-label={`Excluir medição de ${t.l} de ${new Date(
                        m.measuredAt
                      ).toLocaleDateString('pt-BR')}`}
                      onClick={() => del(m.id)}
                      sx={{
                        color: 'text.disabled',
                        '&:hover': { color: 'error.main' },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))
              )}
            </FramePanel>
          </Frame>

          <Alert
            severity="info"
            icon={false}
            sx={{
              borderRadius: '12px',
              '& .MuiAlert-message': { fontSize: 13 },
            }}
          >
            Estes dados informam, não diagnosticam — converse com seu médico sobre
            o que significam no seu caso.
          </Alert>
        </div>
      )}
    </PageContainer>
  );
};
