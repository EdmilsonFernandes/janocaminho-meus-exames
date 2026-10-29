import { type ChartConfig } from "@/components/ui/chart"

// ── Types ──

export type MetricKey = "orders" | "revenue" | "users" | "latency"
export type RangeKey = "7d" | "30d" | "90d"

export type DayRow = { day: number } & Record<MetricKey, number>

export type MetricSpec = {
  key: MetricKey
  label: string
  /** How the tile rolls a window up: a total, or a daily mean. */
  rollup: "sum" | "mean"
  /** Latency is good news when it falls. */
  better: "up" | "down"
  /** The chart's stroke and fill. */
  color: string
  /** The tile's indicator and key dot, as a static class. */
  swatch: string
}

export type Annotation = {
  id: string
  label: string
  kind: "marker" | "band"
  from: number
  to: number
}

export type LayerKey = "previous" | "annotations" | "average" | "grid"

export type ViewState = { metric: MetricKey; range: RangeKey } & Record<
  LayerKey,
  boolean
>

// ── Calendar ──

export const DAY_MS = 86_400_000
/** The demo's fixed "today". */
export const REFERENCE_DAY = Date.UTC(2026, 5, 30)
const DAY_COUNT = 180

export const RANGES = [
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
] as const satisfies readonly { value: RangeKey; label: string; days: number }[]

export const rangeOf = (value: RangeKey) =>
  RANGES.find((range) => range.value === value) ?? RANGES[1]

// ── Metrics ──

export const METRICS = [
  {
    key: "orders",
    label: "Orders",
    rollup: "sum",
    better: "up",
    color: "var(--color-teal-500)",
    swatch: "bg-teal-500",
  },
  {
    key: "revenue",
    label: "Revenue",
    rollup: "sum",
    better: "up",
    color: "var(--color-amber-500)",
    swatch: "bg-amber-500",
  },
  {
    key: "users",
    label: "Active Users",
    rollup: "mean",
    better: "up",
    color: "var(--color-sky-500)",
    swatch: "bg-sky-500",
  },
  {
    key: "latency",
    label: "p95 Latency",
    rollup: "mean",
    better: "down",
    color: "var(--color-violet-500)",
    swatch: "bg-violet-500",
  },
] as const satisfies readonly MetricSpec[]

export const metricOf = (key: MetricKey): MetricSpec =>
  METRICS.find((metric) => metric.key === key) ?? METRICS[0]

// ── Events ──

const RELEASE_DAY = Date.UTC(2026, 5, 4)
/** Promo pricing trims every basket for three weeks of June. */
const PROMO_FROM = Date.UTC(2026, 5, 1)
const PROMO_TO = Date.UTC(2026, 5, 22)
/** A rival's launch: active users drift down from here to the end. */
const CHURN_FROM = Date.UTC(2026, 4, 11)

export const ANNOTATIONS = [
  {
    id: "release",
    label: "v4.2 Release",
    kind: "marker",
    from: RELEASE_DAY,
    to: RELEASE_DAY,
  },
  {
    id: "sale",
    label: "Summer Sale",
    kind: "band",
    from: Date.UTC(2026, 5, 12),
    to: Date.UTC(2026, 5, 14),
  },
] as const satisfies readonly Annotation[]

const SALE = ANNOTATIONS[1]

// ── Daily figures ──

/** Sunday first: weekend trade runs lighter. */
const WEEKLY = [0.84, 1.02, 1.06, 1.05, 1.08, 1.12, 0.9]

/** A repeatable wobble in [-1, 1] for day i. */
function wobble(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** Day i of 180, oldest first: steady growth, then a mixed June of promo
 *  baskets, users lost to a rival and a soft, slower last week. */
function dayAt(i: number): DayRow {
  const day = REFERENCE_DAY - (DAY_COUNT - 1 - i) * DAY_MS
  const daysLeft = DAY_COUNT - 1 - i
  const week = WEEKLY[new Date(day).getUTCDay()]
  const growth = i / (DAY_COUNT - 1)
  const sale = day >= SALE.from && day <= SALE.to
  const promo = day >= PROMO_FROM && day <= PROMO_TO
  const churn = Math.max(0, (day - CHURN_FROM) / (REFERENCE_DAY - CHURN_FROM))
  const orders = Math.round(
    (88 + 46 * growth) *
      week *
      (1 + 0.07 * wobble(i, 1)) *
      (sale ? 1.55 : 1) *
      (daysLeft < 7 ? 0.92 : 1)
  )
  const basket = (44 + 5 * growth + 2.5 * wobble(i, 2)) * (promo ? 0.8 : 1)
  const users = Math.round(
    (1580 + 720 * growth) *
      (0.55 + 0.45 * week) *
      (1 + 0.035 * wobble(i, 3)) *
      (sale ? 1.2 : 1) *
      (1 - 0.3 * churn)
  )
  const latency = Math.round(
    (day >= RELEASE_DAY ? 132 : 158) +
      24 * growth +
      9 * wobble(i, 4) +
      (sale ? 17 : 0) -
      (week < 0.95 ? 6 : 0) +
      (daysLeft < 9 ? (12 * (9 - daysLeft)) / 9 : 0)
  )
  return { day, orders, revenue: Math.round(orders * basket), users, latency }
}

export const DAYS: DayRow[] = Array.from({ length: DAY_COUNT }, (_, i) =>
  dayAt(i)
)

// ── View ──

export const DEFAULT_VIEW: ViewState = {
  metric: "orders",
  range: "30d",
  previous: true,
  annotations: true,
  average: false,
  grid: true,
}

/** The two plotted periods; their colour follows the shown metric. */
export const chartConfigOf = (metric: MetricSpec) =>
  ({
    current: { label: metric.label, color: metric.color },
    previous: { label: "Previous period", color: "var(--muted-foreground)" },
  }) satisfies ChartConfig