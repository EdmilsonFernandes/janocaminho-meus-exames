/**
 * Evolução da composição corporal — adaptação do bloco ReUI chart-6 ("Metric Switcher"):
 * quatro blocos que trocam um único gráfico de área. Diferenças de propósito:
 *  - cada ponto é uma AVALIAÇÃO (datas irregulares), não um dia de uma série contínua;
 *  - não existe "período anterior": a comparação é com a avaliação anterior;
 *  - o eixo Y não parte do zero (peso de 0 a 90 achataria a variação que interessa);
 *  - a variação não ganha cor de bom/ruim — subir ou descer depende do objetivo de cada um.
 */
import { useId, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { cn } from 'cn';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, ReferenceArea, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { Badge } from '@/components/reui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  METRICS, deltaOf, deviceLabel, formatDate, formatDelta, formatMetric, formatShortDate, formatWithUnit,
  type BodyReading, type MetricKey, type RangeInfo,
} from './model';

/** Apara o rótulo nas maiúsculas, para alinhar com o que estiver ao lado (linha de altura fixa). */
const CAP_BOX = '[text-box:trim-both_cap_alphabetic]';
const CAP_TRUNCATE = `${CAP_BOX} overflow-x-clip text-ellipsis whitespace-nowrap`;

/** Divisores de uma grade 2×2 que vira uma linha de 4 em @xl. */
const DIVIDERS = ['', 'border-s', 'border-t @xl:border-s @xl:border-t-0', 'border-s border-t @xl:border-t-0'];

function DeltaBadge({ metric, delta }: { metric: MetricKey; delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground">Primeira avaliação</span>;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      <span className={cn(CAP_BOX, 'tabular-nums')}>{delta === 0 ? 'Sem mudança' : formatDelta(metric, delta)}</span>
    </Badge>
  );
}

/** Um bloco por medida, de borda a borda no painel; tocar em um troca o gráfico. */
export function TrendTiles({
  keys,
  active,
  latest,
  previous,
  onSelect,
}: {
  keys: MetricKey[];
  active: MetricKey;
  latest: BodyReading;
  previous: BodyReading | undefined;
  onSelect: (key: MetricKey) => void;
}) {
  const index = Math.max(0, keys.indexOf(active));
  const slot = {
    '--bc-x2': `${(index % 2) * 100}%`,
    '--bc-y2': `${Math.floor(index / 2) * 100}%`,
    '--bc-x4': `${index * 100}%`,
  } as CSSProperties;
  return (
    <div
      role="group"
      aria-label="Medida do gráfico"
      className="relative -mx-(--frame-panel-px) -my-(--frame-panel-py) grid auto-rows-fr grid-cols-2 @xl:grid-cols-4"
    >
      {keys.map((key, position) => {
        const spec = METRICS[key];
        const value = latest[key];
        const pressed = key === active;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(key)}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col items-start gap-2.5 border-0 border-border bg-transparent px-(--frame-panel-px) py-(--frame-panel-py) text-start font-[inherit] text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
              DIVIDERS[position],
            )}
          >
            <span className="flex h-5 w-full min-w-0 items-center">
              <span className={cn(CAP_TRUNCATE, 'min-w-0 text-sm transition-colors', pressed ? 'text-foreground' : 'text-muted-foreground')}>
                {spec.short}
              </span>
            </span>
            <span className="flex items-baseline gap-1">
              <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
                {value == null ? '—' : formatMetric(key, value)}
              </span>
              {value == null ? null : <span className="text-sm text-muted-foreground">{spec.unit}</span>}
            </span>
            <span className="flex h-5 min-w-0 items-center gap-1.5">
              <DeltaBadge metric={key} delta={deltaOf(key, latest, previous)} />
            </span>
          </button>
        );
      })}
      {/* O indicador desliza entre os blocos em vez de pular; com movimento reduzido, pula. */}
      <span
        aria-hidden="true"
        style={slot}
        className="pointer-events-none absolute start-0 top-0 h-1/2 w-1/2 translate-x-(--bc-x2) translate-y-(--bc-y2) transition-[translate] duration-300 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none @xl:h-full @xl:w-1/4 @xl:translate-x-(--bc-x4) @xl:translate-y-0"
      >
        <span className={cn('absolute inset-x-(--frame-panel-px) bottom-0 h-0.5 rounded-full transition-colors duration-300', METRICS[active].swatch)} />
      </span>
    </div>
  );
}

interface PlotRow {
  t: number;
  value: number;
  reading: BodyReading;
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const subscribeReduced = (notify: () => void) => {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const readReduced = () => window.matchMedia(REDUCED_QUERY).matches;

const MARGIN = { top: 16, right: 12, bottom: 0, left: 0 };
const ACTIVE_DOT = { r: 4.5, fill: 'currentColor', stroke: 'var(--card)', strokeWidth: 2 };
const DOT = { r: 3, fill: 'currentColor', stroke: 'var(--card)', strokeWidth: 1.5 };

/** Graduações redondas que cobrem [lo, hi] com folga, em no máximo cinco intervalos. */
function valueTicks(lo: number, hi: number) {
  const pad = Math.max((hi - lo) * 0.15, hi * 0.01, 0.5);
  const from = Math.max(0, lo - pad);
  const to = hi + pad;
  const raw = (to - from) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((unit) => unit * power).find((size) => (to - from) / size <= 5) ?? 10 * power;
  const start = Math.floor(from / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick < to + step; tick += step) ticks.push(Math.round(tick * 1000) / 1000);
  return ticks;
}

export function TrendPlot({
  readings,
  metric,
  band,
}: {
  /** Mais antiga primeiro. */
  readings: BodyReading[];
  metric: MetricKey;
  /** Faixa de referência desenhada atrás da série (só quando existe uma para a medida). */
  band: RangeInfo | null;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduced = useSyncExternalStore(subscribeReduced, readReduced, () => false);
  const spec = METRICS[metric];
  const rows = useMemo<PlotRow[]>(
    () =>
      readings.flatMap((reading) => {
        const value = reading[metric];
        return value == null ? [] : [{ t: new Date(reading.measuredAt).getTime(), value, reading }];
      }),
    [readings, metric],
  );
  const ticks = useMemo(() => {
    const values = rows.map((row) => row.value);
    if (band) values.push(band.low, band.high);
    return values.length ? valueTicks(Math.min(...values), Math.max(...values)) : [0, 1];
  }, [rows, band]);
  // No máximo 5 datas no eixo; a primeira e a última sempre aparecem.
  const xTicks = useMemo(() => {
    if (rows.length <= 5) return rows.map((row) => row.t);
    const every = Math.ceil((rows.length - 1) / 4);
    return rows.filter((_, i) => (rows.length - 1 - i) % every === 0).map((row) => row.t);
  }, [rows]);
  const config = useMemo(() => ({ value: { label: spec.label } }), [spec.label]);

  if (rows.length < 2) {
    return (
      <p className="m-0 flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {rows.length === 0
          ? `Nenhuma avaliação registrou ${spec.label.toLowerCase()}.`
          : 'O gráfico aparece a partir da segunda avaliação com esta medida.'}
      </p>
    );
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const label = `${spec.label} em ${rows.length} avaliações, de ${formatDate(first.reading.measuredAt)} a ${formatDate(last.reading.measuredAt)}: de ${formatWithUnit(metric, first.value)} para ${formatWithUnit(metric, last.value)}. Use as setas para percorrer as avaliações.`;

  return (
    <ChartContainer
      config={config}
      role="group"
      aria-label={label}
      className="aspect-auto h-64 w-full min-w-0 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 [&_[class*=recharts-zIndex-layer]]:outline-hidden"
      initialDimension={{ width: 340, height: 256 }}
    >
      <ComposedChart accessibilityLayer data={rows} margin={MARGIN}>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1" className={spec.ink}>
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={xTicks}
          interval={0}
          tickFormatter={formatShortDate}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          padding={{ left: 16, right: 16 }}
        />
        <YAxis
          ticks={ticks}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          tickFormatter={(value: number) => value.toLocaleString('pt-BR')}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          width={40}
        />
        {band ? (
          <ReferenceArea
            y1={band.low}
            y2={band.high}
            fill="var(--success)"
            fillOpacity={0.08}
            stroke="var(--success)"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            ifOverflow="hidden"
          />
        ) : null}
        <ChartTooltip isAnimationActive={false} content={<Readout metric={metric} />} />
        <Area
          dataKey="value"
          type="monotone"
          stroke="currentColor"
          strokeWidth={2}
          fill={`url(#${id}-fill)`}
          dot={DOT}
          activeDot={ACTIVE_DOT}
          isAnimationActive={!reduced}
          animationDuration={400}
          animationEasing="ease-out"
          className={spec.ink}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-4 items-center justify-between gap-6">
      <span className={cn(CAP_BOX, 'text-muted-foreground')}>{label}</span>
      <span className={cn(CAP_BOX, 'font-medium tabular-nums')}>{value}</span>
    </div>
  );
}

/** A avaliação lida: a data, o valor com unidade e em que aparelho foi medida. */
function Readout({
  active,
  payload,
  metric,
}: Partial<Pick<TooltipContentProps, 'active' | 'payload'>> & { metric: MetricKey }) {
  const row: PlotRow | undefined = payload?.[0]?.payload;
  if (!active || !row || !payload) return null;
  return (
    <ChartTooltipContent
      active
      payload={payload}
      className="min-w-48 gap-2"
      labelFormatter={() => <span className={CAP_BOX}>{formatDate(row.reading.measuredAt)}</span>}
      formatter={() => (
        <div className="flex flex-1 flex-col gap-1.5">
          <ReadoutRow label={METRICS[metric].label} value={formatWithUnit(metric, row.value)} />
          <ReadoutRow label="Aparelho" value={deviceLabel(row.reading)} />
        </div>
      )}
    />
  );
}
