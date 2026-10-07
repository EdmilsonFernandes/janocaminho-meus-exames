// sportsDomains — classificação de analito por DOMÍNIO ESPORTIVO (E4.2, lógica PURA
// p/ ser testável — padrão utils/clinicalGoals). Delega primeiro pra `categorize`
// (utils/medicalData — categorias clínicas do app) e SOBREPÕE com os analitos do
// painel esportivo que a categorização genérica não cobre (SHBG, LH, FSH, IGF-1,
// cistatina C, CK total — canônicos do E3.4/E3.5).
import { categorize } from '../../utils/medicalData';

export type SportsDomainKey = 'hormonal' | 'hemograma' | 'cardio' | 'musculo_figado' | 'renal' | 'outros';

export const SPORTS_DOMAINS: { key: SportsDomainKey; label: string }[] = [
  { key: 'hormonal', label: 'Hormonal' },
  { key: 'hemograma', label: 'Hemograma' },
  { key: 'cardio', label: 'Cardio-Lipídios' },
  { key: 'musculo_figado', label: 'Músculo-Fígado' },
  { key: 'renal', label: 'Renal' },
  { key: 'outros', label: 'Outros' },
];

/** Normaliza SEM acento (convenção do projeto: patterns sempre sem acento). */
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Sobrepõe esportivas — casam por substring no nome canônico normalizado.
 *  Ordem importa: CK-MB antes de CK (substring), etc. */
const SPORTS_OVERRIDES: { rx: string; domain: SportsDomainKey }[] = [
  // Eixo hormonal estendido (não coberto pelas categorias clínicas genéricas)
  { rx: 'shbg', domain: 'hormonal' },
  { rx: 'globulina ligadora de hormonios sexuais', domain: 'hormonal' },
  { rx: ' lh', domain: 'hormonal' }, // espaço inicial: "LH" palavra, não substring de outro nome
  { rx: ' fsh', domain: 'hormonal' },
  { rx: 'hormonio luteinizante', domain: 'hormonal' },
  { rx: 'hormonio foliculo', domain: 'hormonal' },
  { rx: 'igf-1', domain: 'hormonal' },
  { rx: 'igf1', domain: 'hormonal' },
  { rx: 'somatomedina', domain: 'hormonal' },
  { rx: 'hormonio do crescimento', domain: 'hormonal' },
  { rx: 'gh ', domain: 'hormonal' },
  { rx: 'aldosterona', domain: 'hormonal' },
  { rx: 'renina', domain: 'hormonal' },
  { rx: 'prolactina', domain: 'hormonal' },
  { rx: 'estradiol', domain: 'hormonal' },
  { rx: 'testosterona', domain: 'hormonal' },
  { rx: 'cortisol', domain: 'hormonal' },
  { rx: 'dhea', domain: 'hormonal' },
  { rx: 'progesterona', domain: 'hormonal' },
  { rx: 'insulina', domain: 'hormonal' },
  { rx: 'homa', domain: 'hormonal' },
  // Muscular (CK total = dano/recuperação muscular — diferente do CK-MB cardíaco)
  { rx: 'creatino quinase', domain: 'musculo_figado' },
  { rx: 'creatina quinase', domain: 'musculo_figado' },
  { rx: 'ck total', domain: 'musculo_figado' },
  { rx: 'mioglobina', domain: 'musculo_figado' },
  // Renal estendido
  { rx: 'cistatina', domain: 'renal' },
  // Reologia/oxigenação (ferro é hemograma-esportivo: endurance)
  { rx: 'ferritina', domain: 'hemograma' },
  { rx: 'ferro', domain: 'hemograma' },
  { rx: 'transferrina', domain: 'hemograma' },
  { rx: 'saturacao', domain: 'hemograma' },
  { rx: 'tibc', domain: 'hemograma' },
  { rx: 'uibc', domain: 'hemograma' },
];

/** Mapeia categoria clínica existente → domínio esportivo. */
const CAT_TO_DOMAIN: Record<string, SportsDomainKey> = {
  horm: 'hormonal',
  hemo: 'hemograma',
  lipi: 'cardio',
  card: 'cardio',
  hepa: 'musculo_figado',
  renal: 'renal',
  glic: 'cardio', // glicemia/hba1c = cardiometabólico
  elet: 'outros',
  infl: 'outros', // pcr/vhs (ferritina/ferro já sobrepostos p/ hemograma acima)
  coag: 'outros',
  vita: 'outros',
  urina: 'outros',
  image: 'outros',
  other: 'outros',
};

/** Domínio esportivo de um analito (nome canônico OU cru — normaliza antes). */
export function sportsDomainOf(analyte: string): SportsDomainKey {
  const n = ` ${norm(analyte)} `;
  for (const o of SPORTS_OVERRIDES) {
    if (n.includes(o.rx)) {
      // CK-MB/troponina/BNP continuam CARDIO mesmo contendo "ck": só musculo se NÃO for mb/.cardíaco
      if (o.domain === 'musculo_figado' && (n.includes('ck-mb') || n.includes('ck mb') || n.includes('mb'))) return 'cardio';
      return o.domain;
    }
  }
  return CAT_TO_DOMAIN[categorize(analyte).key] ?? 'outros';
}

// ── Famílias de substância declarada (lógica PURA p/ banner/prep/lente — testável) ──

/** Substância da família ANDROGÊNICA/AAS (impacto conhecido em Hct/HDL/eixo). */
const ANDROGEN_RX = /testosterona|durateston|sustanon|enantato|cipionato|cypionato|propionato|undecilato|nebido|nandrolona|trembolona|trenbolona|stanozolol|winstrol|oxandrolona|oximetolona|hemogenin|anadrol|metandrostenolona|dianabol|drostanolona|masteron|metenolona|primobolan|boldenona|equipoise|mesterolona|proviron|dht/i;

/** Há androgênio/AAS declarado entre as substâncias? (banner: chip HDL×andrógeno;
 *  prep: pergunta de conduta em Hct 48-54; lente: viés hormonal.) */
export function androgenDeclared(substances: { name: string }[] | undefined | null): boolean {
  return (substances ?? []).some((s) => ANDROGEN_RX.test(s?.name ?? ''));
}

/** Há HORMÔNIO declarado (classe "[Hormônio]" do form OU família eixo GH/androgênio)? */
export function hormoneDeclared(substances: { name: string; klass?: string | null }[] | undefined | null): boolean {
  return (substances ?? []).some((s) =>
    s?.klass === 'Hormônio' || ANDROGEN_RX.test(s?.name ?? '') || /hgh|somatropina|igf-?1|ghrp|cjc|ipamorelina|sermorelina/i.test(s?.name ?? ''));
}

// ── LENTE POR ARQUÉTIPO (E5 "lente por arquétipo" — matriz esporte × contexto hormonal,
//    dimensões INDEPENDENTES: nunca acoplar "musculação = uso hormonal"). O perfil muda
//    a FORMA de analisar: ordem das abas, spotlight nos quick stats/primeiros cards,
//    chips de foco e viés das perguntas — dado + ordenação, ZERO sistema visual novo. ──

/** Contexto hormonal declarado no wizard (persistido em collectionContext.hormonalContext). */
export type HormonalContext = 'nenhum' | 'trt' | 'declarado' | 'nao_dizer';

/** Viés das perguntas de consulta (o SportsConsultPrep monta o texto com o dado real). */
export type QuestionBias = 'ferro_endurance' | 'ck_intensa' | 'monitoramento_trt' | 'hct_hormonal' | null;

/** Marcador que "sobe" (quick stats + primeiros cards): analito (rx) OU métrica HC. */
export interface SpotlightSpec {
  key: string;
  /** Label curto do tile. */
  label: string;
  /** Match por nameCanonical (analito) — SEMPRE com flag i (canônico é uppercase). */
  rx?: RegExp;
  /** Métrica do Health Connect (não-analito): FC de repouso (hr-trend) / distância 7d. */
  metric?: 'hr_rest' | 'distance_week';
}

export interface SportArchetype {
  key: string;
  /** Header do painel esportivo. */
  header: string;
  /** Linha de contexto abaixo do header (ênfase de marcadores por modalidade). */
  emphasis: string;
  /** Domínio selecionado por padrão nos filtros (null = "Todos"). */
  defaultDomain: SportsDomainKey | null;
  /** Ordem/prioridade das abas de domínio (domínios ausentes entram depois; 'outros' sempre no fim). */
  domainOrder: SportsDomainKey[];
  /** Marcadores que sobem pros quick stats e primeiros cards (lente do arquétipo). */
  spotlight: SpotlightSpec[];
  /** Chips de foco típicos da modalidade (rótulo de PREOCUPAÇÃO típica — não é dado do usuário). */
  focusChips: string[];
  /** Viés das perguntas da consulta (máx ~5 mantido — só muda a priorização). */
  questionBias: QuestionBias;
}

const ALL_DOMAINS_ORDER: SportsDomainKey[] = ['hormonal', 'hemograma', 'cardio', 'musculo_figado', 'renal'];

const ARCHETYPE_ENDURANCE: SportArchetype = {
  key: 'endurance',
  header: 'Resistência & Performance',
  emphasis: 'Base aeróbica: hemoglobina, hematócrito e ferro sustentam o consumo de oxigênio.',
  defaultDomain: 'hemograma',
  domainOrder: ['hemograma', 'cardio', 'renal', 'musculo_figado', 'hormonal'],
  spotlight: [
    { key: 'FERRITINA', label: 'Ferritina', rx: /ferritina/i },
    { key: 'HEMOGLOBINA', label: 'Hemoglobina', rx: /hemoglobina/i },
    { key: 'HR_REST', label: 'FC repouso', metric: 'hr_rest' },
    { key: 'DIST_7D', label: 'Distância 7d', metric: 'distance_week' },
  ],
  focusChips: ['Estresse de impacto e hidratação em provas longas'],
  questionBias: 'ferro_endurance',
};

const ARCHETYPE_INTENSA: SportArchetype = {
  key: 'crossfit',
  header: 'CrossFit & Alta Intensidade',
  emphasis: 'Recuperação muscular: CK e enzimas sob treino intenso e frequente.',
  defaultDomain: 'musculo_figado',
  domainOrder: ['musculo_figado', 'hormonal', 'cardio', 'hemograma', 'renal'],
  spotlight: [
    { key: 'CK', label: 'CK total', rx: /creatino quinase|creatina quinase|ck total/i },
    { key: 'TGO', label: 'TGO (AST)', rx: /tgo|\bast\b/i },
    { key: 'TGP', label: 'TGP (ALT)', rx: /tgp|\balt\b/i },
    { key: 'GGT', label: 'Gama-GT', rx: /gama\s?gt|ggt/i },
  ],
  focusChips: ['CK alto após treino intenso pode ser esperado — interpretar com médico'],
  questionBias: 'ck_intensa',
};

const ARCHETYPE_STRENGTH: SportArchetype = {
  key: 'strength',
  header: 'Força & Hipertrofia',
  emphasis: 'Eixo hormonal, recuperação muscular (CK) e articulações sob carga de treino.',
  defaultDomain: 'hormonal',
  domainOrder: ['hormonal', 'musculo_figado', 'cardio', 'hemograma', 'renal'],
  spotlight: [
    { key: 'TESTOSTERONA', label: 'Testosterona', rx: /testosterona/i },
    { key: 'CK', label: 'CK total', rx: /creatino quinase|creatina quinase|ck total/i },
    { key: 'CREATININA', label: 'Creatinina', rx: /creatinina/i },
  ],
  focusChips: [],
  questionBias: null,
};

/** HIPERTROFIA × uso hormonal declarado (matriz do dono): Hct/testo/HDL sobem. */
const ARCHETYPE_STRENGTH_HORMONAL: SportArchetype = {
  ...ARCHETYPE_STRENGTH,
  spotlight: [
    { key: 'TESTOSTERONA', label: 'Testosterona', rx: /testosterona/i },
    { key: 'HEMATOCRITO', label: 'Hematócrito', rx: /hematocrito/i },
    { key: 'HDL', label: 'HDL', rx: /hdl/i },
  ],
  focusChips: ['Hematócrito e HDL merecem acompanhamento'],
  questionBias: 'hct_hormonal' as const,
};

const ARCHETYPE_TRT: SportArchetype = {
  key: 'trt',
  header: 'Reposição & Performance',
  emphasis: 'Monitoramento da reposição prescrita: testosterona na meta, hematócrito, PSA e lipídios.',
  defaultDomain: 'hormonal',
  domainOrder: ['hormonal', 'cardio', 'hemograma', 'musculo_figado', 'renal'],
  spotlight: [
    { key: 'TESTOSTERONA', label: 'Testosterona', rx: /testosterona/i },
    { key: 'HEMATOCRITO', label: 'Hematócrito', rx: /hematocrito/i },
    { key: 'PSA', label: 'PSA', rx: /\bpsa\b/i },
    { key: 'HDL', label: 'HDL', rx: /hdl/i },
  ],
  focusChips: ['Monitoramento periódico conforme diretriz de reposição'],
  questionBias: 'monitoramento_trt' as const,
};

const ARCHETYPE_PERFORMANCE: SportArchetype = {
  key: 'performance',
  header: 'Alta Performance',
  emphasis: 'Oxigenação, recuperação e consistência dos marcadores ao longo da temporada.',
  defaultDomain: 'hemograma',
  domainOrder: ALL_DOMAINS_ORDER,
  spotlight: [],
  focusChips: [],
  questionBias: null,
};

export const DEFAULT_ARCHETYPE: SportArchetype = {
  key: 'geral',
  header: 'Saúde Esportiva',
  emphasis: 'Seus marcadores organizados pelo contexto de treino e coleta.',
  defaultDomain: null,
  domainOrder: ALL_DOMAINS_ORDER,
  spotlight: [],
  focusChips: [],
  questionBias: null,
};

/** Esportes por família (fuzzy sobre a modalidade normalizada sem acento). */
const ENDURANCE_RX = /corrid|corredor|maraton|meia maraton|10k|21k|42k|ultra|trail|ciclism|pedal|bike|nataca|triatlo|triathlon|ironman|endurance|resistencia/i;
const INTENSA_RX = /crossfit|funcional|hiit|metcon|\bwod\b|\blpo\b/i;
const STRENGTH_RX = /musculac|fisicult|bodybuild|hipertrofia|powerlift|levantamento|forca|strongman|calistenia/i;
const PERFORMANCE_RX = /alta performance|competicao|atleta|futebol|futebo|volei|basquete|handebol|luta|mma|boxe|jiu|judo|natacao|surf|skate/i;

/** Lê hormonalContext do jsonb collectionContext (wizard 3 passos — sem migration). */
export function parseHormonalContext(cc: unknown): HormonalContext | null {
  if (!cc || typeof cc !== 'object') return null;
  const v = (cc as Record<string, unknown>).hormonalContext;
  return v === 'nenhum' || v === 'trt' || v === 'declarado' || v === 'nao_dizer' ? v : null;
}

/** Lê o nível declarado no wizard (collectionContext.level). */
export function parseSportLevel(cc: unknown): string | null {
  if (!cc || typeof cc !== 'object') return null;
  const v = (cc as Record<string, unknown>).level;
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null;
}

/** Deduz contexto hormonal das substâncias declaradas (sem wizard): classe Hormônio →
 *  keyword trt/reposição vira 'trt'; resto vira 'declarado'. Sem hormônio → null. */
export function deduceHormonalContext(substances: { name: string; klass?: string | null }[] | undefined | null): HormonalContext | null {
  for (const s of substances ?? []) {
    const isHormone = s?.klass === 'Hormônio' || hormoneDeclared([s]);
    if (!isHormone) continue;
    if (/trt|reposicao/i.test(`${s?.name ?? ''} ${s?.klass ?? ''}`)) return 'trt';
    return 'declarado';
  }
  return null;
}

export interface LensInput {
  modality?: string | null;
  /** Do wizard (collectionContext.hormonalContext) — prevalece sobre a dedução. */
  hormonalContext?: HormonalContext | null;
  /** Substâncias declaradas (dedução quando o wizard não rodou — dado antigo continua ok). */
  substances?: { name: string; klass?: string | null }[] | undefined | null;
}

/** LENTE do painel: esporte (fuzzy da modalidade) × contexto hormonal. TRT vence
 *  qualquer esporte (matriz do dono); 'nao_dizer' NÃO assume nada (lens só do esporte). */
export function resolveArchetype(input: LensInput): SportArchetype {
  const hc = input.hormonalContext ?? deduceHormonalContext(input.substances);
  const hormonal = hc === 'trt' || hc === 'declarado';
  const n = norm(input.modality ?? '');
  if (hc === 'trt') return ARCHETYPE_TRT;
  if (!n) return hormonal ? ARCHETYPE_STRENGTH_HORMONAL : DEFAULT_ARCHETYPE;
  if (ENDURANCE_RX.test(n)) return ARCHETYPE_ENDURANCE;
  if (INTENSA_RX.test(n)) return ARCHETYPE_INTENSA;
  if (STRENGTH_RX.test(n)) return hormonal ? ARCHETYPE_STRENGTH_HORMONAL : ARCHETYPE_STRENGTH;
  if (PERFORMANCE_RX.test(n)) return ARCHETYPE_PERFORMANCE;
  return hormonal ? ARCHETYPE_STRENGTH_HORMONAL : DEFAULT_ARCHETYPE;
}

/** Retrocompatível: lente SÓ pela modalidade (wizard ainda não rodou / testes). */
export function archetypeOf(modality?: string | null): SportArchetype {
  return resolveArchetype({ modality });
}

// ── MERGE de variantes ortográficas do PAINEL (júri E4+ #6 — "HEMATÓCRITO ×
//    HEMATOCRITO"): laboratórios escrevem com e sem acento e o canonicalizador do
//    server chegou a gerar DOIS analitos p/ o mesmo marcador → dois cards. O merge é
//    AQUI no front (agrupamento do painel esportivo; pipeline server intocado neste
//    fix): chave sem acento/minúscula, pontos reordenados por data, faixa = MEDIANA
//    dos pontos (mesma régua do /items/evolution), grafia = a do dado mais recente. ──

/** Contrato estrutural do analito do /items/evolution (contrato do SportsMarkerCard). */
export interface PanelAnalyte {
  nameCanonical: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  firstValue: number | null;
  lastValue: number | null;
  firstDate: string | null;
  lastDate: string | null;
  pctChange: number | null;
  direction: 'up' | 'down' | 'stable';
  inRange: boolean;
  abnormal: boolean;
  count: number;
  points: { value: number | null; date: string | null; flag?: string | null; examId?: string; examTitle?: string | null; method?: string | null; refLow?: number | null; refHigh?: number | null }[];
}

/** Chave de agrupamento do painel: canônico minúsculo SEM acento (convenção norm()). */
export function panelGroupKey(nameCanonical: string): string {
  return norm(nameCanonical).replace(/\s+/g, ' ').trim();
}

const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Faixa unificada = MEDIANA das faixas válidas dos pontos (espelha medianRefRange
 *  do server; fallback = faixa da entrada base). */
function medianRefRangeOf<T extends { refLow?: number | null; refHigh?: number | null }>(points: T[]): { refLow: number | null; refHigh: number | null } {
  const valid = points.filter((p) => p.refLow != null && p.refHigh != null && (p.refHigh as number) > (p.refLow as number));
  if (!valid.length) return { refLow: null, refHigh: null };
  return { refLow: median(valid.map((p) => p.refLow as number)), refHigh: median(valid.map((p) => p.refHigh as number)) };
}

/** Agrupa analitos que diferem SÓ por acento/caixa num único card. Singletons voltam
 *  idênticos (sem recomputar nada — zero risco p/ quem não tem o drift). */
export function mergePanelVariants<T extends PanelAnalyte>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = panelGroupKey(it.nameCanonical);
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    // Base = entrada com o dado mais recente (grafia da última coleta vence; empate → mais pontos).
    const base = [...group].sort((a, b) =>
      new Date(b.lastDate ?? 0).getTime() - new Date(a.lastDate ?? 0).getTime() || b.points.length - a.points.length)[0];
    // Pontos mesclados: 1 por DIA (a última medição do dia vence — mesma semântica do
    // server), ordenados asc — o SportsMarkerCard pinta histórico+pin desta série.
    const byDay = new Map<string, T['points'][number]>();
    for (const g of group) {
      for (const p of g.points) {
        if (p.value == null) continue;
        const day = p.date ? new Date(p.date).toDateString() : 's/d';
        const prev = byDay.get(day);
        if (!prev || new Date(p.date ?? 0).getTime() >= new Date(prev.date ?? 0).getTime()) byDay.set(day, p);
      }
    }
    const points = [...byDay.values()].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
    const first = points[0];
    const last = points[points.length - 1];
    const v0 = first?.value ?? null;
    const v1 = last?.value ?? null;
    const pct = v0 != null && v1 != null && v0 !== 0 ? Math.round(((v1 - v0) / Math.abs(v0)) * 100) : 0;
    const { refLow, refHigh } = (() => {
      const m = medianRefRangeOf(points);
      return { refLow: m.refLow ?? base.refLow, refHigh: m.refHigh ?? base.refHigh };
    })();
    const outOfRange = v1 != null && ((refHigh != null && v1 > refHigh) || (refLow != null && v1 < refLow));
    const flagAlt = !!(last?.flag && /high|low|alta|alto|baix|alterad/i.test(last.flag));
    out.push({
      ...base,
      unit: base.unit ?? group.find((g) => g.unit)?.unit ?? null,
      refLow, refHigh,
      firstValue: v0, lastValue: v1,
      firstDate: first?.date ?? null, lastDate: last?.date ?? null,
      pctChange: pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'stable',
      inRange: !outOfRange,
      abnormal: outOfRange || flagAlt,
      count: points.length,
      points,
    });
  }
  return out;
}

/** Ordem das abas de domínio pela lente (ausentes depois na ordem padrão; 'outros' no fim). */
export function domainOrderOf(a: SportArchetype): SportsDomainKey[] {
  const head = a.domainOrder.filter((k) => SPORTS_DOMAINS.some((s) => s.key === k));
  const rest = ALL_DOMAINS_ORDER.filter((k) => !head.includes(k));
  return [...head, ...rest, 'outros'];
}

/** Índice de spotlight de um analito (0 = primeiro; -1 = fora do spotlight). */
export function spotlightIndexOf(a: SportArchetype, nameCanonical: string): number {
  return a.spotlight.findIndex((s) => s.rx?.test(nameCanonical));
}
