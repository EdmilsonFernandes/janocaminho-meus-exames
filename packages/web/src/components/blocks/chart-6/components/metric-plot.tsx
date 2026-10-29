import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  DefaultZIndexes,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
  ZIndexLayer,
  type DotItemDotProps,
  type TooltipContentProps,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

import {
  chartConfigOf,
  type MetricSpec,
  type RangeKey,
  type ViewState,
} from "./data"
import {
  formatAxis,
  formatChange,
  formatDay,
  formatLongDay,
  formatValue,
} from "./format"
import { TREND_ICONS } from "./icons"
import {
  annotationOn,
  annotationsIn,
  averageOf,
  previousDay,
  toneOf,
  type PlotRow,
} from "./series"
import { CAP_BOX, MetricDot, PreviousKey, TEXT_TONES } from "./value-faces"

/** Every series moves in one rhythm: data changes settle in 400ms. */
const SERIES_MOTION = {
  animationDuration: 400,
  animationEasing: "ease-out",
} as const
// Module scope, so a re-render hands Recharts the same objects.
const MARGIN = { top: 28, right: 12, bottom: 0, left: 0 }
const AXIS_WIDTH = 48
/** The event labels ride the margin above the plot. */
const LABEL_OFFSET = 10
/** A text-xs character's rough width, and the air between two labels. */
const LABEL_CHAR_PX = 6.4
const LABEL_GAP = 12
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
/** New axis figures fade in, the house view-switch length. */
const AXIS_FADE_MS = 150
/** What moves with the series takes their beat: Recharts' "ease-out" is the
 *  CSS keyword, so both settle together. */
const SERIES_BEAT = "duration-400 ease-[ease-out]"
/** Context placed by translate or scale glides on the series' beat. */
const GLIDE = `transition-[translate,scale] ${SERIES_BEAT}`
/** A new metric's colour eases in with its line. */
const COLOR_TWEEN = `transition-[color,stop-color] ${SERIES_BEAT}`
/** A layer toggle is a quick state change: a short fade, never a keyframe. */
const LAYER_FADE =
  "transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"

const subscribeNothing = () => () => {}
const readFrozenDemo = () => document.documentElement.dataset.demo === "frozen"
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"
const subscribeReduced = (notify: () => void) => {
  const query = window.matchMedia(REDUCED_QUERY)
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}
const readReduced = () => window.matchMedia(REDUCED_QUERY).matches

/** Series motion is off for the frozen demo and under reduced motion. */
function useStillSeries() {
  const frozen = useSyncExternalStore(
    subscribeNothing,
    readFrozenDemo,
    () => false
  )
  const reduced = useSyncExternalStore(
    subscribeReduced,
    readReduced,
    () => false
  )
  return frozen || reduced
}

/** Round ticks from zero: the tightest step that covers the tallest point,
 *  with a little air, in at most five intervals. */
function valueTicks(max: number) {
  const top = max * 1.08
  const power = 10 ** Math.floor(Math.log10(top / 4))
  const step =
    [1, 2, 2.5, 5, 10]
      .map((unit) => unit * power)
      .find((size) => Math.ceil(top / size) <= 5) ?? 10 * power
  const ticks: number[] = []
  for (let tick = 0; tick <= Math.ceil(top / step) * step; tick += step) {
    ticks.push(tick)
  }
  return ticks
}

/** Every day for a week, weekly for a month, every other week beyond, each
 *  counted back from the latest day so it always carries a tick. */
function dayTicks(rows: PlotRow[]) {
  const every = rows.length <= 7 ? 1 : rows.length <= 31 ? 7 : 14
  return rows
    .filter((_, index) => (rows.length - 1 - index) % every === 0)
    .map((row) => row.day)
}

type PlotScope = {
  rows: PlotRow[]
  metric: MetricSpec
  range: RangeKey
  previous: boolean
  average: number
}
const PlotContext = createContext<PlotScope | null>(null)

export function MetricPlot({
  rows,
  metric,
  view,
  label,
}: {
  rows: PlotRow[]
  metric: MetricSpec
  view: ViewState
  label: string
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const still = useStillSeries()
  const plotRef = useRef<HTMLDivElement>(null)
  const average = averageOf(rows)
  const scope = useMemo(
    () => ({
      rows,
      metric,
      range: view.range,
      previous: view.previous,
      average,
    }),
    [rows, metric, view.range, view.previous, average]
  )
  // Axis inputs keep their identity between switches: Recharts compares them
  // by reference and restarts the series tween on any new one.
  const ticks = useMemo(
    () =>
      valueTicks(
        Math.max(...rows.flatMap((row) => [row.current, row.previous]))
      ),
    [rows]
  )
  const xTicks = useMemo(() => dayTicks(rows), [rows])
  // New axis figures fade in while the series glide; the grid joins them
  // only when its lines move.
  const shownTicks = useRef({ y: ticks.join(), x: xTicks.join() })
  useLayoutEffect(() => {
    const shown = shownTicks.current
    const next = { y: ticks.join(), x: xTicks.join() }
    shownTicks.current = next
    // Frozen demo guard: ?demo=frozen pins the demo, so nothing animates.
    if (still || document.documentElement.dataset.demo === "frozen") return
    const fadeIn = (selector: string) =>
      plotRef.current?.querySelectorAll(selector).forEach((node) =>
        node.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: AXIS_FADE_MS,
          easing: EASE_OUT,
        })
      )
    if (shown.y !== next.y) {
      fadeIn(".recharts-yAxis .recharts-cartesian-axis-tick-labels")
    }
    if (shown.y.split(",").length !== ticks.length) {
      fadeIn(".recharts-cartesian-grid-horizontal")
    }
    if (shown.x !== next.x) {
      fadeIn(".recharts-xAxis .recharts-cartesian-axis-tick-labels")
    }
  }, [ticks, xTicks, still])
  const formatTick = useCallback(
    (value: number) => formatAxis(metric.key, value),
    [metric.key]
  )
  const config = useMemo(() => chartConfigOf(metric), [metric])

  return (
    <div
      ref={plotRef}
      data-previous={view.previous ? "on" : "off"}
      data-annotations={view.annotations ? "on" : "off"}
      data-average={view.average ? "on" : "off"}
      data-grid={view.grid ? "on" : "off"}
      className="group/c6 w-full min-w-0 [&_.recharts-cartesian-grid]:transition-opacity [&_.recharts-cartesian-grid]:duration-200 data-[grid=off]:[&_.recharts-cartesian-grid]:opacity-0"
    >
      <PlotContext.Provider value={scope}>
        {/* A click focuses Recharts' layer group; only keyboard focus
            rings. */}
        <ChartContainer
          config={config}
          role="group"
          aria-label={label}
          className="has-[:focus-visible]:ring-ring/50 aspect-auto h-72 w-full min-w-0 has-[:focus-visible]:ring-[3px] [&_[class*=recharts-zIndex-layer]]:outline-hidden"
          initialDimension={{ width: 820, height: 288 }}
        >
          <ComposedChart accessibilityLayer data={rows} margin={MARGIN}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-current)"
                  className={COLOR_TWEEN}
                  stopOpacity={0.22}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-current)"
                  className={COLOR_TWEEN}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              ticks={xTicks}
              interval={0}
              tickFormatter={formatDay}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              tickFormatter={formatTick}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={AXIS_WIDTH}
            />
            <ZIndexLayer zIndex={DefaultZIndexes.area - 10}>
              <Annotations />
            </ZIndexLayer>
            <ZIndexLayer zIndex={DefaultZIndexes.line + 10}>
              <AverageRule />
            </ZIndexLayer>
            <ChartTooltip
              isAnimationActive={false}
              payloadUniqBy={ONE_READOUT}
              content={<Readout />}
            />
            {/* Stays mounted and fades: a remounted series would re-register
                last and replay its entrance. */}
            <Area
              dataKey="previous"
              type="monotone"
              stroke="var(--color-previous)"
              strokeOpacity={0.7}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
              activeDot={view.previous ? PREVIOUS_DOT : false}
              tooltipType={view.previous ? undefined : "none"}
              isAnimationActive={!still}
              {...SERIES_MOTION}
              className={cn(
                LAYER_FADE,
                "group-data-[previous=off]/c6:opacity-0"
              )}
            />
            {/* The curve and its end mark paint in currentColor: Recharts
                remounts them for every tween, so the colour eases here. */}
            <Area
              dataKey="current"
              type="monotone"
              stroke="currentColor"
              strokeWidth={2}
              fill={`url(#${id}-fill)`}
              dot={renderEndMark}
              activeDot={CURRENT_DOT}
              isAnimationActive={!still}
              {...SERIES_MOTION}
              className={cn("text-(--color-current)", COLOR_TWEEN)}
            />
          </ComposedChart>
        </ChartContainer>
      </PlotContext.Provider>
    </div>
  )
}

/** One readout per day, however many series the pointer crosses. */
const ONE_READOUT = () => "day"

const CURRENT_DOT = {
  r: 4,
  fill: "var(--color-current)",
  stroke: "var(--card)",
  strokeWidth: 2,
}
const PREVIOUS_DOT = {
  r: 3,
  fill: "var(--color-previous)",
  stroke: "var(--card)",
  strokeWidth: 1.5,
}

// Module scope keeps the dot prop one identity; Recharts draws it from the
// interpolated points, so the end mark rides the morphing line.
const renderEndMark = (props: DotItemDotProps) => <EndMark {...props} />

/** The latest day: a haloed dot and its figure, above it unless the line
 *  runs too close to the top. */
function EndMark({ cx, cy, index }: DotItemDotProps) {
  const scope = useContext(PlotContext)
  const plot = usePlotArea()
  if (!scope || !plot || cx == null || cy == null) return null
  // An area's dot value is its [base, top] pair, so the figure comes from
  // the row.
  const row = scope.rows[index]
  if (index !== scope.rows.length - 1 || !row) return null
  const above = cy - 22 >= plot.y
  return (
    <g aria-hidden="true" className="pointer-events-none">
      <circle cx={cx} cy={cy} r={7} fill="currentColor" fillOpacity={0.16} />
      <circle
        cx={cx}
        cy={cy}
        r={3.5}
        fill="currentColor"
        stroke="var(--card)"
        strokeWidth={1.5}
      />
      {/* A panel-coloured halo keeps the figure legible over the fill. */}
      <text
        x={cx - 10}
        y={above ? cy - 10 : cy + 18}
        textAnchor="end"
        stroke="var(--card)"
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
        className="fill-foreground text-xs font-medium tabular-nums"
      >
        {formatValue(scope.metric.key, row.current)}
      </text>
    </g>
  )
}

/** Events inside the shown days: a release as a hairline, a sale as a soft
 *  band, each named in the margin above the plot. */
function Annotations() {
  const scope = useContext(PlotContext)
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  if (!scope || !plot || !xScale || scope.rows.length === 0) return null
  const step = plot.width / scope.rows.length
  const first = scope.rows[0].day
  const last = scope.rows[scope.rows.length - 1].day
  const xOf = (day: number) =>
    xScale(Math.min(last, Math.max(first, day)), { position: "middle" })
  const marks = annotationsIn(scope.rows).flatMap((item) => {
    const from = xOf(item.from)
    const to = xOf(item.to)
    if (from === undefined || to === undefined) return []
    const band = item.kind === "band"
    const left = band ? from - step / 2 : from
    return [{ item, band, left, width: band ? to - from + step : 0 }]
  })
  // Labels go left to right, each clear of the one before; one that cannot
  // fit is left out, while its line or band still draws.
  let edge = plot.x
  const labels = marks.map(({ item, left, width }) => {
    const half = (item.label.length * LABEL_CHAR_PX) / 2
    const wanted = Math.max(left + width / 2, plot.x + half)
    const x = Math.max(wanted, edge + LABEL_GAP + half)
    if (x + half > plot.x + plot.width) return null
    edge = x + half
    return x
  })
  return (
    <g
      aria-hidden="true"
      className={cn(
        "pointer-events-none",
        LAYER_FADE,
        "group-data-[annotations=off]/c6:opacity-0"
      )}
    >
      {marks.map(({ item, band, left, width }, index) => {
        const labelX = labels[index]
        return (
          <g key={item.id}>
            {/* Placed by translate and scale, so a range switch glides the
                event with the series instead of jumping it. */}
            {band ? (
              <rect
                y={plot.y}
                width={1}
                height={plot.height}
                fill="var(--muted-foreground)"
                fillOpacity={0.08}
                style={{ translate: `${left}px 0`, scale: `${width} 1` }}
                className={GLIDE}
              />
            ) : (
              <line
                y1={plot.y}
                y2={plot.y + plot.height}
                style={{ translate: `${left}px 0` }}
                className={GLIDE}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.5}
                strokeDasharray="2 3"
              />
            )}
            {labelX == null ? null : (
              <text
                y={plot.y - LABEL_OFFSET}
                textAnchor="middle"
                style={{ translate: `${labelX}px 0` }}
                className={cn("fill-muted-foreground text-xs", GLIDE)}
              >
                {item.label}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** The window's daily mean as a dotted rule; the legend names its figure,
 *  so no label ever lands on the line. */
function AverageRule() {
  const scope = useContext(PlotContext)
  const plot = usePlotArea()
  const yScale = useYAxisScale()
  const y = scope ? yScale?.(scope.average) : undefined
  if (!scope || !plot || y === undefined) return null
  // The group glides to the new mean with the series; the rule fades.
  return (
    <g
      aria-hidden="true"
      style={{ translate: `0 ${y}px` }}
      className={cn("pointer-events-none", GLIDE)}
    >
      <line
        x1={plot.x}
        x2={plot.x + plot.width}
        stroke="var(--foreground)"
        strokeOpacity={0.45}
        strokeDasharray="1 3"
        strokeLinecap="round"
        className={cn(
          LAYER_FADE,
          "opacity-0 group-data-[average=on]/c6:opacity-100"
        )}
      />
    </g>
  )
}

/** A readout row: a 16px glyph slot, the label, then the figure. */
function ReadoutRow({
  glyph,
  label,
  value,
  className,
}: {
  glyph: ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={cn("flex h-4 items-center justify-between gap-6", className)}
    >
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <span className="flex size-4 shrink-0 items-center justify-center">
          {glyph}
        </span>
        <span className={CAP_BOX}>{label}</span>
      </span>
      <span className={cn(CAP_BOX, "font-medium tabular-nums")}>{value}</span>
    </div>
  )
}

/** The read day: its date and any event on it, this period against the
 *  same day of the previous one, and the change between them. */
function Readout({
  active,
  payload,
}: Partial<Pick<TooltipContentProps, "active" | "payload">>) {
  const scope = useContext(PlotContext)
  const row: PlotRow | undefined = payload?.[0]?.payload
  if (!active || !row || !scope || !payload) return null
  const { metric, range } = scope
  const event = annotationOn(row.day)
  const change = row.current / row.previous - 1
  return (
    <ChartTooltipContent
      active
      payload={payload}
      className="min-w-52 gap-2"
      labelFormatter={() => (
        <span className="flex h-5 items-center justify-between gap-4">
          <span className={CAP_BOX}>{formatLongDay(row.day)}</span>
          {event ? <Badge variant="outline">{event.label}</Badge> : null}
        </span>
      )}
      formatter={() => (
        <div className="flex flex-1 flex-col gap-1.5">
          <ReadoutRow
            glyph={<MetricDot swatch={metric.swatch} />}
            label={metric.label}
            value={formatValue(metric.key, row.current)}
          />
          {scope.previous ? (
            <>
              <ReadoutRow
                glyph={<PreviousKey />}
                label={formatDay(previousDay(row.day, range))}
                value={formatValue(metric.key, row.previous)}
              />
              {/* The tone says how the change reads; the arrow only says
                  which way it went. */}
              <div className="border-t pt-1.5">
                <ReadoutRow
                  glyph={change >= 0 ? TREND_ICONS.up : TREND_ICONS.down}
                  label="Change"
                  value={formatChange(change)}
                  className={TEXT_TONES[toneOf(metric, change)]}
                />
              </div>
            </>
          ) : null}
        </div>
      )}
    />
  )
}