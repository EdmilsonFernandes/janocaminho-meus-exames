import type { Marker } from './ChangesSinceExam';

/**
 * MODO EXEMPLO — payload fictício do dashboard p/ quem ainda não tem exames.
 *
 * Motivação (pesquisa ativação set/26 + decisão do dono 25/09): 63% não voltam após o
 * dia 0 porque o app abre VAZIO — sem posse do PDF no momento, a pessoa não sente o que
 * perde. O modo exemplo mostra o dashboard cheio ("vendo o app, sente a vontade") com
 * dados de uma pessoa fictícia, e converte: banner âmbar + CTAs trocados por "Usar meu
 * exame". Cliques em telas de dado real abrem dialog de conversão (não navegam pro vazio).
 *
 * Regras:
 * - NÃO persiste (sem localStorage): recarregar/sair reseta pro app real — dado de saúde
 *   fictício jamais "vira seu".
 * - Entrada SÓ no estado vazio (score nulo + zero exames), como ação secundária do hero.
 */
export const DEMO_FIRST_NAME = 'Ana';

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

/** Marcadores da "Ana": 1 piorando (LDL) + 1 melhorando (glicose) — alimenta hero, Changes e dica IA. */
export const DEMO_WORSENED: Marker[] = [
  { name: 'LDL colesterol', nameCanonical: 'LDL', unit: 'mg/dL', latest: { valueNumeric: 142 }, refHigh: 130, flag: 'HIGH' },
];
export const DEMO_IMPROVED: Marker[] = [
  { name: 'Glicose em jejum', nameCanonical: 'GLUCOSE', unit: 'mg/dL', latest: { valueNumeric: 98 }, refLow: 70, refHigh: 99, flag: '' },
];

/** Mesmo shape do retorno de useDashboardData() — trocado 1:1 quando demo === true. */
export const DEMO_BODY_REGIONS = [
  {
    key: 'coracao',
    label: 'Coração & vasos',
    emoji: '❤️',
    level: 'alterado' as const,
    markers: [
      {
        nameCanonical: 'LDL',
        name: 'LDL Colesterol',
        level: 'alterado' as const,
        valueText: '142',
        unit: 'mg/dL',
        refText: '< 130',
        performedAt: daysAgo(12),
        prior: { valueText: '128', performedAt: daysAgo(95) },
        deltaPct: 10.9,
        trend: 'piorou',
        examId: 'demo-exam-1',
        historical: false,
      },
      {
        nameCanonical: 'TRIGLICERIDES',
        name: 'Triglicerídeos',
        level: 'ok' as const,
        valueText: '138',
        unit: 'mg/dL',
        refText: '< 150',
        performedAt: daysAgo(12),
        prior: null,
        deltaPct: null,
        trend: 'estavel',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
  {
    key: 'pancreas',
    label: 'Pâncreas & glicemia',
    emoji: '🧬',
    level: 'ok' as const,
    markers: [
      {
        nameCanonical: 'GLUCOSE',
        name: 'Glicose em jejum',
        level: 'ok' as const,
        valueText: '98',
        unit: 'mg/dL',
        refText: '70 – 99',
        performedAt: daysAgo(12),
        prior: { valueText: '104', performedAt: daysAgo(95) },
        deltaPct: -5.7,
        trend: 'melhorou',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
  {
    key: 'cerebro',
    label: 'Cérebro & tireoide',
    emoji: '🧠',
    level: 'ok' as const,
    markers: [
      {
        nameCanonical: 'TSH',
        name: 'TSH',
        level: 'ok' as const,
        valueText: '2,1',
        unit: 'µUI/mL',
        refText: '0,4 – 4,0',
        performedAt: daysAgo(12),
        prior: null,
        deltaPct: null,
        trend: 'estavel',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
  {
    key: 'rins',
    label: 'Rins & eletrólitos',
    emoji: '🫘',
    level: 'ok' as const,
    markers: [
      {
        nameCanonical: 'CREATININA',
        name: 'Creatinina',
        level: 'ok' as const,
        valueText: '0,9',
        unit: 'mg/dL',
        refText: '0,5 – 1,1',
        performedAt: daysAgo(12),
        prior: null,
        deltaPct: null,
        trend: 'estavel',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
  {
    key: 'sangue',
    label: 'Sangue (hemograma)',
    emoji: '🩸',
    level: 'ok' as const,
    markers: [
      {
        nameCanonical: 'HEMOGLOBINA',
        name: 'Hemoglobina',
        level: 'ok' as const,
        valueText: '13,8',
        unit: 'g/dL',
        refText: '12,0 – 16,0',
        performedAt: daysAgo(12),
        prior: null,
        deltaPct: null,
        trend: 'estavel',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
  {
    key: 'figado',
    label: 'Fígado',
    emoji: '🍽️',
    level: 'ok' as const,
    markers: [
      {
        nameCanonical: 'TGP',
        name: 'TGP (ALT)',
        level: 'ok' as const,
        valueText: '22',
        unit: 'U/L',
        refText: '< 35',
        performedAt: daysAgo(12),
        prior: null,
        deltaPct: null,
        trend: 'estavel',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
  {
    key: 'hormonios',
    label: 'Hormônios',
    emoji: '🧪',
    level: 'sem_dados' as const,
    markers: [],
  },
  {
    key: 'pulmoes',
    label: 'Pulmões',
    emoji: '🫁',
    level: 'sem_dados' as const,
    markers: [],
  },
  {
    key: 'musculos',
    label: 'Músculos',
    emoji: '💪',
    level: 'sem_dados' as const,
    markers: [],
  },
  {
    key: 'ossos',
    label: 'Ossos & metabolismo',
    emoji: '🦴',
    level: 'atencao' as const,
    markers: [
      {
        nameCanonical: 'VITAMINA_D',
        name: 'Vitamina D (25-OH)',
        level: 'atencao' as const,
        valueText: '24',
        unit: 'ng/mL',
        refText: '30 – 100',
        performedAt: daysAgo(12),
        prior: null,
        deltaPct: null,
        trend: 'estavel',
        examId: 'demo-exam-1',
        historical: false,
      },
    ],
  },
];

export const DEMO_DASHBOARD = {
  stats: { exams: 6, abnormal: 5 },
  failed: 0,
  lastExam: daysAgo(12),
  processing: null, // E1: strip só com dado real — demo jamais "analisando"
  buckets: { bons: 24, alerta: 3, alterados: 2 },
  score: 78,
  prevScore: null, // nunca exibe ganho no demo (guard `demo ? 0 :` no scoreGain)
  importante: 1,
  moderada: 2,
  cardioRisk: { level: 'moderado', factors: [{ risk: true }, { risk: true }] },
  markerCount: 29,
  credits: 60,
  me: null,
  loaded: true,
  worsened: DEMO_WORSENED,
  improved: DEMO_IMPROVED,
  staleWarning: '',
  availability: null,
  rejected: 0,
  bio: { age: 32, confidence: 'media', markersUsed: 14 },
  bioKdm: null, // 2ª idade bio (KDM) no modo exemplo: card mostra só a principal (trata null)
  bioAvail: null,
  hsLoaded: true,
  indices: [] as never[], // índices clínicos calculados: só com dado REAL (cards escondidos no demo)
  bodyRegions: DEMO_BODY_REGIONS,
};

/** Idade cronológica da persona (alimenta o diff do Idade Bio: 32a = "2a mais jovem"). */
export const DEMO_CHRONO_AGE = 34;
