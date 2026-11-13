/**
 * Mini linha do tempo de um exame (ao lado do valor): mostra a TENDÊNCIA em vez do número
 * solto. A faixa sombreada é o período do protocolo, quando a data de início é conhecida —
 * é o que deixa ver "antes × durante". Decorativa para leitor de tela: o texto ao lado
 * ("44 → 49") carrega a mesma informação.
 */
import type { EvolutionRow } from '@/utils/hormoneRadar';

const W = 84;
const H = 28;
const PAD = 3;

export function MarkerSpark({ points, protocolStart, protocolEnd }: {
  points: NonNullable<EvolutionRow['points']>;
  /** Início e fim do protocolo em ms (ou null quando o usuário não informou a data). */
  protocolStart: number | null;
  protocolEnd: number | null;
}) {
  const data = points
    .filter((p): p is { value: number; date: string } => p.value != null && !!p.date && Number.isFinite(p.value))
    .map((p) => ({ t: new Date(p.date).getTime(), v: p.value }))
    .sort((a, b) => a.t - b.t);
  if (data.length < 2) return null;

  const t0 = data[0].t;
  const t1 = Math.max(data[data.length - 1].t, t0 + 1);
  const lo = Math.min(...data.map((d) => d.v));
  const hi = Math.max(...data.map((d) => d.v));
  const span = hi - lo || 1;
  const x = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD);
  const last = data[data.length - 1];

  // Período do protocolo, recortado ao intervalo dos exames.
  const bandFrom = protocolStart != null ? Math.max(t0, protocolStart) : null;
  const bandTo = protocolEnd != null ? Math.min(t1, protocolEnd) : null;
  const band = bandFrom != null && bandTo != null && bandTo > bandFrom;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0 overflow-visible">
      {band ? <rect x={x(bandFrom!)} y={0} width={x(bandTo!) - x(bandFrom!)} height={H} rx={3} className="fill-primary/15" /> : null}
      <polyline
        points={data.map((d) => `${x(d.t).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ')}
        fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={x(last.t)} cy={y(last.v)} r={2.75} className="fill-foreground stroke-card" strokeWidth={1.25} />
    </svg>
  );
}
