/**
 * Composição corporal (bioimpedância) — tipos e regras de leitura da tela.
 *
 * Regras de segurança de leitura (não são detalhe visual):
 *  - Toda faixa diz DE QUEM é: "faixa do aparelho" (definida pelo fabricante) ou
 *    referência populacional com a fonte. Nunca um "normal" sem dono.
 *  - Sem faixa conhecida → sem selo. TMB, músculo e gordura visceral não ganham veredito.
 *  - Fora da faixa é "acima"/"abaixo", em palavras — nunca só cor, nunca alarme.
 */

export interface BodyReading {
  id: string;
  measuredAt: string;
  source: 'INBODY_QR' | 'MANUAL' | string;
  deviceBrand: string | null;
  deviceModel: string | null;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  fatMassKg: number | null;
  skeletalMuscleKg: number | null;
  fatFreeMassKg: number | null;
  bodyWaterL: number | null;
  proteinKg: number | null;
  mineralKg: number | null;
  bmi: number | null;
  bmrKcal: number | null;
  waistHipRatio: number | null;
  visceralFatLevel: number | null;
  ranges: Record<string, [number, number]> | null;
  needsReview: boolean;
  note: string | null;
}

export interface BodyFatReference {
  low: number;
  high: number;
  source: string;
}

export interface BodyCompositionResponse {
  items: BodyReading[];
  reference: { bodyFatPct: BodyFatReference } | null;
  profile?: { heightCm: number | null };
}

export type MetricKey =
  | 'weightKg'
  | 'bodyFatPct'
  | 'fatMassKg'
  | 'skeletalMuscleKg'
  | 'fatFreeMassKg'
  | 'bodyWaterL'
  | 'proteinKg'
  | 'mineralKg'
  | 'bmi'
  | 'bmrKcal'
  | 'waistHipRatio'
  | 'visceralFatLevel';

export interface MetricSpec {
  key: MetricKey;
  label: string;
  /** Rótulo curto para os blocos do gráfico. */
  short: string;
  unit: string;
  decimals: number;
  /** Classe de preenchimento da cor da série (com par dark quando é paleta crua). */
  swatch: string;
  /** Classe de tinta da série no gráfico (o traço usa currentColor). */
  ink: string;
}

// prettier-ignore
export const METRICS: Record<MetricKey, MetricSpec> = {
  weightKg:         { key: 'weightKg',         label: 'Peso',                       short: 'Peso',          unit: 'kg',    decimals: 1, swatch: 'bg-primary',                         ink: 'text-primary' },
  bodyFatPct:       { key: 'bodyFatPct',       label: 'Gordura corporal',           short: 'Gordura',       unit: '%',     decimals: 1, swatch: 'bg-copper-500',                      ink: 'text-copper-600 dark:text-copper-400' },
  fatMassKg:        { key: 'fatMassKg',        label: 'Massa de gordura',           short: 'Gordura (kg)',  unit: 'kg',    decimals: 1, swatch: 'bg-copper-500',                      ink: 'text-copper-600 dark:text-copper-400' },
  skeletalMuscleKg: { key: 'skeletalMuscleKg', label: 'Músculo esquelético',        short: 'Músculo',       unit: 'kg',    decimals: 1, swatch: 'bg-sky-600 dark:bg-sky-400',         ink: 'text-sky-600 dark:text-sky-400' },
  fatFreeMassKg:    { key: 'fatFreeMassKg',    label: 'Massa livre de gordura',     short: 'Massa magra',   unit: 'kg',    decimals: 1, swatch: 'bg-violet-600 dark:bg-violet-400',   ink: 'text-violet-600 dark:text-violet-400' },
  bodyWaterL:       { key: 'bodyWaterL',       label: 'Água corporal',              short: 'Água',          unit: 'L',     decimals: 1, swatch: 'bg-sky-600 dark:bg-sky-400',         ink: 'text-sky-600 dark:text-sky-400' },
  proteinKg:        { key: 'proteinKg',        label: 'Proteína',                   short: 'Proteína',      unit: 'kg',    decimals: 1, swatch: 'bg-primary',                         ink: 'text-primary' },
  mineralKg:        { key: 'mineralKg',        label: 'Minerais',                   short: 'Minerais',      unit: 'kg',    decimals: 2, swatch: 'bg-primary',                         ink: 'text-primary' },
  bmi:              { key: 'bmi',              label: 'IMC',                        short: 'IMC',           unit: 'kg/m²', decimals: 1, swatch: 'bg-primary',                         ink: 'text-primary' },
  bmrKcal:          { key: 'bmrKcal',          label: 'Taxa metabólica basal',      short: 'TMB',           unit: 'kcal',  decimals: 0, swatch: 'bg-primary',                         ink: 'text-primary' },
  waistHipRatio:    { key: 'waistHipRatio',    label: 'Relação cintura-quadril',    short: 'Cintura-quadril', unit: '',    decimals: 2, swatch: 'bg-primary',                         ink: 'text-primary' },
  visceralFatLevel: { key: 'visceralFatLevel', label: 'Gordura visceral',           short: 'Visceral',      unit: 'nível', decimals: 0, swatch: 'bg-primary',                         ink: 'text-primary' },
};

/** As quatro medidas que trocam o gráfico de evolução. */
export const TREND_KEYS: MetricKey[] = ['weightKg', 'bodyFatPct', 'skeletalMuscleKg', 'fatFreeMassKg'];

export const formatNumber = (value: number, decimals: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const formatMetric = (key: MetricKey, value: number) => formatNumber(value, METRICS[key].decimals);

/** Valor + unidade ("23,4 %", "71,2 kg"). A unidade nunca fica implícita. */
export const formatWithUnit = (key: MetricKey, value: number) => {
  const { unit } = METRICS[key];
  return unit ? `${formatMetric(key, value)} ${unit}` : formatMetric(key, value);
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }).replace(/\./g, '').replace(/ de /g, ' ');

export const formatShortDate = (time: number) =>
  new Date(time).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(/\./g, '').replace(' de ', '/');

/** "hoje", "há 12 dias", "há 3 meses", "há 1 ano e 2 meses". */
export function timeAgo(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 60) return `há ${days} dias`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ano${years > 1 ? 's' : ''}`;
  return rest ? `há ${y} e ${rest} ${rest > 1 ? 'meses' : 'mês'}` : `há ${y}`;
}

/** Avaliação com mais de 6 meses não representa o corpo de hoje. */
export const isStale = (iso: string, now = Date.now()) => now - new Date(iso).getTime() > 183 * 86_400_000;

export const deviceLabel = (r: Pick<BodyReading, 'deviceBrand' | 'deviceModel' | 'source'>) => {
  const name = [r.deviceBrand, r.deviceModel].filter(Boolean).join(' ');
  if (name) return name;
  return r.source === 'MANUAL' ? 'Aparelho não informado' : 'Aparelho não identificado';
};

export type Zone = 'in' | 'below' | 'above';

export const ZONE_LABEL: Record<Zone, string> = { in: 'Na faixa', below: 'Abaixo da faixa', above: 'Acima da faixa' };

export const zoneOf = (value: number, low: number, high: number): Zone => (value < low ? 'below' : value > high ? 'above' : 'in');

export interface RangeInfo {
  low: number;
  high: number;
  /** De quem é a faixa — sempre mostrado ao lado dela. */
  owner: string;
}

/** A faixa aplicável a uma medida desta avaliação, ou null (aí não há selo). */
export function rangeFor(key: MetricKey, reading: BodyReading, reference: BodyCompositionResponse['reference']): RangeInfo | null {
  if (key === 'bodyFatPct') {
    const ref = reference?.bodyFatPct;
    return ref ? { low: ref.low, high: ref.high, owner: `Referência: ${ref.source}` } : null;
  }
  if (key === 'bmi') return { low: 18.5, high: 24.9, owner: 'Referência: OMS, adultos' };
  const own = reading.ranges?.[key];
  if (own && own.length === 2 && own[1] > own[0]) {
    return { low: own[0], high: own[1], owner: `Faixa do aparelho (${deviceLabel(reading)})` };
  }
  return null;
}

/** Diferença entre duas avaliações da mesma medida; null se faltar um dos lados. */
export function deltaOf(key: MetricKey, current: BodyReading, previous: BodyReading | undefined): number | null {
  const a = current[key];
  const b = previous?.[key];
  if (a == null || b == null) return null;
  const d = Math.round((a - b) * 100) / 100;
  return d;
}

export const formatDelta = (key: MetricKey, delta: number) => {
  const abs = formatMetric(key, Math.abs(delta));
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const { unit } = METRICS[key];
  // Diferença entre dois percentuais é em pontos percentuais, não em "%".
  const u = key === 'bodyFatPct' ? 'p.p.' : unit;
  return `${sign}${abs}${u ? ` ${u}` : ''}`;
};

// ───────── Linha do tempo: janela do gráfico, "reproduzir" e histórico por mês ─────────

const SP = 'America/Sao_Paulo';

/** Janela do gráfico. Ancorada na avaliação MAIS RECENTE, não em hoje: quem mediu há um ano ainda vê os dados. */
export type ChartRange = '3m' | '6m' | '1a' | 'tudo';
export const RANGE_LABEL: Record<ChartRange, string> = { '3m': '3 meses', '6m': '6 meses', '1a': '1 ano', tudo: 'Tudo' };
const RANGE_DAYS: Record<Exclude<ChartRange, 'tudo'>, number> = { '3m': 92, '6m': 183, '1a': 366 };

/** As avaliações (mais antiga primeiro) dentro da janela. */
export function inRange(oldestFirst: BodyReading[], range: ChartRange): BodyReading[] {
  if (range === 'tudo' || oldestFirst.length === 0) return oldestFirst;
  const end = new Date(oldestFirst[oldestFirst.length - 1].measuredAt).getTime();
  const from = end - RANGE_DAYS[range] * 86_400_000;
  return oldestFirst.filter((item) => new Date(item.measuredAt).getTime() >= from);
}

/**
 * Janelas que fazem sentido oferecer: só as que escondem alguma avaliação e ainda deixam
 * pelo menos duas para desenhar. Sem nenhuma assim, devolve [] (a tela não mostra o seletor).
 */
export function availableRanges(oldestFirst: BodyReading[]): ChartRange[] {
  const cut = (['3m', '6m', '1a'] as const).filter((range) => {
    const size = inRange(oldestFirst, range).length;
    return size >= 2 && size < oldestFirst.length;
  });
  // Duas janelas com as mesmas avaliações são a mesma opção: fica a mais curta.
  const distinct = cut.filter((range, i) => i === 0 || inRange(oldestFirst, range).length !== inRange(oldestFirst, cut[i - 1]).length);
  return distinct.length ? [...distinct, 'tudo'] : [];
}

/** No máximo `max` passos espalhados por igual, sempre com o primeiro e o último. */
export function sampleSteps<T>(list: T[], max = 24): T[] {
  if (list.length <= max || max < 2) return list;
  const picked: T[] = [];
  for (let i = 0; i < max; i++) picked.push(list[Math.round((i * (list.length - 1)) / (max - 1))]);
  return picked;
}

export interface MonthGroup {
  /** "2026-11" (fuso de São Paulo). */
  key: string;
  /** "Novembro 2026". */
  label: string;
  /** Mais recente primeiro, como a API devolve. */
  items: BodyReading[];
}

const monthKey = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SP, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
};

const monthLabel = (iso: string) => {
  const text = new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: SP }).replace(' de ', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Histórico agrupado por mês, na ordem recebida (mais recente primeiro). */
export function groupByMonth(newestFirst: BodyReading[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const item of newestFirst) {
    const key = monthKey(item.measuredAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: monthLabel(item.measuredAt), items: [item] });
  }
  return groups;
}

/** "02 nov" e "seg" — a data curta de cada linha do histórico (o ano está no título do mês). */
export const formatDayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: SP }).replace(/\./g, '').replace(' de ', ' ');
export const formatWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: SP }).replace(/\./g, '');
