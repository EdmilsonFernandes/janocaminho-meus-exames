"use client"

import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"

import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { leadsData, rangeOptions } from "./data"
import { InfoIcon } from "lucide-react"

export function Stats() {
  return (
    <Frame className="w-full sm:max-w-md">
      {/* Content */}
      <FramePanel>
        <div className="mb-6 flex items-center justify-between gap-3">
          <FrameTitle>Leads Overview</FrameTitle>
          <Select defaultValue="this-month" items={rangeOptions}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              className="w-32"
            >
              {rangeOptions.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4 flex items-stretch gap-x-6">
          <div className="flex flex-1 flex-col items-start gap-1">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-foreground text-2xl font-bold">
                {leadsData.newLeads}
              </span>
              <Badge variant="info-light">{leadsData.newPercent}%</Badge>
            </div>
            <span className="text-muted-foreground text-sm font-medium">
              New leads
            </span>
            <div className="mt-1 w-full">
              <Progress
                value={leadsData.newPercent}
                className="**:data-[slot=progress-track]:h-2.5"
              />
            </div>
          </div>

          <div className="border-muted-foreground/10 flex flex-1 flex-col items-start gap-1 border-s ps-6">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-foreground text-2xl font-bold">
                {leadsData.returningLeads}
              </span>
            </div>
            <span className="text-muted-foreground text-sm font-medium">
              Returning leads
            </span>
            <div className="mt-1 flex w-full gap-0.5">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-2.5 w-0.5 flex-1 rounded-md",
                    i < Math.round((leadsData.returningPercent / 100) * 30)
                      ? "bg-emerald-500"
                      : "bg-muted"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mb-1.5 flex items-center gap-x-4">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Top Source</span>
            <span className="text-foreground text-sm font-medium">
              {leadsData.topSource}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 ps-7.5">
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              Conversion Rate
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="About Conversion Rate"
                      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex cursor-help items-center rounded-full outline-none focus-visible:ring-[3px]"
                    >
                      <InfoIcon className="size-3.5" aria-hidden="true" />
                    </button>
                  }
                />
                <TooltipContent>
                  <p>Percentage of leads converted to customers.</p>
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="text-foreground text-sm font-medium">
              {leadsData.conversionRate}%
            </span>
          </div>
        </div>
      </FramePanel>
    </Frame>
  )
}