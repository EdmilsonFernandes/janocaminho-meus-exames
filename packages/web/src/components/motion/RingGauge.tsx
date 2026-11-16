/**
 * RingGauge — anel de uma ou mais fatias (composição do corpo, meta do dia).
 * SVG puro, sem biblioteca. Entrada única por opacidade/escala (respeita reduced-motion);
 * o conteúdo do centro (número, rótulo) é de quem usa.
 */
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface RingSegment {
  /** Fração de 0 a 1 do anel. */
  fraction: number;
  /** Classe de cor do traço, ex.: 'stroke-primary'. */
  className: string;
}

interface RingGaugeProps {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  /** Espaço entre fatias, em graus. */
  gap?: number;
  children?: ReactNode;
  className?: string;
  label?: string;
}

export function RingGauge({ segments, size = 148, thickness = 12, gap = 3, children, className, label }: RingGaugeProps) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.fraction > 0.004);
  const gapLen = visible.length > 1 ? (gap / 360) * c : 0;
  let start = 0;
  return (
    <div
      className={cn('relative shrink-0 animate-in fade-in zoom-in-95 duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* começa no topo (12 h) e anda no sentido horário */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} stroke="currentColor" strokeOpacity={0.12} />
        {visible.map((s, i) => {
          const len = Math.max(0, Math.min(1, s.fraction) * c - gapLen);
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={thickness}
              strokeLinecap={visible.length > 1 ? 'butt' : 'round'}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-(start + gapLen / 2)}
              className={s.className}
            />
          );
          start += Math.min(1, s.fraction) * c;
          return el;
        })}
        </g>
      </svg>
      {children ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div> : null}
    </div>
  );
}
