/**
 * RangeBar — onde o valor cai em relação à faixa de referência do próprio laudo.
 * A zona "na faixa" ocupa o meio do trilho; o marcador mostra o valor. Nunca depende só da
 * cor: quem usa mostra junto o rótulo escrito ("Na faixa", "Acima", "Abaixo").
 * Sem faixa nenhuma (low e high nulos) não desenha nada: não inventa referência.
 */
import { cn } from '@/lib/utils';

interface RangeBarProps {
  value: number | null | undefined;
  low?: number | null;
  high?: number | null;
  /** 'ok' = na faixa; 'warn' = fora. Quem chama decide (flag do laudo manda). */
  tone: 'ok' | 'warn';
  className?: string;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Posição do marcador (0–100) e limites da zona de referência no trilho. */
export function rangeBarGeometry(value: number, low: number | null, high: number | null) {
  if (low != null && high != null && high > low) {
    // faixa no miolo (25%–75%); fora dela o marcador anda proporcionalmente até a borda
    const pos = 25 + ((value - low) / (high - low)) * 50;
    return { zone: [25, 75] as const, pos: clamp(pos, 3, 97) };
  }
  if (high != null && high > 0) return { zone: [0, 70] as const, pos: clamp((value / high) * 70, 3, 97) };
  if (low != null && low > 0) return { zone: [30, 100] as const, pos: clamp((value / low) * 30, 3, 97) };
  return null;
}

export function RangeBar({ value, low = null, high = null, tone, className }: RangeBarProps) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const g = rangeBarGeometry(Number(value), low != null ? Number(low) : null, high != null ? Number(high) : null);
  if (!g) return null;
  return (
    <span aria-hidden="true" className={cn('relative block h-1.5 w-full rounded-full bg-muted', className)}>
      <span className="absolute inset-y-0 rounded-full bg-success/30" style={{ left: `${g.zone[0]}%`, width: `${g.zone[1] - g.zone[0]}%` }} />
      <span
        className={cn(
          'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background',
          tone === 'ok' ? 'bg-success' : 'bg-warning',
        )}
        style={{ left: `${g.pos}%` }}
      />
    </span>
  );
}
