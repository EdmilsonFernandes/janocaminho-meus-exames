import { useEffect, useMemo, useState } from 'react';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { DataGrid, DataGridContainer, dataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError, FEATURE_LABELS } from './parts';
import { RollingMetric } from '../../components/admin/RollingMetric';
import '../../doctor-v2/tw.css';

/**
 * OVERVIEW ADMIN — v2 ReUI (worktree admin-reui, 30/10).
 * Mesmos dados (/admin/metrics + /admin/decifre-stats), mesma lógica; a CARA muda:
 * tiles Frame + dígitos rolantes preservados, tabelas → DataGrid (sort/paginação),
 * funil e cards em painéis da ilha. Template visual das demais tabs.
 */

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmtMonth = (m: string): string => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const idx = parseInt(mo, 10) - 1;
  return `${MESES[idx] ?? mo} ${y}`;
};
const brl = (v: unknown) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

/** DataGrid local: sort + paginação client-side (dados já vêm inteiros do /admin/metrics). */
function Grid<T>({ columns, data, empty = 'Sem dados ainda.' }: { columns: ColumnDef<any, any>[]; data: T[]; empty?: string }) {
  const table = useTable({ features: dataGridFeatures, data, columns });
  if (!data || data.length === 0) {
    return <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <DataGrid table={table} recordCount={data.length}>
      <DataGridContainer>
        <DataGridTable />
      </DataGridContainer>
      <DataGridPagination />
    </DataGrid>
  );
}

export const OverviewTab = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [decifre, setDecifre] = useState<{ today: number; week: number; total: number; uniqueIps: number } | null>(null);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/metrics`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setMetrics(await r.json()); else setError(true);
      fetch(`${API_URL}/admin/decifre-stats`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r2) => (r2.ok ? r2.json() : null)).then(setDecifre).catch(() => {});
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const kpiSeries = useMemo(() => {
    const wc: any[] = metrics?.weeklyCohort ?? [];
    const coh: any[] = metrics?.cohort ?? [];
    const rev: any[] = metrics?.revenueByMonth ?? [];
    let acc = 0;
    const cum = rev.map((r) => { acc += Number(r.amount ?? 0); return acc; });
    return {
      signups: wc.map((c) => Number(c.signups ?? 0)),
      premium: coh.map((c) => Number(c.converted ?? 0)),
      conv: coh.map((c) => (c.signups ? (c.converted / c.signups) * 100 : 0)),
      mrr: rev.map((r) => Number(r.amount ?? 0)),
      total: cum,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  if (loading) return <TabLoader />;
  if (error || !metrics) return <SectionError message="Não foi possível carregar as métricas." onRetry={() => void load()} />;

  const kpis = [
    { l: 'Cadastros', v: `${metrics.funnel.signups ?? 0}`, c: '#64748b', s: kpiSeries.signups },
    { l: 'Premium ativos', v: `${metrics.funnel.premiumActive ?? 0}`, c: '#178f89', s: kpiSeries.premium },
    { l: 'Conversão free→pago', v: `${metrics.funnel.conversionPct}%`, c: '#178f89', s: kpiSeries.conv },
    { l: 'Receita recorrente/mês', v: brl(metrics.revenue.mrr), c: '#178f89', s: kpiSeries.mrr },
    { l: 'Receita total aprovada', v: brl(metrics.revenue.total), c: '#178f89', s: kpiSeries.total },
    { l: 'Retenção no vencimento', v: `${metrics.churn.retentionPct}%`, c: '#b88a54' },
  ];

  const paywallCols: ColumnDef<any, any>[] = [
    { accessorKey: 'feature', header: 'Função bloqueada (30d)', cell: (i) => <span className="font-semibold">{FEATURE_LABELS[i.getValue() as string] ?? i.getValue() as string}</span> },
    { accessorKey: 'hits', header: 'Tentativas', cell: (i) => <span className="tabular-nums">{i.getValue() as number}</span> },
    { accessorKey: 'users', header: 'Pessoas', cell: (i) => <span className="tabular-nums">{i.getValue() as number}</span> },
  ];
  const cohortWeekCols: ColumnDef<any, any>[] = [
    { accessorKey: 'week', header: 'Semana', cell: (i) => <span className="font-semibold whitespace-nowrap">{i.getValue() as string}</span> },
    { accessorKey: 'signups', header: 'Signups' },
    { accessorKey: 'activated', header: '1º exame', cell: (i) => <span className={(i.getValue() as number) > 0 ? 'tabular-nums text-success-foreground dark:text-success' : 'tabular-nums text-muted-foreground'}>{i.getValue() as number}</span> },
    { accessorKey: 'usedAi', header: 'Usou IA', cell: (i) => <span className={(i.getValue() as number) > 0 ? 'tabular-nums text-primary' : 'tabular-nums text-muted-foreground'}>{i.getValue() as number}</span> },
    { accessorKey: 'retained7', header: 'Voltou após 7d' },
  ];
  const cohortCols: ColumnDef<any, any>[] = [
    { accessorKey: 'month', header: 'Mês', cell: (i) => <span className="font-semibold whitespace-nowrap">{fmtMonth(i.getValue() as string)}</span> },
    { accessorKey: 'signups', header: 'Signups' },
    { accessorKey: 'converted', header: 'Premium' },
    { id: 'conv', header: 'Conv.', accessorFn: (r) => (r.signups ? Math.round((r.converted / r.signups) * 1000) / 10 : 0), cell: (i) => <span className={(i.getValue() as number) > 0 ? 'tabular-nums font-bold text-success-foreground dark:text-success' : 'tabular-nums text-muted-foreground'}>{i.getValue() as number}%</span> },
  ];
  const revenueCols: ColumnDef<any, any>[] = [
    { accessorKey: 'month', header: 'Mês', cell: (i) => <span className="font-semibold whitespace-nowrap">{fmtMonth(i.getValue() as string)}</span> },
    { accessorFn: (r) => Number(r.amount ?? 0), id: 'amount', header: 'Receita', cell: (i) => <span className="tabular-nums font-bold text-success-foreground dark:text-success">{brl(i.getValue() as number)}</span> },
  ];

  const funnel = [
    { l: 'Signups verificados', n: metrics.funnel.verified, pct: 100 },
    { l: 'Free ativos', n: metrics.funnel.freeActive, pct: metrics.funnel.verified ? (metrics.funnel.freeActive / metrics.funnel.verified) * 100 : 0 },
    { l: 'Premium ativos', n: metrics.funnel.premiumActive, pct: metrics.funnel.verified ? (metrics.funnel.premiumActive / metrics.funnel.verified) * 100 : 0 },
  ];

  return (
    <div className="dx-island flex flex-col gap-4">
      {/* KPIs — tiles ReUI com os dígitos rolantes preservados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kpis.map((k) => {
          const nDigits = k.v.replace(/\D/g, '').length;
          return (
            <Frame key={k.l}>
              <FramePanel className="px-3.5 py-3">
                <p className="text-xs font-medium text-muted-foreground">{k.l}</p>
                <RollingMetric label={k.l} text={k.v} series={k.s} color={k.c} digitHeight={nDigits >= 9 ? 19 : 24} sparkHeight={36} />
              </FramePanel>
            </Frame>
          );
        })}
      </div>

      {/* DECIFRE (topo de funil público) */}
      <Frame><FramePanel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="text-sm font-bold">🔥 Decifre grátis (landing)</span>
        {decifre ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span><b className="tabular-nums">{decifre.today}</b> <span className="text-muted-foreground">hoje</span></span>
            <span><b className="tabular-nums">{decifre.week}</b> <span className="text-muted-foreground">nos 7d</span></span>
            <span><b className="tabular-nums">{decifre.total}</b> <span className="text-muted-foreground">no total</span></span>
            <span><b className="tabular-nums">{decifre.uniqueIps}</b> <span className="text-muted-foreground">pessoas diferentes</span></span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Sem decifrações ainda — a landing está pronta pro primeiro visitante colar um exame.</span>
        )}
      </FramePanel></Frame>

      {/* PAYWALL */}
      <Frame><FramePanel className="flex flex-col gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold">🚧 Bateram no sem-saldo (paywall)</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="warning-light">{metrics.paywall?.hits7d ?? 0} bloqueios 7d</Badge>
            <Badge variant="warning-light">{metrics.paywall?.hits30d ?? 0} bloqueios 30d</Badge>
            <Badge variant="info-light">{metrics.paywall?.users30d ?? 0} pessoas distintas 30d</Badge>
          </div>
        </div>
        <Grid columns={paywallCols} data={metrics.paywall?.byFeature ?? []} empty="Nenhum bloqueio ainda." />
        <p className="text-xs text-muted-foreground">Cada linha é alguém QUERENDO usar e não podendo — é aqui que o trial/pack/relatório do paywall (402) disputa a conversão.</p>
      </FramePanel></Frame>

      {/* COORTE SEMANAL */}
      <Frame><FramePanel className="flex flex-col gap-3 px-4 py-4">
        <span className="text-sm font-bold">📈 Semana a semana (cohort semanal)</span>
        <Grid columns={cohortWeekCols} data={metrics.weeklyCohort ?? []} />
      </FramePanel></Frame>

      {/* ORIGEM + FUNIL + RETENÇÃO — 2 colunas no desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {metrics.acquisition?.length > 0 && (
          <Frame><FramePanel className="flex flex-col gap-2 px-4 py-4">
            <span className="text-sm font-bold">🧭 De onde vêm os cadastros</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {metrics.acquisition.map((a: any) => (
                <div key={a.source}>
                  <p className="text-xs text-muted-foreground">{a.source}</p>
                  <p className="text-xl font-extrabold tabular-nums">{a.count}</p>
                </div>
              ))}
            </div>
          </FramePanel></Frame>
        )}
        <Frame><FramePanel className="flex flex-col gap-2.5 px-4 py-4">
          <span className="text-sm font-bold">🔻 Funil (conversão)</span>
          {funnel.map((s) => (
            <div key={s.l} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span>{s.l}</span>
                <span className="font-bold tabular-nums">{s.n} ({Math.round(s.pct)}%)</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-copper-500" style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{metrics.revenue.monthlyPayments} pagamento(s) mensal(is) • {metrics.revenue.creditPurchases} compra(s) de créditos avulsos</p>
        </FramePanel></Frame>
      </div>

      <Frame><FramePanel className="flex flex-col gap-2 px-4 py-4">
        <span className="text-sm font-bold">🔁 Retenção no vencimento</span>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div><p className="text-xs text-muted-foreground">Já assinaram</p><p className="text-xl font-extrabold tabular-nums">{metrics.churn.everPremium}</p></div>
          <div><p className="text-xs text-muted-foreground">Ainda ativos</p><p className="text-xl font-extrabold tabular-nums text-success-foreground dark:text-success">{metrics.churn.stillActive}</p></div>
          <div><p className="text-xs text-muted-foreground">Churn (venceu sem renovar)</p><p className="text-xl font-extrabold tabular-nums text-destructive-foreground dark:text-destructive">{metrics.churn.churned}</p></div>
          <div><p className="text-xs text-muted-foreground">Renovações (2+ pagamentos)</p><p className="text-xl font-extrabold tabular-nums">{metrics.churn.renewals}</p></div>
        </div>
        <p className="text-xs text-muted-foreground">Taxa de retenção <strong>{metrics.churn.retentionPct}%</strong> — é o número que o nudge de vencimento ajuda a subir.</p>
      </FramePanel></Frame>

      {/* COHORT MENSAL + RECEITA — 2 colunas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Frame><FramePanel className="flex flex-col gap-3 px-4 py-4">
          <span className="text-sm font-bold">📅 Cohort — conversão por mês</span>
          <Grid columns={cohortCols} data={metrics.cohort ?? []} />
        </FramePanel></Frame>
        <Frame><FramePanel className="flex flex-col gap-3 px-4 py-4">
          <span className="text-sm font-bold">💰 Receita aprovada por mês</span>
          <Grid columns={revenueCols} data={metrics.revenueByMonth ?? []} empty="Sem receita ainda." />
        </FramePanel></Frame>
      </div>
    </div>
  );
};
