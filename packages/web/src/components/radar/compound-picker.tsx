/**
 * Seletor de composto do Radar Hormonal: Select do ReUI com os itens AGRUPADOS por hormônio
 * e um ícone que diz, de relance, o que é — seringa (injetável) ou comprimido (oral) — na
 * cor da série no gráfico. A linha de apoio traz o que muda a curva: quanto tempo dura.
 */
import { Pill, Syringe } from 'lucide-react';
import { cn } from 'cn';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RADAR_COMPOUNDS, RADAR_FAMILIES, compoundById, type RadarCompoundDef, type RadarFamily } from '@/utils/hormoneRadar';

/** Quadradinho com o ícone da forma de uso, tingido pela cor do composto. */
export function CompoundIcon({ comp, className }: { comp: RadarCompoundDef; className?: string }) {
  const Icon = comp.isOral ? Pill : Syringe;
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', className)}
      style={{ color: comp.color, backgroundColor: `color-mix(in oklab, ${comp.color} 14%, transparent)` }}
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

/** "dura ~5 dias" / "dura ~10 horas" — a meia-vida em palavras. */
export function durationLabel(comp: RadarCompoundDef): string {
  if (comp.isBlend) return '4 ésteres: age rápido e dura até ~3 semanas';
  const hl = comp.halfLife;
  if (hl < 1) return `cai pela metade em ~${Math.round(hl * 24)} horas`;
  return `cai pela metade em ~${hl.toLocaleString('pt-BR')} dias`;
}

const FAMILY_ORDER: RadarFamily[] = ['testosterona', 'nandrolona', 'drostanolona', 'boldenona', 'trembolona', 'oxandrolona'];

export function CompoundPicker({ value, onChange, id }: { value: string; onChange: (id: string) => void; id?: string }) {
  const current = compoundById(value);
  return (
    <Select value={value} onValueChange={(next) => { if (next) onChange(String(next)); }}>
      <SelectTrigger id={id} className="h-auto min-h-12 w-full justify-between gap-2 py-1.5 ps-1.5 text-start">
        <SelectValue>
          {() => (
            <span className="flex min-w-0 items-center gap-2.5">
              <CompoundIcon comp={current} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{current.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {current.isOral ? 'Comprimido' : 'Injetável'} · {durationLabel(current)}
                </span>
              </span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[min(24rem,var(--available-height))] min-w-72">
        {FAMILY_ORDER.map((family) => {
          const list = RADAR_COMPOUNDS.filter((c) => c.family === family);
          if (!list.length) return null;
          return (
            <SelectGroup key={family}>
              <SelectLabel>{RADAR_FAMILIES[family].label}</SelectLabel>
              {list.map((comp) => (
                <SelectItem key={comp.id} value={comp.id} className="py-1.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CompoundIcon comp={comp} className="size-7" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{comp.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{durationLabel(comp)}</span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
