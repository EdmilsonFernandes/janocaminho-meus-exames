/**
 * Assinatura de tempo dos gráficos — lógica pura (sem React), testada em recency.test.ts.
 *
 * Risco que isto fecha (IEC 62366, "dado velho parecendo atual"): a pessoa olha o último
 * ponto do gráfico e assume que é de agora. Duas saídas, nunca as duas à força:
 *  1. eixo X é tempo de verdade e "hoje" cabe sem esmagar os dados → linha vertical "hoje"
 *     (`planTodayAxis` decide e devolve até onde o eixo vai);
 *  2. eixo categórico, ou estender esmagaria → texto de recência do último ponto
 *     (`describeRecency`: "Último resultado: há 3 meses (12/08/2026)").
 *
 * Nada aqui classifica resultado (alto/baixo/normal) nem chama dado de outro dia de "atual".
 */
import { timeAgo } from '@/components/bodycomp/model';

const DAY_MS = 86_400_000;

/**
 * Exame de laboratório passa a "pode estar desatualizado" depois de 12 meses.
 * Espelho do padrão do servidor (`temporalThresholds.staleMonths = 12`, usado por
 * `describeStaleness` em server/src/analysis/health-state.ts) e da mesma régua de 365 dias
 * que a lista de exames já usa no front (resources/Exams/ExamList.tsx).
 */
export const LAB_STALE_AFTER_DAYS = 365;

/**
 * Fatia máxima do eixo que o vazio "último ponto → hoje" pode ocupar. Acima disso os dados
 * ficariam espremidos num canto: não se estende o eixo, usa-se o texto de recência.
 * (Regra de desenho, não limiar clínico.)
 */
export const TODAY_MAX_SHARE = 1 / 3;

export const DEFAULT_STALE_NOTE = 'pode estar desatualizado';

type DateInput = string | number | Date | null | undefined;

const toMs = (value: DateInput): number | null => {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/** Meia-noite local do dia (a recência é contada em dias de calendário, não em horas). */
const dayStart = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const pad2 = (n: number) => String(n).padStart(2, '0');
/** dd/mm/aaaa em horário local, sem depender do ICU do ambiente. */
export const formatDayMonthYear = (d: Date): string => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

export interface TodayAxisPlan {
  /** Desenhar a linha "hoje"? */
  show: boolean;
  /** Fim do eixo X (timestamp) quando `show`; null quando não desenha. */
  domainEnd: number | null;
  /** Posição de hoje no eixo, de 0 (primeiro ponto) a 1 (fim do eixo); null quando não desenha. */
  fraction: number | null;
}

const HIDDEN: TodayAxisPlan = { show: false, domainEnd: null, fraction: null };

/**
 * Decide se a linha "hoje" entra num eixo de TEMPO e até onde o eixo se estende.
 *  - hoje dentro do período dos dados → desenha, sem mexer no eixo;
 *  - hoje depois do último ponto → estende o eixo até hoje, desde que o vazio ocupe no
 *    máximo `maxShare` do eixo final;
 *  - menos de dois instantes distintos, datas inválidas ou hoje antes do primeiro ponto → não desenha.
 */
export function planTodayAxis(firstMs: number, lastMs: number, nowMs: number, maxShare: number = TODAY_MAX_SHARE): TodayAxisPlan {
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return HIDDEN;
  if (lastMs <= firstMs || nowMs < firstMs) return HIDDEN;
  if (nowMs <= lastMs) return { show: true, domainEnd: lastMs, fraction: (nowMs - firstMs) / (lastMs - firstMs) };
  const share = (nowMs - lastMs) / (nowMs - firstMs);
  if (share > maxShare) return HIDDEN;
  return { show: true, domainEnd: nowMs, fraction: 1 };
}

export interface Recency {
  /** Dias de calendário entre a data e hoje (negativo = data no futuro). */
  days: number;
  /** "hoje", "ontem", "há 12 dias", "há 3 meses", "há 1 ano e 2 meses"; null se a data é futura. */
  relative: string | null;
  /** A data absoluta — sempre presente (em saúde a relativa só complementa). */
  absolute: string;
  stale: boolean;
  /** Frase completa: "Último resultado: há 3 meses (12/08/2026) · pode estar desatualizado". */
  text: string;
}

export interface RecencyOptions {
  now?: number;
  /** Texto antes dos dois-pontos. */
  noun?: string;
  /** Marca como antigo acima deste número de dias. Sem valor = nunca marca. */
  staleAfterDays?: number | null;
  /** Veredito de "antigo" já calculado pela regra da própria tela (tem prioridade). */
  stale?: boolean;
  formatDate?: (date: Date) => string;
  staleNote?: string;
}

/** Recência do último ponto de um gráfico. Devolve null para data ausente ou inválida. */
export function describeRecency(date: DateInput, options: RecencyOptions = {}): Recency | null {
  const ms = toMs(date);
  if (ms == null) return null;
  const { now = Date.now(), noun = 'Último resultado', staleAfterDays = null, formatDate = formatDayMonthYear, staleNote = DEFAULT_STALE_NOTE } = options;
  const base = dayStart(ms);
  const days = Math.round((dayStart(now) - base) / DAY_MS);
  // Mesma redação de tempo que a Composição corporal já usa (fonte única: bodycomp/model.timeAgo).
  const relative = days < 0 ? null : timeAgo(new Date(base).toISOString(), base + days * DAY_MS);
  const absolute = formatDate(new Date(ms));
  const stale = options.stale ?? (staleAfterDays != null && days > staleAfterDays);
  const when = relative ? `${relative} (${absolute})` : absolute;
  return { days, relative, absolute, stale, text: `${noun}: ${when}${stale ? ` · ${staleNote}` : ''}` };
}
