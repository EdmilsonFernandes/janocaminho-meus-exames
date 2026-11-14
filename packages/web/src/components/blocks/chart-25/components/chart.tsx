"use client"

import { Badge } from "@/components/reui/badge"
import { Frame, FramePanel } from "@/components/reui/frame"
import { Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"
import { Separator } from "@/components/ui/separator"
import { orderMetrics, type OrderMetric } from "./data"
import { TrendingUp, TrendingDown } from "lucide-react"

function MetricTrendBadge({ metric }: { metric: OrderMetric }) {
  const isUp = metric.trendDirection === "up"

  return (
    <Badge
      className="border-0"
      variant={
        metric.tone === "success" ? "success-light" : "destructive-light"
      }
    >
      {isUp ? (
        <TrendingUp aria-hidden="true" />
      ) : (
        <TrendingDown aria-hidden="true" />
      )}
      {metric.trend}
    </Badge>
  )
}

function MetricSparkline({ metric }: { metric: OrderMetric }) {
  const chartConfig = {
    value: {
      label: metric.label,
      color: metric.chartColor,
    },
  } satisfies ChartConfig

  return (
    <div className="relative h-11 w-32 shrink-0 sm:w-40">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)] [background-size:12px_12px] opacity-30"
      />
      <ChartContainer
        config={chartConfig}
        className="relative z-10 aspect-auto! h-11 w-full"
        initialDimension={{ width: 160, height: 44 }}
      >
        <LineChart
          accessibilityLayer
          data={metric.data}
          margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
        >
          <XAxis dataKey="period" hide />
          <YAxis hide domain={["dataMin - 4", "dataMax + 4"]} />
          <Line
            dataKey="value"
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-value)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.25}
            type="linear"
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

function MetricRow({
  metric,
  showSeparator,
}: {
  metric: OrderMetric
  showSeparator: boolean
}) {
  return (
    <li>
      <div className="flex min-h-20 items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-base font-semibold">
              {metric.value}
              {metric.suffix ? (
                <span className="text-muted-foreground/45">
                  {metric.suffix}
                </span>
              ) : null}
            </span>
            <MetricTrendBadge metric={metric} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{metric.label}</p>
        </div>

        <MetricSparkline metric={metric} />
      </div>
      {showSeparator ? <Separator /> : null}
    </li>
  )
}

export function Chart() {
  return (
    <Frame className="@container w-full max-w-md">
      <FramePanel className="p-0!">
        <ul className="flex flex-col">
          {orderMetrics.map((metric, index) => (
            <MetricRow
              key={metric.label}
              metric={metric}
              showSeparator={index < orderMetrics.length - 1}
            />
          ))}
        </ul>
      </FramePanel>
    </Frame>
  )
}