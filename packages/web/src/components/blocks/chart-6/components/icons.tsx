import { ChartLineIcon, Settings2Icon, ChevronDownIcon, MoreHorizontalIcon, HistoryIcon, TagIcon, MinusIcon, Grid2x2Icon, DownloadIcon, TableIcon, FileTextIcon, RotateCcwIcon, TrendingUp, TrendingDown, CircleCheckIcon, AlertCircleIcon } from "lucide-react";

/** Chrome glyphs, unsized: the owning Button, Badge or tile sizes them. */
// prettier-ignore
export const UI_ICONS = {
  chart:       <ChartLineIcon aria-hidden="true" />,
  display:     <Settings2Icon aria-hidden="true" />,
  chevron:     <ChevronDownIcon className="text-muted-foreground" aria-hidden="true" />,
  more:        <MoreHorizontalIcon aria-hidden="true" />,
  previous:    <HistoryIcon aria-hidden="true" />,
  annotations: <TagIcon aria-hidden="true" />,
  average:     <MinusIcon aria-hidden="true" />,
  grid:        <Grid2x2Icon aria-hidden="true" />,
  download:    <DownloadIcon aria-hidden="true" />,
  table:       <TableIcon aria-hidden="true" />,
  summary:     <FileTextIcon aria-hidden="true" />,
  reset:       <RotateCcwIcon aria-hidden="true" />,
}

/** Direction glyphs at badge size: the Badge sizes its own icons. */
// prettier-ignore
export const BADGE_TREND_ICONS = {
  up:   <TrendingUp aria-hidden="true" />,
  down: <TrendingDown aria-hidden="true" />,
}

/** The same glyphs at the house glyph size, for a readout row's slot. */
// prettier-ignore
export const TREND_ICONS = {
  up:   <TrendingUp className="size-4" aria-hidden="true" />,
  down: <TrendingDown className="size-4" aria-hidden="true" />,
}

export const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="text-success size-4" aria-hidden="true" />
)

export const TOAST_ERROR_ICON = (
  <AlertCircleIcon className="text-destructive size-4" aria-hidden="true" />
)