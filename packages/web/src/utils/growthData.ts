/**
 * growthData.ts — tabelas LMS da OMS vendorizadas + lookup/interpolação/CDF.
 *
 * POR QUE VENDOR: o pacote `@pedi-growth/core` (MIT) carrega cada tabela via
 * `import('.json', { with: { type: 'json' } })` — import dinâmico com atributo que
 * o pre-bundle do Vite NÃO suporta (404 em .vite/deps; com optimizeDeps.exclude o
 * /@fs/ serve com MIME errado). Import ESTÁTICO de JSON o Vite transforma nativo
 * em dev e em build (rolldown) — zero mágica de runtime, funciona também no APK.
 *
 * FONTE: WHO Child Growth Standards (0-5a, tabelas diárias age=dias) + WHO Growth
 * Reference 2007 (5-19a, tabelas mensais age=meses). Dados domínio público OMS;
 * extraídos de @pedi-growth/core 1.1.2 (MIT, github.com/iurileao-hub/pedi-growth).
 * Ver ../data/growth/README.md.
 */
import wfaBoys05 from '../data/growth/wfa-boys-0-5.json';
import wfaGirls05 from '../data/growth/wfa-girls-0-5.json';
import wfaBoys510 from '../data/growth/wfa-boys-5-10.json';
import wfaGirls510 from '../data/growth/wfa-girls-5-10.json';
import lhfaBoys05 from '../data/growth/lhfa-boys-0-5.json';
import lhfaGirls05 from '../data/growth/lhfa-girls-0-5.json';
import hfaBoys519 from '../data/growth/hfa-boys-5-19.json';
import hfaGirls519 from '../data/growth/hfa-girls-5-19.json';
import bfaBoys05 from '../data/growth/bfa-boys-0-5.json';
import bfaGirls05 from '../data/growth/bfa-girls-0-5.json';
import bfaBoys519 from '../data/growth/bfa-boys-5-19.json';
import bfaGirls519 from '../data/growth/bfa-girls-5-19.json';

export type Sex = 'male' | 'female';
export type LmsRow = { age: number; L: number; M: number; S: number };

/** Nome canônico de tabela (mesma chave que o pacote original usava). */
const TABLES = {
  'wfa-boys-0-5': wfaBoys05,
  'wfa-girls-0-5': wfaGirls05,
  'wfa-boys-5-10': wfaBoys510,
  'wfa-girls-5-10': wfaGirls510,
  'lhfa-boys-0-5': lhfaBoys05,
  'lhfa-girls-0-5': lhfaGirls05,
  'hfa-boys-5-19': hfaBoys519,
  'hfa-girls-5-19': hfaGirls519,
  'bfa-boys-0-5': bfaBoys05,
  'bfa-girls-0-5': bfaGirls05,
  'bfa-boys-5-19': bfaBoys519,
  'bfa-girls-5-19': bfaGirls519,
} as const;

export type TableName = keyof typeof TABLES;

/** Tabela LMS por nome (síncrono — dados embutidos no bundle). */
export function loadTable(name: TableName): LmsRow[] {
  return TABLES[name] as unknown as LmsRow[];
}

/** Interpolação linear campo a campo (idêntica ao lms.js do pacote). */
function interpolateLms(a: LmsRow, b: LmsRow, f: number): LmsRow {
  return {
    age: a.age + f * (b.age - a.age),
    L: a.L + f * (b.L - a.L),
    M: a.M + f * (b.M - a.M),
    S: a.S + f * (b.S - a.S),
  };
}

/** Busca binária por `.age` com interpolação linear no vão. Fora do range → null.
 *  ATENÇÃO à unidade: tabelas 0-5 usam age em DIAS; 5-19 em MESES (mesma
 *  convenção do pacote — quem chama decide o índice certo). */
export function lookupLms(table: LmsRow[], index: number): LmsRow | null {
  if (table.length === 0) return null;
  const first = table[0];
  const last = table[table.length - 1];
  if (index < first.age || index > last.age) return null;
  if (index === first.age) return first;
  if (index === last.age) return last;
  let lo = 0;
  let hi = table.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (table[mid].age === index) return table[mid];
    if (table[mid].age < index) lo = mid + 1;
    else hi = mid - 1;
  }
  const lower = table[hi];
  const upper = table[lo];
  if (lower.age === upper.age) return lower;
  return interpolateLms(lower, upper, (index - lower.age) / (upper.age - lower.age));
}

/**
 * CDF normal padrão Φ(z) — aproximação de Zelen & Severo (Abramowitz & Stegun
 * 26.2.17): |erro| < 7,5e-8. Mesma fórmula que o pacote usava (percentis idênticos).
 */
export function normalCdf(z: number): number {
  const b1 = 0.31938153, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
  const p = 0.2316419;
  const phi = (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const cdfPos = (x: number) => {
    const t = 1 / (1 + p * x);
    return 1 - phi(x) * (b1 * t + b2 * t * t + b3 * t ** 3 + b4 * t ** 4 + b5 * t ** 5);
  };
  return z >= 0 ? cdfPos(z) : 1 - cdfPos(-z);
}
