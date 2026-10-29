import { useMemo, useState } from "react"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import { cn } from "cn"
import { toast } from "sonner"

import { ChartToolbar, type ChartActions } from "./chart-toolbar"
import {
  DEFAULT_VIEW,
  metricOf,
  rangeOf,
  REFERENCE_DAY,
  type MetricSpec,
  type ViewState,
} from "./data"
import {
  formatChange,
  formatFullDay,
  formatHeadline,
  formatSpan,
  formatValue,
} from "./format"
import { TOAST_ERROR_ICON, TOAST_SUCCESS_ICON, UI_ICONS } from "./icons"
import { MetricPlot } from "./metric-plot"
import { MetricTiles } from "./metric-tiles"
import {
  averageOf,
  plotRows,
  previousDay,
  summariesOf,
  type PlotRow,
} from "./series"
import {
  AverageKey,
  CAP_BOX,
  DotSeparator,
  Fact,
  MetricDot,
  PreviousKey,
} from "./value-faces"

async function copyText(text: string, title: string, description: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(title, { icon: TOAST_SUCCESS_ICON, description })
  } catch {
    toast.error("Copy failed", {
      icon: TOAST_ERROR_ICON,
      description: "The browser blocked clipboard access.",
    })
  }
}

const sameView = (a: ViewState, b: ViewState) =>
  a.metric === b.metric &&
  a.range === b.range &&
  a.previous === b.previous &&
  a.annotations === b.annotations &&
  a.average === b.average &&
  a.grid === b.grid

/** What the plot measures on the left; its two periods on the right. */
function PlotLegend({
  metric,
  rows,
  view,
}: {
  metric: MetricSpec
  rows: PlotRow[]
  view: ViewState
}) {
  const first = rows[0]?.day ?? REFERENCE_DAY
  const last = rows.at(-1)?.day ?? REFERENCE_DAY
  const average = averageOf(rows)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
      <Fact className="text-muted-foreground">
        {metric.label} per day{metric.key === "latency" ? ", in ms" : ""}
      </Fact>
      <ul
        aria-label="Legend"
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <li className="flex h-4 items-center gap-1.5">
          <MetricDot swatch={metric.swatch} />
          <span className={cn(CAP_BOX, "tabular-nums")}>
            {formatSpan(first, last)}
          </span>
        </li>
        {/* A hidden period stays listed, faded, so the Display menu reads
            as the way back. */}
        <li
          className={cn(
            "text-muted-foreground flex h-4 items-center gap-1.5 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            !view.previous && "opacity-50"
          )}
        >
          <PreviousKey />
          <span className={cn(CAP_BOX, "tabular-nums")}>
            {formatSpan(
              previousDay(first, view.range),
              previousDay(last, view.range)
            )}
            {view.previous ? null : <span className="sr-only">, hidden</span>}
          </span>
        </li>
        {view.average ? (
          <li className="text-muted-foreground flex h-4 items-center gap-1.5">
            <AverageKey />
            <span className={cn(CAP_BOX, "tabular-nums")}>
              Avg {formatValue(metric.key, average)}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export function Chart() {
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const metric = metricOf(view.metric)
  const range = rangeOf(view.range)
  // Cached per metric and range, so the chart morphs only on a real switch.
  const rows = plotRows(view.metric, view.range)
  const summaries = useMemo(() => summariesOf(view.range), [view.range])
  const summary = summaries[view.metric]

  const patchView = (patch: Partial<ViewState>) =>
    setView((current) => ({ ...current, ...patch }))

  const table = (delimiter: "," | "\t") => {
    const header = [
      "Date",
      `${metric.label} (this period)`,
      "Previous date",
      `${metric.label} (previous period)`,
    ]
    const lines = rows.map((row) => [
      new Date(row.day).toISOString().slice(0, 10),
      `${row.current}`,
      new Date(previousDay(row.day, view.range)).toISOString().slice(0, 10),
      `${row.previous}`,
    ])
    return [header, ...lines]
      .map((line) =>
        line
          .map((cell) => (delimiter === "," ? `"${cell}"` : cell))
          .join(delimiter)
      )
      .join("\n")
  }

  const summaryText = `${metric.label}, last ${range.days} days: ${formatHeadline(metric.key, summary.value)}, ${formatChange(summary.change)} against the ${range.days} days before (${formatHeadline(metric.key, summary.previous)}). Latest day ${formatValue(metric.key, rows.at(-1)?.current ?? 0)}.`

  const actions: ChartActions = {
    downloadCsv: () => {
      const name = `platform-${metric.key}-${view.range}.csv`
      const url = URL.createObjectURL(
        new Blob([table(",")], { type: "text/csv" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
      toast.success("CSV downloaded", {
        icon: TOAST_SUCCESS_ICON,
        description: `${name}, ${rows.length} days.`,
      })
    },
    copyData: () =>
      void copyText(
        table("\t"),
        "Data copied",
        `${rows.length} days of ${metric.label.toLowerCase()}, ready to paste.`
      ),
    copySummary: () =>
      void copyText(summaryText, "Summary copied", summaryText),
    resetView: () => patchView(DEFAULT_VIEW),
  }

  const chartLabel = `${metric.label} per day over the last ${range.days} days, with the ${range.days} days before as a dashed line. Arrow keys move between days.`

  return (
    <Frame spacing="default" className="w-full max-w-4xl min-w-0">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* The basis wraps the toolbar below the title before the subtitle
            would truncate. */}
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <IconTile variant="frame" size="sm" aria-hidden="true">
            {UI_ICONS.chart}
          </IconTile>
          <div className="flex min-w-0 flex-col gap-px">
            <FrameTitle role="heading" aria-level={3} className="truncate">
              Platform Metrics
            </FrameTitle>
            <FrameDescription className="truncate">
              Storefront health, period over period
            </FrameDescription>
          </div>
        </div>
        <ChartToolbar
          view={view}
          onViewChange={patchView}
          canReset={!sameView(view, DEFAULT_VIEW)}
          actions={actions}
        />
      </FrameHeader>

      <FramePanel className="@container">
        <MetricTiles
          active={view.metric}
          summaries={summaries}
          onSelect={(next) => patchView({ metric: next })}
        />
      </FramePanel>

      <FramePanel className="flex flex-col gap-4">
        <PlotLegend metric={metric} rows={rows} view={view} />
        <MetricPlot
          rows={rows}
          metric={metric}
          view={view}
          label={chartLabel}
        />
      </FramePanel>

      <FrameFooter className="text-muted-foreground flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <Fact>Production</Fact>
          <DotSeparator />
          <Fact>UTC</Fact>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Fact className="tabular-nums">
            As of {formatFullDay(REFERENCE_DAY)}
          </Fact>
          <DotSeparator />
          <Fact>Synced 2 min ago</Fact>
        </span>
      </FrameFooter>
    </Frame>
  )
}