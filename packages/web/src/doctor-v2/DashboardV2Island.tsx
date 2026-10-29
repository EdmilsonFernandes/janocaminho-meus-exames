import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Area, ComposedChart, ReferenceArea, XAxis, YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Stats } from '@/components/blocks/stats-1/components/stats';
import type { StatItem } from '@/components/blocks/stats-1/components/data';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import './tw.css';

/**
 * /dashboard-v2 — PROTÓTIPIO A/B da ilha ReUI no PACIENTE (Fase 2 do de-para).
 *
 * Não substitui o dashboard atual: roda atrás de flag (localStorage dx.dashV2=1
 * ou ?on=1) em tela cheia (noLayout), com DADOS REAIS do mesmo endpoint que o
 * dashboard de produção usa (/patients/:id/dashboard-summary) + séries reais de
 * marcadores (/items/timeseries). Serve pra o dono comparar lado a lado e decidir
 * a direção (evoluir MUI × rebuild em ReUI).
 *
 * Honestidade de dados (regra de saúde do projeto): banda de referência e pontos
 * fora da faixa vêm do servidor; sem login → estado explícito; sem exames →
 * estado vazio com 1 ação. Nada de dado inventado.
 */
const FLAG = 'dx.dashV2';

/** DADOS DE EXEMPLO — mesmo espírito do "Ver com dados de exemplo" do dashboard atual
 *  (FirstExamExperience/ExamDemo): números plausíveis, SEMPRE marcados como exemplo.
 *  Nunca parecem resultado real (badge âmbar fixo enquanto ativo). */
const DEMO_TILES: StatItem[] = [
  { title: 'Exames no app', value: 7, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: 7, lastFormat: () => '7 no histórico' },
  { title: 'Valores alterados', value: 5, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: 5, lastFormat: () => 'no último exame' },
  { title: 'Score de saúde', value: 74, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: 74, lastFormat: () => 'escala 0–100' },
  { title: 'Marcadores', value: 128, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: 128, lastFormat: () => 'monitorados pela IA' },
];
const DEMO_SERIES: Series[] = [
  {
    name: 'Hemoglobina', unit: 'g/dL', refLow: 12, refHigh: 16,
    points: [
      { date: '12/01/26', valor: 12.8, flag: null }, { date: '09/03/26', valor: 13.1, flag: null },
      { date: '15/05/26', valor: 11.6, flag: 'LOW' }, { date: '22/07/26', valor: 12.9, flag: null },
      { date: '10/09/26', valor: 13.4, flag: null }, { date: '18/10/26', valor: 14.1, flag: null },
    ],
  },
  {
    name: 'Glicose', unit: 'mg/dL', refLow: 70, refHigh: 99,
    points: [
      { date: '12/01/26', valor: 92, flag: null }, { date: '09/03/26', valor: 97, flag: null },
      { date: '15/05/26', valor: 106, flag: 'HIGH' }, { date: '22/07/26', valor: 101, flag: 'HIGH' },
      { date: '10/09/26', valor: 95, flag: null }, { date: '18/10/26', valor: 91, flag: null },
    ],
  },
  {
    name: 'LDL', unit: 'mg/dL', refLow: 0, refHigh: 100,
    points: [
      { date: '12/01/26', valor: 128, flag: 'HIGH' }, { date: '09/03/26', valor: 119, flag: 'HIGH' },
      { date: '15/05/26', valor: 112, flag: 'HIGH' }, { date: '22/07/26', valor: 104, flag: 'HIGH' },
      { date: '10/09/26', valor: 98, flag: null }, { date: '18/10/26', valor: 93, flag: null },
    ],
  },
];

type Pt = { date: string; valor: number; flag?: string | null };
type Series = { name: string; unit?: string; refLow?: number | null; refHigh?: number | null; points: Pt[] };

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');

export default function DashboardV2Island() {
  const [sp] = useSearchParams();
  const [pid] = useSelectedPatient();
  const [enabled] = useState(() => {
    if (sp.get('on') === '1') { try { localStorage.setItem(FLAG, '1'); } catch { /* */ } return true; }
    try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
  });

  const [phase, setPhase] = useState<'load' | 'ready' | 'error' | 'anon'>('load');
  const [tiles, setTiles] = useState<StatItem[]>([]);
  const [noExams, setNoExams] = useState(false);
  const [series, setSeries] = useState<Series[]>([]);
  const [sel, setSel] = useState(0);
  const [demo, setDemo] = useState(false);
  // Modo claro/escuro da ILHA (avaliação A/B): herda o tema do app (RaStore) na 1ª visita,
  // depois segue a escolha local. Ponte real com o toggle do app vem na produção.
  const [dark, setDark] = useState(() => {
    try {
      const own = localStorage.getItem('dx.dashV2.dark');
      if (own != null) return own === '1';
      const ra = JSON.parse(localStorage.getItem('RaStore.theme') ?? 'null');
      return ra === 'dark';
    } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('dx.dashV2.dark', dark ? '1' : '0'); } catch { /* */ }
  }, [dark]);

  useEffect(() => {
    if (!enabled || !pid) return;
    let alive = true;
    const h = { Authorization: `Bearer ${token()}` };
    (async () => {
      try {
        const r = await fetch(`${API_URL}/patients/${pid}/dashboard-summary`, { headers: h });
        if (r.status === 401 || r.status === 403) { if (alive) setPhase('anon'); return; }
        if (!r.ok) throw new Error('summary');
        const d = await r.json();
        const total = d?.exams?.total ?? 0;
        const alterados = (d?.buckets?.alerta ?? 0) + (d?.buckets?.alterados ?? 0);
        const score = typeof d?.health?.score === 'number' ? d.health.score : null;
        const markers = typeof d?.health?.markers === 'number' ? d.health.markers : 0;
        if (!alive) return;
        setNoExams(total === 0);
        setTiles([
          { title: 'Exames no app', value: total, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: total, lastFormat: () => `${total} no histórico` },
          { title: 'Valores alterados', value: alterados, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: alterados, lastFormat: () => 'no último exame' },
          { title: 'Score de saúde', value: score ?? 0, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: score ?? 0, format: (v) => (score == null ? '—' : String(v)), lastFormat: () => (score == null ? 'ainda calculando' : 'escala 0–100') },
          { title: 'Marcadores', value: markers, delta: 0, positive: true, prefix: '', suffix: '', lastMonth: markers, lastFormat: () => 'monitorados pela IA' },
        ]);
        // Séries reais: 3 primeiros marcadores do paciente (mesma fonte da tela Tendências).
        try {
          const rNames = await fetch(`${API_URL}/items/distinct-names${pid ? `?patientId=${pid}` : ''}`, { headers: h });
          const dn = rNames.ok ? await rNames.json() : null;
          // Shape real: {nameCanonical, count}[] (mesma fonte da tela Tendências).
          const raw: { nameCanonical?: string; count?: number }[] = Array.isArray(dn) ? dn : Array.isArray(dn?.names) ? dn.names : [];
          const top = raw
            .filter((x) => typeof x?.nameCanonical === 'string')
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)) // mais pontos primeiro = gráfico melhor
            .map((x) => x.nameCanonical as string)
            .slice(0, 3);
          const loaded: Series[] = [];
          for (const name of top) {
            const q = new URLSearchParams({ nameCanonical: name, patientId: String(pid) });
            const rs = await fetch(`${API_URL}/items/timeseries?${q}`, { headers: h });
            if (!rs.ok) continue;
            const ts = await rs.json();
            const points: Pt[] = (ts?.points ?? [])
              .filter((p: { valueNumeric?: number | null }) => typeof p.valueNumeric === 'number')
              .map((p: { performedAt?: string; valueNumeric: number; flag?: string }) => ({ date: fmtDate(p.performedAt), valor: p.valueNumeric, flag: p.flag }));
            if (points.length) loaded.push({ name, unit: ts?.unit, refLow: ts?.refLow ?? null, refHigh: ts?.refHigh ?? null, points });
          }
          if (alive) setSeries(loaded);
        } catch { /* gráfico é bônus — tiles já são reais */ }
        if (alive) setPhase('ready');
      } catch {
        if (alive) setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [enabled, pid]);

  if (!enabled) return <Navigate to="/" replace />;

  const activeSeries = demo ? DEMO_SERIES : series;
  const s = activeSeries[Math.min(sel, Math.max(activeSeries.length - 1, 0))];
  const vals = s?.points.map((p) => p.valor) ?? [];
  const lo = s?.refLow ?? null;
  const hi = s?.refHigh ?? null;
  const yDomain: [number | 'auto', number | 'auto'] = [
    Math.min(...(vals.length ? vals : [0]), ...(lo != null ? [lo] : [])) * 0.95,
    Math.max(...(vals.length ? vals : [1]), ...(hi != null ? [hi] : [])) * 1.05,
  ];

  return (
    <div className="dx-island min-h-screen bg-background text-foreground p-4 sm:p-8 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            Seu resumo <span className="text-primary">v2</span>
            {demo && <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-bold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">DADOS DE EXEMPLO</span>}
          </h2>
          <p className="text-sm text-muted-foreground">Protótipo A/B · {demo ? 'números ilustrativos, não são seus resultados' : 'dados reais'} · não substitui o app</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDark((v) => !v)}
            aria-label={dark ? 'Modo claro' : 'Modo escuro'}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {dark ? '☀️ claro' : '🌙 escuro'}
          </button>
          <button
            type="button"
            onClick={() => { setDemo((v) => !v); setSel(0); }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {demo ? 'Ver meus dados reais' : 'Ver com dados de exemplo'}
          </button>
          <a href="#/" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
            ← voltar
          </a>
        </div>
      </header>

      {/* TILES — ReUI stats-1 adaptado, dados reais do dashboard-summary */}
      {phase === 'load' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
        </div>
      )}
      {(demo || (phase === 'ready' && !noExams)) && <Stats items={demo ? DEMO_TILES : tiles} subLabel="Detalhe:" />}
      {phase === 'ready' && noExams && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-lg font-semibold">Sem exames ainda</p>
          <p className="text-sm text-muted-foreground">Envie seu primeiro exame para ver seu resumo aqui.</p>
          <a href="#/exams/create" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Enviar exame</a>
        </div>
      )}
      {phase === 'anon' && (
        <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">
          Entre no app para ver seus dados reais. <a className="font-semibold text-primary" href="#/entrar">Fazer login</a>
        </div>
      )}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Não consegui carregar seu resumo agora.</p>
          <button type="button" onClick={() => location.reload()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Tentar de novo</button>
        </div>
      )}

      {/* TENDÊNCIA — série real do marcador + banda de referência do laboratório */}
      {(demo || (phase === 'ready' && !noExams)) && s && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Evolução do marcador</h3>
            <div className="flex flex-wrap gap-1.5">
              {activeSeries.map((x, i) => (
                <button
                  key={x.name}
                  type="button"
                  onClick={() => setSel(i)}
                  className={
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (i === sel ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')
                  }
                >
                  {x.name}
                </button>
              ))}
            </div>
          </div>
          <ChartContainer config={{ valor: { label: s.name, color: 'var(--primary)' } }} className="h-64 w-full">
            <ComposedChart data={s.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
              <YAxis domain={yDomain} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} width={44} />
              {lo != null && hi != null && <ReferenceArea y1={lo} y2={hi} fill="var(--primary)" fillOpacity={0.07} strokeOpacity={0} ifOverflow="extendDomain" />}
              <Area
                type="monotone"
                dataKey="valor"
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.12}
                strokeWidth={2}
                dot={(p: { cx?: number; cy?: number; payload?: Pt }) => {
                  const out = p.payload?.flag === 'HIGH' || p.payload?.flag === 'LOW';
                  return p.cx == null || p.cy == null ? <g /> : (
                    <circle cx={p.cx} cy={p.cy} r={out ? 4.5 : 3} fill={out ? 'var(--destructive)' : 'var(--primary)'} stroke="var(--background)" strokeWidth={1.5} />
                  );
                }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            Faixa de referência destacada{lo != null && hi != null ? `: ${lo}–${hi}${s.unit ? ` ${s.unit}` : ''}` : ''} · pontos fora da faixa em vermelho · dados do laboratório
          </p>
        </section>
      )}

      <footer className="mt-auto pt-2 text-xs text-muted-foreground">
        Protótipo de avaliação (ilha ReUI) · mesmos dados do dashboard atual · nada é diagnóstico
      </footer>
    </div>
  );
}
