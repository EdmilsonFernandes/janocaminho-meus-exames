"use client"

import { Badge } from "@/components/reui/badge"
import { Frame, FramePanel } from "@/components/reui/frame"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { formatNumber, stats, type StatItem } from "./data"
// Ícones: MUI Icons em vez de lucide-react (o Vite deste monorepo/Windows não
// resolveu o lucide hoisted na raiz — MUI Icons já é a lib de ícones do app).
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';

/**
 * Adaptado p/ Dr. Exame (protótipo /dashboard-v2): aceita itens REAIS via props
 * (fallback = demo data.ts do registry) e copy pt-BR. Anatomia/estilos do ReUI
 * intactos (Frame/FramePanel/Badge/menu). `subLabel` substitui o "Vs last month"
 * fixo — cada tile diz o que o número de baixo significa de verdade.
 */
export function Stats({ items, subLabel = "Referência:", onDetail }: {
  items?: StatItem[];
  subLabel?: string;
  onDetail?: (stat: StatItem) => void;
}) {
  const list = items ?? stats;
  return (
    <div className="grid grow grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {list.map((stat, index) => (
        <Frame key={index}>
          <FramePanel className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-muted-foreground text-sm font-medium">
                {stat.title}
              </h3>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-me-1.5"
                    />
                  }
                >
                  <MoreHorizRoundedIcon aria-hidden="true" fontSize="small" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => onDetail?.(stat)}>
                      <SettingsRoundedIcon aria-hidden="true" fontSize="small" />
                      Ver detalhes
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <WarningAmberRoundedIcon aria-hidden="true" fontSize="small" />
                      Criar lembrete
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <PushPinRoundedIcon aria-hidden="true" fontSize="small" />
                      Fixar no dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ShareRoundedIcon aria-hidden="true" fontSize="small" />
                      Compartilhar c/ médico
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive">
                      <DeleteRoundedIcon aria-hidden="true" fontSize="small" />
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-foreground text-2xl font-medium tracking-tight">
                  {stat.format
                    ? stat.format(stat.value)
                    : stat.prefix + formatNumber(stat.value) + stat.suffix}
                </span>
                <Badge
                  variant={
                    stat.positive ? "success-light" : "destructive-light"
                  }
                >
                  {stat.delta > 0 ? (
                    <ArrowUpwardRoundedIcon aria-hidden="true" sx={{ fontSize: 12 }} />
                  ) : (
                    <ArrowDownwardRoundedIcon aria-hidden="true" sx={{ fontSize: 12 }} />
                  )}
                  {stat.delta}%
                </Badge>
              </div>
              <Separator />
              <div className="text-muted-foreground text-xs">
                {subLabel}{" "}
                <span className="text-foreground font-medium">
                  {stat.lastFormat
                    ? stat.lastFormat(stat.lastMonth)
                    : stat.prefix + formatNumber(stat.lastMonth) + stat.suffix}
                </span>
              </div>
            </div>
          </FramePanel>
        </Frame>
      ))}
    </div>
  )
}