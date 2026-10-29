import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Area, ComposedChart, ReferenceArea, XAxis, YAxis,
} from 'recharts';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import BiotechRoundedIcon from '@mui/icons-material/BiotechRounded';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { CardGrid } from '@/components/blocks/card-29/components/card-grid';
import type { ICard } from '@/components/blocks/card-29/components/data';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import './tw.css';

/**
 * /dashboard-v2 — PREVIEW DO APP v2 (ilha ReUI, paciente).
 *
 * Fluxo acordado com o dono (29/10): (1) constroi LOCAL atrás de flag → (2) dono
 * aprova vendo → (3) aplica tela a tela (dashboard, consultas, médicos, lembretes,
 * perfil, planos, carteira) com rollout por flag. Telas de pagamento: muda o VISUAL,
 * o fluxo Asaas/créditos permanece intocado.
 *
 * Dados REAIS do mesmo endpoint do dashboard de produção (/dashboard-summary +
 * /items/timeseries) + modo DADOS DE EXEMPLO claramente marcado.
 */
const FLAG = 'dx.dashV2';

const DEMO_CARDS: ICard[] = [
  { title: 'Exames no app', valueBold: '7', valueFaint: '', icon: <DescriptionRoundedIcon aria-hidden="true" />, description: 'Histórico completo de exames laboratoriais', badge: '7', variant: 'primary-light' },
  { title: 'Valores alterados', valueBold: '5', valueFaint: '', icon: <MonitorHeartRoundedIcon aria-hidden="true" />, description: 'Marcadores fora da faixa no último exame', badge: 'atenção', variant: 'warning-light' },
  { title: 'Score de saúde', valueBold: '74', valueFaint: '/100', icon: <SpeedRoundedIcon aria-hidden="true" />, description: 'Avaliação geral calculada pela IA Dr. Exame', badge: 'boa forma', variant: 'success-light' },
  { title: 'Marcadores', valueBold: '128', valueFaint: '', icon: <BiotechRoundedIcon aria-hidden="true" />, description: 'Analisados e monitorados automaticamente', badge: 'IA', variant: 'info-light' },
];
const DEMO_SERIES = [
  { name: 'Hemoglobina', unit: 'g/dL', refLow: 12, refHigh: 16, points: [{ date: '12/01/26', valor: 12.8, flag: null }, { date: '09/03/26', valor: 13.1, flag: null }, { date: '15/05/26', valor: 11.6, flag: 'LOW' }, { date: '22/07/26', valor: 12.9, flag: null }, { date: '10/09/26', valor: 13.4, flag: null }, { date: '18/10/26', valor: 14.1, flag: null }] },
  { name: 'Glicose', unit: 'mg/dL', refLow: 70, refHigh: 99, points: [{ date: '12/01/26', valor: 92, flag: null }, { date: '09/03/26', valor: 97, flag: null }, { date: '15/05/26', valor: 106, flag: 'HIGH' }, { date: '22/07/26', valor: 101, flag: 'HIGH' }, { date: '10/09/26', valor: 95, flag: null }, { date: '18/10/26', valor: 91, flag: null }] },
  { name: 'LDL', unit: 'mg/dL', refLow: 0, refHigh: 100, points: [{ date: '12/01/26', valor: 128, flag: 'HIGH' }, { date: '09/03/26', valor: 119, flag: 'HIGH' }, { date: '15/05/26', valor: 112, flag: 'HIGH' }, { date: '22/07/26', valor: 104, flag: 'HIGH' }, { date: '10/09/26', valor: 98, flag: null }, { date: '18/10/26', valor: 93, flag: null }] },
];

type Pt = { date: string; valor: number; flag?: string | null };
type Series = { name: string; unit?: string; refLow?: number | null; refHigh?: number | null; points: Pt[] };

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const scoreStatus = (s: number | null) => (s == null ? null : s >= 80 ? 'em ótima forma' : s >= 60 ? 'em boa forma' : s >= 40 ? 'pede atenção' : 'precisa de cuidados');

export default function DashboardV2Island() {
  const [sp] = useSearchParams();
  const [pid] = useSelectedPatient();
  const [enabled] = useState(() => {
    if (sp.get('on') === '1') { try { localStorage.setItem(FLAG, '1'); } catch { /* */ } return true; }
    try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
  });
  const [demo, setDemo] = useState(false);
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

  const [phase, setPhase] = useState<'load' | 'ready' | 'error' | 'anon'>('load');
  const [cards, setCards] = useState<ICard[]>([]);
  const [hero, setHero] = useState<{ score: number | null; lastExam: string | null; alterados: number }>({ score: null, lastExam: null, alterados: 0 });
  const [noExams, setNoExams] = useState(false);
  const [series, setSeries] = useState<Series[]>([]);
  const [sel, setSel] = useState(0);

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
        const lastExam = d?.exams?.lastExamAt ?? null;
        if (!alive) return;
        setNoExams(total === 0);
        setHero({ score, lastExam, alterados });
        setCards([
          { title: 'Exames no app', valueBold: String(total), valueFaint: '', icon: <DescriptionRoundedIcon aria-hidden="true" />, description: 'Histórico completo de exames laboratoriais', badge: String(total), variant: 'primary-light' },
          { title: 'Valores alterados', valueBold: String(alterados), valueFaint: '', icon: <MonitorHeartRoundedIcon aria-hidden="true" />, description: 'Marcadores fora da faixa no último exame', badge: alterados > 0 ? 'revisar' : 'ok', variant: alterados > 0 ? 'destructive-light' : 'success-light' },
          { title: 'Score de saúde', valueBold: score == null ? '—' : String(score), valueFaint: '/100', icon: <SpeedRoundedIcon aria-hidden="true" />, description: 'Avaliação geral calculada pela IA Dr. Exame', badge: scoreStatus(score) ?? 'calculando', variant: (score ?? 100) >= 60 ? 'success-light' : 'warning-light' },
          { title: 'Marcadores', valueBold: String(markers), valueFaint: '', icon: <BiotechRoundedIcon aria-hidden="true" />, description: 'Analisados e monitorados automaticamente', badge: 'IA', variant: 'info-light' },
        ]);
        try {
          const rNames = await fetch(`${API_URL}/items/distinct-names${pid ? `?patientId=${pid}` : ''}`, { headers: h });
          const dn = rNames.ok ? await rNames.json() : null;
          const raw: { nameCanonical?: string; count?: number }[] = Array.isArray(dn) ? dn : Array.isArray(dn?.names) ? dn.names : [];
          const top = raw.filter((x) => typeof x?.nameCanonical === 'string').sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).map((x) => x.nameCanonical as string).slice(0, 3);
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
        } catch { /* gráfico é bônus — cards já são reais */ }
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
  const mostrarConteudo = demo || (phase === 'ready' && !noExams);
  const scoreHero = demo ? 74 : hero.score;

  return (
    <div className="dx-island min-h-screen bg-background text-foreground p-4 sm:p-8 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            Dr. Exame <span className="text-primary">v2</span>
            {demo && <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-bold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">DADOS DE EXEMPLO</span>}
          </h2>
          <p className="text-sm text-muted-foreground">Preview local · {demo ? 'números ilustrativos' : 'seus dados reais'} · nada substitui o app</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDark((v) => !v)} aria-label={dark ? 'Modo claro' : 'Modo escuro'} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">{dark ? '☀️ claro' : '🌙 escuro'}</button>
          <button type="button" onClick={() => { setDemo((v) => !v); setSel(0); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">{demo ? 'Ver meus dados reais' : 'Ver com dados de exemplo'}</button>
          <a href="#/" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">← voltar</a>
        </div>
      </header>

      {/* HERO — score + status + último exame (gradiente da marca) */}
      {mostrarConteudo && (
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-teal-800 p-6 text-white shadow-lg">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,255,255,0.18),transparent_60%)]" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">Seu score de saúde</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-head text-6xl font-extrabold leading-none tabular-nums">{scoreHero ?? '—'}</span>
                <span className="text-sm font-semibold text-white/80">de 100 · {scoreStatus(scoreHero) ?? 'calculando'}</span>
              </div>
              <p className="mt-2 text-sm text-white/85">
                {hero.lastExam && !demo ? <>Último exame em <strong>{fmtDate(hero.lastExam)}</strong></> : 'Baseado nos seus exames laboratoriais'}
                {hero.alterados > 0 && !demo ? <> · <strong>{hero.alterados}</strong> valores alterados</> : ''}
              </p>
            </div>
            <a href="#/relatorio" className="rounded-xl bg-white/95 px-4 py-2.5 text-sm font-bold text-teal-800 shadow transition-transform hover:scale-[1.02] active:scale-95">Ver análise completa →</a>
          </div>
        </section>
      )}

      {/* TILES PREMIUM — card-29 (ReUI) com dados reais */}
      {phase === 'load' && !demo && (
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      )}
      {mostrarConteudo && <CardGrid cards={demo ? DEMO_CARDS : cards} />}

      {phase === 'ready' && noExams && !demo && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-lg font-semibold">Sem exames ainda</p>
          <p className="text-sm text-muted-foreground">Envie seu primeiro exame para ver seu resumo aqui.</p>
          <a href="#/exams/create" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Enviar exame</a>
        </div>
      )}
      {phase === 'anon' && (
        <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">Entre no app para ver seus dados reais. <a className="font-semibold text-primary" href="#/entrar">Fazer login</a></div>
      )}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Não consegui carregar seu resumo agora.</p>
          <button type="button" onClick={() => location.reload()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Tentar de novo</button>
        </div>
      )}

      {/* TENDÊNCIA — série real do marcador + banda de referência do laboratório */}
      {mostrarConteudo && s && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Evolução do marcador</h3>
            <div className="flex flex-wrap gap-1.5">
              {activeSeries.map((x, i) => (
                <button key={x.name} type="button" onClick={() => setSel(i)} className={'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ' + (i === sel ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>{x.name}</button>
              ))}
            </div>
          </div>
          <ChartContainer config={{ valor: { label: s.name, color: 'var(--primary)' } }} className="h-64 w-full">
            <ComposedChart data={s.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
              <YAxis domain={yDomain} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} width={44} />
              {lo != null && hi != null && <ReferenceArea y1={lo} y2={hi} fill="var(--primary)" fillOpacity={0.07} strokeOpacity={0} ifOverflow="extendDomain" />}
              <Area type="monotone" dataKey="valor" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2}
                dot={(p: { cx?: number; cy?: number; payload?: Pt }) => {
                  const out = p.payload?.flag === 'HIGH' || p.payload?.flag === 'LOW';
                  return p.cx == null || p.cy == null ? <g /> : <circle cx={p.cx} cy={p.cy} r={out ? 4.5 : 3} fill={out ? 'var(--destructive)' : 'var(--primary)'} stroke="var(--background)" strokeWidth={1.5} />;
                }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">Faixa de referência destacada{lo != null && hi != null ? `: ${lo}–${hi}${s.unit ? ` ${s.unit}` : ''}` : ''} · pontos fora da faixa em vermelho</p>
        </section>
      )}

      {/* HUB v2 — próximas telas do preview (acordado com o dono) */}
      <section className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-border p-3">
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview v2</span>
        {['✓ dashboard', 'consultas', 'lembretes', 'médicos', 'perfil', 'planos', 'carteira'].map((t, i) => (
          <span key={t} className={'rounded-full border px-2.5 py-1 text-xs font-medium ' + (i === 0 ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground/60')}>{t}</span>
        ))}
      </section>

      <footer className="mt-auto pt-2 text-xs text-muted-foreground">Preview local (ilha ReUI) · mesmos dados do app · nada é diagnóstico</footer>
    </div>
  );
}
