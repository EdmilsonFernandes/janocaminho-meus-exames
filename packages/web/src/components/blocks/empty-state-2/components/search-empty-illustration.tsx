import { cn } from "cn"

export function SearchEmptyIllustration({
  variant = "hero",
}: {
  variant?: "hero" | "compact"
}) {
  const isCompact = variant === "compact"

  return (
    <div
      aria-hidden="true"
      className={cn("relative isolate", isCompact ? "h-11 w-20" : "h-32 w-56")}
    >
      <div
        className={cn(
          "bg-muted/50 border-border/40 dark:bg-muted/25 absolute flex items-center rounded-lg border",
          isCompact
            ? "right-2 bottom-1.5 left-2 h-4 gap-1.5 px-2"
            : "right-6 bottom-4 left-6 h-12 gap-2.5 px-3"
        )}
      >
        <div
          className={cn(
            "bg-muted-foreground/10 shrink-0 rounded",
            isCompact ? "size-2" : "size-5"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className={cn(
              "bg-muted-foreground/10 rounded",
              isCompact ? "h-1 w-full" : "h-2 w-full"
            )}
          />
          <div
            className={cn(
              "bg-muted-foreground/8 rounded",
              isCompact ? "h-1 w-2/3" : "h-2 w-2/3"
            )}
          />
        </div>
      </div>

      <div
        className={cn(
          "bg-muted/70 border-border/50 dark:bg-muted/40 absolute flex items-center rounded-lg border",
          isCompact
            ? "right-1 bottom-4 left-1 h-4 gap-1.5 px-2"
            : "right-3 bottom-8 left-3 h-12 gap-2.5 px-3"
        )}
      >
        <div
          className={cn(
            "bg-muted-foreground/12 shrink-0 rounded",
            isCompact ? "size-2" : "size-5"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className={cn(
              "bg-muted-foreground/12 rounded",
              isCompact ? "h-1 w-full" : "h-2 w-full"
            )}
          />
          <div
            className={cn(
              "bg-muted-foreground/10 rounded",
              isCompact ? "h-1 w-3/4" : "h-2 w-3/4"
            )}
          />
        </div>
      </div>

      <div
        className={cn(
          "bg-background border-border absolute flex items-center rounded-lg border shadow-sm",
          isCompact
            ? "inset-x-0 bottom-6 h-5 gap-2 px-2"
            : "inset-x-0 bottom-12 h-14 gap-3 px-3.5"
        )}
      >
        <div
          className={cn(
            "bg-muted shrink-0 rounded",
            isCompact ? "size-3" : "size-7"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div
            className={cn(
              "bg-muted rounded",
              isCompact ? "h-1.5 w-full" : "h-2.5 w-full"
            )}
          />
          <div
            className={cn(
              "bg-muted/70 rounded",
              isCompact ? "h-1 w-3/5" : "h-2 w-3/5"
            )}
          />
        </div>
      </div>

      {!isCompact ? (
        <div className="from-background/0 to-background pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-b" />
      ) : null}
    </div>
  )
}