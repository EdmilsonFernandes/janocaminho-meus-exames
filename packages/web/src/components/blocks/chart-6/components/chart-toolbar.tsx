import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { RANGES, type LayerKey, type ViewState } from "./data"
import { UI_ICONS } from "./icons"
import { useTriggerTooltip } from "./use-trigger-tooltip"
import { CAP_BOX } from "./value-faces"

export interface ChartActions {
  downloadCsv: () => void
  copyData: () => void
  copySummary: () => void
  resetView: () => void
}

const LAYERS = [
  { key: "previous", label: "Previous Period", icon: UI_ICONS.previous },
  { key: "annotations", label: "Annotations", icon: UI_ICONS.annotations },
  { key: "average", label: "Average Line", icon: UI_ICONS.average },
  { key: "grid", label: "Gridlines", icon: UI_ICONS.grid },
] as const satisfies readonly {
  key: LayerKey
  label: string
  icon: ReactNode
}[]

const layersShown = (view: ViewState) =>
  `${LAYERS.filter((layer) => view[layer.key]).length} of ${LAYERS.length}`

/** The header toolbar: the range, then what the plot shows and more. */
export function ChartToolbar({
  view,
  onViewChange,
  canReset,
  actions,
}: {
  view: ViewState
  onViewChange: (patch: Partial<ViewState>) => void
  canReset: boolean
  actions: ChartActions
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Re-clicking the pressed item clears the choice; the guard keeps
          a range selected. */}
      <ToggleGroup
        multiple={false}
        value={[view.range]}
        onValueChange={(value) => {
          const next = RANGES.find((item) => item.value === value[0])
          if (next) onViewChange({ range: next.value })
        }}
        variant="outline"
        spacing={0}
        aria-label="Range"
      >
        {RANGES.map((item) => (
          <ToggleGroupItem
            key={item.value}
            value={item.value}
            // Pressed lifts to the card surface: the stock muted fill is the
            // header band's own tone and would vanish on it.
            className="text-muted-foreground data-pressed:bg-card dark:data-pressed:bg-muted data-pressed:text-foreground tabular-nums"
          >
            <span className={CAP_BOX}>{item.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ButtonGroup aria-label="Chart actions">
        <DisplayMenu view={view} onViewChange={onViewChange} />
        <MoreMenu canReset={canReset} actions={actions} />
      </ButtonGroup>
    </div>
  )
}

// Stays open while toggling, so several layers read at once.
function DisplayMenu({
  view,
  onViewChange,
}: {
  view: ViewState
  onViewChange: (patch: Partial<ViewState>) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`Display, ${layersShown(view)} layers shown`}
          />
        }
      >
        {UI_ICONS.display}
        <span className={CAP_BOX}>Display</span>
        {UI_ICONS.chevron}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          {LAYERS.map((layer) => (
            <DropdownMenuCheckboxItem
              key={layer.key}
              checked={view[layer.key]}
              onCheckedChange={(next: boolean) => {
                const patch: Partial<ViewState> = {}
                patch[layer.key] = next
                onViewChange(patch)
              }}
              closeOnClick={false}
            >
              {layer.icon}
              {layer.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MoreMenu({
  canReset,
  actions,
}: {
  canReset: boolean
  actions: ChartActions
}) {
  const [open, setOpen] = useState(false)
  const hint = useTriggerTooltip(open)
  return (
    <DropdownMenu open={open} onOpenChange={(next: boolean) => setOpen(next)}>
      <Tooltip {...hint.tooltip}>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="More actions"
                  {...hint.triggerProps}
                />
              }
            />
          }
        >
          {UI_ICONS.more}
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={actions.downloadCsv}>
            {UI_ICONS.download}
            Download CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={actions.copyData}>
            {UI_ICONS.table}
            Copy Data
          </DropdownMenuItem>
          <DropdownMenuItem onClick={actions.copySummary}>
            {UI_ICONS.summary}
            Copy Summary
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={!canReset} onClick={actions.resetView}>
            {UI_ICONS.reset}
            Reset View
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}