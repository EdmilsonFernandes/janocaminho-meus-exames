/**
 * Medidores segmentados da composição corporal — mesma linguagem do bloco ReUI stats-18
 * (pílulas `flex-1 rounded-full` sobre `bg-muted`), aplicada a dois instrumentos:
 *  - RangeMeter: onde o valor cai em relação a uma faixa (a régua).
 *  - CompositionBar: do que o peso é feito (gordura, músculo, restante).
 */
import { cn } from 'cn';
import { ZONE_LABEL, formatNumber, zoneOf, type RangeInfo } from './model';

const RANGE_SEGMENTS = 32;
const RANGE_INDEXES = Array.from({ length: RANGE_SEGMENTS }, (_, index) => index);

/**
 * Régua de faixa: a faixa ocupa o miolo, o valor é a pílula alta. A posição já diz
 * "abaixo / dentro / acima" sem depender de cor; os limites vêm escritos embaixo.
 */
export function RangeMeter({
  value,
  range,
  unit,
  decimals,
  label,
}: {
  value: number;
  range: RangeInfo;
  unit: string;
  decimals: number;
  /** Nome da medida, para o leitor de tela. */
  label: string;
}) {
  const span = range.high - range.low;
  const min = Math.max(0, Math.min(range.low - span * 0.6, value - span * 0.15));
  const max = Math.max(range.high + span * 0.6, value + span * 0.15);
  const width = max - min;
  const at = Math.min(RANGE_SEGMENTS - 1, Math.max(0, Math.floor(((value - min) / width) * RANGE_SEGMENTS)));
  const zone = zoneOf(value, range.low, range.high);
  const edge = (v: number) => `${((v - min) / width) * 100}%`;
  const u = unit ? ` ${unit}` : '';

  return (
    <div
      role="img"
      aria-label={`${label}: ${formatNumber(value, decimals)}${u}. ${ZONE_LABEL[zone]}, que vai de ${formatNumber(range.low, decimals)} a ${formatNumber(range.high, decimals)}${u}.`}
      className="flex flex-col gap-1.5"
    >
      <div aria-hidden="true" className="flex h-5 items-center gap-0.75">
        {RANGE_INDEXES.map((index) => {
          const center = min + ((index + 0.5) / RANGE_SEGMENTS) * width;
          const inBand = center >= range.low && center <= range.high;
          return (
            <span
              key={index}
              className={cn(
                'flex-1 rounded-full',
                index === at
                  ? cn('h-5', zone === 'in' ? 'bg-success' : 'bg-warning')
                  : cn('h-2.5', inBand ? 'bg-success/30' : 'bg-muted'),
              )}
            />
          );
        })}
      </div>
      <div aria-hidden="true" className="relative h-4 text-xs text-muted-foreground tabular-nums">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: edge(range.low) }}>
          {formatNumber(range.low, decimals)}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: edge(range.high) }}>
          {formatNumber(range.high, decimals)}
        </span>
      </div>
    </div>
  );
}

const BAR_SEGMENTS = 40;

export interface CompositionPart {
  key: string;
  label: string;
  kg: number;
  /** Classe de preenchimento (categórica, com par dark quando é paleta crua). */
  swatch: string;
}

/** Barra do corpo: 40 pílulas repartidas na proporção de cada parte do peso. */
export function CompositionBar({ parts, totalKg }: { parts: CompositionPart[]; totalKg: number }) {
  // Maior resto: as fatias somam exatamente 40, sem sobrar nem faltar pílula.
  const exact = parts.map((part) => (part.kg / totalKg) * BAR_SEGMENTS);
  const counts = exact.map(Math.floor);
  let left = BAR_SEGMENTS - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, rest: v - Math.floor(v) })).sort((a, b) => b.rest - a.rest);
  for (let k = 0; left > 0 && k < order.length; k++, left--) counts[order[k].i]++;
  const pills = parts.flatMap((part, i) => Array.from({ length: counts[i] }, (_, n) => ({ id: `${part.key}-${n}`, swatch: part.swatch })));

  return (
    <div aria-hidden="true" className="flex h-6 gap-0.75">
      {pills.map((pill) => (
        <span key={pill.id} className={cn('flex-1 rounded-full', pill.swatch)} />
      ))}
    </div>
  );
}
