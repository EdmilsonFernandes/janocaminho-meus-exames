/**
 * Placar de hoje — topo do Radar Hormonal (25/11).
 *
 * O dono pediu: "usuário não lê muito, quer ir pro que interessa na hora". Três números lado a
 * lado, antes de qualquer texto: última aplicação · próxima PREVISTA · estimativa de hoje.
 *
 * É um placar, não um conselheiro: mostra o que a pessoa registrou e a data prevista pelo
 * intervalo que ELA cadastrou. Nunca manda aplicar, nunca sugere dose. Tudo que é conta vem
 * rotulado como "prevista"/"estimado", e o aviso de simulação fica sempre à vista.
 *
 * Com mais de um composto o placar resume o conjunto (aplicação mais recente; próxima mais
 * próxima) e diz de qual composto veio — sem virar tabela.
 */
import { CalendarDays, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from 'cn';
import { FramePanel } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/motion/CountUp';
import { GlassGlow } from '@/components/motion/GlassGlow';
import { calendarDayDiff, lastDoseLabel, nextDoseLabel } from '@/utils/hormoneRadar';

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).split('.').join('').replace(' de ', ' ');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** "há 3 dias" → "Há" pequeno, "3" grande, "dias" pequeno; "hoje"/"—" inteiro grande. */
function BigValue({ text, className }: { text: string; className?: string }) {
  const m = /^(\D*?)(\d+)(\D*)$/.exec(text);
  if (!m) return <span className={cn('text-xl leading-7 font-semibold tracking-tight text-foreground', className)}>{cap(text)}</span>;
  const before = m[1].trim();
  const after = m[3].trim();
  return (
    <span className="flex flex-wrap items-baseline gap-x-1">
      {before ? <span className="text-xs text-muted-foreground">{cap(before)}</span> : null}
      <span className={cn('text-2xl leading-7 font-semibold tracking-tight text-foreground tabular-nums', className)}>{m[2]}</span>
      {after ? <span className="text-xs text-muted-foreground">{after}</span> : null}
    </span>
  );
}

function Cell({ label, children, divided }: { label: string; children: React.ReactNode; divided?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', divided && 'border-0 border-s border-solid border-border ps-2')}>
      <dt className="flex min-h-8 items-end text-xs leading-4 font-medium text-muted-foreground">{label}</dt>
      {children}
    </div>
  );
}

export function TodayBoard({
  now, loading, last, lastName, next, nextName, estimateMg, avgMg, estimateState, summed, onInformStart, perCompound,
}: {
  /** Com 2+ compostos: última e próxima prevista de CADA um (o resumo de cima mostra só o mais recente
   *  e o mais próximo — sem esta lista, o outro composto some do placar). */
  perCompound?: Array<{ name: string; last: number | null; next: number | null; lateDays: number }>;
  now: number;
  /** Ainda buscando os registros. */
  loading: boolean;
  /** Aplicação mais recente registrada (ms) ou null. */
  last: number | null;
  /** Composto da última aplicação — só quando há mais de um no protocolo. */
  lastName: string | null;
  /** Próxima prevista mais próxima (ms) ou null. */
  next: number | null;
  nextName: string | null;
  /** Liberação estimada hoje (mg/dia) — só com data de início e hoje dentro do período do gráfico. */
  estimateMg: number | null;
  /** Média diária do período usado no cálculo (mg/dia). */
  avgMg: number;
  /** Por que não há estimativa: sem data de início, ou hoje fora do período mostrado. */
  estimateState: 'ok' | 'sem-inicio' | 'fora-do-periodo';
  /** Mais de um composto: o número é a soma. */
  summed: boolean;
  onInformStart: () => void;
}) {
  const nextIn = next != null ? calendarDayDiff(next, now) : null;
  const late = nextIn != null && nextIn < 0;
  const diffPct = estimateMg != null && avgMg > 0 ? ((estimateMg - avgMg) / avgMg) * 100 : null;
  const Trend = diffPct == null || Math.abs(diffPct) < 5 ? Minus : diffPct > 0 ? TrendingUp : TrendingDown;
  const trendText = diffPct == null ? null : Math.abs(diffPct) < 5 ? 'na média do período' : `${n0(Math.abs(diffPct))}% ${diffPct > 0 ? 'acima' : 'abaixo'} da média`;

  return (
    <FramePanel className="dx-glass flex flex-col gap-3">
      <GlassGlow />
      <h2 className="m-0 text-xs font-medium text-muted-foreground">Seu dia · {dateLabel(now)}</h2>

      <dl className="m-0 grid grid-cols-3 gap-x-2">
        <Cell label="Última aplicação">
          <dd className="m-0">{loading ? <BigValue text="…" /> : <BigValue text={lastDoseLabel(last, now)} />}</dd>
          <dd className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {loading ? 'buscando registros' : last == null ? 'nenhuma registrada' : `${dateLabel(last)}${lastName ? ` · ${lastName}` : ''}`}
          </dd>
        </Cell>

        <Cell label="Próxima prevista" divided>
          <dd className="m-0">{loading ? <BigValue text="…" /> : <BigValue text={nextDoseLabel(next, now)} className={nextIn === 0 ? 'text-primary' : undefined} />}</dd>
          <dd className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {loading ? 'buscando registros' : next == null ? 'aparece depois do 1º registro' : late ? (
              <Badge variant="warning-light">{dateLabel(next)}</Badge>
            ) : `${dateLabel(next)}${nextName ? ` · ${nextName}` : ''}`}
          </dd>
        </Cell>

        <Cell label="Estimativa de hoje" divided>
          {estimateMg != null ? (
            <>
              <dd className="m-0 flex flex-wrap items-baseline gap-x-1">
                <CountUp value={estimateMg} format={n1} className="text-2xl leading-7 font-semibold tracking-tight text-foreground tabular-nums" />
                <span className="text-xs text-muted-foreground">mg/dia</span>
              </dd>
              <dd className="m-0 flex items-start gap-1 text-xs text-muted-foreground">
                <Trend aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>{summed ? 'soma estimada' : 'estimado'}{trendText ? ` · ${trendText}` : ''}</span>
              </dd>
            </>
          ) : (
            <>
              <dd className="m-0"><BigValue text="—" /></dd>
              <dd className="m-0 text-xs text-muted-foreground">{estimateState === 'sem-inicio' ? 'falta a data de início' : 'hoje está fora do período do gráfico'}</dd>
            </>
          )}
        </Cell>
      </dl>

      {!loading && perCompound && perCompound.length > 1 ? (
        <div className="flex flex-col" data-board-per-compound>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Por composto</div>
          <ul className="m-0 flex list-none flex-col p-0">
            {perCompound.map((c, i) => (
              <li key={c.name} className={cn('grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-2 py-1.5', i > 0 && 'border-0 border-t border-solid border-border')}>
                <span className="truncate text-sm font-semibold text-foreground">{c.name}</span>
                <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="sr-only">Última aplicação: </span>
                  {c.last == null ? 'sem registro' : `${cap(lastDoseLabel(c.last, now))} · ${dateLabel(c.last)}`}
                </span>
                <span className={cn('text-xs [overflow-wrap:anywhere]', c.lateDays > 0 ? 'font-medium text-warning-foreground dark:text-warning' : 'text-muted-foreground')}>
                  <span className="sr-only">Próxima prevista: </span>
                  {c.next == null ? 'depois do 1º registro' : `${cap(nextDoseLabel(c.next, now))} · ${dateLabel(c.next)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {estimateState === 'sem-inicio' ? (
        <Button variant="outline" size="lg" className="h-11 w-full px-3" onClick={onInformStart}>
          <CalendarDays aria-hidden="true" />
          <span className="truncate">Informar quando começou</span>
        </Button>
      ) : null}

      <p className="m-0 text-xs text-muted-foreground">
        Datas previstas pelo intervalo que você cadastrou; a estimativa é uma simulação, não é o nível no sangue e não substitui o médico.
      </p>
    </FramePanel>
  );
}
