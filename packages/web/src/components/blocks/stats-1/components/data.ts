export interface StatItem {
  title: string
  value: number
  delta: number
  lastMonth: number
  positive: boolean
  prefix: string
  suffix: string
  format?: (v: number) => string
  lastFormat?: (v: number) => string
}

// ── Helpers ──

export function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return n.toLocaleString()
  return n.toString()
}

// ── Data ──

export const stats: StatItem[] = [
  {
    title: "All Orders",
    value: 122380,
    delta: 15.1,
    lastMonth: 105922,
    positive: true,
    prefix: "",
    suffix: "",
  },
  {
    title: "Order Created",
    value: 1902380,
    delta: -2.0,
    lastMonth: 2002098,
    positive: false,
    prefix: "",
    suffix: "",
  },
  {
    title: "Organic Sales",
    value: 98100000,
    delta: 0.4,
    lastMonth: 97800000,
    positive: true,
    prefix: "$",
    suffix: "M",
    format: (v) => `$${(v / 1_000_000).toFixed(1)}M`,
    lastFormat: (v) => `$${(v / 1_000_000).toFixed(1)}M`,
  },
  {
    title: "Active Users",
    value: 48210,
    delta: 3.7,
    lastMonth: 46480,
    positive: true,
    prefix: "",
    suffix: "",
  },
]