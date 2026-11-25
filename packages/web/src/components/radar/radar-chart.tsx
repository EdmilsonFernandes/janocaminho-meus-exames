/**
 * Gráfico do Radar Hormonal — feito para o paciente LER, não só olhar.
 *
 * O que o eixo vertical é: a LIBERAÇÃO ESTIMADA do depósito, em mg de hormônio ativo por dia.
 * NÃO é o nível no sangue (ng/dL): por isso nenhum resultado de exame é desenhado nesta escala;
 * o exame entra só como uma DATA (linha vertical com losango no topo).
 *
 *  - faixa sombreada = o período usado no cálculo de pico/vale/oscilação;
 *  - "pico" e "vale" marcados na própria curva, dentro desse período;
 *  - triângulo VAZADO embaixo = cada aplicação PREVISTA, na cor do composto (forma diferente da
 *    registrada: não depender só de cor); a PRÓXIMA depois de hoje ganha o rótulo "próxima";
 *  - bolinha grande NA CURVA = aplicação que a pessoa REGISTROU (dono 24/11: "vejo o traço mas
 *    não fica claro quando apliquei" — no celular o SVG de 820px encolhe ~2,6x, então tudo que
 *    marca data precisa ser grande no viewBox);
 *  - linha vertical "hoje" = onde a pessoa está no ciclo;
 *  - linha pontilhada = média diária, a régua para enxergar a oscilação;
 *  - cada composto tem cor E tipo de traço (não depender só de cor);
 *  - funciona no TOQUE (arrastar o dedo), não só com mouse.
 */
import { useId, useRef, useState } from 'react';
import { cn } from 'cn';
import type { RadarSeriesResult, RadarStats } from '@/utils/hormoneRadar';

const W = 820;
const H = 384;
const PAD = { top: 52, right: 16, bottom: 74, left: 54 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

const DASHES = ['', '9 4', '2 5', '12 4 2 4', '5 3'];
/** Tipo de traço do composto pela posição no protocolo (o mesmo na legenda e no gráfico). */
export const radarDash = (index: number): string => DASHES[index % DASHES.length];

/** Larguras ESTIMADAS dos rótulos no pior caso (celular, fonte de 24 no viewBox) — só para não sobrepor. */
const HOJE_W = 62;
const NEXT_W = 104;
/** Triângulo da aplicação prevista: meia-largura máxima e altura, em unidades do viewBox (encolhe ~2,6x no celular). */
const TRI_HALF = 12;
const TRI_H = 20;

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RadarChart({
  series, compare, stats, weeks, examDay, hidden, dayLabel, todayDay = null,
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
  /** Dia de hoje a partir do início (null sem data de início). Fora do período = não desenha. */
  todayDay?: number | null;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState<number | null>(null);

  const indexed = series.seriesPerItem.map((s, index) => ({ ...s, index }));
  const shown = indexed.filter((s) => !hidden.has(s.item.uid));
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

  // Pico e vale DENTRO do período usado no cálculo (os mesmos pontos de onde saem os números do resumo).
  const hasWindow = stats.windowEndDay > stats.windowStartDay;
  const winFrom = Math.round(stats.windowStartDay * series.stepsPerDay);
  const winTo = Math.min(series.totalSteps, Math.round(stats.windowEndDay * series.stepsPerDay));
  let peakStep = winFrom;
  let troughStep = winFrom;
  for (let s = winFrom; s <= winTo; s++) {
    if ((series.total[s] ?? 0) > (series.total[peakStep] ?? 0)) peakStep = s;
    if ((series.total[s] ?? 0) < (series.total[troughStep] ?? 0)) troughStep = s;
  }
  const showExtremes = hasWindow && (series.total[peakStep] ?? 0) - (series.total[troughStep] ?? 0) > top * 0.03;
  const anchor = (s: number) => (x(s) > W - 70 ? 'end' : x(s) < PAD.left + 40 ? 'start' : 'middle');

  // O dia tocado tem aplicação? É o dia do exame?
  const shotsToday = day == null ? [] : shown.filter((s) => s.injectionDays.some((d) => Math.abs(d - day) < 0.5)).map((s) => s.comp.short);
  const isExamDay = day != null && examDay != null && Math.abs(examDay - day) < 0.5;
  const loggedToday = day == null ? [] : shown.filter((s) => s.loggedDays.some((d) => Math.abs(d - day) < 0.5)).map((s) => s.comp.short);
  const plannedToday = shotsToday.filter((n) => !loggedToday.includes(n));
  const hasLogged = shown.some((s) => s.loggedDays.length > 0);
  const todayStep = todayDay != null && todayDay >= 0 && todayDay <= series.totalDays ? Math.round(todayDay * series.stepsPerDay) : null;
  const isToday = day != null && todayDay != null && Math.floor(day) === Math.floor(todayDay);

  // Previstas = dias do calendário que a pessoa NÃO registrou. Uma fileira por composto (até 4).
  const base = PAD.top + CH;
  const predicted = shown.map((s, row) => {
    const spacing = (Math.max(0.5, s.item.freqDays) / Math.max(1, series.totalDays)) * CW;
    return {
      s,
      top: base + 4 + Math.min(row, 3) * 8,
      // Aplicação diária em 24 semanas ficaria um borrão: o triângulo estreita com o intervalo.
      half: Math.max(2.5, Math.min(TRI_HALF, spacing * 0.38)),
      days: s.injectionDays.filter((d) => d <= series.totalDays && !s.loggedDays.some((l) => Math.abs(l - d) < 1e-6)),
    };
  });
  const triangle = (cx: number, top: number, half: number) => `M${cx.toFixed(1)},${top}L${(cx + half).toFixed(1)},${top + TRI_H}L${(cx - half).toFixed(1)},${top + TRI_H}Z`;

  // A PRÓXIMA prevista a partir de hoje (só com data de início e hoje dentro do período).
  let nextMark: { day: number; color: string; top: number; half: number } | null = null;
  if (todayStep != null && todayDay != null) {
    const from = Math.floor(todayDay);
    for (const p of predicted) {
      for (const d of p.days) {
        if (d >= from && (nextMark == null || d < nextMark.day)) nextMark = { day: d, color: p.s.comp.color, top: p.top, half: p.half };
      }
    }
  }
  // Rótulos "hoje" e "próxima" lado a lado sem se sobrepor; sem espaço, a "próxima" fica só com a marca.
  const xToday = todayStep != null ? x(todayStep) : null;
  const xNext = nextMark ? x(nextMark.day * series.stepsPerDay) : null;
  let hojeLabel: { x: number; anchor: 'start' | 'middle' | 'end' } | null = xToday != null && todayStep != null ? { x: xToday, anchor: anchor(todayStep) } : null;
  let nextLabel: { x: number; anchor: 'start' | 'end' } | null = null;
  if (xToday != null && xNext != null) {
    const hojeFitsLeft = xToday - 8 - HOJE_W >= 0;
    hojeLabel = hojeFitsLeft ? { x: xToday - 8, anchor: 'end' } : { x: xToday + 8, anchor: 'start' };
    const hojeRight = hojeFitsLeft ? xToday : xToday + 8 + HOJE_W;
    if (xNext + 8 >= hojeRight + 6 && xNext + 8 + NEXT_W <= W) nextLabel = { x: xNext + 8, anchor: 'start' };
    else if (xNext - 8 - NEXT_W >= hojeRight + 6) nextLabel = { x: xNext - 8, anchor: 'end' };
  }
  const loggedColors = shown.filter((s) => s.loggedDays.some((d) => d >= 0 && d <= series.totalDays)).map((s) => s.comp.color).slice(0, 3);
  const predictedColors = predicted.filter((p) => p.days.length > 0).map((p) => p.s.comp.color).slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Simulação da liberação de hormônio em ${weeks} semanas, em miligramas por dia. No período usado no cálculo: média de ${fmt(stats.avgDailyMg)} miligramas por dia, pico de ${fmt(stats.peakMg)} e vale de ${fmt(stats.troughMg)}.`}
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

        {/* Unidade do eixo vertical */}
        <text x={0} y={PAD.top - 26} aria-hidden="true" className="fill-muted-foreground">mg/dia</text>

        {/* Período usado no cálculo (de onde saem pico, vale e oscilação) */}
        {hasWindow ? (
          <g aria-hidden="true">
            <rect
              x={x(winFrom)} y={PAD.top}
              width={x(winTo) - x(winFrom)} height={CH}
              className="fill-muted-foreground/10"
            />
            <text x={x(winTo)} y={PAD.top - 26} textAnchor="end" className="fill-muted-foreground">
              período usado no cálculo
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

        {/* Média diária: a régua para enxergar a oscilação */}
        {stats.avgDailyMg > 0 ? (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(stats.avgDailyMg)} y2={y(stats.avgDailyMg)} aria-hidden="true" className="stroke-foreground/45" strokeWidth={1} strokeDasharray="1 4" strokeLinecap="round" />
        ) : null}

        {/* Soma preenchida + cada composto (cor + tipo de traço) */}
        <path d={area(series.total)} fill={`url(#${id}-fill)`} aria-hidden="true" />
        {shown.map((s) => (
          <path key={s.item.uid} d={path(s.values)} fill="none" stroke={s.comp.color} strokeWidth={many ? 2 : 2.5} strokeDasharray={many ? radarDash(s.index) || undefined : undefined} strokeLinejoin="round" aria-hidden="true" />
        ))}
        {many ? <path d={path(series.total)} fill="none" className="stroke-foreground" strokeWidth={2.5} strokeLinejoin="round" aria-hidden="true" /> : null}
        {compare ? <path d={path(compare.total)} fill="none" className="stroke-warning" strokeWidth={2} strokeDasharray="6 4" aria-hidden="true" /> : null}

        {/* Aplicações PREVISTAS: triângulo vazado embaixo do eixo, na cor do composto */}
        {predicted.map((p) => p.days.map((d) => (
          <path
            key={`${p.s.item.uid}-${d}`} aria-hidden="true"
            d={triangle(x(d * series.stepsPerDay), p.top, p.half)}
            className="fill-card" stroke={p.s.comp.color} strokeWidth={2.5} strokeLinejoin="round"
          />
        )))}
        {/* A próxima prevista depois de hoje: guia até o topo, marca reforçada e rótulo */}
        {nextMark && xNext != null ? (
          <g aria-hidden="true">
            <line x1={xNext} x2={xNext} y1={PAD.top} y2={base} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" />
            <path d={triangle(xNext, nextMark.top, nextMark.half)} className="fill-card" stroke={nextMark.color} strokeWidth={4} strokeLinejoin="round" />
            {nextLabel ? <text x={nextLabel.x} y={PAD.top - 4} textAnchor={nextLabel.anchor} className="fill-muted-foreground font-semibold">próxima</text> : null}
          </g>
        ) : null}
        {/* Hoje: onde a pessoa está no ciclo */}
        {todayStep != null && hojeLabel ? (
          <g aria-hidden="true">
            <line x1={x(todayStep)} x2={x(todayStep)} y1={PAD.top} y2={PAD.top + CH} className="stroke-primary" strokeWidth={3} />
            <text x={hojeLabel.x} y={PAD.top - 4} textAnchor={hojeLabel.anchor} className="fill-primary font-semibold">hoje</text>
          </g>
        ) : null}

        {/* Pico e vale no período usado no cálculo */}
        {showExtremes ? (
          <g aria-hidden="true">
            <circle cx={x(peakStep)} cy={y(series.total[peakStep] ?? 0)} r={5} className="fill-card stroke-foreground" strokeWidth={2} />
            <text x={x(peakStep)} y={y(series.total[peakStep] ?? 0) - 11} textAnchor={anchor(peakStep)} className="fill-foreground font-semibold">pico</text>
            <circle cx={x(troughStep)} cy={y(series.total[troughStep] ?? 0)} r={5} className="fill-card stroke-foreground" strokeWidth={2} />
            <text x={x(troughStep)} y={y(series.total[troughStep] ?? 0) + 11} dominantBaseline="hanging" textAnchor={anchor(troughStep)} className="fill-foreground font-semibold">vale</text>
          </g>
        ) : null}

        {/* Aplicações que o paciente REGISTROU: bolinha grande NA CURVA do composto + haste até o eixo
            (no celular r=11 vira ~4px de raio — dá para ver e tocar). O resto é previsão (triângulos vazados). */}
        {shown.map((s) => s.loggedDays.filter((d) => d >= 0 && d <= series.totalDays).map((d) => {
          const st = Math.round(d * series.stepsPerDay);
          const cy = y((many ? series.total[st] : s.values[st]) ?? 0);
          return (
            <g key={`log-${s.item.uid}-${d}`} aria-hidden="true">
              <line x1={x(st)} x2={x(st)} y1={cy} y2={PAD.top + CH} stroke={s.comp.color} strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
              <circle cx={x(st)} cy={cy} r={11} fill={s.comp.color} className="stroke-card" strokeWidth={3.5} />
            </g>
          );
        }))}

        {/* Dia do exame de sangue: só a DATA (o resultado tem outra unidade e fica fora desta escala) */}
        {examStep != null ? (
          <g aria-hidden="true">
            <line x1={x(examStep)} x2={x(examStep)} y1={PAD.top} y2={PAD.top + CH} className="stroke-destructive" strokeWidth={1.5} strokeDasharray="3 3" />
            <path d={`M${x(examStep)},${PAD.top - 9}l7,7l-7,7l-7,-7Z`} className="fill-destructive stroke-card" strokeWidth={1.5} />
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

      {/* Legenda das marcas de data: as MESMAS formas e cores do gráfico (bolinha cheia × triângulo vazado) */}
      <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {hasLogged && loggedColors.length ? (
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">
              {loggedColors.map((color, i) => (
                <svg key={`${color}-${i}`} width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                  <circle cx="7" cy="7" r="5.5" fill={color} className="stroke-card" strokeWidth="1.5" />
                </svg>
              ))}
            </span>
            Aplicação registrada
          </span>
        ) : null}
        {predictedColors.length ? (
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">
              {predictedColors.map((color, i) => (
                <svg key={`${color}-${i}`} width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                  <path d="M7,2L12.5,12H1.5Z" className="fill-card" stroke={color} strokeWidth="1.75" strokeLinejoin="round" />
                </svg>
              ))}
            </span>
            Aplicação prevista
          </span>
        ) : null}
        {todayStep != null ? <span className="flex items-center gap-1.5"><span className="h-3.5 w-0.5 bg-primary" />Hoje</span> : null}
      </div>

      <div aria-live="polite" className={cn('flex min-h-9 flex-col gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs', step == null && 'justify-center text-muted-foreground')}>
        {step == null || day == null ? (
          <span>Toque ou passe o dedo no gráfico para ver a estimativa de um dia.</span>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-sm font-semibold text-foreground">{dayLabel(day)}</span>
              {isToday ? <span className="font-medium text-primary">Hoje</span> : null}
              {loggedToday.length ? <span className="font-medium text-foreground">Você aplicou: {loggedToday.join(', ')}</span> : null}
              {plannedToday.length ? <span className="text-muted-foreground">Aplicação prevista: {plannedToday.join(', ')}</span> : null}
              {isExamDay ? <span className="font-medium text-destructive">Dia do exame de sangue</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="tabular-nums">{many ? 'Soma estimada' : 'Liberação estimada'} <strong className="text-foreground">{fmt(series.total[step] ?? 0)} mg/dia</strong></span>
              {many ? shown.map((s) => (
                <span key={s.item.uid} className="flex items-center gap-1.5 tabular-nums">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: s.comp.color }} />
                  {s.comp.short} {fmt(s.values[step] ?? 0)} mg/dia
                </span>
              )) : null}
              {compare ? <span className="tabular-nums">Dividido em 2x: {fmt(compare.total[step] ?? 0)} mg/dia</span> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
