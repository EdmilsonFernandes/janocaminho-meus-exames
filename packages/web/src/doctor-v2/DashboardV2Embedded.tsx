import { useEffect, useState } from 'react';
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
import { NextStepsCard } from '../components/dashboard/NextStepsCard';
import { FailedExamsAlert } from '../components/dashboard/FailedExamsAlert';
import { RejectedExamsAlert } from '../components/dashboard/RejectedExamsAlert';
import { ChangesSinceExam } from '../components/dashboard/ChangesSinceExam';
import { ClinicalActionsCard } from '../components/dashboard/ClinicalActionsCard';
import { ActivityCard } from '../components/dashboard/ActivityCard';
import { RestingHeartCard } from '../components/dashboard/RestingHeartCard';
import { syncPushToken } from '../push';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import './tw.css';

/**
 * DASHBOARD v2 EMBUTIDO — a versão candidata a OFICIAL do `/#/`.
 *
 * Diferenças da sala (/dashboard-v2): roda DENTRO do shell do app (bottom nav,
 * AppBar, FAB), sem header próprio/demo/comparador — só conteúdo real — e com
 * os SIDE-EFFECTS do dashboard de produção (sync do token de push + heartbeat
 * de conquistas). Seções complexas usam os COMPONENTES REAIS do app (BodyMap,
 * ChangesSinceExam, ClinicalActionsCard, NextSteps, alertas, Activity) —
 * paridade de função, não só de cara.
 *
 * Ativado por flag de USUÁRIO (localStorage dx.dashV2=1 → App.tsx troca o
 * dashboard). Rollout: dono → beta → todos. Sem a flag, nada muda.
 */

type Pt = { date: string; valor: number; flag?: string | null };
type Series = { name: string; unit?: string; refLow?: number | null; refHigh?: number | null; points: Pt[] };

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const scoreStatus = (s: number | null) => (s == null ? null : s >= 80 ? 'em ótima forma' : s >= 60 ? 'em boa forma' : s >= 40 ? 'pede atenção' : 'precisa de cuidados');
const whenChip = (iso: string): string => {
  const due = new Date(iso).getTime();
  if (isNaN(due)) return '';
  const dayMs = 86_400_000;
  const sod = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((sod(due) - sod(Date.now())) / dayMs);
  if (days < -1) return `vencido há ${-days} dias`;
  if (days === -1) return 'vencido ontem';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
};
const mentalToneCls = (v: number) => (v <= 4 ? 'border-success/25 bg-success/10 text-success-foreground dark:text-success' : v <= 9 ? 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning' : 'border-destructive/25 bg-destructive/10 text-destructive-foreground dark:text-destructive');

/** Sincroniza a classe .dark da ilha com o tema do APP (RaStore) — no shell, quem
 *  manda no tema é o toggle do AppBar; a ilha apenas acompanha. */
const useDarkBridge = () => {
  useEffect(() => {
    const sync = () => {
      let dark = false;
      try { dark = JSON.parse(localStorage.getItem('RaStore.theme') ?? 'null') === 'dark'; } catch { /* */ }
      document.documentElement.classList.toggle('dark', dark);
    };
    sync();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
};

export const DashboardV2Embedded = () => {
  useDarkBridge();
  const [pid] = useSelectedPatient();
  const [phase, setPhase] = useState<'load' | 'ready' | 'error'>('load');
  const [cards, setCards] = useState<ICard[]>([]);
  const [hero, setHero] = useState<{ score: number | null; lastExam: string | null; alterados: number }>({ score: null, lastExam: null, alterados: 0 });
  const [examStats, setExamStats] = useState({ total: 0, failed: 0, rejected: 0, processing: 0 });
  const [changesRaw, setChangesRaw] = useState<{ worsened: any[]; improved: any[] }>({ worsened: [], improved: [] });
  const [bio, setBio] = useState<{ age: number } | null>(null);
  const [actionsRaw, setActionsRaw] = useState<any[] | null>(null);
  const [bodyRegions, setBodyRegions] = useState<any[] | null>(null);
  const [buckets, setBuckets] = useState<{ ok?: number; alterados?: number; alerta?: number } | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [sel, setSel] = useState(0);
  const [pend, setPend] = useState<{ key: string; label: string; chip: string; tone: 'primary' | 'warning' | 'secondary'; to: string }[]>([]);
  const [coletas, setColetas] = useState<{ id?: string; title?: string; dueDate?: string }[]>([]);
  const [mental, setMental] = useState<{ phq9: number | null; gad7: number | null } | null>(null);

  useEffect(() => {
    if (!pid) return;
    let alive = true;
    const h = { Authorization: `Bearer ${token()}` };
    (async () => {
      try {
        const r = await fetch(`${API_URL}/patients/${pid}/dashboard-summary`, { headers: h });
        if (!r.ok) throw new Error('summary');
        const d = await r.json();
        const total = d?.exams?.total ?? 0;
        const alterados = (d?.buckets?.alerta ?? 0) + (d?.buckets?.alterados ?? 0);
        const score = typeof d?.health?.score === 'number' ? d.health.score : null;
        const markers = typeof d?.health?.markers === 'number' ? d.health.markers : 0;
        if (!alive) return;
        setExamStats({ total, failed: d?.exams?.failed ?? 0, rejected: d?.exams?.rejected ?? 0, processing: d?.processing?.count ?? 0 });
        setHero({ score, lastExam: d?.exams?.lastExamAt ?? null, alterados });
        setCards([
          { title: 'Exames no app', valueBold: String(total), valueFaint: '', icon: <DescriptionRoundedIcon aria-hidden="true" />, description: 'Histórico completo de exames laboratoriais', badge: String(total), variant: 'primary-light' },
          { title: 'Valores alterados', valueBold: String(alterados), valueFaint: '', icon: <MonitorHeartRoundedIcon aria-hidden="true" />, description: 'Marcadores fora da faixa no último exame', badge: alterados > 0 ? 'revisar' : 'ok', variant: alterados > 0 ? 'destructive-light' : 'success-light' },
          { title: 'Score de saúde', valueBold: score == null ? '—' : String(score), valueFaint: '/100', icon: <SpeedRoundedIcon aria-hidden="true" />, description: 'Avaliação geral calculada pela IA Dr. Exame', badge: scoreStatus(score) ?? 'calculando', variant: (score ?? 100) >= 60 ? 'success-light' : 'warning-light' },
          { title: 'Marcadores', valueBold: String(markers), valueFaint: '', icon: <BiotechRoundedIcon aria-hidden="true" />, description: 'Analisados e monitorados automaticamente', badge: 'IA', variant: 'info-light' },
        ]);
        const hd: any = d?.health;
        if (hd) {
          setChangesRaw({ worsened: Array.isArray(hd.worsening) ? hd.worsening.slice(0, 3) : [], improved: Array.isArray(hd.improving) ? hd.improving.slice(0, 3) : [] });
          if (hd.biologicalAge && typeof hd.biologicalAge.age === 'number') setBio({ age: hd.biologicalAge.age });
          setActionsRaw(Array.isArray(hd.clinicalActions) ? hd.clinicalActions : []);
          setBodyRegions(Array.isArray(hd.bodyRegions) ? hd.bodyRegions : []);
        }
        if (d?.buckets) setBuckets(d.buckets);
        if (typeof d?.credits === 'number') setCredits(d.credits);
        // Pendências + coletas + mental (mesmas fontes da sala)
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
          const isTele = (x: any) => x && (x.type === 'teleconsulta' || x.provider === 'livekit');
          const isOpen = (x: any) => x && !x.endedAt && !x.done;
          const teles = reminders.filter((x) => isTele(x) && isOpen(x)).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
          const rows: typeof pend = [];
          if (teles[0]) rows.push({ key: 'tele', label: teles[0].title || 'Consulta por vídeo', chip: whenChip(teles[0].dueDate), tone: 'primary', to: '/consultas' });
          const overdue = reminders.filter((x) => !isTele(x) && isOpen(x) && !x.recurrence && x.dueDate && +new Date(x.dueDate) < now);
          if (overdue[0]) rows.push({ key: 'od', label: overdue[0].title || 'Lembrete vencido', chip: whenChip(overdue[0].dueDate), tone: 'warning', to: '/lembretes' });
          const pendQ = Array.isArray(questions) ? questions.filter((q: any) => q && q.status !== 'answered').length : 0;
          if (pendQ > 0) rows.push({ key: 'q', label: pendQ === 1 ? 'Pergunta aguardando o médico' : `${pendQ} perguntas aguardando o médico`, chip: 'aguardando', tone: 'secondary', to: '/perguntas' });
          setPend(rows.slice(0, 3));
          if (colRes.status === 'fulfilled' && colRes.value.ok) {
            const cd = await colRes.value.json().catch(() => null);
            const list = Array.isArray(cd) ? cd : Array.isArray(cd?.items) ? cd.items : [];
            setColetas(list.filter((x: any) => x && !x.done && (x.title || x.name)).slice(0, 3).map((x: any, i: number) => ({ id: x.id ?? `c${i}`, title: x.title || x.name, dueDate: x.dueDate })));
          }
          if (menRes.status === 'fulfilled' && menRes.value.ok) {
            const md = await menRes.value.json().catch(() => null);
            const phq9 = typeof md?.phq9?.score === 'number' ? md.phq9.score : typeof md?.phq9 === 'number' ? md.phq9 : null;
            const gad7 = typeof md?.gad7?.score === 'number' ? md.gad7.score : typeof md?.gad7 === 'number' ? md.gad7 : null;
            if (phq9 != null || gad7 != null) setMental({ phq9, gad7 });
          }
        } catch { /* bônus */ }
        // Tendência: top-3 marcadores por nº de medidas
        try {
          const rNames = await fetch(`${API_URL}/items/distinct-names${pid ? `?patientId=${pid}` : ''}`, { headers: h });
          const dn = rNames.ok ? await rNames.json() : null;
          const raw: { nameCanonical?: string; count?: number }[] = Array.isArray(dn) ? dn : [];
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
        } catch { /* bônus */ }
        if (alive) setPhase('ready');
      } catch {
        if (alive) setPhase('error');
      }
    })();
    // SIDE-EFFECTS do dashboard oficial: push + conquistas (idempotentes 1x/dia).
    fetch(`${API_URL}/achievements/heartbeat`, { method: 'POST', headers: h }).catch(() => {});
    void syncPushToken();
    return () => { alive = false; };
  }, [pid]);

  const s = series[Math.min(sel, Math.max(series.length - 1, 0))];
  const vals = s?.points.map((p) => p.valor) ?? [];
  const lo = s?.refLow ?? null;
  const hi = s?.refHigh ?? null;
  const yDomain: [number | 'auto', number | 'auto'] = [
    Math.min(...(vals.length ? vals : [0]), ...(lo != null ? [lo] : [])) * 0.95,
    Math.max(...(vals.length ? vals : [1]), ...(hi != null ? [hi] : [])) * 1.05,
  ];
  const TONE_CLS: Record<string, string> = {
    primary: 'border-primary/25 bg-primary/10 text-primary',
    warning: 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning',
    secondary: 'border-copper-500/30 bg-copper-500/15 text-copper-700 dark:text-copper-300',
  };
  const go = (hash: string) => () => { window.location.hash = hash; };

  return (
    <div className="dx-island flex flex-col gap-4 p-1 sm:p-2">
      {/* ALERTAS de exame — componentes REAIS (falhou/rejeitaram/processando) */}
      <FailedExamsAlert count={examStats.failed} onClick={go('/exams')} />
      <RejectedExamsAlert count={examStats.rejected} onClick={go('/exams')} />
      {examStats.processing > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">
          ⏳ {examStats.processing} {examStats.processing === 1 ? 'exame em processamento' : 'exames em processamento'} — a IA está analisando
        </div>
      )}

      {phase === 'load' && <div className="h-48 animate-pulse rounded-2xl bg-muted" />}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Não consegui carregar seu resumo agora.</p>
          <button type="button" onClick={() => location.reload()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Tentar de novo</button>
        </div>
      )}

      {phase === 'ready' && (
        <>
          {/* ONBOARDING — componente REAL (some quando o básico está pronto) */}
          <NextStepsCard exams={examStats.total} />

          {/* HERO */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-teal-800 p-5 text-white shadow-lg">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,255,255,0.18),transparent_60%)]" />
            <div className="relative flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">Seu score de saúde</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-5xl font-extrabold leading-none tabular-nums">{hero.score ?? '—'}</span>
                  <span className="text-sm font-semibold text-white/80">de 100 · {scoreStatus(hero.score) ?? 'calculando'}</span>
                </div>
                <p className="mt-1.5 text-sm text-white/85">
                  {hero.lastExam ? <>Último exame em <strong>{fmtDate(hero.lastExam)}</strong></> : 'Baseado nos seus exames laboratoriais'}
                  {hero.alterados > 0 ? <> · <strong>{hero.alterados}</strong> valores alterados</> : ''}
                </p>
              </div>
              <a href="#/relatorio" className="rounded-xl bg-white/95 px-4 py-2.5 text-sm font-bold text-teal-800 shadow transition-transform hover:scale-[1.02] active:scale-95">Ver análise completa →</a>
            </div>
          </section>

          {/* TILES */}
          <CardGrid cards={cards} />

          {/* PENDÊNCIAS */}
          {pend.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="Pendências">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Pra você fazer</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{pend.length}</span>
              </div>
              {pend.map((r) => (
                <a key={r.key} href={`#${r.to}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
                  <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ' + TONE_CLS[r.tone]} aria-hidden>●</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.label}</span>
                  <span className={'shrink-0 text-xs font-bold ' + TONE_CLS[r.tone].split(' ').filter(c => c.startsWith('text-')).join(' ')}>{r.chip}</span>
                  <span aria-hidden className="text-muted-foreground">→</span>
                </a>
              ))}
            </section>
          )}

          {/* COLETAS */}
          {coletas.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="Próximas coletas">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Próximas coletas</h3>
                <span className="text-xs text-muted-foreground">plano do seu médico</span>
              </div>
              {coletas.map((c) => (
                <div key={c.id ?? c.title} className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2">
                  <span aria-hidden className="text-base">🧪</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                  {c.dueDate && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{whenChip(c.dueDate)}</span>}
                </div>
              ))}
            </section>
          )}

          {/* O QUE MUDOU — componente REAL */}
          <ChangesSinceExam worsened={changesRaw.worsened} improved={changesRaw.improved} onView={go('/tendencias')} loaded={phase === 'ready'} lastExamAt={hero.lastExam} />

          {/* IDADE BIOLÓGICA */}
          {bio && (
            <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Idade biológica">
              <div>
                <h3 className="text-sm font-semibold">Idade biológica</h3>
                <p className="text-xs text-muted-foreground">estimada pelos seus marcadores laboratoriais</p>
              </div>
              <div className="font-head text-4xl font-extrabold tabular-nums text-primary">{bio.age}<span className="text-sm font-bold text-muted-foreground"> anos</span></div>
            </section>
          )}

          {/* PERGUNTAS PRO MÉDICO — componente REAL */}
          {actionsRaw && actionsRaw.length > 0 && <ClinicalActionsCard actions={actionsRaw} loaded />}

          {/* SAÚDE MENTAL */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Saúde mental">
            <div>
              <h3 className="text-sm font-semibold">Como você está se sentindo</h3>
              <p className="text-xs text-muted-foreground">check-in emocional (PHQ-9 · GAD-7)</p>
            </div>
            {mental && (mental.phq9 != null || mental.gad7 != null) ? (
              <div className="flex gap-2">
                {mental.phq9 != null && <span className={'rounded-full border px-2.5 py-1 text-xs font-bold ' + mentalToneCls(mental.phq9)}>PHQ-9 {mental.phq9}</span>}
                {mental.gad7 != null && <span className={'rounded-full border px-2.5 py-1 text-xs font-bold ' + mentalToneCls(mental.gad7)}>GAD-7 {mental.gad7}</span>}
              </div>
            ) : (
              <a href="#/saude-mental" className="rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground">Fazer check-in (2 min)</a>
            )}
          </section>

          {/* IA + TELECONSULTA */}
          <a href="#/chat" className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-transparent p-4 transition-colors hover:from-primary/15">
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">✨</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Tirar dúvida com o Dr. Exame</span>
              <span className="block text-xs text-muted-foreground">sobre seus exames, medicamentos e faixas — na hora</span>
            </span>
            <span aria-hidden className="text-primary">→</span>
          </a>
          <a href="#/consultas" className="flex items-center gap-3 rounded-xl border border-copper-500/30 bg-copper-500/10 p-4 transition-colors hover:bg-copper-500/15">
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-copper-500 text-lg text-white">🩺</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Falar com um médico</span>
              <span className="block text-xs text-muted-foreground">teleconsulta com os médicos que já acompanham você</span>
            </span>
            <span aria-hidden className="text-copper-700 dark:text-copper-300">→</span>
          </a>

          {/* MAPA CORPORAL — componente REAL */}
          <section className="rounded-xl border border-border bg-card p-4" aria-label="Mapa corporal">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Mapa corporal</h3>
              <span className="text-xs text-muted-foreground">toque numa região</span>
            </div>
            <BodyMap
              regions={bodyRegions}
              loaded={phase === 'ready'}
              onRegionClick={go('/alterados')}
              onNavigateToTrend={(canonical: string) => { window.location.hash = `#/tendencias?select=${encodeURIComponent(canonical)}`; }}
              onNavigateToExam={(examId: string) => { window.location.hash = `#/exams/${examId}`; }}
              onUploadExam={go('/exams/create')}
            />
          </section>

          {/* PANORAMA + CRÉDITOS */}
          {buckets && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Panorama dos marcadores">
              <h3 className="text-sm font-semibold">Panorama dos marcadores</h3>
              <div className="flex gap-2">
                <span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-bold text-success-foreground dark:text-success">{buckets.ok ?? 0} na faixa</span>
                <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning-foreground dark:text-warning">{buckets.alterados ?? 0} alterados</span>
                <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive-foreground dark:text-destructive">{buckets.alerta ?? 0} em alerta</span>
              </div>
              <a href="#/alterados" className="text-xs font-bold text-primary">ver todos →</a>
            </section>
          )}
          {credits != null && (
            <a href="#/planos" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted">
              <span className="text-sm font-semibold">Créditos do plano</span>
              <span className="rounded-full bg-copper-500/15 px-3 py-1 text-sm font-extrabold text-copper-700 dark:text-copper-300">{credits} ⚡</span>
            </a>
          )}

          {/* TENDÊNCIA */}
          {s && (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Evolução do marcador</h3>
                <div className="flex flex-wrap gap-1.5">
                  {series.map((x, i) => (
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

          {/* ATIVIDADE / FC — componentes REAIS (Health Connect) */}
          <div className="flex flex-col gap-3">
            <ActivityCard lastExamAt={hero.lastExam} />
            <RestingHeartCard />
          </div>
        </>
      )}
    </div>
  );
};
