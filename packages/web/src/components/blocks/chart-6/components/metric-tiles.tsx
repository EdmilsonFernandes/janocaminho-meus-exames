import { type CSSProperties } from "react"
import { cn } from "cn"

import { METRICS, type MetricKey } from "./data"
import { formatHeadline } from "./format"
import { type Summary } from "./series"
import { CAP_TRUNCATE, ChangeBadge, Fact } from "./value-faces"

/** Dividers for a 2 by 2 grid that becomes one row of 4 at @xl. */
const DIVIDERS = [
  "",
  "border-s",
  "border-t @xl:border-s @xl:border-t-0",
  "border-s border-t @xl:border-t-0",
]

/** One tile per metric, edge to edge in its panel; pressing one plots it.
 *  The indicator slides between tiles instead of jumping. */
export function MetricTiles({
  active,
  summaries,
  onSelect,
}: {
  active: MetricKey
  summaries: Record<MetricKey, Summary>
  onSelect: (metric: MetricKey) => void
}) {
  const index = Math.max(
    0,
    METRICS.findIndex((metric) => metric.key === active)
  )
  const swatch = METRICS[index].swatch
  // The slot's offset in both layouts, in its own widths and heights.
  const slot = {
    "--chart-6-x2": `${(index % 2) * 100}%`,
    "--chart-6-y2": `${Math.floor(index / 2) * 100}%`,
    "--chart-6-x4": `${index * 100}%`,
  } as CSSProperties
  return (
    <div
      role="group"
      aria-label="Metric"
      className="relative -mx-(--frame-panel-px) -my-(--frame-panel-py) grid auto-rows-fr grid-cols-2 @xl:grid-cols-4"
    >
      {METRICS.map((metric, position) => {
        const summary = summaries[metric.key]
        const pressed = metric.key === active
        return (
          <button
            key={metric.key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(metric.key)}
            className={cn(
              "hover:bg-muted/40 focus-visible:ring-ring/50 flex min-w-0 flex-col items-start gap-2.5 px-(--frame-panel-px) py-(--frame-panel-py) text-start transition-colors outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset",
              DIVIDERS[position]
            )}
          >
            <span className="flex h-5 w-full min-w-0 items-center">
              <span
                className={cn(
                  CAP_TRUNCATE,
                  "min-w-0 text-sm transition-colors",
                  pressed ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {metric.label}
              </span>
            </span>
            <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
              {formatHeadline(metric.key, summary.value)}
            </span>
            {/* The badge leads the comparison, so the label keeps its row
                at any tile width. */}
            <span className="flex h-5 min-w-0 items-center gap-1.5">
              <ChangeBadge summary={summary} />
              <Fact className="text-muted-foreground min-w-0 text-xs whitespace-nowrap tabular-nums">
                vs {formatHeadline(metric.key, summary.previous)}
                <span className="sr-only"> in the prior period</span>
              </Fact>
            </span>
          </button>
        )
      })}
      {/* Moving across the row is a reposition, so it takes the in-out
          curve; reduced motion jumps. */}
      <span
        aria-hidden="true"
        style={slot}
        className="pointer-events-none absolute start-0 top-0 h-1/2 w-1/2 translate-x-(--chart-6-x2) translate-y-(--chart-6-y2) transition-[translate] duration-300 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none @xl:h-full @xl:w-1/4 @xl:translate-x-(--chart-6-x4) @xl:translate-y-0"
      >
        <span
          className={cn(
            "absolute inset-x-(--frame-panel-px) bottom-0 h-0.5 rounded-full transition-colors duration-300",
            swatch
          )}
        />
      </span>
    </div>
  )
}