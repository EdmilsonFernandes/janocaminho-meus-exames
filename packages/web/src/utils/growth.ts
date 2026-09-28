/**
 * Curvas de crescimento infantil (percentis OMS) — engine de cálculo.
 *
 * FONTE DE DADOS: `@pedi-growth/core` (MIT) — tabelas LMS oficiais da OMS:
 *   - WHO Child Growth Standards (0-5 anos): wfa / lhfa / bfa, idade em DIAS.
 *   - WHO Reference 2007 (5-19 anos): hfa / bfa (e wfa até 10 anos), idade em MESES.
 * A OMS NÃO publica peso-para-idade acima de 10 anos — acima disso a curva de peso
 * simplesmente não é desenhada (decisão clínica correta, não limitação técnica).
 *
 * Fórmulas (padrão LMS):
 *   z = ((v/M)^L - 1) / (L·S)   |   L≈0: z = ln(v/M)/S
 *   v(z) = M · (1 + L·S·z)^(1/L)   |   L≈0: v = M·e^(S·z)
 * Percentil via CDF normal (Abramowitz-Stegun 26.2.17, já exportada pelo pacote).
 */
import { loadTable, lookupLms, normalCdf, type LmsRow, type Sex } from '@pedi-growth/core';

export type GrowthIndicator = 'wfa' | 'lhfa' | 'bfa'; // peso / altura(comprimento) / IMC — para a idade

/** Faixas percentílicas desenhadas — convenção dos gráficos oficiais da OMS. */
export const PERCENTILE_ZS = [
  { key: 'p3', z: -1.881, label: '3' },
  { key: 'p15', z: -1.036, label: '15' },
  { key: 'p50', z: 0, label: '50' },
  { key: 'p85', z: 1.036, label: '85' },
  { key: 'p97', z: 1.881, label: '97' },
] as const;
export type PercentileKey = (typeof PERCENTILE_ZS)[number]['key'];

/** Nome das tabelas que usamos (union local — o pacote não exporta TableName da raiz). */
type TableName = 'wfa-boys-0-5' | 'wfa-girls-0-5' | 'lhfa-boys-0-5' | 'lhfa-girls-0-5' | 'bfa-boys-0-5' | 'bfa-girls-0-5' | 'wfa-boys-5-10' | 'wfa-girls-5-10' | 'hfa-boys-5-19' | 'hfa-girls-5-19' | 'bfa-boys-5-19' | 'bfa-girls-5-19';

/** Idade máxima (dias) coberta pela tabela 0-5 (que usa índice em dias). */
const DAYS_0_5 = 1856;
const DAYS_PER_MONTH = 30.4375;
/** Limite superior de idade (dias) da feature: 19 anos completos (spec: criança < 19). */
export const MAX_AGE_DAYS = 19 * 365.25;

/** Idade em dias entre duas datas ISO (YYYY-MM-DD). Cálculo UTC — imune a fuso. */
export function ageInDays(dobIso: string, atIso?: string): number {
  const dob = Date.parse(`${dobIso.slice(0, 10)}T00:00:00Z`);
  const at = Date.parse(`${(atIso ?? new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob) || Number.isNaN(at)) return NaN;
  return Math.round((at - dob) / 86400000);
}

/** Idade legível: "27d" → "8m" → "2a 3m" (usado no tooltip do gráfico). */
export function formatAgePt(ageDays: number): string {
  if (!Number.isFinite(ageDays) || ageDays < 0) return '—';
  if (ageDays < 28) return `${ageDays}d`;
  const months = Math.floor(ageDays / DAYS_PER_MONTH);
  if (months < 24) return `${months}m`;
  const years = Math.floor(months / 12);
  return `${years}a ${months % 12}m`;
}

/** Valor esperado no percentil z (inverso do z-score LMS). */
export function valueForZ(lms: LmsRow, z: number): number {
  const { L, M, S } = lms;
  if (Math.abs(L) < 1e-6) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/**
 * z-score LMS exato (sem arredondamento — o utilitário do pacote arredonda a 2
 * decimais, o que perde precisão no roundtrip e no percentil exibido).
 * Nota: NÃO aplica a extrapolação OMS para |z|>3 — para exibição educativa o z
 * exato + CDF é suficiente (percentis extremos mostram ~0,1/99,9).
 */
export function zFromLms(lms: LmsRow, value: number): number {
  const { L, M, S } = lms;
  if (!(value > 0) || !(M > 0) || !(S > 0)) return NaN;
  if (Math.abs(L) < 1e-10) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

/** Percentil (0-100) a partir do z-score. */
export function percentileForZ(z: number): number {
  return normalCdf(z) * 100;
}

/** Tabela LMS aplicável à idade. `null` = fora da cobertura OMS p/ o indicador. */
export async function getLms(indicator: GrowthIndicator, sex: Sex, ageDays: number): Promise<LmsRow | null> {
  if (!Number.isFinite(ageDays) || ageDays < 0) return null;
  const s = sex === 'male' ? 'boys' : 'girls';
  if (ageDays <= DAYS_0_5) {
    const t = await loadTable(`${indicator}-${s}-0-5` as TableName);
    return lookupLms(t, ageDays);
  }
  const months = ageDays / DAYS_PER_MONTH;
  const name: TableName = indicator === 'wfa' ? `wfa-${s}-5-10` : indicator === 'lhfa' ? `hfa-${s}-5-19` : `bfa-${s}-5-19`;
  return lookupLms(await loadTable(name), months);
}

/** z-score + percentil de uma medição da criança. `null` = idade fora da tabela. */
export async function zForValue(
  indicator: GrowthIndicator,
  sex: Sex,
  ageDays: number,
  value: number,
): Promise<{ z: number; percentile: number } | null> {
  const lms = await getLms(indicator, sex, ageDays);
  if (!lms || value <= 0) return null;
  const z = zFromLms(lms, value);
  if (!Number.isFinite(z)) return null;
  return { z, percentile: percentileForZ(z) };
}

/** Máximo de meses com curva por indicador (peso para aos 10a — limite OMS). */
const CAP_MONTHS: Record<GrowthIndicator, number> = { wfa: 120, lhfa: 228, bfa: 228 };

/**
 * Grade do gráfico: uma linha por mês com o valor de cada percentil.
 * `extraMonths` = idades exatas (meses, fração ok) das medições da criança —
 * entram na grade p/ o Recharts desenhar ponto+faixa na mesma data.
 */
export type GrowthGridRow = { m: number } & Partial<Record<PercentileKey, number>>;

export async function buildChartGrid(
  indicator: GrowthIndicator,
  sex: Sex,
  minAgeDays: number,
  maxAgeDays: number,
  extraMonths: number[] = [],
): Promise<GrowthGridRow[]> {
  const minM = Math.max(0, Math.floor(minAgeDays / DAYS_PER_MONTH));
  const maxM = Math.min(CAP_MONTHS[indicator], Math.ceil(Math.max(maxAgeDays, minAgeDays) / DAYS_PER_MONTH));
  if (maxM < minM) return [];
  // Passo adaptativo: denso nos 2 primeiros anos, esparso depois (≤ ~230 pontos/linha).
  const step = maxM <= 24 ? 0.5 : maxM <= 60 ? 1 : 3;
  const months = new Set<number>();
  for (let m = minM; m <= maxM + 1e-9; m += step) months.add(Number(m.toFixed(2)));
  for (const em of extraMonths) {
    if (!Number.isFinite(em) || em < 0) continue;
    const m = Math.min(CAP_MONTHS[indicator], Number(em.toFixed(2)));
    if (m >= minM) months.add(m);
  }
  const rows: GrowthGridRow[] = [];
  for (const m of [...months].sort((a, b) => a - b)) {
    const lms = await getLms(indicator, sex, m * DAYS_PER_MONTH);
    if (!lms) continue; // além da cobertura (ex.: peso > 10a)
    const row: GrowthGridRow = { m };
    for (const p of PERCENTILE_ZS) row[p.key] = Number(valueForZ(lms, p.z).toFixed(2));
    rows.push(row);
  }
  return rows;
}
