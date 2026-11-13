/**
 * Gráfico do Radar Hormonal — feito para o paciente LER, não só olhar:
 *  - faixa sombreada = o trecho onde pico/vale foram medidos (de onde saem os números);
 *  - risquinhos embaixo = cada aplicação, na cor do composto;
 *  - linha tracejada "nível médio" = a referência que o olho precisa para ver a oscilação;
 *  - pino vermelho = o dia do exame de sangue;
 *  - funciona no TOQUE (arrastar o dedo), não só com mouse — a 1ª versão só tinha hover.
 */
import { useId, useRef, useState } from 'react';
import { cn } from 'cn';
import type { RadarSeriesResult, RadarStats } from '@/utils/hormoneRadar';

const W = 820;
const H = 340;
const PAD = { top: 26, right: 16, bottom: 56, left: 54 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RadarChart({
  series, compare, stats, weeks, examDay, hidden, dayLabel,
}: {
  series: RadarSeriesResult;
  /** Mesma dose dividida em 2x/semana (linha tracejada), ou null. */
  compare: RadarSeriesResult | null;
  stats: RadarStats;
  weeks: number;
  /** Dia do exame de sangue (a partir do início), ou null. */
  examDay: number | null;
  /** uids de compostos escondidos pelo usuário. */
  hidden: Set<string>;
  /** Transforma "dia N" numa data real quando o início do ciclo é conhecido. */
  dayLabel: (day: number) => string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState<number | null>(null);

  const shown = series.seriesPerItem.filter((s) => !hidden.has(s.item.uid));
  const many = series.seriesPerItem.length > 1;
  let maxY = 5;
  for (let s = 0; s <= series.totalSteps; s++) {
    maxY = Math.max(maxY, series.total[s], compare ? compare.total[s] : 0);
  }
  const niceStep = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((n) => (maxY * 1.12) / n <= 5) ?? 500;
  const top = Math.ceil((maxY * 1.12) / niceStep) * niceStep;
  const x = (s: number) => PAD.left + (s / Math.max(1, series.totalSteps)) * CW;
  const y = (v: number) => PAD.top + CH - (v / top) * CH;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = (vals: number[]) => `${path(vals)}L${x(series.totalSteps).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;

  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((clientX - box.left) / box.width) * W;
    setStep(Math.round(Math.min(1, Math.max(0, (sx - PAD.left) / CW)) * series.totalSteps));
  };

  const weekTicks = Array.from({ length: weeks + 1 }, (_, w) => w).filter((w) => (weeks <= 8 ? w % 2 === 0 : w % 4 === 0));
  const examStep = examDay == null ? null : Math.round(Math.min(series.totalDays, Math.max(0, examDay)) * series.stepsPerDay);
  const day = step == null ? null : step / series.stepsPerDay;

  return (
    <div className="flex flex-col gap-3">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Curva de liberação em ${weeks} semanas. No trecho estável: média de ${fmt(stats.avgDailyMg)} miligramas por dia, pico de ${fmt(stats.peakMg)} e vale de ${fmt(stats.troughMg)}.`}
        className="h-auto w-full touch-pan-y select-none overflow-visible [&_text]:text-[24px] sm:[&_text]:text-[13px]"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setStep(null); }}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Trecho medido (de onde saem pico, vale e oscilação) */}
        {stats.windowEndDay > stats.windowStartDay ? (
          <g aria-hidden="true">
            <rect
              x={x(stats.windowStartDay * series.stepsPerDay)} y={PAD.top}
              width={x(stats.windowEndDay * series.stepsPerDay) - x(stats.windowStartDay * series.stepsPerDay)} height={CH}
              className="fill-muted-foreground/10"
            />
            <text x={(x(stats.windowStartDay * series.stepsPerDay) + x(stats.windowEndDay * series.stepsPerDay)) / 2} y={PAD.top - 8} textAnchor="middle" className="fill-muted-foreground">
              trecho medido
            </text>
          </g>
        ) : null}

        {/* Grade e eixo Y */}
        {Array.from({ length: Math.round(top / niceStep) + 1 }, (_, i) => i * niceStep).map((v) => (
          <g key={v} aria-hidden="true">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground tabular-nums">{v}</text>
          </g>
        ))}
        {weekTicks.map((w) => (
          <text key={w} x={x(w * 7 * series.stepsPerDay)} y={H - 8} textAnchor="middle" aria-hidden="true" className="fill-muted-foreground">
            {w === 0 ? 'início' : `sem ${w}`}
          </text>
        ))}

        {/* Nível médio: a régua para enxergar a oscilação */}
        {stats.avgDailyMg > 0 ? (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(stats.avgDailyMg)} y2={y(stats.avgDailyMg)} aria-hidden="true" className="stroke-foreground/45" strokeWidth={1} strokeDasharray="1 4" strokeLinecap="round" />
        ) : null}

        {/* Total preenchido + cada composto */}
        <path d={area(series.total)} fill={`url(#${id}-fill)`} aria-hidden="true" />
        {shown.map((s) => (
          <path key={s.item.uid} d={path(s.values)} fill="none" stroke={s.comp.color} strokeWidth={many ? 1.75 : 2.5} strokeLinejoin="round" aria-hidden="true" />
        ))}
        {many ? <path d={path(series.total)} fill="none" className="stroke-foreground" strokeWidth={2.5} strokeLinejoin="round" aria-hidden="true" /> : null}
        {compare ? <path d={path(compare.total)} fill="none" className="stroke-warning" strokeWidth={2} strokeDasharray="6 4" aria-hidden="true" /> : null}

        {/* Aplicações: um risco por dose, na cor do composto */}
        {shown.map((s, row) => s.injectionDays.map((d) => (
          <line
            key={`${s.item.uid}-${d}`} aria-hidden="true"
            x1={x(d * series.stepsPerDay)} x2={x(d * series.stepsPerDay)}
            y1={PAD.top + CH + 4 + row * 5} y2={PAD.top + CH + 8 + row * 5}
            stroke={s.comp.color} strokeWidth={2} strokeLinecap="round"
          />
        )))}

        {/* Pino do exame de sangue */}
        {examStep != null ? (
          <g aria-hidden="true">
            <line x1={x(examStep)} x2={x(examStep)} y1={PAD.top} y2={PAD.top + CH} className="stroke-destructive" strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={x(examStep)} cy={y(series.total[examStep] ?? 0)} r={5.5} className="fill-destructive stroke-card" strokeWidth={2} />
          </g>
        ) : null}

        {/* Leitura do dia tocado */}
        {step != null ? (
          <g aria-hidden="true">
            <line x1={x(step)} x2={x(step)} y1={PAD.top} y2={PAD.top + CH} className="stroke-muted-foreground" strokeWidth={1} />
            <circle cx={x(step)} cy={y(series.total[step] ?? 0)} r={4.5} className="fill-foreground stroke-card" strokeWidth={2} />
          </g>
        ) : null}
      </svg>

      <div aria-live="polite" className={cn('flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs', step == null && 'text-muted-foreground')}>
        {step == null || day == null ? (
          <span>Toque ou passe o dedo no gráfico para ver um dia.</span>
        ) : (
          <>
            <span className="font-semibold text-foreground">{dayLabel(day)}</span>
            <span className="tabular-nums">Total <strong className="text-foreground">{fmt(series.total[step] ?? 0)} mg/dia</strong></span>
            {many ? shown.map((s) => (
              <span key={s.item.uid} className="flex items-center gap-1.5 tabular-nums">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: s.comp.color }} />
                {s.comp.short} {fmt(s.values[step] ?? 0)}
              </span>
            )) : null}
            {compare ? <span className="tabular-nums">Dividido em 2x: {fmt(compare.total[step] ?? 0)}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
