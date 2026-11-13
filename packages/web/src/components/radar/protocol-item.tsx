/**
 * Um composto do protocolo, no Radar Hormonal.
 *
 * Dois modos: LEITURA (padrão: nome, uma frase com dose/frequência/período e o resumo) e
 * EDIÇÃO (abre com "Editar" ou ao adicionar). Cadastrado não pode parecer formulário em branco.
 *
 * Ordem da edição, pensada para quem não é da área: o que é (seletor + "?") → quanto (dose, com − e +
 * para o dedo) → de quanto em quanto tempo (botões, sem abrir lista) → em que semanas (faixa
 * arrastável dentro do que o gráfico exibe) → o que isso dá na prática (barra
 * hormônio × éster e os três números que importam).
 *
 * Controles do ReUI/shadcn como vêm (NumberField, ToggleGroup, Slider, Badge), sem recriar na mão.
 * Só descreve o que a pessoa informou. Não sugere dose nem esquema.
 */
import { CalendarRange, Check, CircleHelp, Pencil, Pill, Repeat, Syringe, Trash2 } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/reui/badge';
import { NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput } from '@/components/reui/number-field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CompoundIcon, CompoundPicker, hasCompoundPhoto } from '@/components/radar/compound-picker';
import { RADAR_FREQUENCIES, compoundById, getDoseMg, type RadarProtocolItem } from '@/utils/hormoneRadar';

const FREQ_SHORT: Record<number, string> = { 1: 'Todo dia', 2: 'Dia sim, dia não', 3.5: '2x por semana', 7: '1x por semana', 10: 'A cada 10 dias', 14: 'A cada 14 dias', 70: 'A cada 10 semanas' };
const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const nDose = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

export function ProtocolItem({
  item, index, weeks, dash, canRemove, editing, onEdit, onDone, onUpdate, onChangeCompound, onChangeUnit, onExplain, onRemove,
}: {
  item: RadarProtocolItem;
  index: number;
  /** Semanas mostradas no gráfico (limite do período). */
  weeks: number;
  /** Tipo de traço deste composto no gráfico ('' = contínuo). */
  dash: string;
  canRemove: boolean;
  /** false = cartão de leitura (padrão); true = formulário aberto. */
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onUpdate: (patch: Partial<RadarProtocolItem>) => void;
  onChangeCompound: (compoundId: string) => void;
  onChangeUnit: (unit: 'ml' | 'mg') => void;
  onExplain: () => void;
  onRemove: () => void;
}) {
  const comp = compoundById(item.compoundId);
  const doseMg = getDoseMg(item);
  const activeMg = doseMg * comp.esterRatio;
  const weeklyActive = item.freqDays > 0 ? (activeMg * 7) / item.freqDays : 0;
  const hasEster = comp.esterRatio < 0.999;
  const step = item.unit === 'ml' ? 0.25 : comp.isOral ? 5 : 25;
  const tint = (pct: number) => `color-mix(in oklab, ${comp.color} ${pct}%, transparent)`;
  const from = Math.min(item.startWeek, weeks);
  const to = Math.min(item.endWeek, weeks);
  const DoseIcon = comp.isOral ? Pill : Syringe;
  const doseText = item.unit === 'ml' && !comp.isOral ? `${nDose(item.amount)} ml (${n0(doseMg)} mg)` : `${n0(doseMg)} mg`;
  const freqText = (FREQ_SHORT[item.freqDays] ?? `a cada ${item.freqDays} dias`).toLowerCase();
  const summary = `${doseText} · ${freqText} · ${from === to ? `só na semana ${from}` : `semanas ${from} a ${to}`}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Leitura: o que foi cadastrado. Some na edição, para o composto não aparecer duas vezes. */}
      {editing ? null : (
      <div className="flex items-start gap-3">
        <CompoundIcon comp={comp} className={hasCompoundPhoto(comp.id) ? 'size-16 rounded-xl' : 'size-10 rounded-xl [&>svg]:size-5'} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg aria-hidden="true" width="22" height="6" viewBox="0 0 22 6" className="shrink-0">
              <line x1="1" x2="21" y1="3" y2="3" stroke={comp.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash ? dash.split(' ').map((n) => Number(n) / 2.2).join(' ') : undefined} />
            </svg>
            Composto {index + 1}
          </span>
          <strong className="text-base leading-snug font-semibold text-foreground [overflow-wrap:anywhere]">{comp.name}</strong>
          <span className="sr-only">{summary}</span>
          <span aria-hidden="true" className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="outline" size="lg" className="tabular-nums"><DoseIcon aria-hidden="true" />{doseText}</Badge>
            <Badge variant="outline" size="lg"><Repeat aria-hidden="true" />{FREQ_SHORT[item.freqDays] ?? `A cada ${item.freqDays} dias`}</Badge>
            <Badge variant="outline" size="lg" className="tabular-nums"><CalendarRange aria-hidden="true" />{from === to ? `Só a semana ${from}` : `Semanas ${from} a ${to}`}</Badge>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="icon-lg" className="size-10" aria-label={`O que é ${comp.short}? Abrir explicação`} title="O que é isso?" onClick={onExplain}>
            <CircleHelp aria-hidden="true" />
          </Button>
          <Button variant="outline" size="lg" className="h-10" aria-label={`Editar ${comp.short}`} onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Editar
          </Button>
        </div>
      </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border px-3 py-3">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <svg aria-hidden="true" width="22" height="6" viewBox="0 0 22 6" className="shrink-0">
                <line x1="1" x2="21" y1="3" y2="3" stroke={comp.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash ? dash.split(' ').map((n) => Number(n) / 2.2).join(' ') : undefined} />
              </svg>
              Editando o composto {index + 1}
            </span>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CompoundPicker value={item.compoundId} onChange={onChangeCompound} />
              </div>
              <Button variant="outline" size="icon-lg" className="size-10 shrink-0" aria-label={`O que é ${comp.short}? Abrir explicação`} title="O que é isso?" onClick={onExplain}>
                <CircleHelp aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Quanto */}
          <div className={cn('grid gap-4', !comp.isOral && 'sm:grid-cols-[1.5fr_1fr]')}>
            <div className="flex min-w-0 flex-col gap-1.5">
              <GroupLabel>{comp.isOral ? 'Dose (mg)' : `Dose por aplicação (${item.unit})`}</GroupLabel>
              <div className="flex items-center gap-2">
                <NumberField
                  size="lg" className="min-w-0 flex-1" min={0} step={step} smallStep={item.unit === 'ml' ? 0.05 : 1}
                  format={{ maximumFractionDigits: 2 }} locale="pt-BR"
                  value={Number.isFinite(item.amount) ? item.amount : null}
                  onValueChange={(v) => onUpdate({ amount: Math.max(0, v ?? 0) })}
                >
                  <NumberFieldGroup className="h-11">
                    <NumberFieldDecrement aria-label="Diminuir dose" className="border-y-0 border-s-0 border-e border-solid border-input bg-transparent px-3 text-foreground" />
                    <NumberFieldInput
                      className="border-0 text-base font-semibold text-foreground"
                      aria-label={comp.isOral ? 'Dose em miligramas' : `Dose por aplicação em ${item.unit === 'ml' ? 'mililitros' : 'miligramas'}`}
                    />
                    <NumberFieldIncrement aria-label="Aumentar dose" className="border-y-0 border-e-0 border-s border-solid border-input bg-transparent px-3 text-foreground" />
                  </NumberFieldGroup>
                </NumberField>
                {comp.isOral ? null : (
                  <ToggleGroup value={[item.unit]} onValueChange={(next) => { if (next[0]) onChangeUnit(next[0] as 'ml' | 'mg'); }} variant="outline" spacing={0} aria-label="Unidade da dose" className="h-11 shrink-0">
                    <ToggleGroupItem value="ml" className="h-11 px-3">ml</ToggleGroupItem>
                    <ToggleGroupItem value="mg" className="h-11 px-3">mg</ToggleGroupItem>
                  </ToggleGroup>
                )}
              </div>
            </div>
            {comp.isOral ? null : (
              <label className="flex min-w-0 flex-col gap-1.5">
                <GroupLabel>Concentração do frasco</GroupLabel>
                <span className="relative block">
                  <Input type="number" inputMode="numeric" min={1} className="h-11 pe-16 text-base font-semibold tabular-nums" value={item.conc} onChange={(e) => onUpdate({ conc: Math.max(1, Number(e.target.value) || 1) })} />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">mg/ml</span>
                </span>
              </label>
            )}
          </div>

          {/* De quanto em quanto tempo */}
          <div className="flex flex-col gap-1.5">
            <GroupLabel>Frequência</GroupLabel>
            <ToggleGroup
              value={[String(item.freqDays)]} onValueChange={(next) => { if (next[0]) onUpdate({ freqDays: Number(next[0]) }); }}
              variant="outline" size="sm" spacing={1.5} aria-label="Frequência" className="w-full flex-wrap"
            >
              {RADAR_FREQUENCIES.map((f) => (
                <ToggleGroupItem key={f.days} value={String(f.days)} className="h-9 rounded-full px-3 text-xs">{FREQ_SHORT[f.days] ?? f.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Em que semanas */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <GroupLabel>Período de uso</GroupLabel>
              <Badge variant="outline" className="tabular-nums">{from === to ? `Só a semana ${from}` : `Semana ${from} a ${to}`}</Badge>
            </div>
            <Slider
              min={1} max={Math.max(2, weeks)} step={1} value={[from, to]} minStepsBetweenValues={0}
              onValueChange={(v) => { const [a, b] = Array.isArray(v) ? v : [v, v]; onUpdate({ startWeek: Math.min(a, b), endWeek: Math.max(a, b) }); }}
              aria-label="Semanas de uso (início e fim)"
            />
            <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground tabular-nums"><span>sem 1</span><span>sem {weeks}</span></div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-0 border-t border-solid border-border pt-3">
            <Button variant="ghost" size="lg" className="h-10 bg-transparent text-destructive" disabled={!canRemove} onClick={onRemove}>
              <Trash2 aria-hidden="true" />
              Remover
            </Button>
            <Button size="lg" className="h-10" onClick={onDone}>
              <Check aria-hidden="true" />
              Concluir
            </Button>
          </div>
        </div>
      ) : null}

      {/* O que isso dá na prática */}
      <div className="flex flex-col gap-3 rounded-lg px-3 py-3" style={{ backgroundColor: tint(7) }}>
        {hasEster ? (
          <div className="flex flex-col gap-1.5">
            <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: tint(22) }}>
              <span className="h-full rounded-full" style={{ width: `${comp.esterRatio * 100}%`, backgroundColor: comp.color }} />
            </div>
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span><strong className="font-semibold text-foreground">{n0(comp.esterRatio * 100)}%</strong> é hormônio</span>
              <span>{n0((1 - comp.esterRatio) * 100)}% é o éster, que faz durar</span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Comprimido: não tem éster, a dose inteira é hormônio.</span>
        )}
        <dl className="m-0 grid grid-cols-3 gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{comp.isOral ? 'Por dose' : 'No frasco'}</dt>
            <dd className="m-0 text-base leading-tight font-semibold text-foreground tabular-nums">{n0(doseMg)} <span className="text-xs font-normal text-muted-foreground">mg</span></dd>
            {item.unit === 'ml' && !comp.isOral ? <dd className="m-0 text-xs text-muted-foreground tabular-nums">{nDose(item.amount)} ml × {item.conc}</dd> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Hormônio</dt>
            <dd className="m-0 text-base leading-tight font-semibold text-foreground tabular-nums">{n0(activeMg)} <span className="text-xs font-normal text-muted-foreground">mg</span></dd>
            <dd className="m-0 text-xs text-muted-foreground">por {comp.isOral ? 'dose' : 'aplicação'}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Na semana</dt>
            <dd className="m-0 text-base leading-tight font-semibold text-foreground tabular-nums">{n0(weeklyActive)} <span className="text-xs font-normal text-muted-foreground">mg</span></dd>
            <dd className="m-0 text-xs text-muted-foreground">de hormônio</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
