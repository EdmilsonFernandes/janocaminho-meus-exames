/**
 * Linha vertical "hoje" — a mesma marca do gráfico do Radar Hormonal (components/radar/radar-chart.tsx),
 * para os demais gráficos de TEMPO: responde "onde eu estou agora?" e deixa visível o vazio
 * entre o último dado e hoje.
 *
 * Só entra quando o eixo X é tempo de verdade e `planTodayAxis` (./recency) disse que cabe.
 * O desenho é decorativo (`aria-hidden`): quem usa precisa dizer a mesma coisa em texto
 * (rótulo acessível do gráfico e/ou <LastDataLabel />).
 */
import { ReferenceLine } from 'recharts';

export const TODAY_LABEL = 'hoje';

interface TodayLineProps {
  /** Posição horizontal, em px do SVG. */
  x: number;
  /** Topo e base da área de plotagem, em px do SVG. */
  top: number;
  bottom: number;
  /** Cor da linha — token do tema (padrão: teal da marca via `--primary`). */
  color?: string;
  /** Cor do rótulo, quando precisa de mais contraste que a linha. */
  labelColor?: string;
  label?: string;
}

/** O desenho puro (linha + rótulo acima da área do gráfico). Serve também a SVG feito à mão. */
export function TodayLine({ x, top, bottom, color = 'var(--primary)', labelColor, label = TODAY_LABEL }: TodayLineProps) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      <line x1={x} x2={x} y1={top} y2={bottom} stroke={color} strokeWidth={2} />
      <text x={x} y={top - 6} textAnchor="middle" fill={labelColor ?? color} fontSize={12} fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

interface ShapeCoords {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/**
 * Para gráficos recharts com XAxis numérico de tempo (`type="number" scale="time"`).
 * Use como filho direto do gráfico; o domínio do eixo precisa incluir `x`
 * (fora do domínio o recharts descarta a linha — nunca desenha no lugar errado).
 * Reserve ~16px de margem superior no gráfico para o rótulo.
 */
export function TodayMarker({ x, color, labelColor, label }: {
  /** Timestamp de hoje, na mesma unidade do eixo X. */
  x: number;
  color?: string;
  labelColor?: string;
  label?: string;
}) {
  return (
    <ReferenceLine
      x={x}
      ifOverflow="discard"
      shape={(coords: ShapeCoords) => {
        const { x1, y1, y2 } = coords;
        if (typeof x1 !== 'number' || typeof y1 !== 'number' || typeof y2 !== 'number' || !Number.isFinite(x1 + y1 + y2)) return <g />;
        return <TodayLine x={x1} top={Math.min(y1, y2)} bottom={Math.max(y1, y2)} color={color} labelColor={labelColor} label={label} />;
      }}
    />
  );
}
