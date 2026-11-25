import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { DataGrid, DataGridContainer, dataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { API_URL, token } from '../../config';
import '../../doctor-v2/tw.css';
import { AREA_LABEL, byArea, neverOpened, screenArea, screenLabel, type ScreenRow } from './screenLabels';

/**
 * TELAS ABERTAS (25/11/26) — o que as contas reais abrem no app, por tela.
 * Fonte: /admin/screen-usage (tabela screen_views, uma linha por conta+tela+dia).
 * Complementa a "Adoção de Funcionalidades" (que só enxerga o que a pessoa GRAVA).
 */
interface DayRow { day: string; users: number; views: number }
interface Data {
  days: number; since: string; trackingSince: string | null;
  totals: { users: number; views: number; screens: number };
  daily: DayRow[]; screens: ScreenRow[];
}

const PERIODS = [7, 30, 90] as const;
const dailyConfig = { users: { label: 'Pessoas', color: 'var(--primary)' } } satisfies ChartConfig;
const rankConfig = { users: { label: 'Pessoas', color: 'var(--primary)' } } satisfies ChartConfig;
const nf = (n: number) => n.toLocaleString('pt-BR');
const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <Frame>
      <FramePanel className="px-3.5 py-3">
        <div className="text-[24px] font-extrabold leading-tight tabular-nums text-foreground">{value}</div>
        <div className="text-[12.5px] font-semibold text-muted-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{hint}</div>}
      </FramePanel>
    </Frame>
  );
}

function ScreensGrid({ rows, totalUsers }: { rows: ScreenRow[]; totalUsers: number }) {
  const columns = useMemo<ColumnDef<any, any, any>[]>(() => [
    {
      id: 'tela', size: 230, accessorFn: (r: ScreenRow) => screenLabel(r.screen),
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Tela" />,
      cell: (c) => {
        const r = c.row.original as ScreenRow;
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13.5px] font-bold text-foreground">{screenLabel(r.screen)}</span>
            <span className="truncate text-[11.5px] text-muted-foreground">{AREA_LABEL[screenArea(r.screen)]} · {r.screen}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'users', size: 150,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Pessoas" />,
      cell: (c) => {
        const n = c.getValue() as number;
        const pct = totalUsers ? Math.round((n / totalUsers) * 100) : 0;
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-8 text-right text-[13.5px] font-extrabold tabular-nums text-foreground">{nf(n)}</span>
            <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'users7', size: 90,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="7 dias" />,
      cell: (c) => <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{nf(c.getValue() as number)}</span>,
    },
    {
      accessorKey: 'views', size: 100,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Aberturas" />,
      cell: (c) => <span className="text-[13px] font-semibold tabular-nums text-foreground">{nf(c.getValue() as number)}</span>,
    },
    {
      id: 'media', size: 110, accessorFn: (r: ScreenRow) => (r.users ? r.views / r.users : 0),
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Por pessoa" />,
      cell: (c) => <span className="text-[13px] tabular-nums text-muted-foreground">{(c.getValue() as number).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×</span>,
    },
    {
      id: 'origem', size: 130, enableSorting: false,
      header: () => <span className="text-xs font-semibold text-muted-foreground">App / Web</span>,
      cell: (c) => {
        const r = c.row.original as ScreenRow;
        return <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{r.android} app · {r.web} web</span>;
      },
    },
    {
      accessorKey: 'lastDay', size: 100,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Última" />,
      cell: (c) => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{shortDay(c.getValue() as string)}</span>,
    },
  ], [totalUsers]);

  const table = useTable({
    features: dataGridFeatures,
    data: rows as any[],
    columns,
    getRowId: (r: any) => r.screen,
    initialState: { sorting: [{ id: 'users', desc: true }] },
  } as any);

  return (
    <DataGrid table={table} recordCount={rows.length} tableLayout={{ headerBackground: true, rowBorder: true }}>
      <DataGridContainer><DataGridTable /></DataGridContainer>
    </DataGrid>
  );
}

export function ScreenUsagePanel() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetch(`${API_URL}/admin/screen-usage?days=${days}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [days]);

  const rows = useMemo(() => (data?.screens ?? []).filter((r) => showAdmin || screenArea(r.screen) !== 'admin'), [data, showAdmin]);
  const top = useMemo(() => rows.slice().sort((a, b) => b.users - a.users || b.views - a.views).slice(0, 10).map((r) => ({ ...r, label: screenLabel(r.screen) })), [rows]);
  const areas = useMemo(() => byArea(rows), [rows]);
  const unused = useMemo(() => neverOpened(data?.screens ?? []), [data]);
  const maxAreaViews = Math.max(1, ...areas.map((a) => a.views));
  const hasData = (data?.totals.views ?? 0) > 0;

  return (
    <div className="dx-island flex min-w-0 max-w-full flex-col gap-4 overflow-hidden" data-screen-usage>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold text-foreground">Telas abertas</div>
          <div className="text-[13px] text-muted-foreground">
            Quais telas as contas reais abrem no app e na web. Contas de teste e de administrador ficam de fora.
            {data?.trackingSince && <> Medindo desde {shortDay(data.trackingSince)}/{data.trackingSince.slice(0, 4)}.</>}
          </div>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={days === p}
              onClick={() => setDays(p)}
              className={`min-h-[44px] rounded-[10px] border px-3.5 text-[13px] font-bold transition-colors sm:min-h-[36px] ${days === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-transparent text-foreground hover:bg-primary/10'}`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <Frame><FramePanel className="px-4 py-3 text-[13px] text-muted-foreground">
          Não consegui carregar as telas abertas agora. Tente atualizar a página.
        </FramePanel></Frame>
      )}

      {!failed && data && !hasData && (
        <Frame><FramePanel className="px-4 py-4">
          <div className="text-[14px] font-bold text-foreground">Ainda sem aberturas registradas neste período</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            A medição começa a contar quando as pessoas usam a versão do app que já mede telas (a partir do AAB 627) ou a web atual.
            Quem ainda está em versão antiga do app não aparece aqui.
          </div>
        </FramePanel></Frame>
      )}

      {!failed && data && hasData && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile value={nf(data.totals.users)} label="Pessoas que abriram algo" hint={`em ${data.days} dias`} />
            <Tile value={nf(data.totals.views)} label="Aberturas de tela" hint={data.totals.users ? `${(data.totals.views / data.totals.users).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por pessoa` : undefined} />
            <Tile value={nf(rows.length)} label="Telas diferentes abertas" />
            <Tile value={nf(unused.length)} label="Telas que ninguém abriu" hint="lista no fim" />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Frame><FramePanel className="px-4 py-3.5">
              <div className="text-[14px] font-bold text-foreground">Pessoas ativas por dia</div>
              <div className="mb-2 text-[12px] text-muted-foreground">Contas reais que abriram ao menos uma tela no dia.</div>
              <ChartContainer config={dailyConfig} className="aspect-auto! h-[220px] w-full" initialDimension={{ width: 480, height: 220 }}>
                <BarChart data={data.daily} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent labelFormatter={(v) => shortDay(String(v))} />} />
                  <Bar dataKey="users" fill="var(--color-users)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            </FramePanel></Frame>

            <Frame><FramePanel className="px-4 py-3.5">
              <div className="text-[14px] font-bold text-foreground">As 10 telas mais abertas</div>
              <div className="mb-2 text-[12px] text-muted-foreground">Por número de pessoas diferentes no período.</div>
              <ChartContainer config={rankConfig} className="aspect-auto! w-full" style={{ height: Math.max(120, top.length * 30 + 20) }} initialDimension={{ width: 480, height: 300 }}>
                <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} />
                  <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="users" fill="var(--color-users)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            </FramePanel></Frame>
          </div>

          <Frame><FramePanel className="px-4 py-3.5">
            <div className="text-[14px] font-bold text-foreground">Por área do app</div>
            <div className="mb-3 text-[12px] text-muted-foreground">Aberturas somadas por área; ao lado, quantas pessoas abriram a tela mais usada da área.</div>
            <div className="flex flex-col gap-2">
              {areas.map((a) => (
                // celular: nome + números em cima, barra embaixo; desktop: nome | barra | números
                <div key={a.area} data-area-row className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{a.label}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground sm:order-3">
                    {nf(a.views)} {a.views === 1 ? 'abertura' : 'aberturas'} · até {nf(a.topUsers)} {a.topUsers === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                  <div className="col-span-2 h-2 min-w-0 overflow-hidden rounded-full bg-primary/15 sm:order-2 sm:col-span-1">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((a.views / maxAreaViews) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </FramePanel></Frame>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[14px] font-bold text-foreground">Todas as telas</div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-muted-foreground sm:min-h-0">
              <input type="checkbox" checked={showAdmin} onChange={(e) => setShowAdmin(e.target.checked)} />
              Incluir telas do painel admin
            </label>
          </div>
          <ScreensGrid rows={rows} totalUsers={data.totals.users} />

          <Frame><FramePanel className="px-4 py-3.5">
            <div className="text-[14px] font-bold text-foreground">Telas que ninguém abriu em {data.days} dias</div>
            <div className="mb-2.5 text-[12px] text-muted-foreground">
              Candidatas a sair do menu ou a ganhar um caminho melhor. Só vale como sinal depois de algumas semanas de medição.
            </div>
            {unused.length === 0
              ? <div className="text-[13px] text-muted-foreground">Todas as telas do paciente tiveram ao menos uma abertura.</div>
              : <div className="flex flex-wrap gap-1.5">{unused.map((p) => <Badge key={p} variant="warning-light" size="sm">{screenLabel(p)}</Badge>)}</div>}
          </FramePanel></Frame>
        </>
      )}
    </div>
  );
}
