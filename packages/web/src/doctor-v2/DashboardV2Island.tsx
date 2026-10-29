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
import { BodyMap } from '../components/BodyMap';
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

/** LEVA 1 — seções portadas do dashboard real (mesmos dados do /dashboard-summary). */
const DEMO_CHANGES = { worsened: ['Glicose', 'LDL'], improved: ['Hemoglobina', 'Vitamina D', 'Ferritina'] };
const DEMO_BIO = { age: 38, chrono: 42 };
const DEMO_ACTIONS = [
  { title: 'Glicemia em jejum acima da faixa', domain: 'metabólico', timeframe: 'agora', question: 'Minha glicose voltou a subir mesmo com dieta — preciso repetar o exame ou ajustar tratamento?', rationale: '2 medidas acima de 100 mg/dL no último exame', source: 'Diretriz SBD 2024' },
  { title: 'Colesterol LDL em queda', domain: 'cardio', timeframe: 'rotina', question: 'Meu LDL caiu de 128 para 93 — posso reduzir a dose do remédio?', rationale: 'queda consistente nas últimas 3 coletas', source: 'Diretriz SBC 2023' },
];
const DEMO_PEND = [
  { key: 'tele', label: 'Teleconsulta c/ Dr. Carlos', chip: 'amanhã', tone: 'primary' as const, to: '/consultas' },
  { key: 'q', label: 'Pergunta aguardando o médico', chip: 'aguardando', tone: 'secondary' as const, to: '/perguntas' },
];
/** LEVA 2 — mental, coletas, IA e teleconsulta em destaque. */
const DEMO_MENTAL = { phq9: 6, gad7: 4 };
const DEMO_COLETAS = [
  { id: 'c1', title: 'Hemograma completo + TSH', dueDate: new Date(Date.now() + 6 * 86400000).toISOString() },
  { id: 'c2', title: 'Perfil lipídico (jejum 12h)', dueDate: new Date(Date.now() + 20 * 86400000).toISOString() },
];
const mentalTone = (v: number) => (v <= 4 ? { label: 'mínimo', cls: 'border-success/25 bg-success/10 text-success-foreground dark:text-success' } : v <= 9 ? { label: 'leve', cls: 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning' } : { label: 'atenção', cls: 'border-destructive/25 bg-destructive/10 text-destructive-foreground dark:text-destructive' });
/** LEVA 3 — panorama demo (buckets plausíveis; mapa corporal real não existe em demo). */
const DEMO_BUCKETS = { ok: 100, alterados: 18, alerta: 10 };

const whenChip = (iso: string): { text: string; overdue: boolean } => {
  const due = new Date(iso).getTime();
  if (isNaN(due)) return { text: '', overdue: false };
  const dayMs = 86_400_000;
  const sod = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((sod(due) - sod(Date.now())) / dayMs);
  if (days < -1) return { text: `vencido há ${-days} dias`, overdue: true };
  if (days === -1) return { text: 'vencido ontem', overdue: true };
  if (days === 0) return { text: 'hoje', overdue: false };
  if (days === 1) return { text: 'amanhã', overdue: false };
  return { text: `em ${days} dias`, overdue: false };
};

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
  // ANTES × DEPOIS: compara o dashboard REAL (iframe /) com o v2 lado a lado.
  const [compare, setCompare] = useState(false);
  const [side, setSide] = useState<'antes' | 'depois'>('depois');
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
  // Leva 1: seções portadas
  const [changes, setChanges] = useState<{ worsened: string[]; improved: string[] }>({ worsened: [], improved: [] });
  const [bio, setBio] = useState<{ age: number } | null>(null);
  const [actions, setActions] = useState<{ title?: string; domain?: string; timeframe?: string; question?: string; rationale?: string; source?: string }[]>([]);
  const [pend, setPend] = useState<{ key: string; label: string; chip: string; tone: 'primary' | 'warning' | 'secondary'; to: string }[]>([]);
  // Leva 2
  const [mental, setMental] = useState<{ phq9: number | null; gad7: number | null } | null>(null);
  const [coletas, setColetas] = useState<{ id?: string; title?: string; dueDate?: string }[]>([]);
  // Leva 3
  const [bodyRegions, setBodyRegions] = useState<any[] | null>(null);
  const [buckets, setBuckets] = useState<{ ok?: number; alterados?: number; alerta?: number } | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

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
        // LEVA 1 — parse das seções do health-summary (mesma fonte do dashboard real).
        const hd: any = d?.health;
        if (hd) {
          const nm = (m: any) => (m?.nameCanonical || m?.name || '').trim();
          setChanges({
            worsened: (Array.isArray(hd.worsening) ? hd.worsening : []).slice(0, 3).map(nm).filter(Boolean),
            improved: (Array.isArray(hd.improving) ? hd.improving : []).slice(0, 3).map(nm).filter(Boolean),
          });
          if (hd.biologicalAge && typeof hd.biologicalAge.age === 'number') setBio({ age: hd.biologicalAge.age });
          setActions(Array.isArray(hd.clinicalActions) ? hd.clinicalActions.slice(0, 3) : []);
          setBodyRegions(Array.isArray(hd.bodyRegions) ? hd.bodyRegions : []);
        }
        if (d?.buckets) setBuckets(d.buckets);
        if (typeof d?.credits === 'number') setCredits(d.credits);
        // Pendências (lógica do PendenciasCard do app real): teleconsulta aberta +
        // lembrete vencido + perguntas aguardando médico.
        try {
          const [remRes, qRes, colRes, menRes] = await Promise.allSettled([
            fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: h }),
            fetch(`${API_URL}/doctor-questions?patientId=${pid}`, { headers: h }),
            fetch(`${API_URL}/collection-checklist`, { headers: h }),
            fetch(`${API_URL}/patients/${pid}/mental-screenings/latest`, { headers: h }),
          ]);
          const reminders: any[] = remRes.status === 'fulfilled' && remRes.value.ok ? await remRes.value.json().catch(() => []) : [];
          const questions: any[] = qRes.status === 'fulfilled' && qRes.value.ok ? await qRes.value.json().catch(() => []) : [];
          const now = Date.now();
          const isTele = (r: any) => r && (r.type === 'teleconsulta' || r.provider === 'livekit');
          const isOpen = (r: any) => r && !r.endedAt && !r.done;
          const teles = reminders.filter((r) => isTele(r) && isOpen(r)).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
          const rows: { key: string; label: string; chip: string; tone: 'primary' | 'warning' | 'secondary'; to: string }[] = [];
          if (teles[0]) rows.push({ key: 'tele', label: teles[0].title || 'Consulta por vídeo', chip: whenChip(teles[0].dueDate).text, tone: 'primary', to: '/consultas' });
          const overdue = reminders.filter((r) => !isTele(r) && isOpen(r) && !r.recurrence && r.dueDate && +new Date(r.dueDate) < now);
          if (overdue[0]) rows.push({ key: 'od', label: overdue[0].title || 'Lembrete vencido', chip: whenChip(overdue[0].dueDate).text, tone: 'warning', to: '/lembretes' });
          const pendQ = Array.isArray(questions) ? questions.filter((q: any) => q && q.status !== 'answered').length : 0;
          if (pendQ > 0) rows.push({ key: 'q', label: pendQ === 1 ? 'Pergunta aguardando o médico' : `${pendQ} perguntas aguardando o médico`, chip: 'aguardando', tone: 'secondary', to: '/perguntas' });
          setPend(rows.slice(0, 3));
          // Leva 2: coletas do plano + última triagem mental
          if (colRes?.status === 'fulfilled' && colRes.value.ok) {
            const cd = await colRes.value.json().catch(() => null);
            const list = Array.isArray(cd) ? cd : Array.isArray(cd?.items) ? cd.items : [];
            setColetas(list.filter((x: any) => x && !x.done && (x.title || x.name)).slice(0, 3).map((x: any, i: number) => ({ id: x.id ?? `c${i}`, title: x.title || x.name, dueDate: x.dueDate })));
          }
          if (menRes?.status === 'fulfilled' && menRes.value.ok) {
            const md = await menRes.value.json().catch(() => null);
            const phq9 = typeof md?.phq9?.score === 'number' ? md.phq9.score : typeof md?.phq9 === 'number' ? md.phq9 : null;
            const gad7 = typeof md?.gad7?.score === 'number' ? md.gad7.score : typeof md?.gad7 === 'number' ? md.gad7 : null;
            if (phq9 != null || gad7 != null) setMental({ phq9, gad7 });
          }
        } catch { /* pendências é bônus */ }
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
          <button type="button" onClick={() => setCompare(true)} className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/15">🔀 Comparar antes × depois</button>
          <button type="button" onClick={() => setDark((v) => !v)} aria-label={dark ? 'Modo claro' : 'Modo escuro'} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">{dark ? '☀️ claro' : '🌙 escuro'}</button>
          <button type="button" onClick={() => { setDemo((v) => !v); setSel(0); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">{demo ? 'Ver meus dados reais' : 'Ver com dados de exemplo'}</button>
          <a href="#/" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">← voltar</a>
        </div>
      </header>

      {/* ANTES × DEPOIS — overlay de comparação (desktop: split; mobile: alterna) */}
      {compare && (() => {
        const appRoot = location.href.split('#')[0];
        return (
          <div className="fixed inset-0 z-50 flex flex-col gap-2 bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-head text-sm font-bold">Antes × Depois — seu dashboard real (esquerda) e o v2 (direita)</h3>
              <div className="flex items-center gap-1.5">
                <div className="flex overflow-hidden rounded-lg border border-border md:hidden">
                  <button type="button" onClick={() => setSide('antes')} className={'px-3 py-1.5 text-xs font-bold ' + (side === 'antes' ? 'bg-muted text-foreground' : 'text-muted-foreground')}>Antes</button>
                  <button type="button" onClick={() => setSide('depois')} className={'px-3 py-1.5 text-xs font-bold ' + (side === 'depois' ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>Depois</button>
                </div>
                <button type="button" onClick={() => setCompare(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted">✕ fechar</button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2">
              <div className={'min-h-0 flex-col ' + (side === 'antes' ? 'flex' : 'hidden md:flex')}>
                <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Antes — dashboard atual</span>
                <iframe title="Antes — dashboard atual" src={appRoot + '#/'} className="min-h-0 w-full flex-1 rounded-lg border border-border bg-white" />
              </div>
              <div className={'min-h-0 flex-col ' + (side === 'depois' ? 'flex' : 'hidden md:flex')}>
                <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">Depois — v2</span>
                <iframe title="Depois — v2" src={appRoot + '#/dashboard-v2'} className="min-h-0 w-full flex-1 rounded-lg border border-primary/40 bg-white" />
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* LEVA 1 — seções portadas do dashboard real */}
      {mostrarConteudo && (() => {
        const pendRows = demo ? DEMO_PEND : pend;
        const ch = demo ? DEMO_CHANGES : changes;
        const bioData = demo ? DEMO_BIO : bio;
        const actRows = demo ? DEMO_ACTIONS : actions;
        const TONE_CLS: Record<string, string> = {
          primary: 'border-primary/25 bg-primary/10 text-primary',
          warning: 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning',
          secondary: 'border-copper-500/30 bg-copper-500/15 text-copper-700 dark:text-copper-300',
        };
        return (
          <>
            {/* PRA VOCÊ FAZER — pendências do dia-a-dia */}
            {pendRows.length > 0 && (
              <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="Pendências">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Pra você fazer</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{pendRows.length}</span>
                </div>
                {pendRows.map((r) => (
                  <a key={r.key} href={`#${r.to}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
                    <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ' + TONE_CLS[r.tone]} aria-hidden>●</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.label}</span>
                    <span className={'shrink-0 text-xs font-bold ' + TONE_CLS[r.tone].split(' ').filter(c => c.startsWith('text-')).join(' ')}>{r.chip}</span>
                    <span aria-hidden className="text-muted-foreground">→</span>
                  </a>
                ))}
              </section>
            )}

            {/* O QUE MUDOU — pioraram/melhoraram desde o exame anterior */}
            {(ch.worsened.length > 0 || ch.improved.length > 0) && (
              <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4" aria-label="O que mudou">
                <h3 className="mr-1 text-sm font-semibold">O que mudou</h3>
                {ch.worsened.map((n) => (
                  <span key={n} className="rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive-foreground dark:text-destructive">↓ {n}</span>
                ))}
                {ch.improved.map((n) => (
                  <span key={n} className="rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-bold text-success-foreground dark:text-success">↑ {n}</span>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">desde o exame anterior</span>
              </section>
            )}

            {/* IDADE BIOLÓGICA */}
            {bioData && (
              <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Idade biológica">
                <div>
                  <h3 className="text-sm font-semibold">Idade biológica</h3>
                  <p className="text-xs text-muted-foreground">estimada pelos seus marcadores laboratoriais</p>
                </div>
                <div className="text-right">
                  <div className="font-head text-4xl font-extrabold tabular-nums text-primary">{bioData.age}<span className="text-sm font-bold text-muted-foreground"> anos</span></div>
                  {demo && DEMO_BIO.chrono != null && <p className="text-xs font-bold text-success-foreground dark:text-success">{DEMO_BIO.chrono - bioData.age} anos mais novo que você ({DEMO_BIO.chrono})</p>}
                </div>
              </section>
            )}

            {/* PERGUNTAS PRO MÉDICO — ações clínicas (fonte determinística, sem IA) */}
            {actRows.length > 0 && (
              <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="Perguntas pro médico">
                <h3 className="text-sm font-semibold">Perguntas pra levar ao médico</h3>
                {actRows.map((a, i) => (
                  <div key={i} className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 min-w-40 text-sm font-bold">{a.title}</span>
                      <span className={'rounded-full border px-2 py-0.5 text-[11px] font-bold ' + (a.timeframe === 'agora' ? 'border-destructive/25 bg-destructive/10 text-destructive-foreground dark:text-destructive' : 'border-primary/25 bg-primary/10 text-primary')}>{a.timeframe === 'agora' ? 'prioridade agora' : 'rotina'}</span>
                    </div>
                    <p className="mt-1.5 text-sm italic text-muted-foreground">“{a.question}”</p>
                    {a.source && <p className="mt-1 text-[11px] text-muted-foreground/70">Base: {a.source}</p>}
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground/70">Conteúdo educativo gerado a partir dos seus exames — perguntas pra facilitar a consulta. Não substitui avaliação médica.</p>
              </section>
            )}
          </>
        );
      })()}

      {/* LEVA 2 — coletas, saúde mental, IA e teleconsulta */}
      {mostrarConteudo && (() => {
        const colRows = demo ? DEMO_COLETAS : coletas;
        const men = demo ? DEMO_MENTAL : mental;
        return (
          <>
            {/* PRÓXIMAS COLETAS — checklist do plano clínico */}
            {colRows.length > 0 && (
              <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="Próximas coletas">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Próximas coletas</h3>
                  <span className="text-xs text-muted-foreground">plano do seu médico</span>
                </div>
                {colRows.map((c) => (
                  <div key={c.id ?? c.title} className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2">
                    <span aria-hidden className="text-base">🧪</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                    {c.dueDate && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{whenChip(c.dueDate).text}</span>}
                  </div>
                ))}
              </section>
            )}

            {/* SAÚDE MENTAL — PHQ-9 / GAD-7 */}
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Saúde mental">
              <div>
                <h3 className="text-sm font-semibold">Como você está se sentindo</h3>
                <p className="text-xs text-muted-foreground">check-in emocional (PHQ-9 · GAD-7)</p>
              </div>
              {men && (men.phq9 != null || men.gad7 != null) ? (
                <div className="flex gap-2">
                  {men.phq9 != null && (() => { const t = mentalTone(men.phq9); return (
                    <span className={'rounded-full border px-2.5 py-1 text-xs font-bold ' + t.cls}>PHQ-9 {men.phq9} · {t.label}</span>
                  ); })()}
                  {men.gad7 != null && (() => { const t = mentalTone(men.gad7); return (
                    <span className={'rounded-full border px-2.5 py-1 text-xs font-bold ' + t.cls}>GAD-7 {men.gad7} · {t.label}</span>
                  ); })()}
                </div>
              ) : (
                <a href="#/saude-mental" className="rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground">Fazer check-in (2 min)</a>
              )}
            </section>

            {/* DR. EXAME IA — entrada pro chat */}
            <a href="#/chat" className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-transparent p-4 transition-colors hover:from-primary/15">
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">✨</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Tirar dúvida com o Dr. Exame</span>
                <span className="block text-xs text-muted-foreground">sobre seus exames, medicamentos e faixas — na hora</span>
              </span>
              <span aria-hidden className="text-primary">→</span>
            </a>

            {/* TELECONSULTA — destaque clínico */}
            <a href="#/consultas" className="flex items-center gap-3 rounded-xl border border-copper-500/30 bg-copper-500/10 p-4 transition-colors hover:bg-copper-500/15">
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-copper-500 text-lg text-white">🩺</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Falar com um médico</span>
                <span className="block text-xs text-muted-foreground">teleconsulta com os médicos que já acompanham você</span>
              </span>
              <span aria-hidden className="text-copper-700 dark:text-copper-300">→</span>
            </a>
          </>
        );
      })()}

      {/* LEVA 3 — mapa corporal real (componente de produção embutido) + panorama */}
      {mostrarConteudo && (() => {
        const bk = demo ? DEMO_BUCKETS : buckets;
        const go = (hash: string) => () => { window.location.hash = hash; };
        return (
          <>
            {/* MAPA CORPORAL — o componente REAL do app (SVG interativo, dado real).
                Em demo não existe mapa fictício honesto → placeholder explícito. */}
            <section className="rounded-xl border border-border bg-card p-4" aria-label="Mapa corporal">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Mapa corporal</h3>
                <span className="text-xs text-muted-foreground">toque numa região</span>
              </div>
              {demo ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">O mapa interativo aparece com seus dados reais (exemplo não desenha corpo fictício).</p>
              ) : (
                <BodyMap
                  regions={bodyRegions}
                  loaded={phase === 'ready'}
                  onRegionClick={go('#/alterados')}
                  onNavigateToTrend={(canonical: string) => { window.location.hash = `#/tendencias?select=${encodeURIComponent(canonical)}`; }}
                  onNavigateToExam={(examId: string) => { window.location.hash = `#/exams/${examId}`; }}
                  onUploadExam={go('#/exams/create')}
                />
              )}
            </section>

            {/* PANORAMA DOS MARCADORES */}
            {bk && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Panorama dos marcadores">
                <h3 className="text-sm font-semibold">Panorama dos marcadores</h3>
                <div className="flex gap-2">
                  <span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-bold text-success-foreground dark:text-success">{bk.ok ?? 0} na faixa</span>
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning-foreground dark:text-warning">{bk.alterados ?? 0} alterados</span>
                  <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive-foreground dark:text-destructive">{bk.alerta ?? 0} em alerta</span>
                </div>
                <a href="#/alterados" className="text-xs font-bold text-primary">ver todos →</a>
              </section>
            )}

            {/* CRÉDITOS DO PLANO */}
            {credits != null && !demo && (
              <a href="#/planos" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted">
                <span className="text-sm font-semibold">Créditos do plano</span>
                <span className="rounded-full bg-copper-500/15 px-3 py-1 text-sm font-extrabold text-copper-700 dark:text-copper-300">{credits} ⚡</span>
              </a>
            )}
          </>
        );
      })()}

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
