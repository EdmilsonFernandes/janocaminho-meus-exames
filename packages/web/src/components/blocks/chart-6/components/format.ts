import { type MetricKey } from "./data"

const INTEGER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const PERCENT = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
})
const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const FULL_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** A day's exact figure: "1,284", "$4,812", "142 ms". */
export function formatValue(metric: MetricKey, value: number) {
  if (metric === "revenue") return `$${INTEGER.format(value)}`
  if (metric === "latency") return `${INTEGER.format(value)} ms`
  return INTEGER.format(value)
}

/** A window's headline: "11,323", "$541.4K", "147 ms". */
export function formatHeadline(metric: MetricKey, value: number) {
  if (metric === "revenue") return `$${COMPACT.format(value)}`
  return formatValue(metric, value)
}

/** An axis tick: "120", "$4K", "2.2K", "150". */
export function formatAxis(metric: MetricKey, value: number) {
  if (metric === "revenue") return `$${COMPACT.format(value)}`
  return COMPACT.format(value)
}

/** "+24.9%", "-10.4%" */
export const formatChange = (ratio: number) => PERCENT.format(ratio)

/** "Jun 12" */
export const formatDay = (day: number) => SHORT_DAY.format(day)

/** "Fri, Jun 12" */
export const formatLongDay = (day: number) => LONG_DAY.format(day)

/** "Jun 30, 2026" */
export const formatFullDay = (day: number) => FULL_DAY.format(day)

/** "Jun 1 to Jun 30" */
export const formatSpan = (from: number, to: number) =>
  `${formatDay(from)} to ${formatDay(to)}`