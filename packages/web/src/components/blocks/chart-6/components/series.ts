import {
  ANNOTATIONS,
  DAY_MS,
  DAYS,
  metricOf,
  METRICS,
  rangeOf,
  type Annotation,
  type DayRow,
  type MetricKey,
  type MetricSpec,
  type RangeKey,
} from "./data"

/** One plotted day: this period's figure and the matching day before it. */
export type PlotRow = { day: number; current: number; previous: number }

/** Good news, a slip worth watching, or a real setback. */
export type Tone = "good" | "watch" | "bad"

/** A slip under 5% is one to watch; a bigger one is a setback. */
const WATCH_LIMIT = 0.05

export function toneOf(metric: MetricSpec, change: number): Tone {
  if (metric.better === "up" ? change >= 0 : change <= 0) return "good"
  return Math.abs(change) < WATCH_LIMIT ? "watch" : "bad"
}

export type Summary = {
  value: number
  previous: number
  /** The change as a ratio: 0.12 is up 12%. */
  change: number
  tone: Tone
}

function windowOf(range: RangeKey) {
  const { days } = rangeOf(range)
  return {
    current: DAYS.slice(-days),
    previous: DAYS.slice(-2 * days, -days),
  }
}

const rowCache = new Map<string, PlotRow[]>()

export function plotRows(metric: MetricKey, range: RangeKey) {
  const key = `${metric}:${range}`
  const cached = rowCache.get(key)
  if (cached) return cached
  const { current, previous } = windowOf(range)
  const rows = current.map((row, index) => ({
    day: row.day,
    current: row[metric],
    previous: previous[index]?.[metric] ?? row[metric],
  }))
  rowCache.set(key, rows)
  return rows
}

function rollup(rows: DayRow[], metric: MetricKey) {
  const total = rows.reduce((sum, row) => sum + row[metric], 0)
  return metricOf(metric).rollup === "sum"
    ? total
    : total / Math.max(1, rows.length)
}

/** Every tile's headline for one range. */
export function summariesOf(range: RangeKey) {
  const { current, previous } = windowOf(range)
  return Object.fromEntries(
    METRICS.map((metric) => {
      const value = rollup(current, metric.key)
      const before = rollup(previous, metric.key)
      const change = value / before - 1
      const tone = toneOf(metric, change)
      return [metric.key, { value, previous: before, change, tone }]
    })
  ) as Record<MetricKey, Summary>
}

/** The shown days' mean, for the average rule and its legend figure. */
export const averageOf = (rows: PlotRow[]) =>
  rows.reduce((sum, row) => sum + row.current, 0) / Math.max(1, rows.length)

/** The events that fall inside the shown days. */
export function annotationsIn(rows: PlotRow[]): Annotation[] {
  const first = rows[0]?.day ?? 0
  const last = rows.at(-1)?.day ?? 0
  return ANNOTATIONS.filter((item) => item.to >= first && item.from <= last)
}

/** The event a day falls in, for the readout. */
export function annotationOn(day: number) {
  return ANNOTATIONS.find((item) => day >= item.from && day <= item.to)
}

/** The previous period's matching day. */
export const previousDay = (day: number, range: RangeKey) =>
  day - rangeOf(range).days * DAY_MS