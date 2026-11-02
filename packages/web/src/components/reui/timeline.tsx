import * as React from "react"
import { cn } from "@/lib/utils"

interface TimelineContextValue {
  activeStep: number
  orientation: "horizontal" | "vertical"
}

const TimelineContext = React.createContext<TimelineContextValue>({
  activeStep: 1,
  orientation: "vertical",
})

export interface TimelineProps extends React.ComponentProps<"div"> {
  defaultValue?: number
  value?: number
  onValueChange?: (value: number) => void
  orientation?: "horizontal" | "vertical"
}

function Timeline({
  defaultValue = 1,
  value,
  orientation = "vertical",
  className,
  children,
  ...props
}: TimelineProps) {
  const activeStep = value ?? defaultValue
  return (
    <TimelineContext.Provider value={{ activeStep, orientation }}>
      <div
        data-slot="timeline"
        data-orientation={orientation}
        className={cn(
          "group/timeline flex",
          orientation === "vertical" ? "flex-col" : "flex-row items-start",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </TimelineContext.Provider>
  )
}

function TimelineItem({
  step,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { step: number }) {
  const { activeStep, orientation } = React.useContext(TimelineContext)
  const completed = step <= activeStep
  return (
    <div
      data-slot="timeline-item"
      data-completed={completed ? "" : undefined}
      data-orientation={orientation}
      className={cn(
        "group/timeline-item relative flex",
        orientation === "vertical"
          ? "flex-col pb-5 pl-8 last:pb-0"
          : "flex-1 flex-col pt-8",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function TimelineSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-separator"
      aria-hidden="true"
      className={cn(
        "bg-border group-last/timeline-item:hidden",
        "group-data-[orientation=vertical]/timeline-item:absolute group-data-[orientation=vertical]/timeline-item:top-6 group-data-[orientation=vertical]/timeline-item:bottom-0 group-data-[orientation=vertical]/timeline-item:left-[11px] group-data-[orientation=vertical]/timeline-item:w-px",
        className
      )}
      {...props}
    />
  )
}

function TimelineIndicator({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-indicator"
      className={cn(
        "absolute top-0.5 left-0 flex size-6 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary ring-4 ring-background transition-colors group-data-completed/timeline-item:border-primary/40 group-data-completed/timeline-item:bg-primary/15",
        className
      )}
      {...props}
    >
      {children ?? <span className="size-2 rounded-full bg-primary" />}
    </div>
  )
}

function TimelineHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-header"
      className={cn("flex flex-wrap items-center justify-between gap-1.5", className)}
      {...props}
    />
  )
}

function TimelineTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-title"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function TimelineDate({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-date"
      className={cn("text-xs font-medium text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

function TimelineContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-content"
      className={cn("mt-1.5 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineIndicator,
  TimelineHeader,
  TimelineTitle,
  TimelineDate,
  TimelineContent,
}

