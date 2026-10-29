import { type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"

import { formatChange } from "./format"
import { BADGE_TREND_ICONS } from "./icons"
import { type Summary, type Tone } from "./series"

/** Trims a label to its caps, so `items-center` lines the letters up with
 *  the dot or control beside it. Needs a fixed-height row. */
export const CAP_BOX = "[text-box:trim-both_cap_alphabetic]"
/** CAP_BOX for a label that may ellipsize: it clips only sideways, so the
 *  descenders a trimmed box hangs below its edge stay whole. */
export const CAP_TRUNCATE = `${CAP_BOX} overflow-x-clip text-ellipsis whitespace-nowrap`

export function DotSeparator() {
  return (
    <span
      aria-hidden="true"
      className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
    />
  )
}

/** The shown period's key: a dot in the metric's own colour. */
export function MetricDot({ swatch }: { swatch: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", swatch)}
    />
  )
}

/** The previous period's key, dashed like its line. */
export function PreviousKey() {
  return (
    <span aria-hidden="true" className="flex w-3 shrink-0 justify-between">
      <span className="bg-muted-foreground h-0.5 w-1 rounded-full" />
      <span className="bg-muted-foreground h-0.5 w-1 rounded-full" />
    </span>
  )
}

/** The average rule's key, dotted like the rule. */
export function AverageKey() {
  return (
    <span aria-hidden="true" className="flex w-3 shrink-0 justify-between">
      <span className="bg-foreground/45 size-0.5 rounded-full" />
      <span className="bg-foreground/45 size-0.5 rounded-full" />
      <span className="bg-foreground/45 size-0.5 rounded-full" />
    </span>
  )
}

const BADGE_TONES = {
  good: "success-light",
  watch: "warning-light",
  bad: "destructive-light",
} as const satisfies Record<Tone, string>

/** The readout's change figure, in the badge's tones. */
export const TEXT_TONES = {
  good: "text-success",
  watch: "text-warning",
  bad: "text-destructive",
} as const satisfies Record<Tone, string>

/** A change against the previous period: the arrow follows the number, the
 *  tone follows how it reads for the metric. */
export function ChangeBadge({ summary }: { summary: Summary }) {
  return (
    <Badge variant={BADGE_TONES[summary.tone]}>
      {summary.change >= 0 ? BADGE_TREND_ICONS.up : BADGE_TREND_ICONS.down}
      <span className={cn(CAP_BOX, "tabular-nums")}>
        {formatChange(summary.change)}
      </span>
    </Badge>
  )
}

/** A text-xs fact on a status line: cap-trimmed inside an h-4 row. */
export function Fact({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn("flex h-4 items-center", className)}>
      <span className={CAP_BOX}>{children}</span>
    </span>
  )
}