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
  bioAvail: null,
  hsLoaded: true,
};

/** Idade cronológica da persona (alimenta o diff do Idade Bio: 32a = "2a mais jovem"). */
export const DEMO_CHRONO_AGE = 34;
