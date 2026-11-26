/**
 * panoramaPresenter — as FRASES do "Panorama da sua saúde" (tela /relatorio).
 *
 * O servidor (GET /patients/:id/panorama) devolve FATOS: valores, datas, séries e o estado de
 * cada área. Aqui eles viram o modelo pronto para a tela: herói, "o que mudou", azulejos,
 * "para completar" e os cartões do modo história. Lógica PURA (sem React) — testada em
 * panoramaPresenter.test.ts — e todo texto passa pela função de tradução recebida.
 *
 * Regras que este arquivo guarda (design system + fatores humanos, IEC 62366):
 *  - NENHUM dado de saúde aparece sem dizer de quando é: toda área com dado leva `age`.
 *  - Dado antigo (`status: 'stale'`) nunca parece atual: tom neutro + pílula "dado de há X".
 *  - `missing` vira convite ("Para completar"); `unavailable` vira aviso discreto com "Tentar de novo".
 *  - Fora da faixa = cor + um segundo sinal (texto "acima/abaixo", seta ↑/↓).
 *  - Estimativa é chamada de estimativa; saúde mental é sempre "rastreio, não diagnóstico".
 *  - Sem dado para uma frase (série curta, média nula) → a frase simplesmente não existe.
 *  - Nada aqui classifica resultado por conta própria: a faixa vem do dado; a prioridade de um
 *    valor alterado vem da régua única do app (`priorityOf`), a mesma de Valores alterados.
 */
import type {
  PanoramaResponse, PanoramaKey, PanoramaStatus, PanoramaArea, PanoramaChange,
  PanoramaExamsData, PanoramaExamValue, PanoramaRef, PanoramaHeartData, PanoramaWeightData,
  PanoramaBodyCompData, PanoramaHormonesData, PanoramaMindData, PanoramaDiaryData,
  PanoramaVitalityData, PanoramaMetric, PanoramaMedsData, PanoramaCareData, PanoramaVaccinesData,
  PanoramaSeriesPoint, PanoramaScreening,
} from '@meus-exames/shared';
import { describeRecency } from '@/components/charts/recency';
import { priorityOf } from './alertPriority';

/** A função de tradução do react-admin (`useTranslate()`): recebe a chave e as variáveis. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
export type Locale = 'pt' | 'en';
/** As 12 áreas do panorama — as mesmas chaves do contrato (`@meus-exames/shared`). */
export type { PanoramaKey };

// ───────────────────────── idade do dado ─────────────────────────
export interface Age {
  /** 'date' conta em DIAS DE CALENDÁRIO (exame, medição): hoje · ontem · há N dias…
   *  'time' conta o relógio (sincronização, atualização): agora · há N h · há N dias… */
  kind: 'date' | 'time';
  /** Dias desde a data; null = sem data, data inválida ou no futuro. */
  days: number | null;
  /** Horas cheias desde o instante — só em 'time', com menos de 24 h. */
  hours: number | null;
}

const NO_AGE = (kind: Age['kind']): Age => ({ kind, days: null, hours: null });

/** "2026-11-26" (só data) é lido como dia LOCAL — `new Date("2026-11-26")` trata como meia-noite UTC
 *  e, no Brasil, viraria o dia anterior. Com hora, o parse é o normal. */
const parseDate = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Dias de calendário entre a data e hoje (negativo = futuro); null sem data válida. */
const calendarDays = (iso: string | null | undefined, now: number): number | null => {
  const d = iso ? parseDate(iso) : null;
  const r = d ? describeRecency(d, { now }) : null;
  return r ? r.days : null;
};

/** Idade de um dado datado (dias de calendário), pela mesma régua dos gráficos do app. */
export function dateAge(iso: string | null | undefined, now: number = Date.now()): Age {
  const days = calendarDays(iso, now);
  return days == null || days < 0 ? NO_AGE('date') : { kind: 'date', days, hours: null };
}

/** Idade de um instante (relógio): "agora", "há 2 h", "há 3 dias". */
export function timeAge(iso: string | null | undefined, now: number = Date.now()): Age {
  const d = iso ? parseDate(iso) : null;
  if (!d) return NO_AGE('time');
  const elapsed = now - d.getTime();
  if (elapsed < 0) return NO_AGE('time');
  const days = Math.floor(elapsed / 86_400_000);
  if (elapsed < 86_400_000) return { kind: 'time', days, hours: Math.floor(elapsed / 3_600_000) };
  return { kind: 'time', days, hours: null };
}

const monthsBare = (n: number, t: Translate) => t('panorama.age.months_n', { smart_count: n });
const yearsBare = (n: number, t: Translate) => t('panorama.age.years_n', { smart_count: n });

/** Duração sem o "há": "12 dias", "6 meses", "1 ano e 2 meses" — para períodos ("em 6 meses").
 *  Mesma régua do `timeAgo` de utils/format.ts: menos de 30 dias em dias; depois meses de 30 dias. */
export function spanText(days: number, t: Translate): string {
  if (days < 30) return t('panorama.age.days_n', { smart_count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return monthsBare(months, t);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest
    ? t('panorama.age.years_months_n', { years: yearsBare(years, t), months: monthsBare(rest, t) })
    : yearsBare(years, t);
}

/** O texto da idade: "hoje", "ontem", "há 5 dias", "há 2 meses", "há 1 ano e 2 meses". Vazio sem data. */
export function ageText(age: Age | null | undefined, t: Translate): string {
  if (!age || age.days == null) return '';
  if (age.kind === 'time' && age.hours != null) {
    if (age.hours < 1) return t('panorama.age.now');
    return t('panorama.age.hours', { smart_count: age.hours });
  }
  const d = age.days;
  if (d === 0) return t('panorama.age.today');
  if (d === 1) return t('panorama.age.yesterday');
  if (d < 30) return t('panorama.age.days', { smart_count: d });
  const months = Math.floor(d / 30);
  if (months < 12) return t('panorama.age.months', { smart_count: months });
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest
    ? t('panorama.age.years_months', { years: yearsBare(years, t), months: monthsBare(rest, t) })
    : t('panorama.age.years', { smart_count: years });
}

// ───────────────────────── modelo ─────────────────────────
export type TickState = 'on' | 'warn' | 'stale' | 'off';

export interface HeroModel {
  score: number | null;
  /** Mesmo rótulo do herói da Home (`statusFromScore` do DashboardV2). */
  verdict: string;
  outOfRange: number | null;
  inRange: number | null;
  /** "O que mais puxa o placar para baixo:" — os nomes vão em `pullDown`. Vazio quando nada puxa. */
  pullLead: string;
  pullDown: string[];
  /** "O que segura: os outros N resultados na faixa." */
  holds: string;
  /** "Nada puxa o placar para baixo…" — só quando tudo está na faixa. */
  nothingPulls: string;
  /** Convite quando ainda não existe placar. */
  noScoreText: string;
  scoreSource: string;
  newest: { area: string; when: string } | null;
  oldest: { area: string; when: string } | null;
  filled: number;
  total: number;
  ticks: TickState[];
}

export interface Band { tone: Tone; label: string }
export interface StoryRow { name: string; detail: string; value: string; tone: Tone; arrow: 'up' | 'down' | null }

export type StoryCard =
  | { kind: 'number'; eyebrow: string; big: string; unit: string; band: Band | null; text: string; spark?: { points: number[]; tone: Tone; label: string } | null }
  | { kind: 'line'; eyebrow: string; points: number[]; ref: [number, number] | null; unit: string; x: [string, string]; /** "Último resultado" — a idade vem em `lastAge`. */ lastLead: string; lastAge: Age; text: string }
  | { kind: 'bars'; eyebrow: string; values: number[]; labels: string[]; lastLead: string; lastAge: Age; text: string }
  | { kind: 'list'; eyebrow: string; rows: StoryRow[]; text: string }
  | { kind: 'crisis'; title: string; text: string; call: string; chat: string; urgent: string; support: string }
  | { kind: 'step'; title: string; text: string; cta: string; to: string }
  | { kind: 'end'; eyebrow: string; title: string; text: string };

export interface AreaTileModel {
  key: PanoramaKey;
  name: string;
  status: PanoramaStatus;
  tone: Tone;
  big: string;
  unit: string;
  /** Parte da data já formatada ("exame de 21 nov", "medido", "PHQ-9"). */
  whenLead: string;
  /** Como a data se junta à idade: "exame de 21 nov · há 5 dias", "medido há 2 dias" ou sozinha. */
  whenJoin: 'dot' | 'space' | 'none';
  asOf: string | null;
  age: Age;
  /** O "de quando" pronto: "exame de 21 nov · há 5 dias". */
  when: string;
  pill: string;
  stale: boolean;
  spark: number[];
  sparkTone: Tone;
  /** Frase por área, para os cartões do computador. */
  take: string;
  /** Saúde mental: todo cartão repete "rastreio, não diagnóstico". */
  screeningNote: boolean;
  crisis: boolean;
  story: StoryCard[];
  ariaLabel: string;
}

export interface ChangeCardModel {
  key: PanoramaKey;
  area: string;
  title: string;
  sub: string;
  before: string;
  after: string;
  unit: string;
  whenLead: string;
  whenJoin: 'dot' | 'space';
  age: Age;
  at: string;
  tone: Tone;
}

export interface TodoModel { key: PanoramaKey; name: string; why: string; cta: string; to: string }
export interface UnavailableModel { key: PanoramaKey; name: string }

export interface PanoramaModel {
  generatedAt: string | null;
  generatedAge: Age;
  filled: number;
  total: number;
  hero: HeroModel;
  changes: ChangeCardModel[];
  tiles: AreaTileModel[];
  todo: TodoModel[];
  unavailable: UnavailableModel[];
  end: { eyebrow: string; title: string; text: string };
}

/** O que o apresentador lê do resumo de saúde (GET /patients/:id/health-summary). */
export interface HealthSummaryLike {
  score?: number | null;
  markers?: number | null;
  byPriority?: { normal?: number; leve?: number; moderada?: number; importante?: number } | null;
  topAttention?: { name?: string | null }[] | null;
}

export interface PresenterOptions {
  t: Translate;
  locale?: Locale;
  now?: number;
}

// ───────────────────────── utilidades ─────────────────────────
/** Ordem fixa das 12 áreas do panorama. */
export const AREA_ORDER: PanoramaKey[] = ['exams', 'heart', 'weight', 'bodyComp', 'hormones', 'mind', 'diary', 'vitality', 'meds', 'care', 'vaccines', 'emergency'];

const MONTHS: Record<Locale, string[]> = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "21 nov" (pt) · "Nov 21" (en) — sem depender do ICU do aparelho. */
export const shortDate = (iso: string | null | undefined, locale: Locale = 'pt'): string => {
  const d = iso ? parseDate(iso) : null;
  if (!d) return '';
  return locale === 'en' ? `${MONTHS.en[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS.pt[d.getMonth()]}`;
};
const fullDate = (iso: string | null | undefined, locale: Locale): string => {
  const d = iso ? parseDate(iso) : null;
  if (!d) return '';
  return locale === 'en' ? `${MONTHS.en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const dayNum = (iso: string): string => {
  const d = parseDate(iso);
  return d ? String(d.getDate()) : '';
};
const monthShort = (iso: string, locale: Locale): string => {
  const d = parseDate(iso);
  return d ? MONTHS[locale][d.getMonth()] : '';
};
/** "14h30" (pt) · "2:30 PM" (en). */
const clock = (iso: string, locale: Locale): string => {
  const d = parseDate(iso);
  if (!d) return '';
  if (locale === 'en') {
    const h = d.getHours();
    return `${((h + 11) % 12) + 1}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return `${d.getHours()}h${pad2(d.getMinutes())}`;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const lastOf = <T,>(xs: T[]): T | undefined => (xs.length ? xs[xs.length - 1] : undefined);
const MINUS = '−';
/** "+0,8 kg" / "−1,4 kg" — sinal sempre explícito numa variação. */
const signed = (n: number, text: string) => (n < 0 ? `${MINUS}${text}` : `+${text}`);
const unique = <T,>(xs: T[]): T[] => Array.from(new Set(xs));
/** "7h12" — horas e minutos de sono. */
const hms = (minutes: number) => `${Math.floor(minutes / 60)}h${pad2(Math.round(minutes % 60))}`;

const formatters = new Map<string, Intl.NumberFormat>();
interface Ctx { t: Translate; locale: Locale; now: number; bodyCompMissing: boolean }
/** Número no formato do idioma, com teto de casas: 41 → "41"; 0,45 → "0,45". */
const fmt = (c: Ctx, v: number, maxDec = 2): string => {
  const k = `${c.locale}:${maxDec}`;
  let f = formatters.get(k);
  if (!f) {
    f = new Intl.NumberFormat(c.locale === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: maxDec });
    formatters.set(k, f);
  }
  return f.format(v);
};
const int = (c: Ctx, v: number) => fmt(c, v, 0);

/** "LDL, ferritina e VCM" (pt) · "LDL, ferritin, and VCM" (en). */
export const joinNames = (names: string[], t: Translate): string => {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  const and = t('panorama.common.and');
  const head = list.slice(0, -1).join(', ');
  const last = list[list.length - 1];
  const oxford = t('panorama.common.list_style') === 'oxford';
  return list.length > 2 && oxford ? `${head}, ${and} ${last}` : `${head} ${and} ${last}`;
};

// ───────────────────────── helpers de série ─────────────────────────
const cleanSeries = (pts: PanoramaSeriesPoint[] | null | undefined): PanoramaSeriesPoint[] =>
  arr<PanoramaSeriesPoint>(pts).filter((x) => x && num(x.v) != null && !!x.at);

/** Dias de calendário de a até b (b mais recente → negativo); null sem par válido. */
const daysBetween = (a: string | null | undefined, b: string | null | undefined, now: number): number | null => {
  const da = calendarDays(a, now), db = calendarDays(b, now);
  return da == null || db == null ? null : da - db;
};

/** Frase de tendência do primeiro para o último ponto — só com ≥2 pontos e mudança real.
 *  `unit` vem com o espaço em branco à frente quando existe (" mmHg"). */
const trendText = (c: Ctx, values: number[], firstAt: string, lastAt: string, up: string, down: string, unit = ''): string => {
  if (values.length < 2) return '';
  const span = daysBetween(firstAt, lastAt, c.now);
  if (span == null) return '';
  const period = spanText(span, c.t);
  const delta = values[values.length - 1] - values[0];
  if (Math.abs(delta) < 1e-9) return c.t('panorama.trend.stable', { period });
  const d = fmt(c, Math.abs(delta), 1);
  return delta > 0 ? c.t(up, { d, unit, period }) : c.t(down, { d, unit, period });
};

const lineCard = (c: Ctx, p: { eyebrow: string; pts: PanoramaSeriesPoint[]; ref: [number, number] | null; unit: string; lastLead: string; text: string }): StoryCard | null => {
  const pts = cleanSeries(p.pts);
  if (pts.length < 2) return null;
  const lastAt = pts[pts.length - 1].at;
  return {
    kind: 'line', eyebrow: p.eyebrow, points: pts.map((x) => x.v as number), ref: p.ref, unit: p.unit,
    x: [shortDate(pts[0].at, c.locale), shortDate(lastAt, c.locale)],
    lastLead: p.lastLead, lastAge: dateAge(lastAt, c.now), text: p.text,
  };
};

const barsCard = (c: Ctx, p: { eyebrow: string; values: number[]; labels: string[]; lastAt: string | null; lastLead: string; text: string }): StoryCard | null => {
  if (p.values.length < 2 || p.values.length !== p.labels.length) return null;
  return { kind: 'bars', eyebrow: p.eyebrow, values: p.values, labels: p.labels, lastLead: p.lastLead, lastAge: dateAge(p.lastAt, c.now), text: p.text };
};

// ───────────────────────── helpers de área ─────────────────────────
type Area<T> = PanoramaArea<T>;
type Build = (a: Area<unknown>, c: Ctx) => AreaTileModel | null;
interface TileParts {
  tone: Tone; big: string; unit: string; whenLead: string; whenJoin: 'dot' | 'space' | 'none';
  asOf: string | null; age: Age; pill: string; spark: number[]; sparkTone: Tone; take: string; story: StoryCard[];
  crisis?: boolean;
}

/** A área existe no payload? (contrato antigo, sem a chave → "não foi possível carregar"). */
const areaOf = (p: PanoramaResponse, key: PanoramaKey): Area<unknown> | null => {
  const a = (p as unknown as Record<string, unknown> | null)?.[key] as Area<unknown> | null | undefined;
  return a && typeof a === 'object' ? a : null;
};

const refText = (c: Ctx, ref: PanoramaRef | null | undefined): string => {
  if (!ref) return '';
  const lo = num(ref.low), hi = num(ref.high);
  if (lo != null && hi != null) return c.t('panorama.ref.between', { low: fmt(c, lo), high: fmt(c, hi) });
  if (hi != null) return c.t('panorama.ref.below', { high: fmt(c, hi) });
  if (lo != null) return c.t('panorama.ref.above', { low: fmt(c, lo) });
  return ref.text ? c.t('panorama.ref.as_written', { ref: ref.text }) : '';
};

/** Linha de um valor fora da faixa: seta ↑/↓ + cor + texto da referência (nunca só a cor). */
const examRow = (c: Ctx, v: PanoramaExamValue): StoryRow => {
  const flag = (v.flag || '').toUpperCase();
  const lo = num(v.ref?.low), hi = num(v.ref?.high), n = num(v.valueNumeric);
  let arrow: 'up' | 'down' | null = flag === 'HIGH' ? 'up' : flag === 'LOW' ? 'down' : null;
  if (!arrow && n != null) {
    if (hi != null && n > hi) arrow = 'up';
    else if (lo != null && n < lo) arrow = 'down';
  }
  const shown = v.valueText && String(v.valueText).toLowerCase() !== 'null' ? String(v.valueText) : n != null ? fmt(c, n) : '—';
  const prio = priorityOf({ flag: v.flag, valueNumeric: n, refLow: lo, refHigh: hi, name: v.name, nameCanonical: v.nameCanonical });
  return {
    name: v.name || c.t('panorama.common.result'), detail: refText(c, v.ref),
    value: [shown, v.unit].filter(Boolean).join(' '),
    tone: prio === 'importante' ? 'bad' : 'warn', arrow,
  };
};

/** Pílula de "em dia" ou de "vale conversar com seu médico", pelo status que o servidor deu. */
const statusPill = (c: Ctx, status: PanoramaStatus): { tone: Tone; pill: string } =>
  status === 'attention' ? { tone: 'warn', pill: c.t('panorama.status.talk_to_doctor') } : { tone: 'ok', pill: c.t('panorama.status.in_day') };

/** Rótulo + idade do dado: "Pressão arterial · há 2 dias". Sem data válida fica só o rótulo —
 *  nunca um separador pendurado (ex.: cartão de emergência, cujo `asOf` vem null). */
const dated = (c: Ctx, label: string, age: Age): string => [label, ageText(age, c.t)].filter(Boolean).join(' · ');

/** Fecha o azulejo com o que é igual em todas as áreas — inclusive a regra do dado antigo. */
const finishTile = (c: Ctx, key: PanoramaKey, status: PanoramaStatus, p: TileParts): AreaTileModel => {
  const name = c.t(`panorama.area.${key}`);
  const stale = status === 'stale';
  const age = ageText(p.age, c.t);
  const when = [p.whenLead, p.whenJoin === 'none' ? '' : age].filter(Boolean).join(p.whenJoin === 'dot' ? ' · ' : ' ');
  const staleLabel = c.t('panorama.age.stale_pill', { age: age || c.t('panorama.common.old_data') });
  // Dado antigo: tom neutro, pílula "dado de há X" e o mesmo aviso no lugar da faixa do cartão de número.
  const story: StoryCard[] = stale
    ? p.story.map((s) => (s.kind === 'number' && s.band ? { ...s, band: { tone: 'neutral' as Tone, label: staleLabel } } : s))
    : p.story;
  return {
    key, name, status, stale, tone: stale ? 'neutral' : p.tone,
    big: p.big, unit: p.unit, whenLead: p.whenLead, whenJoin: p.whenJoin, asOf: p.asOf, age: p.age, when,
    pill: stale ? staleLabel : p.pill,
    spark: p.spark, sparkTone: stale ? 'neutral' : p.sparkTone, take: p.take,
    screeningNote: key === 'mind', crisis: !!p.crisis, story,
    ariaLabel: [
      c.t('panorama.a11y.tile', { name, value: [p.big, p.unit].filter(Boolean).join(' '), when: when || c.t('panorama.common.no_date') }),
      stale ? `(${c.t('panorama.a11y.stale')})` : '',
    ].filter(Boolean).join(' '),
  };
};

const PHQ9_MAX = 27;
const GAD7_MAX = 21;

const stripAcc = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Nome da faixa de um questionário: o do servidor quando veio; senão o nosso, pelos cortes validados. */
const bandName = (c: Ctx, serverLabel: string | null | undefined, total: number, kind: 'phq9' | 'gad7'): { label: string; own: string } => {
  const own = kind === 'phq9'
    ? (total <= 4 ? 'minima' : total <= 9 ? 'leve' : total <= 14 ? 'moderada' : total <= 19 ? 'moderadamente_grave' : 'grave')
    : (total <= 4 ? 'minima' : total <= 9 ? 'leve' : total <= 14 ? 'moderada' : 'grave');
  const ownName = c.t(`panorama.mind.band.${own}`);
  const given = (serverLabel || '').trim();
  // "não realizado" só existe para total null; se aparecer junto de um total, não é a faixa dele.
  return { label: given && !/n[aã]o realizado/i.test(given) ? given : ownName, own: ownName };
};

/** Faixa + intervalo de pontos ("mínima (0 a 4)"). O intervalo só entra quando o nome que o servidor
 *  deu é o mesmo que os cortes validados dão para aquele total — nunca "leve (0 a 4)". */
const bandLabel = (c: Ctx, serverLabel: string | null | undefined, total: number, kind: 'phq9' | 'gad7'): string => {
  const { label, own } = bandName(c, serverLabel, total, kind);
  const range = kind === 'phq9'
    ? (total <= 4 ? [0, 4] : total <= 9 ? [5, 9] : total <= 14 ? [10, 14] : total <= 19 ? [15, 19] : [20, PHQ9_MAX])
    : (total <= 4 ? [0, 4] : total <= 9 ? [5, 9] : total <= 14 ? [10, 14] : [15, GAD7_MAX]);
  const a = stripAcc(label), b = stripAcc(own);
  const agrees = !!a && (b.includes(a) || a.includes(b));
  return agrees ? c.t('panorama.mind.band_with_range', { label, low: range[0], high: range[1] }) : label;
};

/** Diff (média de 7 dias − média de 30 dias) de um hábito → tom, rótulo e tamanho da variação.
 *  Abaixo do piso (5 min de sono, 50 passos) é "média de 7 dias": ruído não vira notícia. */
const habitDiff = (c: Ctx, diff: number | null, kind: 'sleep' | 'steps'): { tone: Tone; label: string; size: string | null } => {
  const t = c.t;
  const flat = { tone: 'ok' as Tone, label: t('panorama.vitality.avg7'), size: null };
  if (diff == null || Math.abs(diff) < (kind === 'sleep' ? 5 : 50)) return flat;
  const size = kind === 'sleep' ? t('panorama.vitality.min_diff', { min: int(c, Math.abs(diff)) }) : t('panorama.vitality.steps_diff', { n: int(c, Math.abs(diff)) });
  return diff > 0
    ? { tone: 'ok', label: t('panorama.vitality.above_avg', { diff: size }), size }
    : { tone: 'warn', label: t('panorama.vitality.below_avg', { diff: size }), size };
};

// ───────────────────────── área por área ─────────────────────────
/** Exames e sangue. */
const examsArea: Build = (a, c) => {
  const d = a.data as PanoramaExamsData | null;
  if (!d) return null;
  const last = d.lastExam ?? null;
  const examCount = num(d.examCount) ?? 0;
  const items = Math.max(num(d.itemCount) ?? 0, 0);
  const abnormal = arr<PanoramaExamValue>(d.abnormal).filter((x) => !!x);
  const out = Math.max(num(d.abnormalCount) ?? abnormal.length, 0);
  if (!last && examCount === 0 && items === 0) return null;

  const asOf = last?.performedAt ?? a.asOf;
  const age = dateAge(asOf, c.now);
  const hasCritical = abnormal.some((x) => (x.flag || '').toUpperCase() === 'CRITICAL');
  const tone: Tone = hasCritical ? 'bad' : out > 0 ? 'warn' : 'ok';
  const names = unique(abnormal.map((x) => (x.name || '').trim()).filter(Boolean));
  const perPts = arr<{ at: string; count: number }>(d.abnormalPerExam).filter((x) => x && num(x.count) != null).map((x) => ({ at: x.at, v: x.count as number }));
  const spark = cleanSeries(perPts).map((x) => x.v as number);
  const inn = Math.max(items - out, 0);
  const unit = c.t('panorama.exams.unit');
  const dateShort = shortDate(last?.performedAt, c.locale);

  const story: StoryCard[] = [{
    kind: 'number',
    eyebrow: dated(c, dateShort ? c.t('panorama.exams.story_eyebrow', { date: dateShort }) : c.t('panorama.exams.story_eyebrow_nodate'), age),
    big: String(out), unit,
    band: items > 0 ? { tone, label: c.t('panorama.exams.of_results', { smart_count: items }) } : null,
    text: out > 0
      ? (inn > 0 ? c.t('panorama.exams.others_in', { smart_count: inn }) : c.t('panorama.exams.all_out', { smart_count: items }))
      : (last?.title ? c.t('panorama.exams.all_in_titled', { title: last.title }) : c.t('panorama.exams.all_in')),
    spark: spark.length >= 2 ? { points: spark, tone: out > 0 ? 'warn' : 'ok', label: c.t('panorama.exams.spark_label') } : null,
  }];
  if (abnormal.length) {
    story.push({
      kind: 'list', eyebrow: c.t('panorama.exams.list_eyebrow'), rows: abnormal.map((x) => examRow(c, x)),
      text: hasCritical ? c.t('panorama.exams.list_footer_critical') : c.t('panorama.exams.list_footer'),
    });
  }
  const mean = spark.length ? spark.reduce((s, v) => s + v, 0) / spark.length : null;
  const line = lineCard(c, {
    eyebrow: c.t('panorama.exams.line_eyebrow'), pts: perPts, ref: null, unit: '', lastLead: c.t('panorama.chart.last_exam'),
    text: spark.length >= 2 && mean != null ? c.t('panorama.exams.line_text', { smart_count: spark.length, avg: fmt(c, mean, 1) }) : '',
  });
  if (line) story.push(line);

  const retest = d.retest ?? null;
  const cta = c.t('panorama.exams.cta');
  if (out > 0) {
    story.push({
      kind: 'step', title: abnormal.length === 1 ? c.t('panorama.exams.step_one') : c.t('panorama.exams.step_many'),
      text: c.t('panorama.exams.step_text'), cta, to: '/exams',
    });
  } else if (retest?.dueAt) {
    // Prazo de repetir vem do servidor (mesmo cálculo de GET /retest). Vencido é dito como vencido.
    const ahead = -(calendarDays(retest.dueAt, c.now) ?? 0);
    story.push({
      kind: 'step',
      title: ahead > 0 ? c.t('panorama.exams.step_due', { date: fullDate(retest.dueAt, c.locale) }) : c.t('panorama.exams.step_due_now'),
      text: c.t('panorama.exams.step_due_text'), cta, to: '/exams',
    });
  } else {
    story.push({ kind: 'step', title: c.t('panorama.exams.step_keep'), text: c.t('panorama.exams.step_keep_text'), cta, to: '/exams' });
  }

  return finishTile(c, 'exams', a.status, {
    tone, big: String(out), unit,
    whenLead: dateShort ? c.t('panorama.exams.when', { date: dateShort }) : '', whenJoin: 'dot', asOf, age,
    pill: out > 0
      ? [names.slice(0, 2).join(', '), names.length > 2 ? `+${names.length - 2}` : ''].filter(Boolean).join(' ')
      : c.t('panorama.exams.pill_all_in'),
    spark, sparkTone: out > 0 ? 'warn' : 'ok',
    take: out > 0
      ? (names.length === 1 ? c.t('panorama.exams.take_out_one', { name: names[0] }) : c.t('panorama.exams.take_out_many', { names: joinNames(names.slice(0, 3), c.t) }))
      : (items > 0 ? c.t('panorama.exams.take_all_in', { smart_count: items }) : c.t('panorama.exams.take_none')),
    story,
  });
};

/** Coração e pressão. A faixa da pressão não vem no contrato → o gráfico sai sem faixa. */
const heartArea: Build = (a, c) => {
  const d = a.data as PanoramaHeartData | null;
  if (!d) return null;
  const bp = d.bp && num(d.bp.systolic) != null && num(d.bp.diastolic) != null && d.bp.at ? d.bp : null;
  const series = cleanSeries(d.bpSeries);
  const risk = d.cardioRisk?.label ? String(d.cardioRisk.label) : null;
  const body = d.bodyAge && num(d.bodyAge.estimate) != null ? d.bodyAge : null;
  if (!bp && !body && series.length === 0) return null;

  const asOf = bp?.at ?? a.asOf;
  const age = dateAge(asOf, c.now);
  const { tone, pill } = statusPill(c, a.status);
  const ageLbl = ageText(age, c.t);
  const riskSentence = risk ? c.t('panorama.heart.risk_sentence', { risk }) : '';
  const story: StoryCard[] = [];

  if (bp) {
    story.push({
      kind: 'number', eyebrow: dated(c, c.t('panorama.heart.story_eyebrow'), age),
      big: `${int(c, bp.systolic)}/${int(c, bp.diastolic)}`, unit: 'mmHg', band: { tone, label: pill }, text: c.t('panorama.heart.ref_note'),
    });
  }
  const line = lineCard(c, {
    eyebrow: c.t('panorama.heart.line_eyebrow'), pts: series, ref: null, unit: 'mmHg', lastLead: c.t('panorama.chart.last_measurement'),
    text: trendText(c, series.map((x) => x.v as number), series[0]?.at as string, series[series.length - 1]?.at as string, 'panorama.trend.rose', 'panorama.trend.fell', ' mmHg'),
  });
  if (line) story.push(line);

  if (body) {
    const est = body.estimate as number;
    const chrono = num(body.chronologicalAge);
    const diff = chrono == null ? 0 : Math.round(chrono - est);
    story.push({
      kind: 'number', eyebrow: c.t('panorama.heart.body_age_eyebrow'), big: int(c, est), unit: c.t('panorama.common.years'),
      band: {
        tone: 'ok',
        label: diff === 0 ? c.t('panorama.heart.body_age_same')
          : diff > 0 ? c.t('panorama.heart.body_age_less', { smart_count: diff })
          : c.t('panorama.heart.body_age_more', { smart_count: Math.abs(diff) }),
      },
      text: chrono != null ? c.t('panorama.heart.body_age_text', { age: int(c, chrono) }) : c.t('panorama.heart.body_age_text_no_age'),
    });
  }
  story.push({
    kind: 'step', title: c.t('panorama.heart.step_title'),
    text: [c.t('panorama.heart.step_text'), riskSentence].filter(Boolean).join(' '),
    cta: c.t('panorama.heart.cta'), to: '/medicoes',
  });

  // No azulejo a pressão vai na notação do dia a dia (120/80 → 12/8); no cartão, o valor exato.
  return finishTile(c, 'heart', a.status, {
    tone,
    big: bp ? `${Math.round(bp.systolic / 10)}/${Math.round(bp.diastolic / 10)}` : int(c, (body as NonNullable<PanoramaHeartData['bodyAge']>).estimate),
    unit: bp ? 'mmHg' : c.t('panorama.common.years_est'),
    whenLead: bp ? c.t('panorama.heart.measured') : '', whenJoin: 'space', asOf, age,
    pill: bp || !risk ? pill : c.t('panorama.heart.risk_pill', { risk }),
    spark: series.map((x) => x.v as number), sparkTone: tone,
    take: [bp ? c.t('panorama.heart.take', { age: ageLbl }) : '', riskSentence].filter(Boolean).join(' '),
    story,
  });
};

/** Peso e corpo. */
const weightArea: Build = (a, c) => {
  const d = a.data as PanoramaWeightData | null;
  if (!d) return null;
  const latest = d.latest && num(d.latest.v) != null ? d.latest : null;
  const series = cleanSeries(d.series);
  const lastV = lastOf(series) ? num(lastOf(series)!.v) : null;
  const value = num(latest?.v) ?? lastV;
  if (value == null) return null;

  const asOf = latest?.at ?? lastOf(series)?.at ?? a.asOf;
  const age = dateAge(asOf, c.now);
  const bmi = num(d.bmi);
  const values = series.map((x) => x.v as number);
  const delta = values.length >= 2 ? values[values.length - 1] - values[0] : null;
  const lastAt = lastOf(series)?.at ?? null;
  const span = series.length >= 2 ? daysBetween(series[0].at, lastAt, c.now) : null;
  const changed = delta != null && span != null && Math.abs(delta) >= 0.05;
  const months = span == null ? 0 : Math.floor(span / 30);
  const withRate = changed && months >= 1;
  const deltaLbl = delta == null ? '' : signed(delta, fmt(c, Math.abs(delta), 1));
  const tone: Tone = a.status === 'attention' ? 'warn' : 'ok';
  const valueLbl = fmt(c, value, 1);
  const period = span != null ? spanText(span, c.t) : '';

  const pill = withRate
    ? c.t('panorama.weight.delta', { delta: deltaLbl, period })
    : (bmi != null ? c.t('panorama.weight.bmi', { bmi: fmt(c, bmi, 1) }) : c.t('panorama.status.recorded'));
  const take = withRate
    ? ((delta as number) < 0
      ? c.t('panorama.weight.take_down', { rate: fmt(c, Math.abs(delta as number) / months, 2) })
      : c.t('panorama.weight.take_up', { rate: fmt(c, (delta as number) / months, 2) }))
    : (delta == null ? c.t('panorama.weight.take_single', { value: valueLbl }) : c.t('panorama.weight.take_stable', { value: valueLbl }));

  const story: StoryCard[] = [{
    kind: 'number', eyebrow: dated(c, c.t('panorama.weight.story_eyebrow'), age),
    big: valueLbl, unit: 'kg',
    band: bmi != null ? { tone, label: c.t('panorama.weight.bmi_band', { bmi: fmt(c, bmi, 1) }) } : null,
    text: withRate
      ? ((delta as number) < 0
        ? c.t('panorama.weight.less', { delta: fmt(c, Math.abs(delta as number), 1), period })
        : c.t('panorama.weight.more', { delta: fmt(c, Math.abs(delta as number), 1), period }))
      : '',
  }];
  const line = lineCard(c, {
    eyebrow: c.t('panorama.weight.line_eyebrow'), pts: series, ref: null, unit: 'kg', lastLead: c.t('panorama.chart.last_record'),
    text: withRate ? take : '',
  });
  if (line) story.push(line);
  story.push(c.bodyCompMissing
    ? { kind: 'step', title: c.t('panorama.weight.step_missing_title'), text: c.t('panorama.weight.step_missing_text'), cta: c.t('panorama.weight.step_missing_cta'), to: '/composicao' }
    : { kind: 'step', title: c.t('panorama.weight.step_title'), text: c.t('panorama.weight.step_text'), cta: c.t('panorama.weight.step_cta'), to: '/medicoes' });

  return finishTile(c, 'weight', a.status, {
    tone, big: valueLbl, unit: 'kg', whenLead: '', whenJoin: 'space', asOf, age, pill,
    spark: values, sparkTone: 'ok', take, story,
  });
};

/** Composição corporal. Músculo vem em % quando a avaliação tem peso; senão em kg, como o aparelho mediu. */
const bodyCompArea: Build = (a, c) => {
  const d = a.data as PanoramaBodyCompData | null;
  const at = d?.latest?.at ?? null;
  const fat = num(d?.latest?.bodyFatPct), musclePct = num(d?.latest?.skeletalMusclePct), muscleKg = num(d?.latest?.skeletalMuscleKg);
  if (!at || (fat == null && musclePct == null && muscleKg == null)) return null;
  const age = dateAge(at, c.now);
  const { tone, pill } = statusPill(c, a.status);
  const fatUnit = c.t('panorama.bodyComp.fat_unit');
  const muscle = musclePct != null
    ? { big: fmt(c, musclePct, 1), unit: c.t('panorama.bodyComp.muscle_unit'), text: c.t('panorama.bodyComp.muscle_text'), take: c.t('panorama.bodyComp.take_muscle', { muscle: fmt(c, musclePct, 1) }) }
    : muscleKg != null
      ? { big: fmt(c, muscleKg, 1), unit: c.t('panorama.bodyComp.muscle_kg_unit'), text: c.t('panorama.bodyComp.muscle_kg_text'), take: c.t('panorama.bodyComp.take_muscle_kg', { kg: fmt(c, muscleKg, 1) }) }
      : null;
  // Sem gordura medida, o músculo é o primeiro número (e leva a pílula de estado).
  const story: StoryCard[] = [];
  let head: { big: string; unit: string } | null = null;
  if (fat != null) {
    const fatLbl = fmt(c, fat, 1);
    head = { big: fatLbl, unit: fatUnit };
    story.push({ kind: 'number', eyebrow: dated(c, c.t('panorama.bodyComp.story_eyebrow'), age), big: fatLbl, unit: fatUnit, band: { tone, label: pill }, text: c.t('panorama.bodyComp.fat_text') });
  }
  if (muscle) {
    const first = story.length === 0;
    if (first) head = { big: muscle.big, unit: muscle.unit };
    story.push({ kind: 'number', eyebrow: dated(c, c.t('panorama.bodyComp.muscle_eyebrow'), age), big: muscle.big, unit: muscle.unit, band: first ? { tone, label: pill } : null, text: muscle.text });
  }
  story.push({ kind: 'step', title: c.t('panorama.bodyComp.step_title'), text: c.t('panorama.bodyComp.step_text'), cta: c.t('panorama.bodyComp.cta'), to: '/composicao' });
  return finishTile(c, 'bodyComp', a.status, {
    tone, big: head?.big ?? '—', unit: head?.unit ?? fatUnit,
    whenLead: c.t('panorama.bodyComp.measured'), whenJoin: 'space', asOf: at, age, pill, spark: [], sparkTone: tone,
    take: [fat != null ? c.t('panorama.bodyComp.take_fat', { fat: fmt(c, fat, 1) }) : '', muscle ? muscle.take : ''].filter(Boolean).join(' '),
    story,
  });
};

type Marker = NonNullable<PanoramaHormonesData['markers']>[number];

const shortMarker = (c: Ctx, key: string | null | undefined, fallback: string): string => {
  if (key === 'VITAMIN_D') return c.t('panorama.hormones.vitd');
  if (key === 'TSH') return 'TSH';
  if (key === 'T4_FREE') return c.t('panorama.hormones.t4free');
  return fallback;
};
const markerValue = (c: Ctx, m: Marker): string =>
  (m.valueText && String(m.valueText).toLowerCase() !== 'null' ? String(m.valueText) : m.valueNumeric != null ? fmt(c, m.valueNumeric) : '—');

/** Hormônios e vitaminas. */
const hormonesArea: Build = (a, c) => {
  const d = a.data as PanoramaHormonesData | null;
  if (!d) return null;
  const markers = arr<Marker>(d.markers).filter((m) => m && markerValue(c, m) !== '—');
  if (!markers.length) return null;

  // Liderança do azulejo: primeiro um marcador fora da faixa; senão o medido mais recentemente; senão o primeiro.
  const daysOf = (m: Marker) => (m.at ? dateAge(m.at, c.now).days ?? Infinity : Infinity);
  const byDate = [...markers].sort((x, y) => daysOf(x) - daysOf(y));
  const lead = markers.find((m) => m.status === 'high' || m.status === 'low') ?? byDate[0];
  const second = markers.find((m) => m !== lead);
  const asOf = lead.at ?? a.asOf;
  const age = dateAge(asOf, c.now);
  const short = shortMarker(c, lead.key, lead.name);
  const lo = num(lead.ref?.low), hi = num(lead.ref?.high);
  const leadOut = lead.status === 'high' ? c.t('panorama.band.above') : c.t('panorama.band.below');

  const inRange = (m: Marker) => {
    const ml = num(m.ref?.low), mh = num(m.ref?.high);
    return ml != null && mh != null ? c.t('panorama.band.in_range', { low: fmt(c, ml), high: fmt(c, mh) }) : c.t('panorama.band.in_range_short');
  };
  /** Ponto anterior da série e se o marcador ENTROU na faixa (o anterior estava fora dela, pelos números). */
  const before = (m: Marker): { prev: number | null; entered: boolean } => {
    const vals = cleanSeries(m.series).map((x) => x.v as number);
    const prev = vals.length >= 2 ? vals[vals.length - 2] : null;
    const ml = num(m.ref?.low), mh = num(m.ref?.high);
    const entered = m.status === 'in' && prev != null && ((ml != null && prev < ml) || (mh != null && prev > mh));
    return { prev, entered };
  };
  const numberCard = (m: Marker, name: string): StoryCard => {
    const { prev, entered } = before(m);
    const ml = num(m.ref?.low), mh = num(m.ref?.high);
    return {
      kind: 'number', eyebrow: dated(c, name, dateAge(m.at ?? asOf, c.now)),
      big: markerValue(c, m), unit: m.unit ?? '',
      band: m.status === 'high' ? { tone: 'warn', label: c.t('panorama.band.above') }
        : m.status === 'low' ? { tone: 'warn', label: c.t('panorama.band.below') }
        : entered && ml != null && mh != null ? { tone: 'ok', label: c.t('panorama.band.entered', { low: fmt(c, ml), high: fmt(c, mh) }) }
        : { tone: 'ok', label: inRange(m) },
      text: prev != null ? c.t('panorama.hormones.prev_value', { value: fmt(c, prev) }) : '',
    };
  };

  const leadSeries = cleanSeries(lead.series);
  const leadVals = leadSeries.map((x) => x.v as number);
  const leadBefore = before(lead);
  const story: StoryCard[] = [numberCard(lead, short)];
  const line = lineCard(c, {
    eyebrow: short, pts: leadSeries, ref: lo != null && hi != null ? [lo, hi] : null, unit: lead.unit ?? '', lastLead: c.t('panorama.chart.last_result'),
    text: trendText(c, leadVals, leadSeries[0]?.at as string, leadSeries[leadSeries.length - 1]?.at as string, 'panorama.trend.rose', 'panorama.trend.fell', lead.unit ? ` ${lead.unit}` : ''),
  });
  if (line) story.push(line);
  if (second) story.push(numberCard(second, shortMarker(c, second.key, second.name)));
  story.push(d.radarInUse
    ? { kind: 'step', title: c.t('panorama.hormones.step_radar_title'), text: c.t('panorama.hormones.step_radar_text'), cta: c.t('panorama.hormones.step_radar_cta'), to: '/radar-hormonal' }
    : { kind: 'step', title: c.t('panorama.hormones.step_title'), text: c.t('panorama.hormones.step_text'), cta: c.t('panorama.hormones.step_cta'), to: '/evolucao' });

  const inLead = lead.status === 'in';
  return finishTile(c, 'hormones', a.status, {
    tone: inLead ? 'ok' : 'warn', big: markerValue(c, lead), unit: lead.unit ?? '',
    whenLead: short, whenJoin: 'dot', asOf, age,
    pill: inLead
      ? (leadBefore.prev != null ? c.t('panorama.hormones.before', { value: fmt(c, leadBefore.prev) }) : c.t('panorama.band.in_range_short'))
      : leadOut,
    spark: leadVals, sparkTone: inLead ? 'ok' : 'warn',
    take: inLead
      ? (leadBefore.entered ? c.t('panorama.hormones.take_entered', { name: short }) : c.t('panorama.hormones.take_in', { name: short, band: inRange(lead) }))
      : c.t('panorama.hormones.take_out', { name: short, dir: leadOut }),
    story,
  });
};

/** Mente e humor — SEMPRE rastreio, nunca diagnóstico.
 *  PHQ-9 e GAD-7 são independentes: só existe número e frase para o questionário respondido
 *  (null = nunca respondeu; nunca vira "0", que diria "sem sintomas"). Cada um tem a própria data. */
const mindArea: Build = (a, c) => {
  const d = a.data as PanoramaMindData | null;
  const latest = d?.latest ?? null;
  if (!latest?.at) return null;
  const phq = num(latest.phq9), gad = num(latest.gad7);
  if (phq == null && gad == null) return null; // nada respondido: é convite, não número
  const phqName = 'PHQ-9';
  const gadName = c.t('panorama.mind.gad_name');
  const phqAge = dateAge(latest.phq9At ?? latest.at, c.now);
  const gadAge = dateAge(latest.gad7At ?? latest.at, c.now);
  const of = (kind: 'phq9' | 'gad7') => c.t('panorama.mind.of', { max: kind === 'phq9' ? PHQ9_MAX : GAD7_MAX });
  const prev = d?.previous ?? null;
  const prevPhq = num(prev?.phq9), prevGad = num(prev?.gad7);
  const crisis = !!latest.suicidalIdeation;
  // O azulejo lidera com o PHQ-9 quando existe; senão, com o GAD-7.
  const lead: 'phq9' | 'gad7' = phq != null ? 'phq9' : 'gad7';
  const leadValue = lead === 'phq9' ? phq : gad;
  const leadAge = lead === 'phq9' ? phqAge : gadAge;
  const asOf = (lead === 'phq9' ? latest.phq9At : latest.gad7At) ?? latest.at;
  const prevLead = lead === 'phq9' ? prevPhq : prevGad;
  const leadName = lead === 'phq9' ? phqName : gadName;
  const leadBand = bandName(c, lead === 'phq9' ? latest.phq9Band : latest.gad7Band, leadValue as number, lead).label;
  const history = arr<PanoramaScreening>(d?.history).filter((x) => x && num(x.phq9) != null && !!x.at);

  const story: StoryCard[] = [];
  if (crisis) {
    // Presença, não pânico: o mesmo recurso da tela de saúde mental (CVV 188 · SAMU 192).
    story.push({
      kind: 'crisis', title: c.t('panorama.mind.crisis.title'), text: c.t('panorama.mind.crisis.text'),
      call: c.t('panorama.mind.crisis.call'), chat: c.t('panorama.mind.crisis.chat'),
      urgent: c.t('panorama.mind.crisis.urgent'), support: c.t('panorama.mind.crisis.support'),
    });
  }
  if (phq != null) {
    story.push({
      kind: 'number', eyebrow: dated(c, phqName, phqAge), big: String(phq), unit: of('phq9'),
      band: { tone: 'ok', label: bandLabel(c, latest.phq9Band, phq, 'phq9') }, text: c.t('panorama.mind.phq_text'),
    });
  }
  const values = history.map((x) => x.phq9 as number);
  const first = history.length ? history[0] : null, lastH = lastOf(history) ?? null;
  const bars = barsCard(c, {
    eyebrow: c.t('panorama.mind.bars_eyebrow', { smart_count: values.length }), values, labels: history.map((x) => shortDate(x.at, c.locale)),
    lastAt: lastH?.at ?? null, lastLead: c.t('panorama.chart.last_answer'),
    text: first && lastH ? trendText(c, values, first.at, lastH.at, 'panorama.mind.rose', 'panorama.mind.fell', ` ${c.t('panorama.mind.points_unit')}`) : '',
  });
  if (bars) story.push(bars);
  if (gad != null) {
    story.push({
      kind: 'number', eyebrow: dated(c, gadName, gadAge), big: String(gad), unit: of('gad7'),
      band: { tone: 'ok', label: bandLabel(c, latest.gad7Band, gad, 'gad7') },
      text: prevGad != null ? c.t('panorama.mind.prev_total', { value: prevGad }) : '',
    });
  }
  story.push({ kind: 'step', title: c.t('panorama.mind.step_title'), text: c.t('panorama.mind.step_text'), cta: c.t('panorama.mind.step_cta'), to: '/saude-mental' });

  const period = prev?.at ? spanText(dateAge(prev.at, c.now).days ?? 0, c.t) : '';
  const take = period && prevPhq != null && prevGad != null
    ? c.t('panorama.mind.take_previous', { phq: prevPhq, gad: prevGad, period })
    : period && prevLead != null
      ? c.t('panorama.mind.take_previous_one', { name: leadName, value: prevLead, period })
      : c.t(phq != null && gad != null ? 'panorama.mind.take_plain_both' : phq != null ? 'panorama.mind.take_plain_phq' : 'panorama.mind.take_plain_gad');
  return finishTile(c, 'mind', a.status, {
    tone: 'ok', big: String(leadValue), unit: of(lead),
    whenLead: leadName, whenJoin: 'dot', asOf, age: leadAge,
    pill: crisis ? c.t('panorama.mind.crisis_pill') : prevLead != null ? c.t('panorama.hormones.before', { value: prevLead }) : leadBand,
    spark: values, sparkTone: 'ok', take: `${c.t('panorama.mind.screening')} ${take}`, crisis, story,
  });
};

type DiaryDay = NonNullable<PanoramaDiaryData['last7']>[number];
type TopSymptom = NonNullable<PanoramaDiaryData['topSymptoms']>[number];

/** Diário de saúde. */
const diaryArea: Build = (a, c) => {
  const d = a.data as PanoramaDiaryData | null;
  if (!d) return null;
  const days = arr<DiaryDay>(d.last7).filter((x) => x && !!x.date);
  const streak = Math.max(num(d.streak) ?? 0, 0);
  if (!days.length && streak === 0) return null;
  const asOf = lastOf(days)?.date ?? a.asOf;
  const age = dateAge(asOf, c.now);
  const moodAvg = num(d.moodAvg7);
  const moodDays = days.filter((x) => num(x.mood) != null);
  const top = arr<TopSymptom>(d.topSymptoms).filter((x) => x && (x.name || '').trim() && num(x.days) != null);
  const streakUnit = c.t('panorama.diary.streak_unit', { smart_count: streak });

  const pill = moodAvg != null ? c.t('panorama.diary.mood_avg', { avg: fmt(c, moodAvg, 1) }) : statusPill(c, a.status).pill;
  const take = top[0]
    ? c.t('panorama.diary.take_top', { name: (top[0].name as string).trim() })
    : (days.length ? c.t('panorama.diary.take_none') : c.t('panorama.diary.take_streak'));
  const story: StoryCard[] = [{
    kind: 'number', eyebrow: c.t('panorama.diary.story_eyebrow'), big: String(streak), unit: streakUnit,
    band: { tone: 'ok', label: [c.t('panorama.diary.when'), ageText(age, c.t)].filter(Boolean).join(' ') }, text: c.t('panorama.diary.streak_text'),
  }];
  const bars = barsCard(c, {
    eyebrow: c.t('panorama.diary.bars_eyebrow'), values: moodDays.map((x) => x.mood as number), labels: moodDays.map((x) => shortDate(x.date, c.locale)),
    lastAt: lastOf(moodDays)?.date ?? null, lastLead: c.t('panorama.chart.last_entry'),
    text: moodAvg != null ? c.t('panorama.diary.bars_text', { avg: fmt(c, moodAvg, 1) }) : '',
  });
  if (bars) story.push(bars);
  if (top.length) {
    story.push({
      kind: 'list', eyebrow: c.t('panorama.diary.list_eyebrow'),
      rows: top.map((x) => ({
        name: (x.name as string).trim(),
        detail: c.t('panorama.diary.marked_on', { days: x.days as number, total: days.length }),
        value: c.t('panorama.diary.of_days', { days: x.days as number, total: days.length }),
        tone: 'neutral', arrow: null,
      })),
      text: c.t('panorama.diary.list_text'),
    });
  }
  story.push({ kind: 'step', title: c.t('panorama.diary.step_title'), text: c.t('panorama.diary.step_text'), cta: c.t('panorama.diary.step_cta'), to: '/diario' });

  return finishTile(c, 'diary', a.status, {
    tone: 'ok', big: String(streak), unit: streakUnit,
    whenLead: c.t('panorama.diary.when'), whenJoin: 'space', asOf, age, pill,
    spark: moodDays.map((x) => x.mood as number), sparkTone: 'ok', take, story,
  });
};

interface MetricView { latest: number | null; avg7: number | null; avg30: number | null; series: PanoramaSeriesPoint[] }
const metricOf = (m: PanoramaMetric | null | undefined): MetricView | null => {
  const series = cleanSeries(m?.series7);
  const latest = num(m?.latest), avg7 = num(m?.avg7), avg30 = num(m?.avg30);
  if (latest == null && avg7 == null && avg30 == null && !series.length) return null;
  return { latest, avg7, avg30, series };
};
/** Valor de destaque de uma métrica: a média de 7 dias; sem ela, o último; sem ele, o fim da série. */
const headline = (m: MetricView): number | null => m.avg7 ?? m.latest ?? (m.series.length ? num(lastOf(m.series)!.v) : null);

/** Sono e atividade (Health Connect). A faixa de 7–9 h é a recomendação geral para adultos. */
const vitalityArea: Build = (a, c) => {
  const d = a.data as PanoramaVitalityData | null;
  if (!d) return null;
  const sleep = metricOf(d.sleepMinutes), steps = metricOf(d.steps);
  const sync = d.lastSyncAt ?? null;
  const sleepIsLead = !!sleep && headline(sleep) != null;
  const lead = sleepIsLead ? (sleep as MetricView) : steps;
  if (!lead) return null;
  const main = headline(lead);
  if (main == null) return null;
  const isSleep = sleepIsLead;
  const kind: 'sleep' | 'steps' = isSleep ? 'sleep' : 'steps';

  const age = sync ? timeAge(sync, c.now) : dateAge(a.asOf, c.now);
  const diff = lead.avg7 != null && lead.avg30 != null ? lead.avg7 - lead.avg30 : null;
  const habit = habitDiff(c, diff, kind);
  const unit = isSleep ? c.t('panorama.vitality.per_night') : c.t('panorama.vitality.per_day');
  const show = (v: number) => (isSleep ? hms(v) : int(c, v));
  const big = show(main);
  const leadName = isSleep ? c.t('panorama.vitality.sleep') : c.t('panorama.vitality.steps');
  const leadSeries = cleanSeries(isSleep ? d.sleepMinutes?.series7 : d.steps?.series7);

  const story: StoryCard[] = [{
    kind: 'number', eyebrow: c.t(isSleep ? 'panorama.vitality.sleep_eyebrow' : 'panorama.vitality.steps_eyebrow'),
    big, unit, band: { tone: habit.tone, label: habit.label },
    text: lead.avg30 != null ? c.t('panorama.vitality.avg30_text', { avg: show(lead.avg30), unit }) : '',
  }];
  const line = lineCard(c, {
    eyebrow: leadName, pts: leadSeries.map((x) => ({ at: x.at, v: isSleep ? (x.v as number) / 60 : (x.v as number) })),
    ref: isSleep ? [7, 9] : null, unit: isSleep ? 'h' : '', lastLead: c.t(isSleep ? 'panorama.chart.last_night' : 'panorama.chart.last_sync'),
    text: isSleep ? c.t('panorama.vitality.sleep_rec') : '',
  });
  if (line) story.push(line);
  const other = isSleep ? steps : null;
  const otherMain = other ? headline(other) : null;
  if (other && otherMain != null) {
    const stepsHabit = habitDiff(c, other.avg7 != null && other.avg30 != null ? other.avg7 - other.avg30 : null, 'steps');
    story.push({
      kind: 'number', eyebrow: c.t('panorama.vitality.steps_eyebrow'), big: int(c, otherMain), unit: c.t('panorama.vitality.per_day'),
      band: { tone: stepsHabit.tone, label: stepsHabit.label },
      text: other.avg30 != null ? c.t('panorama.vitality.avg30_text', { avg: int(c, other.avg30), unit: c.t('panorama.vitality.per_day') }) : '',
    });
  }
  story.push({ kind: 'step', title: c.t('panorama.vitality.step_title'), text: c.t('panorama.vitality.step_text'), cta: c.t('panorama.vitality.step_cta'), to: '/sinais' });

  return finishTile(c, 'vitality', a.status, {
    tone: habit.tone, big, unit,
    whenLead: sync ? c.t('panorama.vitality.synced') : '', whenJoin: 'space', asOf: sync ?? a.asOf, age,
    pill: habit.label, spark: lead.series.map((x) => x.v as number), sparkTone: habit.tone,
    take: habit.size
      ? c.t(isSleep ? 'panorama.vitality.take_sleep' : 'panorama.vitality.take_steps', { diff: habit.size, dir: c.t(habit.tone === 'warn' ? 'panorama.vitality.dir_less' : 'panorama.vitality.dir_more') })
      : c.t('panorama.vitality.take_plain', { value: big, unit }),
    story,
  });
};

/** Remédios. */
const medsArea: Build = (a, c) => {
  const d = a.data as PanoramaMedsData | null;
  if (!d) return null;
  const active = arr<NonNullable<PanoramaMedsData['active']>[number]>(d.active).filter((x) => x && (x.name || '').trim());
  const crit = num(d.criticalInteractions);
  const age = dateAge(a.asOf, c.now);
  const tone: Tone = crit != null && crit > 0 ? 'bad' : statusPill(c, a.status).tone;
  const unit = c.t('panorama.meds.unit', { smart_count: active.length });
  const pill = crit == null ? c.t('panorama.meds.unchecked') : crit === 0 ? c.t('panorama.meds.no_critical') : c.t('panorama.meds.critical', { smart_count: crit });
  const body = crit == null ? c.t('panorama.meds.text_unchecked') : crit === 0 ? c.t('panorama.meds.text_clear') : c.t('panorama.meds.text_critical');
  const story: StoryCard[] = [{
    kind: 'number', eyebrow: c.t('panorama.meds.story_eyebrow'), big: String(active.length), unit,
    band: { tone, label: pill }, text: body,
  }];
  if (active.length) {
    story.push({
      kind: 'list', eyebrow: c.t('panorama.meds.list_eyebrow'),
      rows: active.map((x) => ({ name: (x.name as string).trim(), detail: x.dose ? String(x.dose) : '', value: '', tone: 'neutral' as Tone, arrow: null })),
      text: c.t('panorama.meds.list_text'),
    });
  }
  story.push({ kind: 'step', title: c.t('panorama.meds.step_title'), text: c.t('panorama.meds.step_text'), cta: c.t('panorama.meds.step_cta'), to: '/medicamentos' });
  return finishTile(c, 'meds', a.status, {
    tone, big: String(active.length), unit,
    whenLead: a.asOf ? c.t('panorama.meds.updated') : '', whenJoin: 'space', asOf: a.asOf, age, pill, spark: [], sparkTone: tone,
    take: crit != null && crit > 0 ? c.t('panorama.meds.take_critical') : body,
    story,
  });
};

/** Consultas e perguntas. */
const careArea: Build = (a, c) => {
  const d = a.data as PanoramaCareData | null;
  if (!d) return null;
  const next = d.nextAppointment && d.nextAppointment.at ? d.nextAppointment : null;
  const q = Math.max(num(d.pendingQuestions) ?? 0, 0);
  const overdue = Math.max(num(d.overdueReminders) ?? 0, 0);
  if (!next && q === 0 && overdue === 0) return null;

  // "daqui a 16 dias" — a consulta é a única data futura do panorama.
  const ahead = next ? -((calendarDays(next.at, c.now) ?? 0)) : null;
  const span = ahead == null ? '' : ahead <= 0 ? c.t('panorama.age.today') : ahead === 1 ? c.t('panorama.age.tomorrow') : c.t('panorama.common.from_now', { span: spanText(ahead, c.t) });
  const dayUnit = next ? c.t('panorama.care.day_unit', { month: monthShort(next.at, c.locale), time: clock(next.at, c.locale) }) : '';
  const qUnit = c.t('panorama.care.questions_unit', { smart_count: q });

  const story: StoryCard[] = [];
  // O título do compromisso (como a pessoa escreveu) é o único nome quando não há médico vinculado.
  const title = next?.title?.trim() || '';
  if (next) {
    const who = [next.doctor?.trim(), next.specialty?.trim()].filter(Boolean).join(' · ') || title || c.t('panorama.care.who_unknown');
    story.push({
      kind: 'number', eyebrow: c.t('panorama.care.story_eyebrow', { span }), big: dayNum(next.at), unit: dayUnit,
      band: { tone: 'info', label: who }, text: title && who !== title ? title : '',
    });
  }
  if (overdue > 0) {
    story.push({
      kind: 'number', eyebrow: c.t('panorama.care.overdue_eyebrow'), big: String(overdue), unit: c.t('panorama.care.overdue_unit', { smart_count: overdue }),
      band: { tone: 'warn', label: c.t('panorama.care.overdue_pill') }, text: c.t('panorama.care.overdue_text'),
    });
  }
  if (q > 0) {
    story.push({
      kind: 'number', eyebrow: c.t('panorama.care.q_eyebrow'), big: String(q), unit: qUnit,
      band: { tone: 'info', label: c.t('panorama.care.q_pill') }, text: c.t('panorama.care.q_text'),
    });
  }
  story.push({ kind: 'step', title: c.t('panorama.care.step_title'), text: c.t('panorama.care.step_text'), cta: c.t('panorama.care.step_cta'), to: '/perguntas' });

  const pill = q > 0 ? c.t('panorama.care.questions_ready', { smart_count: q }) : overdue > 0 ? c.t('panorama.care.overdue', { smart_count: overdue }) : c.t('panorama.status.in_day');
  const tone: Tone = q > 0 ? 'info' : overdue > 0 ? 'warn' : 'ok';
  return finishTile(c, 'care', a.status, {
    tone, big: next ? dayNum(next.at) : String(q), unit: next ? dayUnit : qUnit,
    whenLead: next ? c.t('panorama.care.next_in', { span }) : '', whenJoin: next ? 'none' : 'space',
    asOf: next?.at ?? a.asOf, age: next ? NO_AGE('date') : dateAge(a.asOf, c.now),
    pill, spark: [], sparkTone: tone,
    take: [
      next
        ? (title
            ? c.t('panorama.care.take_next_titled', { title, date: shortDate(next.at, c.locale), time: clock(next.at, c.locale) })
            : c.t('panorama.care.take_next', { date: shortDate(next.at, c.locale), time: clock(next.at, c.locale) }))
        : '',
      q > 0 ? c.t('panorama.care.take_questions', { smart_count: q }) : '',
      overdue > 0 ? c.t('panorama.care.take_overdue', { smart_count: overdue }) : '',
    ].filter(Boolean).join(' '),
    story,
  });
};

/** Vacinas. */
const vaccinesArea: Build = (a, c) => {
  const d = a.data as PanoramaVaccinesData | null;
  if (!d) return null;
  const count = Math.max(num(d.count) ?? 0, 0);
  const overdue = Math.max(num(d.overdue) ?? 0, 0);
  const nextDue = d.nextDue && d.nextDue.date ? d.nextDue : null;
  if (count === 0) return null;
  const age = dateAge(a.asOf, c.now);
  const unit = c.t('panorama.vaccines.unit', { smart_count: count });
  const tone: Tone = overdue > 0 ? 'warn' : 'ok';
  const pill = overdue > 0 ? c.t('panorama.vaccines.overdue', { smart_count: overdue })
    : nextDue ? c.t('panorama.vaccines.next_due', { date: shortDate(nextDue.date, c.locale) })
    : statusPill(c, a.status).pill;
  const story: StoryCard[] = [{
    kind: 'number', eyebrow: dated(c, c.t('panorama.vaccines.story_eyebrow'), age), big: String(count), unit,
    band: { tone, label: pill }, text: c.t('panorama.vaccines.text'),
  }];
  if (nextDue) {
    story.push({
      kind: 'number', eyebrow: c.t('panorama.vaccines.due_eyebrow', { name: nextDue.name }), big: dayNum(nextDue.date), unit: monthShort(nextDue.date, c.locale),
      band: { tone: 'info', label: c.t('panorama.vaccines.due_pill', { date: fullDate(nextDue.date, c.locale) }) }, text: '',
    });
  }
  story.push({ kind: 'step', title: c.t('panorama.vaccines.step_title'), text: c.t('panorama.vaccines.step_text'), cta: c.t('panorama.vaccines.step_cta'), to: '/vacinas' });
  return finishTile(c, 'vaccines', a.status, {
    tone, big: String(count), unit, whenLead: '', whenJoin: 'space', asOf: a.asOf, age, pill, spark: [], sparkTone: tone,
    take: overdue > 0 ? c.t('panorama.vaccines.take_overdue', { smart_count: overdue }) : c.t('panorama.vaccines.take', { smart_count: count }), story,
  });
};

/** Cartão de emergência. */
const emergencyArea: Build = (a, c) => {
  const d = a.data as { configured?: boolean } | null;
  if (!d || !d.configured) return null;
  const age = dateAge(a.asOf, c.now);
  const big = c.t('panorama.emergency.ready');
  const unit = c.t('panorama.emergency.unit');
  const pill = c.t('panorama.emergency.configured');
  const story: StoryCard[] = [
    { kind: 'number', eyebrow: dated(c, c.t('panorama.emergency.story_eyebrow'), age), big, unit, band: { tone: 'ok', label: pill }, text: c.t('panorama.emergency.text') },
    { kind: 'step', title: c.t('panorama.emergency.step_title'), text: c.t('panorama.emergency.step_text'), cta: c.t('panorama.emergency.step_cta'), to: '/emergencia' },
  ];
  return finishTile(c, 'emergency', a.status, {
    tone: 'ok', big, unit, whenLead: '', whenJoin: 'space', asOf: a.asOf, age, pill, spark: [], sparkTone: 'ok',
    take: c.t('panorama.emergency.take'), story,
  });
};

const BUILDERS: Record<PanoramaKey, Build> = {
  exams: examsArea, heart: heartArea, weight: weightArea, bodyComp: bodyCompArea, hormones: hormonesArea, mind: mindArea,
  diary: diaryArea, vitality: vitalityArea, meds: medsArea, care: careArea, vaccines: vaccinesArea, emergency: emergencyArea,
};

/** Para onde cada área sem dado convida. */
const TODO_ROUTE: Record<PanoramaKey, string> = {
  exams: '/exams', heart: '/medicoes', weight: '/medicoes', bodyComp: '/composicao', hormones: '/exams', mind: '/saude-mental',
  diary: '/diario', vitality: '/sinais', meds: '/medicamentos', care: '/consultas', vaccines: '/vacinas', emergency: '/emergencia',
};

// ───────────────────────── o que mudou ─────────────────────────
/** Um cartão de "o que mudou" — ou null quando não há mudança de verdade. */
const changeCard = (x: PanoramaChange, c: Ctx): ChangeCardModel | null => {
  const before = num(x.before), after = num(x.after);
  if (before == null || after == null || before === after || !x.at) return null;
  const subject = (x.subject || '').trim();
  const base = { key: x.area, area: c.t(`panorama.area.${x.area}`), at: x.at, sub: '' };

  if (x.kind === 'screening') {
    const instr = /phq/i.test(subject) ? 'phq' : /gad/i.test(subject) ? 'gad' : 'generic';
    const down = after < before;
    return {
      ...base,
      title: c.t(`panorama.change.screening_${instr}_${down ? 'down' : 'up'}`, { subject: subject || c.t('panorama.common.questionnaire') }),
      before: int(c, before), after: int(c, after), unit: instr === 'phq' ? 'PHQ-9' : instr === 'gad' ? 'GAD-7' : subject,
      whenLead: c.t('panorama.change.answered'), whenJoin: 'space', age: dateAge(x.at, c.now), tone: down ? 'ok' : 'warn',
    };
  }
  if (x.kind === 'habit') {
    const unitRaw = x.unit || '';
    const which = /sono|sleep/i.test(subject) ? 'sleep' : /passo|step/i.test(subject) ? 'steps' : /peso|weight|kg/i.test(subject + unitRaw) ? 'weight' : 'generic';
    const diff = after - before;
    const when = { whenLead: c.t('panorama.change.vs_avg30'), whenJoin: 'space' as const, age: NO_AGE('date') };
    if (which === 'sleep') {
      // Sono pode vir em minutos (Health Connect) ou em horas (unit "h").
      const hours = /h|hora|hour/i.test(unitRaw);
      const show = (v: number) => (hours ? `${fmt(c, v, 1)} h` : hms(v));
      const minutes = Math.round(Math.abs(diff) * (hours ? 60 : 1));
      return {
        ...base, ...when,
        title: c.t(diff > 0 ? 'panorama.change.sleep_more' : 'panorama.change.sleep_less', { min: int(c, minutes) }),
        before: show(before), after: show(after), unit: c.t('panorama.change.per_night'), tone: diff > 0 ? 'ok' : 'warn',
      };
    }
    if (which === 'steps') {
      return {
        ...base, ...when,
        title: c.t(diff > 0 ? 'panorama.change.steps_more' : 'panorama.change.steps_less', { n: int(c, Math.abs(diff)) }),
        before: int(c, before), after: int(c, after), unit: c.t('panorama.change.per_day'), tone: diff > 0 ? 'ok' : 'neutral',
      };
    }
    if (which === 'weight') {
      // Peso cair ou subir não é bom nem ruim por si: o cartão só informa.
      return {
        ...base, ...when,
        title: c.t(diff > 0 ? 'panorama.change.weight_more' : 'panorama.change.weight_less', { v: fmt(c, Math.abs(diff), 1) }),
        before: fmt(c, before, 1), after: fmt(c, after, 1), unit: unitRaw || 'kg', tone: 'info',
      };
    }
    return {
      ...base, ...when,
      title: c.t(diff > 0 ? 'panorama.change.generic_more' : 'panorama.change.generic_less', { subject: subject || c.t('panorama.common.habit'), delta: fmt(c, Math.abs(diff)) }),
      before: fmt(c, before), after: fmt(c, after), unit: unitRaw, tone: 'neutral',
    };
  }
  const tone: Tone = x.kind === 'entered_range' ? 'ok' : x.kind === 'left_range' ? 'bad' : x.kind === 'improved' ? 'ok' : 'warn';
  return {
    ...base,
    title: c.t(`panorama.change.${x.kind}`, { subject: subject || c.t('panorama.common.marker') }),
    sub: x.kind === 'improved' || x.kind === 'worsened' ? c.t('panorama.change.still_out') : '',
    before: fmt(c, before), after: fmt(c, after), unit: x.unit || '',
    whenLead: c.t('panorama.change.exam_of', { date: shortDate(x.at, c.locale) }), whenJoin: 'dot', age: dateAge(x.at, c.now), tone,
  };
};

// ───────────────────────── orquestrador ─────────────────────────
const heroOf = (c: Ctx, health: HealthSummaryLike | null, tiles: AreaTileModel[]): HeroModel => {
  const t = c.t;
  const score = health ? num(health.score) : null;
  const verdict = score == null ? t('panorama.hero.verdict_none')
    : score >= 80 ? t('panorama.hero.verdict_great')
    : score >= 60 ? t('panorama.hero.verdict_good')
    : score >= 40 ? t('panorama.hero.verdict_attention')
    : t('panorama.hero.verdict_care');
  const bp = health?.byPriority ?? null;
  const cnt = (v: unknown) => Math.max(num(v) ?? 0, 0);
  const outOfRange = bp ? cnt(bp.leve) + cnt(bp.moderada) + cnt(bp.importante) : null;
  const inRange = bp ? cnt(bp.normal) : null;
  const top = unique(arr<{ name?: string | null }>(health?.topAttention).map((m) => (m?.name || '').trim()).filter(Boolean));
  const pulling = (outOfRange == null || outOfRange > 0) && top.length > 0;
  // Mais recente / mais antigo entre as áreas datadas. No mesmo dia, um instante conhecido
  // ("há 2 h") é mais preciso que uma data sem hora e conta como mais novo.
  const dated = tiles.filter((x) => x.age.days != null);
  const rank = (x: AreaTileModel) => (x.age.days as number) * 24 + (x.age.kind === 'time' ? x.age.hours ?? 24 : 12);
  const newest = dated.reduce<AreaTileModel | null>((acc, x) => (!acc || rank(x) < rank(acc) ? x : acc), null);
  const oldest = dated.reduce<AreaTileModel | null>((acc, x) => (!acc || rank(x) > rank(acc) ? x : acc), null);
  const whenOf = (x: AreaTileModel) => x.when || ageText(x.age, t);
  // Cada área vira um tracinho: acesa (verde), em atenção (âmbar), antiga (neutra) ou apagada (sem dado).
  const tickOf = (x: AreaTileModel): TickState => (x.stale ? 'stale' : x.status === 'attention' ? 'warn' : 'on');
  return {
    score, verdict, outOfRange, inRange,
    pullLead: pulling ? t('panorama.hero.pull_lead') : '',
    pullDown: pulling ? top.slice(0, 3) : [],
    holds: pulling && inRange != null && inRange > 0 ? t('panorama.hero.holds', { smart_count: inRange }) : '',
    nothingPulls: outOfRange === 0 ? t('panorama.hero.nothing_pulls', { smart_count: inRange ?? 0 }) : '',
    noScoreText: score == null ? t('panorama.hero.no_score_text') : '',
    scoreSource: score == null ? '' : t('panorama.hero.score_source'),
    newest: newest ? { area: newest.name, when: whenOf(newest) } : null,
    oldest: oldest && oldest !== newest ? { area: oldest.name, when: whenOf(oldest) } : null,
    filled: tiles.length,
    total: AREA_ORDER.length,
    ticks: AREA_ORDER.map((k) => {
      const tile = tiles.find((x) => x.key === k);
      return tile ? tickOf(tile) : 'off';
    }),
  };
};

/**
 * O modelo pronto para a tela. `health` é o resumo de saúde (o placar é o mesmo da Home);
 * quando falta, o herói mostra "ainda sem placar" e o resto do panorama segue.
 */
export function presentPanorama(p: PanoramaResponse, health: HealthSummaryLike | null, opts: PresenterOptions): PanoramaModel {
  const now = opts.now ?? Date.now();
  const locale: Locale = opts.locale ?? 'pt';
  const c: Ctx = { t: opts.t, locale, now, bodyCompMissing: false };

  const statusOf = (a: Area<unknown> | null): PanoramaStatus => {
    if (!a) return 'unavailable';
    const s = a.status as PanoramaStatus;
    if (s === 'ok' || s === 'attention' || s === 'stale') return a.data == null ? 'unavailable' : s;
    return s === 'missing' || s === 'unavailable' ? s : (a.data == null ? 'missing' : 'ok');
  };

  // Primeiro passada só para saber se falta composição corporal (o passo de "Peso e corpo" depende disso).
  c.bodyCompMissing = statusOf(areaOf(p, 'bodyComp')) === 'missing';

  const tiles: AreaTileModel[] = [];
  const todo: TodoModel[] = [];
  const unavailable: UnavailableModel[] = [];
  for (const key of AREA_ORDER) {
    const a = areaOf(p, key);
    const status = statusOf(a);
    const name = c.t(`panorama.area.${key}`);
    if (status === 'unavailable') { unavailable.push({ key, name }); continue; }
    if (status === 'missing') { todo.push({ key, name, why: c.t(`panorama.todo.${key}.why`), cta: c.t(`panorama.todo.${key}.cta`), to: TODO_ROUTE[key] }); continue; }
    const tile = BUILDERS[key](a as Area<unknown>, c);
    // Status diz que há dado, mas veio vazio: é convite, não número inventado.
    if (tile) tiles.push(tile);
    else todo.push({ key, name, why: c.t(`panorama.todo.${key}.why`), cta: c.t(`panorama.todo.${key}.cta`), to: TODO_ROUTE[key] });
  }

  const end = { eyebrow: c.t('panorama.story.end_eyebrow'), title: c.t('panorama.story.end_title', { smart_count: tiles.length }), text: c.t('panorama.story.end_text') };
  if (tiles.length) tiles[tiles.length - 1].story.push({ kind: 'end', ...end });

  const changes: ChangeCardModel[] = [];
  for (const x of arr<PanoramaChange>(p.changed).slice(0, 6)) {
    const card = x ? changeCard(x, c) : null;
    if (card) changes.push(card);
    if (changes.length === 3) break;
  }

  return {
    generatedAt: p.generatedAt ?? null,
    generatedAge: timeAge(p.generatedAt, now),
    filled: tiles.length,
    total: AREA_ORDER.length,
    hero: heroOf(c, health, tiles),
    changes, tiles, todo, unavailable, end,
  };
}
