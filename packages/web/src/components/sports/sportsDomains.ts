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

// ── Whitelabel interno por esporte (diretiva do dono: filtro-padrão + ênfase + copy) ──

export interface SportArchetype {
  key: string;
  /** Header do painel esportivo. */
  header: string;
  /** Linha de contexto abaixo do header (ênfase de marcadores por modalidade). */
  emphasis: string;
  /** Domínio selecionado por padrão nos filtros (null = "Todos"). */
  defaultDomain: SportsDomainKey | null;
}

const ARCHETYPES: { rx: RegExp; archetype: SportArchetype }[] = [
  {
    rx: /corrid|corredor|maraton|meia maraton|10k|21k|42k|ultra|trail|ciclism|pedal|nataca|triatlo|triathlon|ironman|endurance|resistencia/i,
    archetype: {
      key: 'endurance',
      header: 'Resistência & Performance',
      emphasis: 'Base aeróbica: hemoglobina, hematócrito e ferro sustentam o consumo de oxigênio.',
      defaultDomain: 'cardio',
    },
  },
  {
    rx: /musculac|fisicult|bodybuild|hipertrofia|powerlift|levantamento|forca|strongman|calistenia|crossfit/i,
    archetype: {
      key: 'strength',
      header: 'Força & Hipertrofia',
      emphasis: 'Eixo hormonal, recuperação muscular (CK) e articulações sob carga de treino.',
      defaultDomain: 'hormonal',
    },
  },
  {
    rx: /alta performance|competicao|competição|atleta|futebol|futebo|volei|basquete|handebol|luta|mma|boxe|jiu|judo|natacao|surf|skate/i,
    archetype: {
      key: 'performance',
      header: 'Alta Performance',
      emphasis: 'Oxigenação, recuperação e consistência dos marcadores ao longo da temporada.',
      defaultDomain: 'hemograma',
    },
  },
];

export const DEFAULT_ARCHETYPE: SportArchetype = {
  key: 'geral',
  header: 'Saúde Esportiva',
  emphasis: 'Seus marcadores organizados pelo contexto de treino e coleta.',
  defaultDomain: null,
};

/** Arquétipo da modalidade declarada (normalizada sem acento antes do match). */
export function archetypeOf(modality?: string | null): SportArchetype {
  const n = norm(modality ?? '');
  if (!n) return DEFAULT_ARCHETYPE;
  for (const a of ARCHETYPES) if (a.rx.test(n)) return a.archetype;
  return DEFAULT_ARCHETYPE;
}
