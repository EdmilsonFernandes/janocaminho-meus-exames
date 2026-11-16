/**
 * Alimentação e seus exames — /alimentacao (14/11/26).
 *
 * Plano ReUI: superfície operacional · arquétipo "Frame stack" · família Frame · regiões:
 * seus números (linhas com mini gráfico; cada linha abre a alimentação daquele exame ali mesmo)
 * → resumo personalizado (IA) → dicionário dos demais exames → limites desta tela.
 *
 * Blocos ReUI reaproveitados (composição, com dados reais):
 *  - chart-25: lista de métricas com valor, etiqueta e mini gráfico por linha;
 *  - stats-4: medidor segmentado, aqui como "força da evidência";
 *  - sheet-10: painel lateral com sugestões de pergunta e campo de texto.
 *
 * Movimento (regras do ReUI): 1 entrada (os cartões em sequência, classe dx-rise), o medidor
 * cresce uma vez (dx-grow-x) e o mini gráfico se desenha uma vez. Tudo com repouso sob
 * "reduzir movimento".
 *
 * Conteúdo curado no servidor (analysis/food-guide.ts). A IA só costura esses fatos com os
 * exames da pessoa, passa pelas mesmas travas e cobra créditos. Não é plano alimentar: sem
 * quantidade, porção nem cardápio (isso é do nutricionista).
 *
 * Estados: carregando · falha (tentar de novo) · sem exame no app · nenhum alterado com
 * orientação · com orientações · resumo: nunca gerado / gerando / pronto / sem saldo / falhou.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RangeBar } from '../components/motion/RangeBar';
import { RingGauge } from '../components/motion/RingGauge';
import { CountUp } from '../components/motion/CountUp';
import { GlassGlow } from '../components/motion/GlassGlow';
import { useNotify, useRefresh } from 'react-admin';
import { Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArrowUp, BookOpen, Check, ChevronDown, CircleHelp, Info, MessageCircleQuestion, Salad, Sparkles, Stethoscope, TrendingDown, TrendingUp, TriangleAlert, Upload, X } from 'lucide-react';
import { cn } from 'cn';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { AnalysisScan } from '../components/AnalysisScan';
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Button } from '@/components/ui/button';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type Strength = 'forte' | 'moderada' | 'limitada' | 'nao-resolve';

interface Guide {
  key: string;
  label: string;
  when: 'alto' | 'baixo' | 'qualquer';
  strength: Strength;
  summary: string;
  helps: string[];
  avoid: string[];
  dietAlone: string;
  source: string;
}

interface Match {
  nameCanonical: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  date: string | null;
  direction: 'alto' | 'baixo';
  guide: Guide;
  points?: Array<{ value: number; date: string }>;
}

/** Resultado mais recente do paciente num exame que o dicionário cobre (dentro ou fora da faixa). */
interface PatientValue {
  guideKey: string;
  label: string;
  nameCanonical: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  date: string | null;
  status: 'alto' | 'baixo' | 'normal';
  points?: Array<{ value: number; date: string }>;
}

interface SummaryContent { resumo: string; comecarPor: string[]; levarAoMedico: string }
interface Payload { matches: Match[]; values: PatientValue[]; dictionary: Guide[]; examsRead: number; summary: { content: SummaryContent; generatedAt: string } | null; summaryCost: number; summaryStatus?: 'pending' | 'error' | null; summaryError?: string | null }

const parsePayload = (json: Payload): Payload => ({
  matches: Array.isArray(json?.matches) ? json.matches : [], values: Array.isArray(json?.values) ? json.values : [], dictionary: Array.isArray(json?.dictionary) ? json.dictionary : [],
  examsRead: Number(json?.examsRead) || 0, summary: json?.summary?.content ? json.summary : null, summaryCost: Math.max(0, Number(json?.summaryCost) || 0),
  summaryStatus: json?.summaryStatus ?? null, summaryError: json?.summaryError ?? null,
});

const STRENGTH: Record<Strength, { label: string; variant: 'success-light' | 'info-light' | 'warning-light' | 'outline'; explain: string; level: number; tone: string }> = {
  forte: { label: 'Evidência forte', variant: 'success-light', explain: 'Vários estudos e diretrizes médicas apontam na mesma direção.', level: 3, tone: 'bg-success' },
  moderada: { label: 'Evidência moderada', variant: 'info-light', explain: 'Há boa base, mas depende da causa da alteração.', level: 2, tone: 'bg-info' },
  limitada: { label: 'Evidência limitada', variant: 'warning-light', explain: 'A alimentação muda pouco este exame.', level: 1, tone: 'bg-warning' },
  'nao-resolve': { label: 'Alimentação não resolve', variant: 'outline', explain: 'Não há alimento com efeito comprovado; a avaliação é médica.', level: 0, tone: 'bg-muted-foreground' },
};

const SCAN_CHIPS = [
  { label: 'Seus exames', value: 'fora da faixa' },
  { label: 'Dicionário', value: 'diretrizes' },
  { label: 'O que ajuda', value: 'por exame' },
  { label: 'Em comum', value: 'ligando os pontos' },
  { label: 'Para o médico', value: 'o que levar' },
];

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dateBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).split('.').join('').split(' de ').join(' ');
const WHEN_TEXT: Record<Guide['when'], string> = { alto: 'quando está acima da faixa', baixo: 'quando está abaixo da faixa', qualquer: 'quando está fora da faixa' };

function rangeText(low: number | null, high: number | null): string {
  if (low != null && high != null) return `${fmt(low)} a ${fmt(high)}`;
  if (low != null) return `a partir de ${fmt(low)}`;
  return high != null ? `até ${fmt(high)}` : '';
}

// ───────────────────────── peças ─────────────────────────

/** Mini gráfico da evolução do exame (composição do bloco chart-25). */
function Sparkline({ label, points, tone = 'warning' }: { label: string; points?: Array<{ value: number; date: string }>; tone?: 'warning' | 'success' }) {
  const data = (points ?? []).map((p) => ({ period: p.date, value: p.value }));
  if (data.length < 2) return null; // um resultado só: a linha diz "primeiro resultado" no texto
  const config = { value: { label, color: tone === 'success' ? 'var(--success)' : 'var(--warning)' } } satisfies ChartConfig;
  const first = data[0].value; const last = data[data.length - 1].value;
  return (
    <div className="relative h-11 w-20 shrink-0 sm:w-40" role="img" aria-label={`${label}: de ${fmt(first)} para ${fmt(last)} em ${data.length} resultados`}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md opacity-60 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:16px_11px]" />
      <ChartContainer config={config} className="relative z-10 aspect-auto! h-11 w-full" initialDimension={{ width: 160, height: 44 }}>
        <LineChart accessibilityLayer data={data} margin={{ top: 5, right: 4, bottom: 5, left: 4 }}>
          <XAxis dataKey="period" hide />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line dataKey="value" dot={{ r: 2, strokeWidth: 0, fill: 'var(--color-value)' }} animationDuration={300} stroke="var(--color-value)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} type="linear" />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

/** Medidor segmentado (composição do bloco stats-4): quanto a alimentação pesa neste exame. */
function EvidenceMeter({ strength }: { strength: Strength }) {
  const st = STRENGTH[strength];
  const SEGMENTS = 18;
  const filled = Math.round((st.level / 3) * SEGMENTS);
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={`${st.label}. ${st.explain}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Quanto a alimentação pesa neste exame</span>
        <Badge variant={st.variant}>{st.label}</Badge>
      </div>
      <div aria-hidden="true" className="dx-grow-x flex w-full origin-left gap-0.5">
        {Array.from({ length: SEGMENTS }, (_, i) => <span key={i} className={cn('h-2.5 flex-1 rounded-md', i < filled ? st.tone : 'bg-muted')} />)}
      </div>
      <span className="text-xs text-muted-foreground">{st.explain}</span>
    </div>
  );
}

/** Corpo de uma orientação: ajuda / atrapalha / só a alimentação resolve? / fonte. */
function GuideBody({ guide }: { guide: Guide }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm leading-relaxed text-foreground">{guide.summary}</p>
      {guide.helps.length || guide.avoid.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {guide.helps.length ? (
            <div className="flex flex-col gap-1.5">
              <h4 className="m-0 text-xs font-semibold text-muted-foreground">Costuma ajudar</h4>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {guide.helps.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-foreground"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /><span>{t}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
          {guide.avoid.length ? (
            <div className="flex flex-col gap-1.5">
              <h4 className="m-0 text-xs font-semibold text-muted-foreground">Costuma atrapalhar</h4>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {guide.avoid.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-foreground"><X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" /><span>{t}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
        <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="m-0 text-sm leading-relaxed text-foreground"><strong className="font-semibold">Só a alimentação resolve?</strong> {guide.dietAlone}</p>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Fonte: {guide.source}</p>
    </div>
  );
}

/**
 * Uma linha de "Seus números": o valor do paciente e, ao tocar, a alimentação daquele exame
 * aberta ali mesmo (antes era um cartão separado no fim da tela, repetindo o exame).
 * Abre/fecha pela altura (grid 0fr → 1fr), uma transição de 200ms; parado sob "reduzir movimento".
 */
function ValueRow({ v, guide, open, onToggle, onAsk }: { v: PatientValue; guide: Guide | null; open: boolean; onToggle: () => void; onAsk: (() => void) | null }) {
  const panelId = `food-panel-${v.nameCanonical.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  // Rótulo em linguagem de gente (dono, 16/11): fala de prato, não de "alimentação".
  const cta = !guide ? null : guide.strength === 'nao-resolve' ? 'A comida ajuda aqui?' : v.status === 'normal' ? 'O que manter no prato' : 'O que pôr no prato';
  const first = (v.points?.length ?? 0) < 2;
  const meta = [
    rangeText(v.refLow, v.refHigh) ? `Faixa do laudo: ${rangeText(v.refLow, v.refHigh)}` : 'Laudo sem faixa de referência',
    v.date ? dateBr(v.date) : '',
    first ? 'primeiro resultado' : '',
  ].filter(Boolean).join(' · ');
  const summary = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{v.label}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-semibold whitespace-nowrap text-foreground tabular-nums">{fmt(v.value)}{v.unit ? <span className="ms-1 text-sm font-normal text-muted-foreground">{v.unit}</span> : null}</span>
          {v.status === 'normal' ? (
            <Badge className="shrink-0 border-0 whitespace-nowrap" variant="success-light"><Check aria-hidden="true" />Na faixa</Badge>
          ) : (
            <Badge className="shrink-0 border-0 whitespace-nowrap" variant="warning-light">
              {v.status === 'alto' ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
              {v.status === 'alto' ? 'Acima da faixa' : 'Abaixo da faixa'}
            </Badge>
          )}
        </span>
        <RangeBar value={v.value} low={v.refLow} high={v.refHigh} tone={v.status === 'normal' ? 'ok' : 'warn'} className="mt-2 max-w-56" />
        <span className="mt-1.5 text-xs text-muted-foreground">{meta}</span>
        {cta ? (
          <span className="mt-2 inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary">
            <Salad aria-hidden="true" className="size-4 shrink-0" />
            {cta}
            <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', open && 'rotate-180')} />
          </span>
        ) : null}
      </span>
      <Sparkline label={v.label} points={v.points} tone={v.status === 'normal' ? 'success' : 'warning'} />
    </>
  );
  if (!guide) return <div className="flex min-h-20 items-center justify-between gap-3 px-4 py-3">{summary}</div>;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-20 w-full cursor-pointer appearance-none items-center justify-between gap-3 border-0 bg-transparent px-4 py-3 text-left transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {summary}
      </button>
      <div id={panelId} role="region" aria-label={`${cta}: ${v.label}`} inert={!open} className={cn('grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 border-0 border-t border-dashed border-border bg-muted/30 px-4 py-4">
            {v.status === 'normal' ? (
              <p className="m-0 flex items-start gap-2 text-sm leading-relaxed text-foreground">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                <span>Seu resultado está na faixa. O que vem abaixo é o que costuma ajudar a mantê-lo assim.</span>
              </p>
            ) : null}
            <EvidenceMeter key={open ? 'aberto' : 'fechado'} strength={guide.strength} />
            <GuideBody guide={guide} />
            {onAsk ? (
              <Button variant="outline" size="lg" className="h-10 self-start" onClick={onAsk}><MessageCircleQuestion aria-hidden="true" />Perguntar ao Dr. Exame</Button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** Painel "Perguntar ao Dr. Exame" (composição do bloco sheet-10): sugestões + campo de texto. */
function AskSheet({ match, onClose }: { match: Match | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  useEffect(() => { setText(''); }, [match?.guide.key]);
  const label = match?.guide.label ?? '';
  const side = match?.direction === 'alto' ? 'acima' : 'abaixo';
  const value = match ? `${fmt(match.value)}${match.unit ? ` ${match.unit}` : ''}` : '';
  const suggestions = match ? [
    { id: 'porque', label: 'Por que alterou?', prompt: `Meu exame de ${label} veio ${value}, ${side} da faixa do laudo. Me explique, de forma simples, o que costuma fazer esse exame sair da faixa.` },
    { id: 'comer', label: 'O que muda na alimentação?', prompt: `Meu exame de ${label} veio ${value}, ${side} da faixa do laudo. O que os estudos dizem sobre alimentação para esse exame? Não quero cardápio nem quantidades, só entender o que ajuda e o que atrapalha.` },
    { id: 'medico', label: 'O que perguntar ao médico?', prompt: `Meu exame de ${label} veio ${value}, ${side} da faixa do laudo. Que perguntas eu devo levar para o médico sobre esse resultado?` },
    { id: 'repetir', label: 'Quando repetir?', prompt: `Meu exame de ${label} veio ${value}, ${side} da faixa do laudo. Em geral, depois de quanto tempo faz sentido repetir esse exame para ver se mudou?` },
  ] : [];
  const send = () => {
    const prompt = text.trim();
    if (!prompt) return;
    try { sessionStorage.setItem('dx-chat-prefill', prompt); } catch { /* sem sessionStorage: abre o chat vazio */ }
    onClose();
    navigate('/chat');
  };
  return (
    <Sheet open={!!match} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="inset-y-3 right-3 left-auto h-[calc(100svh-1.5rem)] w-[min(26rem,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden rounded-xl">
        <SheetHeader className="shrink-0 border-0 border-b border-solid border-border">
          <SheetTitle className="flex items-center gap-2 pe-8 text-base"><MessageCircleQuestion aria-hidden="true" className="size-4 text-primary" />Perguntar ao Dr. Exame</SheetTitle>
          <SheetDescription>{label ? `Sobre ${label}: ${value}, ${side} da faixa.` : ''}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <h3 className="m-0 text-sm font-medium text-foreground">Comece por uma destas</h3>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button key={s.id} variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setText(s.prompt)}>{s.label}</Button>
            ))}
          </div>
          <p className="m-0 text-xs text-muted-foreground">A pergunta abre no chat do app, onde você revisa antes de enviar. Cada pergunta do chat usa créditos.</p>
        </div>
        <SheetFooter className="shrink-0 border-0 border-t border-solid border-border">
          <form className="flex w-full flex-col gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label htmlFor="food-ask" className="sr-only">Sua pergunta</label>
            <Textarea id="food-ask" name="pergunta" rows={4} className="min-h-24 resize-none" placeholder="Escolha uma sugestão ou escreva a sua pergunta" value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" size="lg" className="h-10" disabled={!text.trim()}><ArrowUp aria-hidden="true" />Levar para o chat</Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────── página ─────────────────────────

export function FoodGuidePage() {
  useReuiThemeSync();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [pid, setPid] = useSelectedPatient();
  // Veio de um push sobre um dependente: troca para o paciente do aviso antes de carregar.
  const [params] = useSearchParams();
  const wanted = params.get('paciente');
  useEffect(() => { if (wanted && wanted !== pid) setPid(wanted); }, [wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [askFor, setAskFor] = useState<Match | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const outOfRange = (data?.values ?? []).filter((v) => v.status !== 'normal').length;

  useEffect(() => {
    let ignore = false;
    setData(null);
    setFailed(false);
    fetch(`${API_URL}/items/food-guide${pid ? `?patientId=${encodeURIComponent(pid)}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: Payload) => {
        if (ignore) return;
        const next = parsePayload(json);
        setData(next);
        // Saiu da tela no meio da geração e voltou: continua acompanhando.
        if (next.summaryStatus === 'pending') setGenerating(true);
      })
      .catch(() => { if (!ignore) setFailed(true); });
    return () => { ignore = true; };
  }, [pid, tick]);

  // A IA leva cerca de 1 minuto: o pedido volta na hora e a tela consulta até o resumo ficar
  // pronto (ou falhar). No máximo ~3 minutos de espera.
  useEffect(() => {
    if (!generating) return;
    let stop = false;
    let tries = 0;
    const url = `${API_URL}/items/food-guide${pid ? `?patientId=${encodeURIComponent(pid)}` : ''}`;
    const timer = window.setInterval(async () => {
      tries += 1;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok || stop) return;
        const next = parsePayload(await r.json());
        if (stop) return;
        if (next.summary) { setData(next); setGenerating(false); refresh(); return; }
        if (next.summaryStatus === 'error') { setData(next); setGenerating(false); notify(next.summaryError || 'Não foi possível gerar o resumo.', { type: 'error', autoHideDuration: 9000 }); refresh(); return; }
      } catch { /* oscilação de rede: tenta de novo na próxima volta */ }
      if (tries >= 45) { setGenerating(false); notify('O resumo está demorando mais que o normal. Volte a esta tela em instantes: ele aparece sozinho quando ficar pronto.', { type: 'info', autoHideDuration: 12000 }); }
    }, 4000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [generating, pid, notify, refresh]);

  const generate = async () => {
    if (generating || !data) return;
    setGenerating(true);
    try {
      const r = await fetch(`${API_URL}/items/food-guide/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ patientId: pid }) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setGenerating(false);
        if (json?.code === 'INSUFFICIENT_CREDITS') { notify(json.error || 'Créditos insuficientes.', { type: 'warning', autoHideDuration: 9000 }); navigate('/planos'); return; }
        throw new Error(json?.error || 'Não foi possível gerar o resumo.');
      }
      // Já existia para este conjunto de exames: vem pronto, sem cobrar.
      if (json?.content) { setData({ ...data, summary: { content: json.content, generatedAt: json.generatedAt } }); setGenerating(false); return; }
      if (json?.charged > 0) refresh(); // saldo de créditos no cabeçalho
      // 202: segue gerando; o efeito acima acompanha.
    } catch (e) {
      setGenerating(false);
      notify((e as Error).message || 'Não foi possível gerar o resumo.', { type: 'error', autoHideDuration: 9000 });
    }
  };

  // A orientação de cada exame abre na própria linha de "Seus números".
  const matchFor = (v: PatientValue) => (data?.matches ?? []).find((m) => m.nameCanonical === v.nameCanonical) ?? null;
  const guideFor = (v: PatientValue) => matchFor(v)?.guide ?? (data?.dictionary ?? []).find((g) => g.key === v.guideKey) ?? null;
  const toggleRow = (name: string) => setOpenRows((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  // O dicionário do fim fica só com os exames que NÃO aparecem em "Seus números".
  const shown = new Set([...(data?.matches ?? []).map((m) => m.guide.key), ...(data?.values ?? []).map((v) => guideFor(v)?.key ?? v.guideKey)]);
  const others = (data?.dictionary ?? []).filter((g) => !shown.has(g.key));
  const withFood = (data?.matches ?? []).filter((m) => m.guide.strength !== 'nao-resolve').length;

  return (
    <PageContainer width={1040} sx={{ pb: { xs: 14, sm: 6 } }}>
      <PageHeader
        title="Alimentação e seus exames"
        subtitle="O que os estudos dizem sobre alimentação para cada exame seu que saiu da faixa."
        icon={<Salad size={24} aria-hidden="true" />}
      />

      <div className="dx-island flex flex-col gap-4 [&_button]:font-[inherit]">
        {failed ? (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Não consegui carregar agora</AlertTitle>
            <AlertDescription>
              <p className="m-0">Confira a conexão e tente de novo.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>
            </AlertDescription>
          </Alert>
        ) : data === null ? (
          <Frame>
            <FramePanel className="flex flex-col gap-3" role="status" aria-label="Carregando as orientações">
              <Skeleton className="h-5 w-2/5" /><Skeleton className="h-16 w-full" /><Skeleton className="h-5 w-1/3" /><Skeleton className="h-16 w-full" />
            </FramePanel>
          </Frame>
        ) : (
          <>
            {/* ───────── SEUS NÚMEROS: os valores do paciente vêm primeiro (bloco chart-25) ───────── */}
            {data.values.length ? (
              <Frame>
                <FrameHeader className="dx-glass relative flex-row items-center gap-4 overflow-hidden rounded-[calc(var(--frame-radius)-var(--frame-px))]">
                  <GlassGlow />
                  <RingGauge
                    size={84}
                    thickness={9}
                    segments={[
                      { fraction: (data.values.length - outOfRange) / data.values.length, className: 'stroke-success' },
                      { fraction: outOfRange / data.values.length, className: 'stroke-warning' },
                    ]}
                    label={`${data.values.length - outOfRange} de ${data.values.length} exames na faixa`}
                  >
                    <CountUp value={data.values.length - outOfRange} format={(n) => String(Math.round(n))} className="text-xl leading-none font-semibold text-foreground tabular-nums" />
                    <span className="mt-0.5 text-xs text-muted-foreground">de {data.values.length}</span>
                  </RingGauge>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <FrameTitle role="heading" aria-level={2}>Seus números</FrameTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge className="border-0" variant="success-light"><Check aria-hidden="true" />{data.values.length - outOfRange} na faixa</Badge>
                      {outOfRange > 0 ? <Badge className="border-0" variant="warning-light"><TriangleAlert aria-hidden="true" />{outOfRange} fora da faixa</Badge> : null}
                      {withFood > 0 ? <Badge className="border-0" variant="primary-light"><Salad aria-hidden="true" />a comida ajuda em {withFood}</Badge> : null}
                    </div>
                    <FrameDescription>Toque em um exame para ver o que pôr no prato.</FrameDescription>
                  </div>
                </FrameHeader>
                <FramePanel className="p-0!">
                  <ul className="m-0 flex list-none flex-col p-0">
                    {data.values.map((v, i) => (
                      <li key={v.nameCanonical}>
                        <ValueRow
                          v={v}
                          guide={guideFor(v)}
                          open={openRows.has(v.nameCanonical)}
                          onToggle={() => toggleRow(v.nameCanonical)}
                          onAsk={matchFor(v) ? () => setAskFor(matchFor(v)!) : null}
                        />
                        {i < data.values.length - 1 ? <Separator /> : null}
                      </li>
                    ))}
                  </ul>
                </FramePanel>
              </Frame>
            ) : null}

            {data.matches.length ? (
              <>
                {/* ───────── Resumo personalizado (IA) ───────── */}
                <Frame>
                  <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                      <IconTile variant="frame" size="sm" aria-hidden="true"><Sparkles aria-hidden="true" /></IconTile>
                      <div className="flex min-w-0 flex-col gap-px">
                        <FrameTitle role="heading" aria-level={2}>Resumo feito para você</FrameTitle>
                        <FrameDescription>A IA liga os seus exames usando só o que está no dicionário abaixo.</FrameDescription>
                      </div>
                    </div>
                    {data.summary ? <Badge variant="primary-light"><Sparkles aria-hidden="true" />Gerado por IA</Badge> : null}
                  </FrameHeader>
                  <FramePanel className="flex flex-col gap-4">
                    {generating ? (
                      <div role="status" aria-live="polite"><AnalysisScan label="Dr. Exame está ligando os seus exames" chips={SCAN_CHIPS} /></div>
                    ) : data.summary ? (
                      <div className="dx-rise flex flex-col gap-4">
                        <p className="m-0 text-base leading-relaxed text-foreground">{data.summary.content.resumo}</p>
                        {data.summary.content.comecarPor.length ? (
                          <div className="flex flex-col gap-2">
                            <h3 className="m-0 text-sm font-semibold text-foreground">Por onde começar</h3>
                            <ol className="m-0 flex list-none flex-col gap-2 p-0">
                              {data.summary.content.comecarPor.map((step, i) => (
                                <li key={step} className="flex items-start gap-3 text-sm text-foreground">
                                  <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">{i + 1}</span>
                                  <span className="pt-0.5">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
                          <Stethoscope aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <p className="m-0 text-sm leading-relaxed text-foreground"><strong className="font-semibold">Leve ao seu médico:</strong> {data.summary.content.levarAoMedico}</p>
                        </div>
                        <p className="m-0 text-xs text-muted-foreground">Texto gerado por IA em {dateBr(data.summary.generatedAt)} a partir de conteúdo curado. Vale até chegar exame novo. Não é plano alimentar.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-3">
                        <p className="m-0 max-w-2xl text-sm leading-relaxed text-foreground">Veja, em poucas linhas, o que os seus exames fora da faixa têm em comum, por onde começar e o que levar ao médico.</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="lg" className="h-11" onClick={() => void generate()}><Sparkles aria-hidden="true" />Gerar meu resumo</Button>
                          <Badge variant="outline" size="lg">{data.summaryCost > 0 ? `${data.summaryCost} créditos` : 'Grátis'}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">Leva cerca de um minuto. Você só paga uma vez por conjunto de exames e, se a IA falhar, os créditos voltam.</span>
                      </div>
                    )}
                  </FramePanel>
                </Frame>
              </>
            ) : (
              <Frame>
                <FramePanel className="flex flex-col items-start gap-3">
                  {data.examsRead === 0 ? (
                    <>
                      <p className="m-0 text-sm leading-relaxed text-foreground"><strong className="font-semibold">Ainda não há exame seu no app.</strong> Envie o PDF ou a foto do laudo e esta tela mostra o que a alimentação pode fazer por cada resultado que sair da faixa.</p>
                      <Button size="lg" className="h-10" onClick={() => navigate('/exams/create')}><Upload aria-hidden="true" />Enviar exame</Button>
                    </>
                  ) : (
                    <p className="m-0 flex items-start gap-2 text-sm leading-relaxed text-foreground">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                      <span><strong className="font-semibold">Nenhum dos exames do dicionário está fora da faixa no seu resultado mais recente.</strong> Ele continua aqui para consulta.</span>
                    </p>
                  )}
                </FramePanel>
              </Frame>
            )}

            {/* ───────── Dicionário ───────── */}
            {others.length ? (
              <Frame>
                <FrameHeader className="flex-row items-center gap-3">
                  <IconTile variant="frame" size="sm" aria-hidden="true"><BookOpen aria-hidden="true" /></IconTile>
                  <div className="flex min-w-0 flex-col gap-px">
                    <FrameTitle role="heading" aria-level={2}>Dicionário: alimentação por exame</FrameTitle>
                    <FrameDescription>Toque em um exame para ver o que a ciência diz.</FrameDescription>
                  </div>
                </FrameHeader>
                <FramePanel className="p-0!">
                  <div className="flex flex-col divide-y divide-border">
                    {others.map((g) => {
                      const st = STRENGTH[g.strength];
                      return (
                        <details key={g.key} className="group">
                          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-sm font-medium text-foreground">{g.label}</span>
                              <span className="text-xs text-muted-foreground">{WHEN_TEXT[g.when]}</span>
                            </span>
                            <Badge variant={st.variant}>{st.label}</Badge>
                            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-180 motion-reduce:transition-none" />
                          </summary>
                          <div className="px-4 pb-4"><GuideBody guide={g} /></div>
                        </details>
                      );
                    })}
                  </div>
                </FramePanel>
              </Frame>
            ) : null}

            {/* ───────── Limites ───────── */}
            <Alert>
              <Info aria-hidden="true" />
              <AlertTitle>O que esta tela é, e o que não é</AlertTitle>
              <AlertDescription>
                <p className="m-0">É conteúdo educativo, tirado de diretrizes médicas, sobre o que costuma ajudar em cada exame. Não é plano alimentar, não traz quantidades e não substitui consulta. Para um cardápio feito para você, procure um nutricionista; para decidir o tratamento, o seu médico.</p>
              </AlertDescription>
            </Alert>
          </>
        )}
      </div>

      <AskSheet match={askFor} onClose={() => setAskFor(null)} />
    </PageContainer>
  );
}
