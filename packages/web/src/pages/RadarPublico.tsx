/**
 * Simulador hormonal PÚBLICO — /simulador-hormonal (sem login). 14/11/26.
 *
 * Para quê: quem chega pelo Google/YouTube simula a curva de graça, entende cada composto e,
 * na mesma tela, vê o que só existe com a conta: o cruzamento com os PRÓPRIOS exames. O
 * simulador é a isca honesta; o exame é o motivo de cadastrar.
 *
 * Plano ReUI: superfície de marketing com ferramenta · família Frame · regiões: barra pública →
 * abertura escura (título + celular com a tela de exames) → [simulador | "no app, com os seus
 * exames"] → cada composto explicado → o que muda com os exames → dúvidas.
 * Uma ação primária ("Criar conta grátis"); o resto é secundário.
 *
 * Movimento (regras do ReUI): 1 entrada (o escalonamento da abertura), 3 laços ambientes
 * (celular, etiqueta, ponto do pico), revelação ao rolar de 300ms; tudo com repouso sob
 * "reduzir movimento" (classes dx-* em doctor-v2/tw.css).
 *
 * O que fica guardado para o app, de propósito: exames, registro de aplicações e metade da
 * explicação de cada composto (o que muda nos exames, riscos, perguntas ao médico). A página
 * não sugere dose nem esquema, e não traz ciclo pronto.
 *
 * O protocolo montado fica em localStorage `dx-radar-v2:anon`; ao criar a conta, o Radar do
 * app abre com ele (ver loadSaved em RadarHormonal).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, BellPlus, Check, ClipboardList, FlaskConical, Info, Link2, Lock, Plus, Sparkles, Syringe, TestTubeDiagonal, TrendingDown, TrendingUp, Waves, X } from 'lucide-react';
import { cn } from 'cn';
import { API_URL } from '../config';
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CompoundIcon, durationLabel } from '@/components/radar/compound-picker';
import { ProtocolItem } from '@/components/radar/protocol-item';
import { RadarChart, radarDash } from '@/components/radar/radar-chart';
import { RADAR_COMPOUNDS, RADAR_FAMILIES, compoundById, computeRadarSeries, computeRadarStats, type RadarProtocolItem } from '@/utils/hormoneRadar';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.janocaminho.drexame&utm_source=simulador';
const CANONICAL = 'https://drexame.janocaminho.com.br/simulador-hormonal';
const TITLE = 'Simulador hormonal grátis: pico e vale da testosterona entre as aplicações | Dr. Exame';
const DESCRIPTION = 'Simule a curva de testosterona, Durateston, Deposteron, enantato, deca e outros: pico, vale e oscilação entre as aplicações. Grátis, sem cadastro. No app, cruze com os seus exames.';
const STORAGE_KEY = 'dx-radar-v2:anon';
const WEEK_OPTIONS = [8, 12, 16, 24];
const NUDGE_AFTER = 4;
const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`;

const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const STABILITY = {
  estavel: { label: 'Estável', variant: 'success-light', phrase: 'fica bem estável entre uma aplicação e outra' },
  moderado: { label: 'Oscila um pouco', variant: 'warning-light', phrase: 'oscila de forma moderada entre uma aplicação e outra' },
  alto: { label: 'Oscila bastante', variant: 'warning-light', phrase: 'sobe e desce bastante entre uma aplicação e outra' },
} as const;

const DEFAULT_PROTOCOL: RadarProtocolItem[] = [
  { uid: '1', compoundId: 'test_cyp', unit: 'ml', amount: 1, conc: 200, freqDays: 7, startWeek: 1, endWeek: 12 },
];

/** O que só o app faz. Cada item é uma função que existe hoje. */
const IN_APP = [
  { icon: TestTubeDiagonal, title: 'Seus exames ao lado do protocolo', text: 'Hematócrito, estradiol, HDL, LDL, LH, FSH e PSA, com a faixa do seu laudo e a evolução.' },
  { icon: Waves, title: 'Pico ou vale: onde você colheu', text: 'Mostra em que ponto da curva caiu a sua coleta e quando repetir para comparar.' },
  { icon: Syringe, title: 'Registro das aplicações', text: 'A curva passa a usar as datas reais, com atraso e dose pulada.' },
  { icon: BellPlus, title: 'Pontos de atenção e lembretes', text: 'Avisa quando um exame sai da faixa do laudo ou está na hora do controle.' },
  { icon: ClipboardList, title: 'Resumo para o médico', text: 'Uma página com o que você usa, seus exames e as perguntas certas.' },
];

const OPEN_SECTIONS: Array<{ key: string; title: string }> = [
  { key: 'oQueE', title: 'O que é' },
  { key: 'noCorpo', title: 'O que faz no corpo' },
  { key: 'porQueUsam', title: 'Por que alguém usa' },
];
const LOCKED_TITLES: Record<string, string> = {
  nosExames: 'O que costuma mudar nos seus exames',
  riscos: 'Riscos que as pessoas mais subestimam',
  levarAoMedico: 'O que perguntar ao médico',
};

const FAQ = [
  { q: 'O que este simulador calcula?', a: 'Uma estimativa de quanto hormônio o depósito da injeção libera por dia, em mg/dia, a partir da dose, do intervalo e da meia-vida de cada éster. Não é o nível no sangue: esse só o exame mostra.' },
  { q: 'O que são pico e vale?', a: 'Pico é o ponto mais alto estimado depois da aplicação. Vale é o ponto mais baixo, antes da próxima. Quanto maior a distância entre os dois, mais o nível oscila.' },
  { q: 'Por que dividir a mesma dose em mais aplicações reduz a oscilação?', a: 'Porque cada aplicação menor sobe menos e a seguinte chega antes de o nível cair muito. A quantidade total da semana é a mesma; muda só a divisão. Qualquer mudança na forma de aplicar deve ser conversada com o médico.' },
  { q: 'O resultado vale para o meu corpo?', a: 'É uma média de estudos. Local da aplicação, tipo de óleo, peso e metabolismo mudam a curva de pessoa para pessoa. Por isso o app cruza a simulação com os seus exames reais.' },
  { q: 'O Dr. Exame indica dose ou ciclo?', a: 'Não. O simulador e o app são educativos: organizam os seus dados para você e o seu médico decidirem. Não indicamos dose, não vendemos nada e não substituímos consulta.' },
];

// ───────────────────────── protocolo: guardar e compartilhar ─────────────────────────

const clampNum = (v: unknown, lo: number, hi: number, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };

/** "test_cyp,ml,1,200,7,1,12;…" — curto o bastante para colar no WhatsApp. */
function encodeProtocol(items: RadarProtocolItem[]): string {
  return items.map((i) => [i.compoundId, i.unit, i.amount, i.conc, i.freqDays, i.startWeek, i.endWeek].join(',')).join(';');
}

/** Lê o link compartilhado; tudo fora do catálogo ou de faixa plausível é descartado. */
function decodeProtocol(raw: string | null): RadarProtocolItem[] | null {
  if (!raw) return null;
  const out: RadarProtocolItem[] = [];
  for (const part of raw.split(';').slice(0, 6)) {
    const [id, unit, amount, conc, freq, start, end] = part.split(',');
    if (!RADAR_COMPOUNDS.some((c) => c.id === id)) continue;
    const startWeek = Math.round(clampNum(start, 1, 24, 1));
    out.push({
      uid: `s${out.length + 1}`, compoundId: id, unit: unit === 'mg' ? 'mg' : 'ml',
      amount: clampNum(amount, 0, 2000, 1), conc: clampNum(conc, 1, 1000, compoundById(id).defaultConc),
      freqDays: clampNum(freq, 0.5, 70, 7), startWeek, endWeek: Math.round(clampNum(end, startWeek, 24, 12)),
    });
  }
  return out.length ? out : null;
}

function loadSaved(): { protocol: RadarProtocolItem[]; weeks: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.protocol) && parsed.protocol.length ? { protocol: parsed.protocol, weeks: WEEK_OPTIONS.includes(parsed.weeks) ? parsed.weeks : 12 } : null;
  } catch {
    return null;
  }
}

// ───────────────────────── SEO e revelação ao rolar ─────────────────────────

/** Título, descrição, canonical e dados estruturados (o servidor já manda título e og no HTML). */
function usePageSeo() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const set = (selector: string, attr: string, value: string) => { const el = document.head.querySelector(selector); const old = el?.getAttribute(attr) ?? null; el?.setAttribute(attr, value); return () => { if (el && old != null) el.setAttribute(attr, old); }; };
    const undo = [set('meta[name="description"]', 'content', DESCRIPTION), set('link[rel="canonical"]', 'href', CANONICAL)];
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebApplication', name: 'Simulador hormonal Dr. Exame', url: CANONICAL, applicationCategory: 'HealthApplication', operatingSystem: 'Web', inLanguage: 'pt-BR', description: DESCRIPTION, offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' } },
        { '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      ],
    });
    document.head.appendChild(ld);
    return () => { document.title = prevTitle; undo.forEach((u) => u()); ld.remove(); };
  }, []);
}

/** Blocos com data-reveal aparecem ao entrar na tela (uma vez). Sem JS ou com movimento reduzido, já nascem visíveis. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = root.current;
    if (!host || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(host.querySelectorAll<HTMLElement>('[data-reveal]'));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('dx-reveal-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    for (const el of els) {
      if (el.getBoundingClientRect().top < window.innerHeight) continue; // o que já está na tela não some
      el.classList.add('dx-reveal-armed');
      io.observe(el);
    }
    return () => io.disconnect();
  }, [root]);
}

// ───────────────────────── abertura: celular + curva ─────────────────────────

/** Curva decorativa da abertura: é a curva REAL do exemplo padrão, não um desenho solto. */
function useHeroCurve() {
  return useMemo(() => {
    const s = computeRadarSeries(DEFAULT_PROTOCOL, 10 * 7, 0);
    const max = Math.max(...s.total) * 1.15;
    const W = 640; const H = 260;
    const pts = s.total.map((v, i) => [Math.round((i / s.totalSteps) * W * 10) / 10, Math.round((H - (v / max) * H) * 10) / 10] as const);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');
    let peak = pts[0];
    for (const p of pts.slice(Math.floor(pts.length * 0.7))) if (p[1] < peak[1]) peak = p;
    return { W, H, line, area: `${line}L${W},${H}L0,${H}Z`, peak };
  }, []);
}

const HERO_ROWS = [
  { name: 'Hematócrito', from: '45,2', to: '51,8 %', up: true, badge: 'Na faixa', variant: 'success-light' },
  { name: 'Estradiol', from: '27', to: '48 pg/mL', up: true, badge: 'Acima da faixa', variant: 'warning-light' },
  { name: 'Colesterol HDL', from: '47', to: '36 mg/dL', up: false, badge: 'Abaixo da faixa', variant: 'warning-light' },
  { name: 'Testosterona total', from: '410', to: '742 ng/dL', up: true, badge: 'Na faixa', variant: 'success-light' },
] as const;

/**
 * Imagem da abertura: o Radar do app refeito como marcação de verdade (texto nítido em qualquer
 * tela), não um print reduzido. A curva é a do exemplo padrão; os exames são de demonstração.
 */
function HeroVisual() {
  const curve = useHeroCurve();
  const examX = curve.W * 0.78;
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md pt-6 pb-20">
      <div className="absolute inset-x-6 top-16 h-72 rounded-full bg-primary/25 blur-3xl" />
      <svg viewBox={`0 0 ${curve.W} ${curve.H}`} preserveAspectRatio="none" className="absolute -inset-x-6 top-10 h-52 w-[calc(100%+3rem)] opacity-40">
        <path d={curve.line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="dx-float relative mx-auto flex w-[18.5rem] max-w-full flex-col gap-3 rounded-[2rem] border border-border bg-card p-3.5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <img src={asset('app-icon.png')} alt="" width={24} height={24} className="size-6 rounded-md" />Radar Hormonal
          </span>
          <Badge variant="outline" size="sm">Demonstração</Badge>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-background px-3 pt-3 pb-2">
          <svg viewBox={`0 0 ${curve.W} ${curve.H}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible">
            <defs>
              <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={curve.area} fill="url(#hero-fill)" />
            <path d={curve.line} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <line x1={examX} x2={examX} y1={0} y2={curve.H} stroke="var(--destructive)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="dx-pulse-soft size-2 rounded-full bg-primary" />Pico 25,1 mg/dia</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rotate-45 bg-destructive" />Dia do exame</span>
          </div>
        </div>

        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {HERO_ROWS.map((r) => (
            <li key={r.name} className="flex items-center gap-2.5 py-2">
              <IconTile variant="soft" size="sm" className="text-muted-foreground">{r.up ? <TrendingUp /> : <TrendingDown />}</IconTile>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium text-foreground">{r.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{r.from} → <strong className="font-semibold text-foreground">{r.to}</strong></span>
              </span>
              <Badge variant={r.variant} size="sm">{r.badge}</Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* Centraliza no pai e anima no filho: a animação usa a propriedade translate e anularia a centralização */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
      <div className="dx-float-slow flex w-64 max-w-full items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
        <Waves className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="text-xs leading-snug text-foreground">Coleta feita <strong className="font-semibold">perto do pico</strong>: o número veio dos mais altos do ciclo.</span>
      </div>
      </div>
    </div>
  );
}

// ───────────────────────── explicação do composto ─────────────────────────

interface PublicExplanation { sections: Record<string, string>; locked: Array<{ key: string; teaser: string }> }
const explainCache = new Map<string, PublicExplanation | 'none'>();

function CompoundDialog({ compoundId, onClose, onSignUp }: { compoundId: string | null; onClose: () => void; onSignUp: () => void }) {
  const [data, setData] = useState<PublicExplanation | 'none' | null>(null);
  const comp = compoundId ? compoundById(compoundId) : null;

  useEffect(() => {
    if (!compoundId) return;
    const hit = explainCache.get(compoundId);
    if (hit) { setData(hit); return; }
    let ignore = false;
    setData(null);
    fetch(`${API_URL}/public/compounds/${encodeURIComponent(compoundId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: PublicExplanation) => { if (ignore) return; const ok = json?.sections ? json : 'none'; explainCache.set(compoundId, ok); setData(ok); })
      .catch(() => { if (!ignore) setData('none'); });
    return () => { ignore = true; };
  }, [compoundId]);

  return (
    <Dialog open={!!comp} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        {comp ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-start">
                <CompoundIcon comp={comp} className="size-12 rounded-xl" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="[overflow-wrap:anywhere]">{comp.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{comp.isOral ? 'Comprimido' : 'Injetável'} · {durationLabel(comp)}</span>
                </span>
              </DialogTitle>
              <DialogDescription>Explicação educativa, em linguagem simples.</DialogDescription>
            </DialogHeader>

            {data === null ? (
              <div role="status" aria-label="Carregando a explicação" className="flex flex-col gap-3">
                <Skeleton className="h-4 w-1/3" /><Skeleton className="h-14 w-full" /><Skeleton className="h-4 w-2/5" /><Skeleton className="h-14 w-full" />
              </div>
            ) : data === 'none' ? (
              <p className="m-0 text-sm leading-relaxed text-foreground">
                {comp.isOral ? 'É tomado por comprimido e age por pouco tempo.' : `É aplicado por injeção e ${durationLabel(comp)}.`} {RADAR_FAMILIES[comp.family].aromatizes ? 'Parte dele vira estradiol no corpo.' : 'Não vira estradiol no corpo.'} A explicação completa deste composto está no app.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {OPEN_SECTIONS.filter((s) => data.sections[s.key]).map((s) => (
                  <section key={s.key} className="flex flex-col gap-1">
                    <h3 className="m-0 text-sm font-semibold text-foreground">{s.title}</h3>
                    <p className="m-0 text-sm leading-relaxed text-foreground">{data.sections[s.key]}</p>
                  </section>
                ))}
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 px-3 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Lock aria-hidden="true" className="size-3.5" />Continua no app, junto dos seus exames</span>
                  {data.locked.map((l) => (
                    <section key={l.key} className="flex flex-col gap-0.5">
                      <h3 className="m-0 text-sm font-semibold text-foreground">{LOCKED_TITLES[l.key] ?? l.key}</h3>
                      <p className="m-0 text-sm leading-relaxed text-muted-foreground [mask-image:linear-gradient(90deg,#000_35%,transparent_96%)]">{l.teaser}</p>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {/* Rodapé fixo: no celular o texto rola por baixo e os botões continuam à mão */}
            <DialogFooter className="sticky -bottom-4 z-10 bg-muted">
              <Button variant="outline" size="lg" className="h-10" onClick={onClose}>Voltar ao simulador</Button>
              <Button size="lg" className="h-10" onClick={onSignUp}>Ver tudo no app<ArrowRight aria-hidden="true" /></Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── página ─────────────────────────

export function RadarPublicoPage() {
  useReuiThemeSync();
  usePageSeo();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const initial = useMemo(() => {
    const shared = decodeProtocol(params.get('p'));
    if (shared) return { protocol: shared, weeks: WEEK_OPTIONS.includes(Number(params.get('w'))) ? Number(params.get('w')) : 12, fresh: false };
    const saved = loadSaved();
    return saved ? { ...saved, fresh: false } : { protocol: DEFAULT_PROTOCOL, weeks: 12, fresh: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [protocol, setProtocol] = useState<RadarProtocolItem[]>(initial.protocol);
  const [weeks, setWeeks] = useState(initial.weeks);
  const [compare2x, setCompare2x] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editingUid, setEditingUid] = useState<string | null>(initial.fresh ? '1' : null);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [touches, setTouches] = useState(0);
  const [nudgeClosed, setNudgeClosed] = useState(() => { try { return sessionStorage.getItem('dx-sim-nudge') === '1'; } catch { return false; } });
  const [copied, setCopied] = useState(false);
  const touch = () => setTouches((n) => n + 1);

  // Guarda o que a pessoa montou: se ela criar a conta, o Radar do app abre com isso.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ protocol, weeks, startDate: '', variationPct: 0 })); } catch { /* navegação privada: a página funciona sem guardar */ }
  }, [protocol, weeks]);

  const totalDays = weeks * 7;
  const series = useMemo(() => computeRadarSeries(protocol, totalDays, 0), [protocol, totalDays]);
  const stats = useMemo(() => computeRadarStats(series), [series]);
  const canSplit = protocol.some((p) => p.freqDays >= 7);
  const compare = useMemo(() => (compare2x && canSplit ? computeRadarSeries(protocol, totalDays, 0, true) : null), [compare2x, canSplit, protocol, totalDays]);
  const compareStats = useMemo(() => (compare ? computeRadarStats(compare) : null), [compare]);
  const stab = STABILITY[stats.stability];
  const many = series.seriesPerItem.length > 1;
  const showNudge = touches >= NUDGE_AFTER && !nudgeClosed;

  const update = (uid: string, patch: Partial<RadarProtocolItem>) => { touch(); setProtocol((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p))); };
  const changeCompound = (uid: string, compoundId: string) => {
    const comp = compoundById(compoundId);
    update(uid, comp.isOral ? { compoundId, conc: comp.defaultConc, unit: 'mg', amount: 20, freqDays: 1 } : { compoundId, conc: comp.defaultConc, unit: 'ml', amount: 1, freqDays: 7 });
  };
  const changeUnit = (item: RadarProtocolItem, unit: 'ml' | 'mg') => {
    if (unit === item.unit) return;
    const mg = item.unit === 'ml' ? item.amount * item.conc : item.amount;
    update(item.uid, { unit, amount: unit === 'ml' ? Math.round((mg / Math.max(1, item.conc)) * 100) / 100 : Math.round(mg) });
  };
  const add = () => {
    const uid = String(Date.now());
    touch();
    setProtocol((prev) => [...prev, { uid, compoundId: 'test_enan', unit: 'ml', amount: 1, conc: 250, freqDays: 7, startWeek: 1, endWeek: weeks }]);
    setEditingUid(uid);
  };
  const closeNudge = () => { setNudgeClosed(true); try { sessionStorage.setItem('dx-sim-nudge', '1'); } catch { /* sem sessionStorage: some só nesta visita */ } };
  const signUp = () => navigate('/registrar');
  const toSimulator = () => document.getElementById('simulador')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/simulador-hormonal?p=${encodeURIComponent(encodeProtocol(protocol))}&w=${weeks}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { window.prompt('Copie o link da simulação:', url); }
  };

  return (
    <div ref={rootRef} className="dx-island min-h-screen bg-background text-foreground [&_button]:font-[inherit]">
      {/* ───────── Barra pública ───────── */}
      <header className="sticky top-0 z-20 border-0 border-b border-solid border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3 px-4">
          <a href={asset('')} onClick={(e) => { e.preventDefault(); navigate('/landing'); }} className="flex min-w-0 items-center gap-2.5 text-foreground no-underline">
            <img src={asset('app-icon.png')} alt="" width={32} height={32} className="size-8 rounded-lg" />
            <span className="truncate text-base font-semibold">Dr. Exame</span>
          </a>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="lg" className="h-10 bg-transparent" onClick={() => navigate('/entrar')}>Entrar</Button>
            <Button size="lg" className="h-10" onClick={signUp}>Criar conta grátis</Button>
          </div>
        </div>
      </header>

      {/* ───────── Abertura (escura nos dois temas: classe .dark troca os tokens só aqui) ───────── */}
      <section className="dark relative overflow-hidden bg-background text-foreground">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60rem_30rem_at_15%_-10%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]" />
        <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-8 px-4 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col items-start gap-5">
            <div className="dx-rise flex flex-wrap gap-1.5" style={{ '--i': 0 } as React.CSSProperties}>
              <Badge variant="primary-light" size="lg"><Sparkles aria-hidden="true" />Grátis</Badge>
              <Badge variant="outline" size="lg">Sem cadastro</Badge>
            </div>
            <h1 className="dx-rise m-0 text-4xl leading-[1.08] font-bold tracking-tight text-foreground sm:text-5xl" style={{ '--i': 1 } as React.CSSProperties}>
              Veja o pico e o vale entre as aplicações. <span className="text-primary">Depois, veja nos seus exames.</span>
            </h1>
            <p className="dx-rise m-0 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ '--i': 2 } as React.CSSProperties}>
              Monte a simulação com testosterona, Durateston, deca, masteron e outros. O gráfico mostra a liberação estimada dia a dia. No app, a mesma curva aparece ao lado do seu hematócrito, estradiol e colesterol.
            </p>
            <div className="dx-rise flex w-full flex-col gap-2 sm:w-auto sm:flex-row" style={{ '--i': 3 } as React.CSSProperties}>
              <Button size="lg" className="h-12 px-5 text-base" onClick={toSimulator}>Simular agora<ArrowDown aria-hidden="true" /></Button>
              <Button variant="outline" size="lg" className="h-12 border-foreground/30 bg-transparent px-5 text-base text-foreground hover:bg-foreground/10" onClick={signUp}>Criar conta e enviar exame</Button>
            </div>
            <ul className="dx-rise m-0 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-sm text-muted-foreground" style={{ '--i': 4 } as React.CSSProperties}>
              {['13 compostos, cada um explicado', 'Pico, vale e oscilação', 'Não indica dose'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check aria-hidden="true" className="size-4 text-primary" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="dx-rise" style={{ '--i': 5 } as React.CSSProperties}><HeroVisual /></div>
        </div>
      </section>

      <main>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-4 py-10">
        <div id="simulador" className="grid scroll-mt-20 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ───────── Simulador ───────── */}
          <div className="flex min-w-0 flex-col gap-4">
            <Frame>
              <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <IconTile variant="frame" size="sm" aria-hidden="true"><FlaskConical aria-hidden="true" /></IconTile>
                  <div className="flex min-w-0 flex-col gap-px">
                    <FrameTitle role="heading" aria-level={2}>Monte a simulação</FrameTitle>
                    <FrameDescription>Toque no "?" para entender cada composto.</FrameDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span role="status" className="text-xs text-muted-foreground">{copied ? 'Link copiado' : ''}</span>
                  <Button variant="outline" size="sm" onClick={() => void copyLink()}><Link2 aria-hidden="true" />Copiar link</Button>
                </div>
              </FrameHeader>
              {protocol.map((item, index) => (
                <FramePanel key={item.uid}>
                  <ProtocolItem
                    item={item} index={index} weeks={weeks}
                    dash={protocol.length > 1 ? radarDash(index) : ''}
                    canRemove={protocol.length > 1}
                    editing={editingUid === item.uid}
                    onEdit={() => setEditingUid(item.uid)}
                    onDone={() => setEditingUid(null)}
                    onUpdate={(patch) => update(item.uid, patch)}
                    onChangeCompound={(id) => changeCompound(item.uid, id)}
                    onChangeUnit={(unit) => changeUnit(item, unit)}
                    onExplain={() => { touch(); setExplainId(item.compoundId); }}
                    onRemove={() => { setEditingUid(null); setProtocol((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.uid !== item.uid))); }}
                  />
                </FramePanel>
              ))}
              <FramePanel>
                <button
                  type="button" onClick={add}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Adicionar outro composto
                </button>
              </FramePanel>
            </Frame>

            <Frame>
              <FramePanel className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="m-0 max-w-2xl text-base leading-relaxed text-foreground">
                    Nesta simulação, a liberação <strong className="font-semibold">{stab.phrase}</strong>.
                    {compareStats ? <> Dividindo a mesma dose em 2 aplicações por semana, a oscilação cairia de <strong className="font-semibold tabular-nums">{n0(stats.swingPct)}%</strong> para <strong className="font-semibold tabular-nums">{n0(compareStats.swingPct)}%</strong>.</> : null}
                  </p>
                  <Badge variant={stab.variant} size="lg">{stab.label}</Badge>
                </div>
                <dl className="m-0 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
                  <div className="flex flex-col gap-1 bg-card px-3 py-3">
                    <dt className="text-xs text-muted-foreground">Média por dia</dt>
                    <dd className="m-0 text-2xl leading-none font-semibold tabular-nums">{n1(stats.avgDailyMg)} <span className="text-sm font-normal text-muted-foreground">mg</span></dd>
                  </div>
                  <div className="flex flex-col gap-1 bg-card px-3 py-3">
                    <dt className="text-xs text-muted-foreground">Do vale ao pico</dt>
                    <dd className="m-0 text-2xl leading-none font-semibold tabular-nums">{n1(stats.troughMg)} <span className="text-sm font-normal text-muted-foreground">a</span> {n1(stats.peakMg)} <span className="text-sm font-normal text-muted-foreground">mg/dia</span></dd>
                  </div>
                  <div className="flex flex-col gap-1 bg-card px-3 py-3">
                    <dt className="text-xs text-muted-foreground">Sobe e desce</dt>
                    <dd className="m-0 text-2xl leading-none font-semibold tabular-nums">{n0(stats.swingPct)} <span className="text-sm font-normal text-muted-foreground">%</span></dd>
                  </div>
                </dl>
              </FramePanel>
            </Frame>

            {/* Convite no momento certo: só depois de a pessoa mexer algumas vezes */}
            {showNudge ? (
              <div className="dx-rise flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
                <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="m-0 text-sm leading-relaxed text-foreground"><strong className="font-semibold">Gostou da simulação?</strong> Ela mostra o hormônio. O app mostra o que ele está fazendo no seu hematócrito, no seu estradiol e no seu colesterol.</p>
                  <div><Button size="sm" onClick={signUp}>Cruzar com os meus exames<ArrowRight aria-hidden="true" /></Button></div>
                </div>
                <Button variant="ghost" size="icon-sm" className="shrink-0 bg-transparent" aria-label="Fechar convite" onClick={closeNudge}><X aria-hidden="true" /></Button>
              </div>
            ) : null}

            <Frame>
              <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <IconTile variant="frame" size="sm" aria-hidden="true"><Waves aria-hidden="true" /></IconTile>
                  <div className="flex min-w-0 flex-col gap-px">
                    <FrameTitle role="heading" aria-level={2}>Como a liberação estimada varia</FrameTitle>
                    <FrameDescription>Quanto o depósito da injeção libera por dia (mg/dia). Não é o nível no sangue.</FrameDescription>
                  </div>
                </div>
                <ToggleGroup value={[String(weeks)]} onValueChange={(next) => { if (next[0]) { touch(); setWeeks(Number(next[0])); } }} variant="outline" size="sm" spacing={0} aria-label="Período mostrado">
                  {WEEK_OPTIONS.map((w) => <ToggleGroupItem key={w} value={String(w)}>{w} sem</ToggleGroupItem>)}
                </ToggleGroup>
              </FrameHeader>
              <FramePanel className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {series.seriesPerItem.map((s, index) => {
                    const off = hidden.has(s.item.uid);
                    const dashed = many ? radarDash(index) : '';
                    return (
                      <button
                        key={s.item.uid} type="button" aria-pressed={!off} title={off ? 'Mostrar no gráfico' : 'Esconder do gráfico'}
                        onClick={() => setHidden((prev) => { const next = new Set(prev); if (off) next.delete(s.item.uid); else next.add(s.item.uid); return next; })}
                        className={cn('flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-solid border-border bg-transparent px-2.5 text-xs text-foreground transition-colors hover:bg-muted', off && 'text-muted-foreground line-through')}
                      >
                        <svg aria-hidden="true" width="20" height="6" viewBox="0 0 20 6" className={cn('shrink-0', off && 'opacity-30')}>
                          <line x1="1" x2="19" y1="3" y2="3" stroke={s.comp.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? dashed.split(' ').map((n) => Number(n) / 2.2).join(' ') : undefined} />
                        </svg>
                        {s.comp.short}
                      </button>
                    );
                  })}
                  {canSplit ? (
                    <button
                      type="button" aria-pressed={compare2x} onClick={() => { touch(); setCompare2x((v) => !v); }}
                      className={cn('ms-auto flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-solid border-border bg-transparent px-2.5 text-xs text-foreground transition-colors hover:bg-muted', compare2x && 'border-warning/50 bg-warning/10')}
                    >
                      <span aria-hidden="true" className="h-0 w-4 border-0 border-t-2 border-dashed border-warning" />
                      E se dividir em 2x por semana?
                    </button>
                  ) : null}
                </div>
                <RadarChart series={series} compare={compare} stats={stats} weeks={weeks} examDay={null} hidden={hidden} dayLabel={(day) => `Dia ${Math.floor(day) + 1} · semana ${Math.floor(day / 7) + 1}`} />
                <p className="m-0 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground">
                  <Info aria-hidden="true" className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                  <span><strong className="font-semibold">É uma simulação.</strong> Vem de médias de estudos; o seu organismo pode responder de forma diferente. O exame de sangue é medido separadamente, e é ele que o app cruza com esta curva.</span>
                </p>
              </FramePanel>
            </Frame>
          </div>

          {/* ───────── No app, com os seus exames ───────── */}
          <aside aria-labelledby="no-app" className="lg:sticky lg:top-20">
            <Frame>
              <FrameHeader className="flex-row items-center gap-3">
                <IconTile variant="frame" size="sm" aria-hidden="true"><TestTubeDiagonal aria-hidden="true" /></IconTile>
                <div className="flex min-w-0 flex-col gap-px">
                  <FrameTitle id="no-app" role="heading" aria-level={2}>No app, com os seus exames</FrameTitle>
                  <FrameDescription>A simulação é só metade da história.</FrameDescription>
                </div>
              </FrameHeader>
              <FramePanel className="flex flex-col gap-4">
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {IN_APP.map((f) => (
                    <li key={f.title} className="flex items-start gap-2.5">
                      <f.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <strong className="text-sm font-medium text-foreground">{f.title}</strong>
                        <span className="text-xs text-muted-foreground">{f.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2">
                  <Button size="lg" className="h-11 w-full" onClick={signUp}>Criar conta grátis<ArrowRight aria-hidden="true" /></Button>
                  <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" className="mx-auto block w-36" aria-label="Baixar o Dr. Exame no Google Play (abre em nova aba)">
                    <img src={asset('playstore-badge.png')} alt="Disponível no Google Play" width={155} height={46} loading="lazy" decoding="async" className="block h-auto w-full" />
                  </a>
                  <span className="text-center text-xs text-muted-foreground">O que você montou aqui já aparece no Radar do app ao entrar por este navegador.</span>
                </div>
              </FramePanel>
            </Frame>
          </aside>
        </div>

        {/* ───────── Cada composto explicado ───────── */}
        <section aria-labelledby="compostos" data-reveal className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-1.5">
            <h2 id="compostos" className="m-0 text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">Entenda cada composto antes de simular</h2>
            <p className="m-0 text-sm leading-relaxed text-muted-foreground sm:text-base">Toque em um composto para ler, sem termo difícil, o que ele é, o que faz no corpo e por que as pessoas usam.</p>
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {RADAR_COMPOUNDS.map((comp) => (
              <li key={comp.id}>
                <button
                  type="button" onClick={() => { touch(); setExplainId(comp.id); }}
                  className="flex h-full w-full cursor-pointer flex-col items-start gap-2 rounded-xl border border-solid border-border bg-card p-3 text-start text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
                >
                  <CompoundIcon comp={comp} className="size-14 rounded-xl" />
                  <span className="text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{comp.name}</span>
                  <span className="text-xs text-muted-foreground">{comp.isOral ? 'Comprimido' : 'Injetável'} · {durationLabel(comp)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ───────── O que muda com os exames ───────── */}
        <section aria-labelledby="com-exames" data-reveal className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-1.5">
            <h2 id="com-exames" className="m-0 text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">A curva mostra o hormônio. Os exames mostram você.</h2>
            <p className="m-0 text-sm leading-relaxed text-muted-foreground sm:text-base">Duas pessoas com o mesmo protocolo têm exames diferentes. Veja o que aparece quando você envia os seus (PDF ou foto do laudo).</p>
          </div>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
            {[
              { img: 'radar-momento', h: 923, title: 'Em que ponto você colheu', text: 'O app marca a data da coleta na curva e diz se foi perto do pico ou do vale.' },
              { img: 'radar-exames', h: 1440, title: 'O que o protocolo mexe em você', text: 'Cada exame com o seu valor, a faixa do laudo e a evolução desde o início.' },
              { img: 'radar-consulta', h: 923, title: 'O que perguntar ao médico', text: 'Perguntas montadas a partir dos seus resultados, prontas para imprimir.' },
            ].map((c) => (
              <li key={c.img} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="h-64 overflow-hidden border-0 border-b border-solid border-border bg-muted">
                  <img src={asset(`showcase/${c.img}.webp`)} alt="" width={720} height={c.h} loading="lazy" decoding="async" className="block h-auto w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:transition-none" />
                </div>
                <div className="flex flex-col gap-1 px-4 py-3">
                  <h3 className="m-0 text-base font-semibold text-foreground">{c.title}</h3>
                  <p className="m-0 text-sm text-muted-foreground">{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-11" onClick={signUp}>Criar conta e enviar meu exame<ArrowRight aria-hidden="true" /></Button>
            <span className="text-sm text-muted-foreground">Grátis para começar. Telas com dados de demonstração.</span>
          </div>
        </section>

        {/* ───────── Dúvidas ───────── */}
        <section aria-labelledby="duvidas" data-reveal className="flex max-w-3xl flex-col gap-3">
          <h2 id="duvidas" className="m-0 text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">Dúvidas comuns</h2>
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  <h3 className="m-0 text-sm font-medium">{f.q}</h3>
                  <Plus aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-45 motion-reduce:transition-none" />
                </summary>
                <p className="m-0 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            Conteúdo educativo. Hormônios são medicamentos de uso controlado no Brasil; o Dr. Exame não indica dose, não vende nada e não substitui consulta médica.
          </p>
        </section>
      </div>

        {/* ───────── Fechamento ───────── */}
        <section data-reveal aria-labelledby="fechamento" className="dark relative overflow-hidden bg-background text-foreground">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(50rem_24rem_at_85%_120%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]" />
          <div className="relative mx-auto flex w-full max-w-[1180px] flex-col items-start gap-5 px-4 pt-12 pb-28 sm:items-center sm:pb-14 sm:text-center">
            <h2 id="fechamento" className="m-0 max-w-2xl text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl">Simule de graça. <span className="text-primary">Acompanhe de verdade.</span></h2>
            <p className="m-0 max-w-xl text-base leading-relaxed text-muted-foreground">Envie o PDF ou a foto do seu exame e veja o que o protocolo está fazendo no seu corpo, com a faixa do seu laudo.</p>
            <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Button size="lg" className="h-12 px-5 text-base" onClick={signUp}>Criar conta grátis<ArrowRight aria-hidden="true" /></Button>
              <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" className="mx-auto block w-40 sm:mx-0" aria-label="Baixar o Dr. Exame no Google Play (abre em nova aba)">
                <img src={asset('playstore-badge.png')} alt="Disponível no Google Play" width={155} height={46} loading="lazy" decoding="async" className="block h-auto w-full" />
              </a>
            </div>
            <nav aria-label="Rodapé" className="flex flex-wrap gap-x-5 gap-y-2 pt-4 text-sm">
              <a href="#/landing" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Conheça o Dr. Exame</a>
              <a href="#/saude-esportiva" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Saúde esportiva</a>
              <a href={asset('termos')} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Termos</a>
              <a href={asset('privacidade')} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Privacidade</a>
            </nav>
          </div>
        </section>
      </main>

      {/* ───────── Ação fixa no celular ───────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-0 border-t border-solid border-border bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
        <Button size="lg" className="h-11 w-full" onClick={signUp}>Cruzar com os meus exames<ArrowRight aria-hidden="true" /></Button>
      </div>

      <CompoundDialog compoundId={explainId} onClose={() => setExplainId(null)} onSignUp={signUp} />
    </div>
  );
}
