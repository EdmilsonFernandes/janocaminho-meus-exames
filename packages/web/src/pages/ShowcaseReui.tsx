import { useEffect, useMemo, useRef, useState } from 'react';
import { LinearProgress, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Title } from 'react-admin';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import {
  ArrowLeft, ArrowRight, Sparkles, TrendingUp, TrendingDown, FileText, Upload,
  Clock, PenLine, Mic, Send, Check, ChevronRight, Activity, HeartPulse, Moon,
  Stethoscope, ClipboardList, ShieldCheck, Zap, BadgeCheck,
  AlertTriangle, Phone, CalendarCheck, Download, RotateCcw, Star, X, Layers,
  Pill, FileSearch, Bot, UserRound, Syringe, CreditCard, Trophy, KeyRound, Lock, Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrExame } from '../components/DrExame';
import { GradientButton } from '../components/GradientButton';
import { PageContainer } from '../components/layout/PageContainer';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription, FrameFooter } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile, MessageHeader as PatternMessageHeader, type ReuiTone } from '@/components/reui/patterns';
import { Rating } from '@/components/reui/rating';
import {
  Timeline, TimelineItem, TimelineSeparator, TimelineIndicator, TimelineHeader, TimelineTitle, TimelineDate, TimelineContent,
} from '@/components/reui/timeline';
import {
  Message, MessageGroup, MessageAvatar, MessageContent,
  Bubble, BubbleContent, AssistantReplyActions,
} from '@/components/reui/message';

/* ============================================================================
 * Showcase ReUI × Dr. Exame — maquete interativa dos padrões portados p/ MUI.
 * Tudo aqui é DADOS FICTÍCIOS; nenhum dado real de paciente, nenhuma chamada de API.
 * Cada seção cita o bloco ReUI de origem + link do preview ao vivo.
 * ==========================================================================*/

// ---------- Utilidades visuais (SVG puro — leve, sem lib) ----------

/** Sparkline: mini linha SVG normalizada (inspirado em chart-15 / chart-25). */
function Sparkline({ data, stroke = '#20b2aa', width = 96, height = 28 }: { data: number[]; stroke?: string; width?: number; height?: number }) {
  const { d, area } = useMemo(() => {
    if (data.length < 2) return { d: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { d: line, area: `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z` };
  }, [data, width, height]);
  const gid = useMemo(() => `sp-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gid})`} />}
      {d && <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Ring gauge (inspirado em chart-8 — SLO rings) p/ aderência a metas. */
function GoalRing({ pct, label, value, tone = '#20b2aa', size = 92 }: { pct: number; label: string; value: string; tone?: string; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="9" className="stroke-muted" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="9" stroke={tone} strokeLinecap="round"
            strokeDasharray={`${(c * filled).toFixed(1)} ${c.toFixed(1)}`} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-lg font-extrabold tabular-nums text-foreground">{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-bold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// ---------- Shell de seção ----------

interface SectionProps {
  n: number;
  title: string;
  from: string;
  previewUrl: string;
  desc: string;
  children: React.ReactNode;
}

function Section({ n, title, from, previewUrl, desc, children }: SectionProps) {
  return (
    <section className="mt-7 scroll-mt-4" aria-labelledby={`sec-${n}`}>
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-grid size-6 place-items-center rounded-lg bg-teal-600/12 text-[11px] font-extrabold text-teal-700 dark:text-teal-300 tabular-nums border border-teal-600/20">
            {String(n).padStart(2, '0')}
          </span>
          <h2 id={`sec-${n}`} className="font-heading text-base sm:text-lg font-extrabold text-foreground tracking-tight">{title}</h2>
          <Badge variant="outline" size="xs" className="font-mono normal-case">{from}</Badge>
        </div>
        <p className="mt-1.5 text-xs sm:text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
        <a href={previewUrl} target="_blank" rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-300">
          ver original ReUI ao vivo <ArrowRight className="size-3" />
        </a>
      </div>
      {children}
    </section>
  );
}

// ---------- Mocks ----------

type Period = 'semana' | 'mes' | 'ano';

interface Kpi { label: string; value: string; decimals: string; delta: number; spark: number[]; tone: ReuiTone; icon: React.ReactNode }

const KPI_BY_PERIOD: Record<Period, Kpi[]> = {
  semana: [
    { label: 'Score de saúde', value: '72', decimals: ',4', delta: 2.1, spark: [68, 69, 70, 69, 71, 72], tone: 'primary', icon: <HeartPulse className="size-4" /> },
    { label: 'Valores alterados', value: '3', decimals: '', delta: -1, spark: [5, 5, 4, 4, 4, 3], tone: 'warning', icon: <Activity className="size-4" /> },
    { label: 'Exames na semana', value: '2', decimals: '', delta: 0, spark: [1, 1, 2, 1, 1, 2], tone: 'info', icon: <FileText className="size-4" /> },
    { label: 'Aderência às metas', value: '68', decimals: '%', delta: 4, spark: [58, 61, 63, 65, 66, 68], tone: 'success', icon: <Zap className="size-4" /> },
  ],
  mes: [
    { label: 'Score de saúde', value: '74', decimals: ',0', delta: 3.4, spark: [66, 68, 70, 72, 73, 74], tone: 'primary', icon: <HeartPulse className="size-4" /> },
    { label: 'Valores alterados', value: '5', decimals: '', delta: -2, spark: [8, 7, 7, 6, 5, 5], tone: 'warning', icon: <Activity className="size-4" /> },
    { label: 'Exames no mês', value: '6', decimals: '', delta: 2, spark: [2, 3, 3, 5, 5, 6], tone: 'info', icon: <FileText className="size-4" /> },
    { label: 'Aderência às metas', value: '72', decimals: '%', delta: 6, spark: [60, 63, 67, 69, 71, 72], tone: 'success', icon: <Zap className="size-4" /> },
  ],
  ano: [
    { label: 'Score de saúde', value: '78', decimals: ',2', delta: 11.2, spark: [64, 67, 70, 73, 76, 78], tone: 'primary', icon: <HeartPulse className="size-4" /> },
    { label: 'Valores alterados', value: '8', decimals: '', delta: -5, spark: [14, 13, 12, 10, 9, 8], tone: 'warning', icon: <Activity className="size-4" /> },
    { label: 'Exames no ano', value: '21', decimals: '', delta: 6, spark: [4, 7, 11, 14, 18, 21], tone: 'info', icon: <FileText className="size-4" /> },
    { label: 'Aderência às metas', value: '75', decimals: '%', delta: 9, spark: [62, 65, 68, 71, 74, 75], tone: 'success', icon: <Zap className="size-4" /> },
  ],
};

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out'];

type MetricKey = 'glicose' | 'tsh' | 'hdl';

interface Metric { key: MetricKey; label: string; unit: string; refMin: number; refMax: number; current: number[]; previous: number[]; eventAt?: string; eventLabel?: string; betterIsLower: boolean }

const METRICS: Record<MetricKey, Metric> = {
  glicose: {
    key: 'glicose', label: 'Glicose em jejum', unit: 'mg/dL', refMin: 70, refMax: 99, betterIsLower: true,
    current: [112, 110, 108, 104, 99, 95, 91, 90, 88, 87],
    previous: [118, 117, 116, 115, 114, 113, 112, 111, 110, 109],
    eventAt: 'jul', eventLabel: 'Metformina 500mg',
  },
  tsh: {
    key: 'tsh', label: 'TSH', unit: 'mUI/L', refMin: 0.4, refMax: 4.0, betterIsLower: true,
    current: [5.8, 5.4, 4.9, 4.6, 4.2, 3.8, 3.5, 3.3, 3.1, 3.0],
    previous: [6.2, 6.1, 6.0, 5.9, 5.8, 5.7, 5.6, 5.5, 5.4, 5.3],
  },
  hdl: {
    key: 'hdl', label: 'HDL (colesterol bom)', unit: 'mg/dL', refMin: 40, refMax: 90, betterIsLower: false,
    current: [38, 39, 41, 42, 44, 45, 47, 48, 50, 51],
    previous: [36, 36, 37, 37, 38, 38, 39, 39, 40, 40],
  },
};

const PIPELINE_STAGES = [
  { label: 'Enviado', detail: 'PDF 2,4 MB' },
  { label: 'PDF lido', detail: '4 páginas' },
  { label: 'Texto extraído', detail: 'pdftotext · 31 valores' },
  { label: 'IA analisando', detail: 'GLM-4.6 · ~40s' },
  { label: 'Sua conferência', detail: 'você aprova os valores' },
  { label: 'Pronto', detail: 'no seu histórico' },
];

const HISTORY = [
  {
    date: '28 out 2026', title: 'Hemograma completo', badge: 'success-light' as const, badgeText: 'Estável',
    detail: '18 valores · 2 alterados leves · igual ao exame anterior', file: 'hemograma-out-28.pdf',
  },
  {
    date: '14 set 2026', title: 'TSH + T4 livre', badge: 'warning-light' as const, badgeText: 'Melhorou ↓',
    detail: 'TSH 3,0 (era 4,9) · dentro da faixa após ajuste de dose', file: 'tsh-set-14.pdf',
  },
  {
    date: '02 ago 2026', title: 'Glicemia + HbA1c', badge: 'info-light' as const, badgeText: 'Novo',
    detail: 'Primeiro envio · HbA1c 6,8% · plano de ação criado', file: 'glicemia-ago-02.pdf',
  },
];

// PHQ-9 (rastreamento validado — 4 itens desta maquete; escala 0–3)
const PHQ_ITEMS = [
  { id: 1, text: 'Pouco interesse ou pouco prazer em fazer as coisas', options: ['Nunca', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'] },
  { id: 2, text: 'Dificuldade para dormir, ou dormindo demais', options: ['Nunca', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'] },
  { id: 3, text: 'Sentir-se cansado/a ou com pouca energia', options: ['Nunca', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'] },
  { id: 4, text: 'Sentir-se desanimado/a, sem esperança no futuro', options: ['Nunca', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'] },
];
const PHQ_BRANCH = { id: 5, text: 'Em alguns dias, pensou em se machucar ou que seria melhor não estar vivo/a?', options: ['Nunca', 'Sim, alguns dias', 'Sim, muitos dias', 'Sim, quase todos os dias'] };

const CHAT_STARTERS = [
  'O que significa TSH alta?',
  'Compare meus últimos 3 exames',
  'O que perguntar ao médico sobre HbA1c?',
];

const CID_PATH = [
  { level: 'E00–E90', label: 'Endócrinas e nutricionais' },
  { level: 'E10–E14', label: 'Diabetes mellitus' },
  { level: 'E11', label: 'Diabetes tipo 2' },
  { level: 'E11.9', label: 'Sem complicações' },
];

// ---------- Página ----------

export const ShowcaseReuiPage = () => {
  useReuiThemeSync();
  const navigate = useNavigate();
  return (
    <PageContainer width={860}>
      <Title title="Maquete ReUI × Dr. Exame" />
      {/* Voltar */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-2xs transition-colors hover:bg-muted cursor-pointer">
          <ArrowLeft className="size-3.5" /><span>Voltar</span>
        </button>
        <Badge variant="destructive-light" size="xs">dados fictícios · maquete</Badge>
      </div>

      {/* HERO */}
      <Frame variant="default" className="mb-2">
        <FrameHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/25">
              <DrExame size={36} sx={{ borderRadius: '50%' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-lg sm:text-xl font-extrabold text-foreground">Maquete ReUI × Dr. Exame</h1>
                <Badge variant="primary-light" size="xs">11 seções · 30 padrões</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Como os blocos do catálogo ReUI ficam portados pra MUI × tema teal — sem instalar shadcn.
              </p>
            </div>
          </div>
        </FrameHeader>
        <FramePanel className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success-light" size="xs"><Check className="size-3" /> componentes reui nativos (Frame, Badge, Timeline…)</Badge>
            <Badge variant="info-light" size="xs">Recharts p/ gráficos</Badge>
            <Badge variant="outline" size="xs">mobile-first 360–412px</Badge>
            <Badge variant="outline" size="xs">dark/light</Badge>
          </div>
        </FramePanel>
      </Frame>

      <KpiSection />
      <EvolutionSection />
      <PipelineSection />
      <HistorySection />
      <EmptyStateSection />
      <PhqSection />
      <ChatSection />
      <BookingSection />
      <PlansSection />
      <ExtrasSection />
      <Lote2Section />

      {/* FOOTER */}
      <Frame variant="default" className="mt-7">
        <FramePanel className="p-5 text-center space-y-2">
          <Sparkles className="size-5 mx-auto text-teal-600 dark:text-teal-300" aria-hidden="true" />
          <p className="text-sm font-bold text-foreground">Padrões, não dependência</p>
          <p className="text-xs leading-relaxed text-muted-foreground max-w-md mx-auto">
            Tudo aqui foi reescrito em MUI + componentes <code className="text-[11px] font-mono bg-muted/60 rounded px-1">@/components/reui/*</code> já
            adotados no app — zero blocos shadcn instalados, tema e identidade preservados. Quando um padrão for aprovado,
            ele promove pra tela real com dados de verdade.
          </p>
          <a href="https://reui.io?ref=mcp" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-300">
            reui.io — catálogo completo <ArrowRight className="size-3" />
          </a>
        </FramePanel>
      </Frame>
    </PageContainer>
  );
};

/* ============================== 01 · KPIs ============================== */

function KpiSection() {
  const [period, setPeriod] = useState<Period>('mes');
  const kpis = KPI_BY_PERIOD[period];
  return (
    <Section n={1} title="Dashboard com KPIs e período" from="chart-1 + chart-15 + card-34" previewUrl="https://reui.io/preview/base/chart-1?ref=mcp"
      desc="Tabs de período trocam os 4 KPIs, cada um com sparkline, delta colorido e decimal esmaecido (6,4 vira “6” forte + “,4” claro). Alvo: tiles do DashboardV2.">
      <Frame>
        <FrameHeader className="flex-row items-center justify-between gap-2 flex-wrap pb-2">
          <FrameTitle className="flex items-center gap-1.5"><Activity className="size-4 text-teal-600 dark:text-teal-300" /> Seu resumo</FrameTitle>
          <div role="tablist" aria-label="Período" className="flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
            {(['semana', 'mes', 'ano'] as const).map((p) => (
              <button key={p} role="tab" aria-selected={period === p} type="button" onClick={() => setPeriod(p)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                  period === p ? 'bg-teal-600 text-white shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                {p === 'semana' ? 'Semana' : p === 'mes' ? 'Mês' : 'Ano'}
              </button>
            ))}
          </div>
        </FrameHeader>
        <FramePanel className="p-3">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label + period} className="rounded-xl border border-border/70 bg-card p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-1.5">
                  <IconTile tone={k.tone} size="sm">{k.icon}</IconTile>
                  <Sparkline data={k.spark} />
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{k.value}</span>
                  {k.decimals && <span className="text-sm font-bold tabular-nums text-muted-foreground/60">{k.decimals}</span>}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground leading-tight">{k.label}</span>
                  <Badge variant={k.delta > 0 ? 'success-light' : k.delta < 0 ? (k.tone === 'warning' ? 'success-light' : 'destructive-light') : 'outline'} size="xs">
                    {k.delta > 0 ? <TrendingUp className="size-3" /> : k.delta < 0 ? <TrendingDown className="size-3" /> : null}
                    {k.delta === 0 ? '—' : `${Math.abs(k.delta)}%`}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </FramePanel>
      </Frame>
    </Section>
  );
}

/* ============================== 02 · Evolução ============================== */

function EvolutionSection() {
  const [metric, setMetric] = useState<MetricKey>('glicose');
  const m = METRICS[metric];
  const data = useMemo(() => MONTHS.map((mo, i) => ({ mo, atual: m.current[i], anterior: m.previous[i] })), [m]);
  const delta = useMemo(() => {
    const d = m.current[m.current.length - 1] - m.current[0];
    const good = m.betterIsLower ? d < 0 : d > 0;
    return { d, good };
  }, [m]);
  return (
    <Section n={2} title="Evolução com anotações e período anterior" from="chart-6 + chart-22" previewUrl="https://reui.io/preview/base/chart-6?ref=mcp"
      desc="Métricas comutáveis, linha fantasma do período anterior, faixa de referência e MARCO de medicação sobre a curva — a promessa “vi o efeito do tratamento”. Alvo: página Evolução.">
      <Frame>
        <FrameHeader className="flex-row items-start justify-between gap-2 flex-wrap pb-2">
          <div>
            <FrameTitle className="flex items-center gap-1.5"><Activity className="size-4 text-teal-600 dark:text-teal-300" /> {m.label}</FrameTitle>
            <FrameDescription className="text-xs">
              Referência {m.refMin}–{m.refMax} {m.unit} ·{' '}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {delta.good ? '↓' : '↑'} {Math.abs(delta.d).toFixed(1).replace('.', ',')} {m.unit} desde janeiro
              </span>
            </FrameDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(METRICS) as MetricKey[]).map((k) => (
              <button key={k} type="button" onClick={() => setMetric(k)}
                className={cn('rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                  metric === k ? 'bg-teal-600 text-white shadow-xs' : 'border border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground')}>
                {METRICS[k].label.split(' ')[0]}
              </button>
            ))}
          </div>
        </FrameHeader>
        <FramePanel className="p-3 sm:p-4">
          <div className="h-56 sm:h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, rgba(120,130,140,.2))" vertical={false} />
                <XAxis dataKey="mo" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground, #94a3b8)" tickLine={false} axisLine={false} />
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground, #94a3b8)" tickLine={false} axisLine={false} width={38} />
                <ReTooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(32,178,170,.3)', background: 'var(--color-card, #fff)', fontSize: 12 }}
                  formatter={(v, name) => [`${Number(v ?? 0).toFixed(1).replace('.', ',')} ${m.unit}`, String(name)]}
                />
                {m.refMin !== undefined && (
                  <ReferenceLine y={m.refMax} stroke="#d4a574" strokeDasharray="6 4" label={{ value: `máx ${m.refMax}`, fontSize: 10, fill: '#d4a574', position: 'insideTopRight' }} />
                )}
                {m.eventAt && (
                  <ReferenceLine x={m.eventAt} stroke="#20b2aa" strokeWidth={1.5}
                    label={{ value: `◆ ${m.eventLabel}`, fontSize: 10, fill: '#20b2aa', position: 'insideTopLeft' }} />
                )}
                <Line type="monotone" dataKey="anterior" name="ano passado" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="atual" name="você agora" stroke="#20b2aa" strokeWidth={2.6} dot={{ r: 3, fill: '#20b2aa', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <FrameFooter className="flex items-center justify-between gap-2 flex-wrap pt-2">
            <div className="flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 rounded bg-teal-500" /> você agora</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 rounded bg-slate-400" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#94a3b8 0 5px,transparent 5px 9px)' }} /> ano passado</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 rounded bg-[#d4a574]" /> referência</span>
            </div>
            <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted cursor-pointer">
              <Download className="size-3" /> CSV
            </button>
          </FrameFooter>
        </FramePanel>
      </Frame>
    </Section>
  );
}

/* ============================== 03 · Pipeline ============================== */

function PipelineSection() {
  const current = 3; // IA analisando
  return (
    <Section n={3} title="Pipeline do exame (fim da espera cega)" from="chart-39" previewUrl="https://reui.io/preview/base/chart-39?ref=mcp"
      desc="Cada exame em processamento mostra as etapas ao vivo — o spinner mudo vira progresso real: enviado → lido → extraído → IA → sua conferência → pronto.">
      <Frame>
        <FramePanel className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <IconTile tone="primary"><FileSearch className="size-4" /></IconTile>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground truncate">Painel lipídico + TSH.pdf</div>
                <div className="text-xs text-muted-foreground">enviado há 38s · laboratório Aloha</div>
              </div>
            </div>
            <Badge variant="warning-light" size="sm"><Bot className="size-3" /> IA analisando…</Badge>
          </div>

          {/* stage meter segmentado */}
          <div className="flex gap-1" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={PIPELINE_STAGES.length} aria-label="Etapa 4 de 6">
            {PIPELINE_STAGES.map((s, i) => (
              <div key={s.label} className={cn('h-2 flex-1 rounded-full transition-colors',
                i < current ? 'bg-teal-500' : i === current ? 'bg-teal-500/45 animate-pulse' : 'bg-muted')} />
            ))}
          </div>

          <ol className="space-y-0">
            {PIPELINE_STAGES.map((s, i) => (
              <li key={s.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn('inline-grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-extrabold tabular-nums',
                    i < current ? 'bg-teal-600 text-white' : i === current ? 'border border-teal-500 text-teal-600 dark:text-teal-300' : 'border border-border text-muted-foreground')}>
                    {i < current ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className={cn('text-xs font-semibold truncate', i <= current ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>
                  <span className="text-[11px] text-muted-foreground/80 truncate hidden sm:inline">{s.detail}</span>
                </div>
                {i < current && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">ok</span>}
                {i === current && <Badge variant="primary-light" size="xs">agora</Badge>}
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
            <ShieldCheck className="mr-1 inline size-3.5 text-teal-700 dark:text-teal-300" />
            Você aprova cada valor antes de ir pro histórico — a IA sugere, você confere.
          </div>
        </FramePanel>
      </Frame>
    </Section>
  );
}

/* ============================== 04 · Histórico ============================== */

function HistorySection() {
  return (
    <Section n={4} title="Histórico de exames como linha do tempo" from="timeline-5 + solution-users-6" previewUrl="https://reui.io/preview/base/timeline-5?ref=mcp"
      desc="Do mais recente pro mais antigo, com badge de status por exame e o PDF a um toque. Substitui a lista “seca” por uma narrativa.">
      <Frame>
        <FramePanel className="p-4">
          <Timeline defaultValue={3}>
            {HISTORY.map((h, i) => (
              <TimelineItem key={h.title} step={i + 1}>
                <TimelineSeparator />
                <TimelineIndicator>
                  <FileText className="size-3" />
                </TimelineIndicator>
                <TimelineHeader>
                  <TimelineTitle>{h.title}</TimelineTitle>
                  <TimelineDate>{h.date}</TimelineDate>
                </TimelineHeader>
                <TimelineContent>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant={h.badge} size="xs">{h.badgeText}</Badge>
                    <span className="text-[11px] text-muted-foreground">{h.detail}</span>
                  </div>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted cursor-pointer">
                    <FileText className="size-3 text-red-500" /> {h.file}
                  </button>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        </FramePanel>
      </Frame>
    </Section>
  );
}

/* ============================== 05 · Empty state ============================== */

function EmptyStateSection() {
  return (
    <Section n={5} title="Estado vazio do 1º exame" from="empty-state-1" previewUrl="https://reui.io/preview/base/empty-state-1?ref=mcp"
      desc="A tela mais valiosa do funil: quem chega sem exame vê DUAS portas (enviar ou explorar com exemplo) — ataca o cliff do dia 0.">
      <Frame>
        <FramePanel className="p-6 sm:p-8">
          <div className="mx-auto max-w-sm text-center space-y-4">
            <div className="relative mx-auto w-fit">
              <div className="absolute -top-1 -left-4 rotate-[-8deg] rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-bold text-muted-foreground shadow-xs">TSH 3,0</div>
              <div className="absolute -top-1 -right-5 rotate-[7deg] rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-[10px] font-extrabold text-teal-700 dark:text-teal-300 shadow-xs">HbA1c 6,8%</div>
              <IconTile tone="primary" size="xl" className="mx-auto"><Upload className="size-7" /></IconTile>
            </div>
            <div>
              <h3 className="font-heading text-lg font-extrabold text-foreground">Seu primeiro exame em 1 minuto</h3>
              <p className="mt-1 text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
                Envie o PDF do laboratório e a IA explica cada valor, compara com a sua faixa e monta perguntas pro médico.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <GradientButton startIcon={<Upload className="size-4" />}>Enviar meu exame</GradientButton>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted cursor-pointer">
                <Sparkles className="size-3.5 text-teal-600 dark:text-teal-300" /> Explorar com exemplo (Ana)
              </button>
            </div>
            <Divider sx={{ my: 1.5 }} />
            <div className="grid gap-1 text-left max-w-xs mx-auto">
              {['PDF com vários exames? Dividimos por data sozinho', 'Foto de laudo também funciona'].map((g) => (
                <button key={g} type="button" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer">
                  <ChevronRight className="size-3.5 shrink-0 text-teal-600 dark:text-teal-300" /> {g}
                </button>
              ))}
            </div>
          </div>
        </FramePanel>
      </Frame>
    </Section>
  );
}

/* ============================== 06 · PHQ-9 guiado ============================== */

function PhqSection() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);

  const needsBranch = useMemo(
    () => step === PHQ_ITEMS.length && Object.values(answers).some((a) => a >= 2),
    [step, answers],
  );
  const total = PHQ_ITEMS.length + (needsBranch ? 1 : 0);
  const current = done ? null : step < PHQ_ITEMS.length ? PHQ_ITEMS[step] : needsBranch ? PHQ_BRANCH : null;
  const score = useMemo(() => Object.values(answers).reduce((s, a) => s + a, 0), [answers]);
  const crisis = (answers[PHQ_BRANCH.id] ?? 0) > 0;

  const reset = () => { setAnswers({}); setStep(0); setDone(false); };
  const answer = (v: number) => {
    if (!current) return;
    const next = { ...answers, [current.id]: v };
    setAnswers(next);
    const wasBranch = current.id === PHQ_BRANCH.id;
    const branchNeeded = Object.values(next).some((a) => a >= 2);
    if (wasBranch || step === PHQ_ITEMS.length - 1 && !branchNeeded) {
      setDone(true);
    } else {
      setStep((s) => s + 1);
    }
  };

  const faixa =
    score <= 4 ? { label: 'Sintomas mínimos', tone: 'success' as const, msg: 'Seu ritmo parece equilibrado. Vale manter o acompanhamento de rotina.' }
    : score <= 9 ? { label: 'Sintomas leves', tone: 'info' as const, msg: 'Sinais leves — acompanhe e converse com seu médico se persistirem.' }
    : score <= 14 ? { label: 'Sintomas moderados', tone: 'warning' as const, msg: 'Vale levar este resultado na próxima consulta.' }
    : { label: 'Sintomas relevantes', tone: 'destructive' as const, msg: 'Procure um profissional de saúde — você não precisa lidar com isso sozinho/a.' };

  return (
    <Section n={6} title="PHQ-9 guiado (saúde mental com fluxo)" from="c-questionnaire-1 + 7" previewUrl="https://reui.io/preview/base/components/c-questionnaire-1?ref=mcp"
      desc="Questionário vira conversa: uma pergunta por vez, progresso, e a pergunta de crise só entra quando as respostas pedem. Rastreamento educativo — nunca diagnóstico.">
      <Frame>
        <FramePanel className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconTile tone="info"><ClipboardList className="size-4" /></IconTile>
              <div>
                <div className="text-sm font-bold text-foreground">Como você andou se sentindo?</div>
                <div className="text-[11px] text-muted-foreground">últimos 14 dias · ~2 min · PHQ-9</div>
              </div>
            </div>
            {done && (
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted cursor-pointer">
                <RotateCcw className="size-3" /> refazer
              </button>
            )}
          </div>

          <LinearProgress variant="determinate" value={done ? 100 : Math.min(100, ((step + (done ? 1 : 0)) / total) * 100)}
            sx={{ height: 6, borderRadius: 99, bgcolor: 'rgba(148,163,184,.18)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#20b2aa,#178f89)' } }} />

          {!done && current && (
            <div key={current.id} className="space-y-3" style={{ animation: 'reuiFade .3s cubic-bezier(.22,1,.36,1) both' }}>
              <p className="text-sm sm:text-base font-bold leading-snug text-foreground">{current.text}</p>
              <div className="grid gap-1.5">
                {current.options.map((o, v) => (
                  <button key={o} type="button" onClick={() => answer(v)}
                    className={cn('flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors cursor-pointer',
                      answers[current.id] === v
                        ? 'border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200'
                        : 'border-border/80 bg-card text-foreground hover:border-teal-500/50 hover:bg-muted/50')}>
                    {o}
                    {answers[current.id] === v && <Check className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {done && (
            <div className="space-y-3" style={{ animation: 'reuiFade .3s cubic-bezier(.22,1,.36,1) both' }}>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-extrabold tabular-nums text-foreground">{score}</div>
                <div>
                  <Badge variant={`${faixa.tone}-light`}>{faixa.label}</Badge>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{faixa.msg}</p>
                </div>
              </div>
              {crisis && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-extrabold text-red-700 dark:text-red-300">
                    <AlertTriangle className="size-4" /> Você merece apoio agora
                  </div>
                  <p className="text-xs leading-relaxed text-foreground">
                    O CVV atende 24h, gratuito e sigiloso: <strong>ligue 188</strong> — e leve este resultado ao seu médico.
                  </p>
                  <a href="tel:188" className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-red-700">
                    <Phone className="size-3.5" /> Ligar 188 (CVV)
                  </a>
                </div>
              )}
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mr-1 inline size-3.5 text-teal-700 dark:text-teal-300" />
                Rastreamento educativo (PHQ-9), não diagnóstico. O resultado vai junto pro seu médico no relatório — a decisão clínica é dele.
              </div>
            </div>
          )}
        </FramePanel>
      </Frame>
      <style>{`@keyframes reuiFade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </Section>
  );
}

/* ============================== 07 · Chat IA ============================== */

function ChatSection() {
  const [asked, setAsked] = useState<string | null>(null);
  return (
    <Section n={7} title="Chat IA com starters e receipt de fontes" from="ai-chat-13 + ai-chat-3 + ai-chat-12" previewUrl="https://reui.io/preview/base/ai-chat-13?ref=mcp"
      desc="O FloatingChat evoluído: zero-state com sugestões, bolhas com autor/timestamp e o “recibo de leitura” — a IA mostra QUAIS exames leu antes de responder. Confiança clínica à vista.">
      <Frame>
        <FramePanel className="p-0 overflow-hidden">
          {/* header do popup */}
          <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-teal-600/12 to-transparent px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <DrExame size={34} sx={{ borderRadius: '50%' }} />
                <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-teal-600 text-white ring-2 ring-card">
                  <Sparkles className="size-2.5" aria-label="IA" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-foreground leading-tight">Dr. Exame</div>
                <div className="text-[10px] font-semibold text-teal-700 dark:text-teal-300">assistente de exames · online</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Expandir" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><Layers className="size-4" /></button>
              <button type="button" aria-label="Fechar" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><X className="size-4" /></button>
            </div>
          </div>

          {/* corpo */}
          <div className="space-y-3.5 p-3.5">
            {!asked && (
              <div className="space-y-3" style={{ animation: 'reuiFade .35s cubic-bezier(.22,1,.36,1) both' }}>
                <div className="flex items-start gap-2.5">
                  <MessageAvatar><DrExame size={30} sx={{ borderRadius: '50%' }} /></MessageAvatar>
                  <Bubble variant="clinical" className="max-w-[85%]">
                    <BubbleContent>
                      <p className="font-semibold text-foreground">Olá! Eu leio seus exames e explico em português claro.</p>
                      <p className="mt-0.5 text-muted-foreground">Por onde começamos?</p>
                    </BubbleContent>
                  </Bubble>
                </div>
                <div className="grid gap-1.5 pl-10">
                  {CHAT_STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => setAsked(s)}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/8 px-3.5 py-2.5 text-left text-[13px] font-bold text-teal-800 hover:bg-teal-500/15 transition-colors cursor-pointer dark:text-teal-200">
                      <Sparkles className="size-3.5 shrink-0" /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {asked && (
              <MessageGroup className="reui-chat-thread" style={{ animation: 'reuiFade .35s cubic-bezier(.22,1,.36,1) both' }}>
                <Message align="end">
                  <MessageContent>
                    <PatternMessageHeader timestamp="agora"><UserRound className="size-3.5" aria-label="você" /></PatternMessageHeader>
                    <Bubble variant="default"><BubbleContent>{asked}</BubbleContent></Bubble>
                  </MessageContent>
                </Message>
                <Message align="start">
                  <MessageAvatar><DrExame size={30} sx={{ borderRadius: '50%' }} /></MessageAvatar>
                  <MessageContent>
                    <PatternMessageHeader timestamp="agora">
                      <span className="font-bold text-foreground">Dr. Exame</span>
                      <Badge variant="primary-light" size="xs"><Sparkles className="size-2.5" /> IA</Badge>
                    </PatternMessageHeader>
                    <Bubble variant="clinical">
                      <BubbleContent className="space-y-2">
                        <p><strong>TSH 4,9 mUI/L</strong> ficou acima da faixa do seu laboratório (0,4–4,0). Isso costuma indicar que a tireoide está trabalhando num ritmo mais lento (hipotireoidismo subclínico, quando o T4L segue normal).</p>
                        <p className="text-muted-foreground">Boas perguntas pro seu médico: repetir TSH em quanto tempo? É caso de tratar ou só acompanhar? Meu T4L está normal — muda algo?</p>
                        <div className="rounded-lg border border-primary/25 bg-primary/6 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                          <BadgeCheck className="mr-1 inline size-3 text-teal-600 dark:text-teal-300" />
                          Li <strong className="text-foreground">2 exames</strong> (set/26, ago/26), citei <strong className="text-foreground">3 valores</strong> · fonte: faixa do próprio laboratório · diretriz SBEM 2023.
                        </div>
                      </BubbleContent>
                    </Bubble>
                    <AssistantReplyActions content="TSH 4,9…" timestamp="agora" onAskDoctor={() => undefined} />
                  </MessageContent>
                </Message>
              </MessageGroup>
            )}
          </div>

          {/* composer */}
          <div className="flex items-center gap-2 border-t border-border/70 bg-card px-3 py-2.5">
            <div className="flex-1 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs text-muted-foreground">
              Pergunte sobre seus exames…
            </div>
            <button type="button" aria-label="Ditar por voz" className="grid size-10 place-items-center rounded-xl border border-border/70 text-muted-foreground hover:text-teal-600 hover:border-teal-500/50 cursor-pointer"><Mic className="size-4" /></button>
            <button type="button" aria-label="Enviar" className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-xs cursor-pointer"><Send className="size-4" /></button>
          </div>
        </FramePanel>
      </Frame>
    </Section>
  );
}

/* ============================== 08 · Agenda ============================== */

function BookingSection() {
  const [day, setDay] = useState<number | null>(12);
  const [dur, setDur] = useState(30);
  const [slot, setSlot] = useState<string | null>(null);
  const available = useMemo(() => new Set([10, 11, 12, 13, 17, 18, 19, 24, 25, 26]), []);
  const slots = ['08:00', '08:30', '09:00', '14:00', '14:30', '16:00'];
  const price = dur === 15 ? 49 : dur === 30 ? 79 : 119;
  return (
    <Section n={8} title="Agendar teleconsulta com slots" from="schedule-9 + solution-bookings-3" previewUrl="https://reui.io/preview/base/schedule-9?ref=mcp"
      desc="Calendário do mês + duração + horários + confirmação com preço — a agenda do médico como produto. Alvo: Minhas Consultas → agendar.">
      <Frame>
        <FrameHeader className="flex-row items-center justify-between gap-2 flex-wrap pb-2">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary"><Stethoscope className="size-4" /></IconTile>
            <div>
              <FrameTitle>Dra. Helena Costa</FrameTitle>
              <FrameDescription className="text-xs">Endocrinologia · CRM 116739-SP · vídeo 30min</FrameDescription>
            </div>
          </div>
          <Badge variant="success-light" size="xs"><CalendarCheck className="size-3" /> 10 dias livres</Badge>
        </FrameHeader>
        <FramePanel className="p-3 sm:p-4 space-y-3.5">
          {/* mini calendário nov/2026 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-extrabold text-foreground">Novembro 2026</span>
              <span className="text-[11px] text-muted-foreground">hoje é 04/11</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground" aria-hidden="true">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={`${d}${i}`}>{d}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => {
                const isAvail = available.has(d);
                const isSel = day === d;
                const isPast = d < 4;
                return (
                  <button key={d} type="button" disabled={!isAvail}
                    onClick={() => { setDay(d); setSlot(null); }}
                    aria-label={`dia ${d}${isAvail ? ' disponível' : ''}`}
                    className={cn('grid h-9 place-items-center rounded-lg text-xs font-bold tabular-nums transition-colors',
                      isSel ? 'bg-teal-600 text-white shadow-xs'
                        : isAvail ? 'border border-teal-500/35 bg-teal-500/8 text-teal-800 hover:bg-teal-500/16 cursor-pointer dark:text-teal-200'
                        : isPast ? 'text-muted-foreground/35' : 'text-muted-foreground/60')}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* duração */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-muted-foreground">Duração</span>
            <div className="flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
              {[15, 30, 60].map((d) => (
                <button key={d} type="button" onClick={() => setDur(d)}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-bold tabular-nums transition-colors cursor-pointer',
                    dur === d ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:text-foreground')}>{d}min</button>
              ))}
            </div>
          </div>

          {/* slots */}
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-muted-foreground">
              Horários {day ? `· dia ${String(day).padStart(2, '0')}/11` : ''}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {slots.map((s) => (
                <button key={s} type="button" onClick={() => setSlot(s)}
                  className={cn('flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold tabular-nums transition-colors cursor-pointer',
                    slot === s ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                      : 'border-border/80 bg-card text-foreground hover:border-teal-500/50')}>
                  <Clock className="size-3" /> {s}
                </button>
              ))}
            </div>
          </div>
        </FramePanel>
        <FrameFooter className="flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3.5 text-amber-500" />
            {slot ? `${dur}min · ${String(day).padStart(2, '0')}/11 às ${slot}` : 'escolha dia e horário'}
          </div>
          <GradientButton startIcon={<CalendarCheck className="size-4" />} disabled={!slot}>
            Confirmar · R$ {price},00
          </GradientButton>
        </FrameFooter>
      </Frame>
    </Section>
  );
}

/* ============================== 09 · Planos ============================== */

function PlansSection() {
  const rows: { feature: string; free: string; premium: string }[] = [
    { feature: 'Enviar exames (PDF/foto)', free: 'Grátis', premium: 'Grátis' },
    { feature: 'Chat com a IA', free: '2 créditos/pergunta', premium: 'Incluído — 300/mês' },
    { feature: 'Relatório inteligente', free: '10 créditos', premium: 'Incluído' },
    { feature: 'Consolidado p/ médico', free: '20 créditos', premium: 'Incluído' },
    { feature: 'Teleconsulta com brief', free: '—', premium: 'Preço de tabela' },
    { feature: 'Créditos de bônus', free: '60 ao criar conta', premium: '60 + 300 todo mês' },
  ];
  return (
    <Section n={9} title="Planos com uso medido (créditos à vista)" from="pricing-2 + profile-8" previewUrl="https://reui.io/preview/base/pricing-2?ref=mcp"
      desc="A matriz que explica o modelo de verdade: o que é grátis, o que consome crédito e o que o plano mensal desbloqueia — mais o painel de uso do mês.">
      <div className="space-y-3">
        <div className="rounded-xl border border-primary/25 bg-primary/8 px-3.5 py-2.5 flex items-start gap-2">
          <Zap className="mt-0.5 size-4 shrink-0 text-teal-700 dark:text-teal-300" />
          <p className="text-xs leading-relaxed text-foreground">
            <strong>Teste Premium por 7 dias</strong> — restam 4 dias e 214 créditos. Sem cartão pra começar.
          </p>
        </div>

        <Frame>
          <FramePanel className="p-0">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-border/60 bg-muted/40 px-3.5 py-2.5 text-[11px] font-extrabold text-muted-foreground">
              <span>Recurso</span><span className="w-16 text-center sm:w-24">Grátis</span><span className="w-20 text-center sm:w-28 text-teal-700 dark:text-teal-300">Premium</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.feature} className={cn('grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3.5 py-2.5 text-xs', i !== rows.length - 1 && 'border-b border-border/40')}>
                <span className="font-semibold text-foreground leading-snug">{r.feature}</span>
                <span className="w-16 text-center text-[11px] font-bold text-muted-foreground tabular-nums sm:w-24">{r.free}</span>
                <span className="w-20 text-center text-[11px] font-extrabold text-teal-700 dark:text-teal-300 tabular-nums sm:w-28">{r.premium}</span>
              </div>
            ))}
          </FramePanel>
          <FrameFooter className="flex-row items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-extrabold text-foreground">Premium · R$ 29,90<span className="text-xs font-semibold text-muted-foreground">/mês</span></div>
              <div className="text-[11px] text-muted-foreground">cancele quando quiser, no app</div>
            </div>
            <GradientButton startIcon={<Sparkles className="size-4" />}>Assinar Premium</GradientButton>
          </FrameFooter>
        </Frame>

        {/* uso do mês */}
        <Frame>
          <FrameHeader className="pb-2"><FrameTitle className="text-xs">Seu uso este mês</FrameTitle></FrameHeader>
          <FramePanel className="p-3.5 space-y-2.5">
            {[
              { label: 'Chat com a IA', used: 142, total: 300 },
              { label: 'Relatórios', used: 3, total: 10 },
              { label: 'Consolidados', used: 1, total: 5 },
            ].map((u) => (
              <div key={u.label}>
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
                  <span className="text-foreground">{u.label}</span>
                  <span className="text-muted-foreground tabular-nums">{u.used}/{u.total}</span>
                </div>
                <LinearProgress variant="determinate" value={(u.used / u.total) * 100}
                  sx={{ height: 5, borderRadius: 99, bgcolor: 'rgba(148,163,184,.18)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#20b2aa,#178f89)' } }} />
              </div>
            ))}
          </FramePanel>
        </Frame>
      </div>
    </Section>
  );
}

/* ============================== 11 · Lote 2 — telas que faltavam ============================== */

const YEAR_DATA = MONTHS.map((mo, i) => ({ mo, y2026: METRICS.glicose.current[i], y2025: METRICS.glicose.previous[i] }));

function Lote2Section() {
  const [tabDesp, setTabDesp] = useState<'mes' | 'tudo'>('mes');
  return (
    <Section n={11} title="Lote 2 — os encaixes das telas que faltavam" from="chart-52 · list-6 · profile-6 · timeline · receipt-2 · ai-usage · auth-18" previewUrl="https://reui.io/preview/base/chart-52?ref=mcp"
      desc="Fechando o mapa tela a tela: tendências (ano×ano), despesas, conquistas/indique, vacinas, status da consulta, monitor de IA do admin e login com prova social.">
      <div className="grid gap-3 md:grid-cols-2">

        {/* a) Tendências ano×ano (chart-52) */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Activity className="size-3.5 text-teal-600 dark:text-teal-300" /> Tendências · você em 2026 × 2025</FrameTitle>
            <FrameDescription className="text-[11px]">chart-52 · cinza = ano passado</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3">
            <div className="h-36 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={YEAR_DATA} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="yr26" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#20b2aa" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#20b2aa" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,140,.16)" vertical={false} />
                  <XAxis dataKey="mo" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="#94a3b8" interval={1} />
                  <ReTooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(32,178,170,.3)', background: 'var(--color-card, #fff)', fontSize: 12 }} />
                  <Area type="monotone" dataKey="y2025" name="2025" stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="4 4" fill="none" />
                  <Area type="monotone" dataKey="y2026" name="2026" stroke="#20b2aa" strokeWidth={2.4} fill="url(#yr26)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </FramePanel>
        </Frame>

        {/* b) Despesas (list-6) */}
        <Frame>
          <FrameHeader className="flex-row items-center justify-between gap-2 flex-wrap pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><CreditCard className="size-3.5 text-teal-600 dark:text-teal-300" /> Despesas médicas</FrameTitle>
            <div className="flex gap-1 rounded-lg border border-border/70 bg-muted/40 p-0.5">
              {(['mes', 'tudo'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTabDesp(t)}
                  className={cn('rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer',
                    tabDesp === t ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:text-foreground')}>
                  {t === 'mes' ? 'Mês' : 'Tudo'}
                </button>
              ))}
            </div>
          </FrameHeader>
          <FramePanel className="p-0">
            {(tabDesp === 'mes' ? [
              { d: '02/11', label: 'Consulta — Dra. Helena', cat: 'Consulta', v: -79, tag: 'PIX' },
              { d: '28/10', label: 'Exame — Laboratório Aloha', cat: 'Exame', v: -129.9, tag: 'Crédito' },
              { d: '21/10', label: 'Reembolso plano de saúde', cat: 'Reembolso', v: 84.5, tag: 'Recebido' },
            ] : [
              { d: 'out/26', label: 'Total de outubro', cat: '3 lançamentos', v: -312.4, tag: 'mês' },
              { d: 'set/26', label: 'Total de setembro', cat: '5 lançamentos', v: -408.9, tag: 'mês' },
              { d: 'ago/26', label: 'Total de agosto', cat: '4 lançamentos', v: -355.3, tag: 'mês' },
            ]).map((t, i, arr) => (
              <div key={t.label} className={cn('flex items-center gap-2.5 px-3.5 py-2.5', i !== arr.length - 1 && 'border-b border-border/40')}>
                <IconTile tone={t.v > 0 ? 'success' : 'primary'} size="sm"><CreditCard className="size-3.5" /></IconTile>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-foreground">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">{t.d} · {t.cat}</div>
                </div>
                <div className={cn('text-xs font-extrabold tabular-nums shrink-0', t.v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
                  {t.v > 0 ? '+' : '−'} R$ {Math.abs(t.v).toFixed(2).replace('.', ',')}
                </div>
              </div>
            ))}
          </FramePanel>
        </Frame>

        {/* c) Conquistas / indique (profile-6) */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Trophy className="size-3.5 text-amber-500" /> Conquistas & indicações</FrameTitle>
            <FrameDescription className="text-[11px]">profile-6 · escada de recompensas</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5 space-y-2">
            {[
              { label: '1º exame enviado', st: 'done' as const, reward: '+10 créditos' },
              { label: 'Convidou 1 amigo', st: 'next' as const, reward: '+30 créditos', pct: 60, hint: 'convite enviado · falta criar conta' },
              { label: '5 amigos no app', st: 'locked' as const, reward: '+100 créditos', hint: '1/5' },
            ].map((s) => (
              <div key={s.label} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5',
                s.st === 'done' ? 'border-emerald-500/30 bg-emerald-500/8' : s.st === 'next' ? 'border-teal-500/35 bg-teal-500/8' : 'border-border/60 bg-muted/30')}>
                <IconTile tone={s.st === 'done' ? 'success' : s.st === 'next' ? 'primary' : 'muted'} size="sm">
                  {s.st === 'done' ? <Check className="size-3.5" /> : s.st === 'locked' ? <Lock className="size-3.5" /> : <Gift className="size-3.5" />}
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className={cn('text-xs font-bold', s.st === 'locked' ? 'text-muted-foreground' : 'text-foreground')}>{s.label}</div>
                  {s.st === 'next' && s.pct !== undefined && (
                    <div className="mt-1"><LinearProgress variant="determinate" value={s.pct} sx={{ height: 4, borderRadius: 99, bgcolor: 'rgba(148,163,184,.18)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#20b2aa,#178f89)' } }} /></div>
                  )}
                  {s.st !== 'next' && <div className="text-[11px] text-muted-foreground">{s.hint ?? 'concluída'}</div>}
                </div>
                <Badge variant={s.st === 'done' ? 'success-light' : s.st === 'next' ? 'primary-light' : 'outline'} size="xs">{s.reward}</Badge>
              </div>
            ))}
          </FramePanel>
        </Frame>

        {/* d) Vacinas (timeline + recorrência) */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Syringe className="size-3.5 text-teal-600 dark:text-teal-300" /> Carteira de vacinas</FrameTitle>
            <FrameDescription className="text-[11px]">timeline · próxima dose em destaque</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/8 px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconTile tone="warning" size="sm"><Syringe className="size-3.5" /></IconTile>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-foreground">Influenza (anual)</div>
                  <div className="text-[11px] text-muted-foreground">próxima dose · até 15 dez 2026</div>
                </div>
              </div>
              <Badge variant="warning-light" size="xs">em 41 dias</Badge>
            </div>
            <Timeline defaultValue={3}>
              {[
                { t: 'COVID (reforço)', d: '12 set 2026' },
                { t: 'Influenza', d: '18 out 2025' },
                { t: 'Febre amarela', d: '2019' },
              ].map((v, i) => (
                <TimelineItem key={v.t} step={i + 1}>
                  <TimelineSeparator />
                  <TimelineIndicator><Check className="size-3" /></TimelineIndicator>
                  <TimelineHeader><TimelineTitle className="text-xs">{v.t}</TimelineTitle><TimelineDate>{v.d}</TimelineDate></TimelineHeader>
                </TimelineItem>
              ))}
            </Timeline>
          </FramePanel>
        </Frame>

        {/* e) Status da consulta (receipt-2) */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><CalendarCheck className="size-3.5 text-teal-600 dark:text-teal-300" /> Status da consulta</FrameTitle>
            <FrameDescription className="text-[11px]">receipt-2 · agendada → laudo pronto</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5">
            <div className="flex items-center">
              {['Agendada', 'Confirmada', 'Realizada', 'Laudo'].map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <span className={cn('grid size-7 place-items-center rounded-full text-[10px] font-extrabold',
                      i < 2 ? 'bg-teal-600 text-white' : i === 2 ? 'border-2 border-teal-500 text-teal-700 dark:text-teal-300 animate-pulse' : 'border border-border text-muted-foreground')}>
                      {i < 2 ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn('text-[10px] font-bold', i <= 2 ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
                  </div>
                  {i < 3 && <div className={cn('mx-1 -mt-4 h-0.5 flex-1 rounded', i < 2 ? 'bg-teal-500' : 'bg-border')} />}
                </div>
              ))}
            </div>
            <div className="mt-2.5 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              consulta de hoje, 14:00 · a teleconsulta abre 5 min antes · cancelamento gratuito até 2h antes
            </div>
          </FramePanel>
        </Frame>

        {/* f) Admin · uso de IA (ai-usage) */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><KeyRound className="size-3.5 text-teal-600 dark:text-teal-300" /> Admin · consumo de IA</FrameTitle>
            <FrameDescription className="text-[11px]">ai-usage · quem usa, quanto e em qual chave</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5 space-y-2.5">
            {[
              { u: 'ana@…', c: 214, k: 'pool-1', pct: 71 },
              { u: 'joao@…', c: 96, k: 'pool-1', pct: 32 },
              { u: 'dr.helena@…', c: 388, k: 'pool-2', pct: 81 },
            ].map((r) => (
              <div key={r.u}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold">
                  <span className="truncate text-foreground">{r.u}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{r.c} créditos · {r.k}</span>
                </div>
                <LinearProgress variant="determinate" value={r.pct}
                  sx={{ height: 5, borderRadius: 99, bgcolor: 'rgba(148,163,184,.18)', '& .MuiLinearProgress-bar': { background: r.pct > 78 ? '#d97706' : 'linear-gradient(90deg,#20b2aa,#178f89)' } }} />
              </div>
            ))}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[11px] leading-relaxed text-foreground">
              <AlertTriangle className="mr-1 inline size-3.5 text-amber-600" />
              pool-2 em 81% do limite por minuto — alertar antes do 429 (lesson de 02/11).
            </div>
          </FramePanel>
        </Frame>

        {/* g) Login split com prova social (auth-18) */}
        <Frame className="md:col-span-2">
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Lock className="size-3.5 text-teal-600 dark:text-teal-300" /> Login com prova social</FrameTitle>
            <FrameDescription className="text-[11px]">auth-18 · split: formulário + depoimento (a magia do OTP por e-mail já existe no backend)</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-0">
            <div className="grid md:grid-cols-2">
              <div className="space-y-2.5 p-4">
                <div className="flex items-center gap-2">
                  <DrExame size={30} sx={{ borderRadius: '50%' }} />
                  <span className="font-heading text-sm font-extrabold text-foreground">Entrar no Dr. Exame</span>
                </div>
                <div className="rounded-xl border border-border/80 bg-background px-3 py-2.5 text-xs text-muted-foreground">seu@email.com</div>
                <div className="rounded-xl border border-border/80 bg-background px-3 py-2.5 text-xs text-muted-foreground flex items-center justify-between">senha · •••••••• <button type="button" className="text-[10px] font-bold text-teal-700 dark:text-teal-300 cursor-pointer">mostrar</button></div>
                <GradientButton fullWidth>Entrar</GradientButton>
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground"><span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" /></div>
                <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-card text-xs font-bold text-foreground hover:bg-muted cursor-pointer">
                  <span className="font-black text-[#4285F4]">G</span> Continuar com Google
                </button>
                <button type="button" className="w-full text-center text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-300 cursor-pointer">receber link por e-mail (sem senha)</button>
              </div>
              <div className="hidden md:flex flex-col justify-center gap-3 border-t border-border/60 bg-gradient-to-br from-teal-600/10 to-transparent p-6 md:border-l md:border-t-0">
                <Rating rating={4.5} showValue size="sm" />
                <p className="text-sm font-semibold leading-relaxed text-foreground">“Levei 3 anos de exames desorganizados. Em um dia, o app me mostrou o que nenhum médico tinha tempo de me explicar.”</p>
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-full bg-teal-600/15 text-xs font-extrabold text-teal-700 dark:text-teal-300">MC</div>
                  <div className="text-[11px] leading-tight"><div className="font-bold text-foreground">Mariana C.</div><div className="text-muted-foreground">usuária desde 2025 · 21 exames</div></div>
                </div>
              </div>
            </div>
          </FramePanel>
        </Frame>
      </div>
    </Section>
  );
}

function SignaturePad() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState(0);
  const [saved, setSaved] = useState(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    setSaved(false);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.strokeStyle = getComputedStyle(ref.current!).color || '#0f1818';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { if (drawing.current) { drawing.current = false; setStrokes((s) => s + 1); } };
  const clear = () => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setStrokes(0);
    setSaved(false);
  };

  return (
    <div className="space-y-2">
      <canvas ref={ref} width={560} height={180}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        className="h-32 w-full touch-none rounded-xl border border-dashed border-teal-500/45 bg-white text-[#0f1818]"
        aria-label="Área de assinatura" role="img" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{strokes === 0 ? 'assine acima (dedo ou mouse)' : saved ? 'assinatura registrada ✓' : `${strokes} traço${strokes > 1 ? 's' : ''}`}</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={clear} className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted cursor-pointer">limpar</button>
          <button type="button" disabled={strokes === 0} onClick={() => setSaved(true)}
            className="rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 px-2.5 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-40 cursor-pointer">assinar consentimento</button>
        </div>
      </div>
    </div>
  );
}

function UploadDemo() {
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    if (progress === null || progress >= 100) return;
    const id = window.setTimeout(() => setProgress((p) => Math.min(100, (p ?? 0) + 7 + Math.random() * 9)), 180);
    return () => window.clearTimeout(id);
  }, [progress]);
  return (
    <div className="space-y-2.5">
      <button type="button" onClick={() => setProgress(0)}
        className="flex w-full min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-teal-500/50 bg-teal-500/6 px-3 py-3 text-xs font-bold text-teal-800 hover:bg-teal-500/12 transition-colors cursor-pointer dark:text-teal-200">
        <Upload className="size-4" /> {progress === null ? 'arraste o PDF ou toque pra escolher' : 'enviando…'}
      </button>
      {progress !== null && progress < 100 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
            <FileText className="size-3.5 text-red-500" /> exames-nov-26.pdf
            <span className="ml-auto tabular-nums">{Math.round(progress)}%</span>
          </div>
          <LinearProgress variant="determinate" value={progress} sx={{ height: 5, borderRadius: 99, bgcolor: 'rgba(148,163,184,.18)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#20b2aa,#178f89)' } }} />
        </div>
      )}
      {progress !== null && progress >= 100 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          <Check className="size-3.5" /> enviado — extraindo valores…
        </div>
      )}
    </div>
  );
}

function ExtrasSection() {
  const [stars, setStars] = useState(4.5);
  const [cid, setCid] = useState(3);
  return (
    <Section n={10} title="Peças avulsas prontas pra promover" from="rating · signature-pad · c-file-upload-5 · chart-8 · cascader" previewUrl="https://reui.io/components/rating?ref=mcp"
      desc="Avaliação pós-consulta, assinatura de consentimento (teleconsulta Art. 15), upload com progresso, anéis de meta e o cascader p/ navegar os 12.451 códigos CID-10.">
      <div className="grid gap-3 md:grid-cols-2">
        {/* rating */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Star className="size-3.5 text-amber-500" /> Avaliação pós-consulta</FrameTitle>
            <FrameDescription className="text-[11px]">rating · meia estrela · touch 44px</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5 space-y-2.5">
            <p className="text-xs font-semibold text-foreground">Como foi sua consulta com a Dra. Helena?</p>
            <Rating rating={stars} editable onRatingChange={setStars} showValue size="lg" />
            <div className="flex gap-1.5">
              {['Atenciosa', 'Pontual', 'Explicou bem'].map((t) => (
                <button key={t} type="button" className="min-h-9 rounded-lg border border-border/70 bg-muted/40 px-2.5 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">{t}</button>
              ))}
            </div>
          </FramePanel>
        </Frame>

        {/* assinatura */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><PenLine className="size-3.5 text-teal-600 dark:text-teal-300" /> Consentimento de teleconsulta</FrameTitle>
            <FrameDescription className="text-[11px]">signature-pad · registro do ato (Art. 15)</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5">
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              “Consinto com a realização de consulta por videochamada e com o registro desta assinatura no meu histórico.”
            </p>
            <SignaturePad />
          </FramePanel>
        </Frame>

        {/* upload */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Upload className="size-3.5 text-teal-600 dark:text-teal-300" /> Upload com progresso</FrameTitle>
            <FrameDescription className="text-[11px]">c-file-upload-5 · um arquivo por linha</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5"><UploadDemo /></FramePanel>
        </Frame>

        {/* metas */}
        <Frame>
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Moon className="size-3.5 text-indigo-500" /> Anéis de meta</FrameTitle>
            <FrameDescription className="text-[11px]">chart-8 · aderência do mês</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5">
            <div className="flex items-center justify-around gap-2">
              <GoalRing pct={82} label="Sono 7–9h" value="média 7h41" tone="#6366f1" />
              <GoalRing pct={64} label="Passos/dia" value="média 6,4k" tone="#20b2aa" />
              <GoalRing pct={91} label="Remédios" value="28/31 doses" tone="#d4a574" />
            </div>
          </FramePanel>
        </Frame>

        {/* CID-10 cascader */}
        <Frame className="md:col-span-2">
          <FrameHeader className="pb-2">
            <FrameTitle className="flex items-center gap-1.5 text-xs"><Layers className="size-3.5 text-teal-600 dark:text-teal-300" /> CID-10 em cascata (12.451 códigos já no app)</FrameTitle>
            <FrameDescription className="text-[11px]">cascader · capítulo → categoria → código · com trilha de migalhas</FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-muted-foreground">
              {CID_PATH.slice(0, cid + 1).map((p, i) => (
                <span key={p.level} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3" />}
                  <span className={i === cid ? 'text-teal-700 dark:text-teal-300' : ''}>{p.level}</span>
                </span>
              ))}
              {cid < CID_PATH.length - 1 && <ChevronRight className="size-3" />}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CID_PATH.map((p, i) => (
                <button key={p.level} type="button" disabled={i > cid + 1} onClick={() => setCid(i)}
                  className={cn('flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors',
                    i === cid ? 'border-teal-600 bg-teal-600 text-white shadow-xs cursor-pointer'
                      : i < cid ? 'border-border/70 bg-muted/40 text-muted-foreground cursor-pointer'
                      : i === cid + 1 ? 'border-teal-500/40 bg-teal-500/6 text-teal-800 dark:text-teal-200 cursor-pointer'
                      : 'border-border/50 text-muted-foreground/40')}>
                  <span><span className="font-mono text-[10px] font-extrabold">{p.level}</span> · {p.label}</span>
                  {i === cid && <Check className="size-4 shrink-0" />}
                  {i > cid && <ChevronRight className="size-3.5 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <Pill className="mr-1 inline size-3 text-teal-600 dark:text-teal-300" />
              Uso real: escolher o CID de um diagnóstico no prontuário — 3 toques em vez de digitar código.
            </div>
          </FramePanel>
        </Frame>
      </div>
    </Section>
  );
}
