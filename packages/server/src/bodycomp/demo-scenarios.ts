/**
 * Massa de dados SINTÉTICA de composição corporal — pessoas e valores fictícios.
 *
 * Serve a três usos: testes do servidor, testes da tela (web) e o seed de demonstração
 * (`scripts/seed-body-composition-demo.ts`) para ver a tela com cara de vida real.
 * Arquivo puro (sem Prisma, sem Node): pode ser importado pelo web.
 *
 * Os valores fecham entre si como numa folha de verdade: gordura = peso × %, massa livre
 * de gordura = peso − gordura, água/proteína/minerais como frações da massa livre de
 * gordura, IMC = peso ÷ altura², TMB pela fórmula de Katch-McArdle. O ruído é
 * determinístico (semente fixa) — o mesmo cenário gera sempre os mesmos números.
 */

export interface DemoReading {
  measuredAt: Date;
  source: 'INBODY_QR' | 'MANUAL';
  deviceBrand: string | null;
  deviceModel: string | null;
  weightKg: number;
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
}

export type DemoScenarioKey =
  | 'emagrecimento'
  | 'ganhoDeMassa'
  | 'trocaDeAparelho'
  | 'unica'
  | 'antiga'
  | 'semMusculo'
  | 'foraDaFaixa'
  | 'densa'
  | 'modeloNaoConferido';

export const DEMO_SCENARIOS: Record<DemoScenarioKey, string> = {
  emagrecimento: '14 avaliações mensais no InBody 270: 92 → 81 kg, gordura de 27 % para 19 %',
  ganhoDeMassa: '8 avaliações a cada 6 semanas: peso sobe com o músculo, gordura estável',
  trocaDeAparelho: '3 avaliações digitadas (Omron, com gordura visceral) e depois 3 no InBody 270',
  unica: 'uma única avaliação — sem variação e sem gráfico',
  antiga: 'duas avaliações, a mais recente de 9 meses atrás (aviso de dado antigo)',
  semMusculo: '3 avaliações digitadas só com peso e % de gordura (balança simples)',
  foraDaFaixa: 'gordura abaixo da faixa, depois muito acima — a régua nos dois extremos',
  densa: '60 avaliações semanais — gráfico e histórico cheios',
  modeloNaoConferido: 'InBody 570, modelo ainda não conferido (pede revisão)',
};

const DAY = 86_400_000;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** PRNG determinístico (mulberry32): ruído reprodutível, sem Math.random. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Person {
  heightCm: number;
  male: boolean;
}

/** Folha completa (padrão InBody) a partir de peso, % de gordura e músculo. */
function inbody(person: Person, at: Date, weightKg: number, bodyFatPct: number, skeletalMuscleKg: number, model = '270'): DemoReading {
  const h = person.heightCm / 100;
  const weight = r1(weightKg);
  const fat = r1((weight * bodyFatPct) / 100);
  const ffm = r1(weight - fat);
  const ideal = 22 * h * h;
  const idealFat = person.male ? [0.1, 0.2] : [0.18, 0.28];
  const idealFfm = ideal * (person.male ? 0.85 : 0.77);
  return {
    measuredAt: at,
    source: 'INBODY_QR',
    deviceBrand: 'InBody',
    deviceModel: model,
    weightKg: weight,
    heightCm: person.heightCm,
    bodyFatPct: r1((fat / weight) * 100),
    fatMassKg: fat,
    skeletalMuscleKg: r1(skeletalMuscleKg),
    fatFreeMassKg: ffm,
    bodyWaterL: r1(ffm * 0.732),
    proteinKg: r1(ffm * 0.197),
    mineralKg: r2(ffm * 0.068),
    bmi: r1(weight / (h * h)),
    bmrKcal: Math.round(370 + 21.6 * ffm),
    waistHipRatio: r2(0.78 + bodyFatPct / 180),
    visceralFatLevel: null,
    ranges: {
      weightKg: [r1(ideal * 0.85), r1(ideal * 1.15)],
      fatMassKg: [r1(ideal * idealFat[0]), r1(ideal * idealFat[1])],
      bodyWaterL: [r1(idealFfm * 0.732 * 0.9), r1(idealFfm * 0.732 * 1.1)],
      proteinKg: [r1(idealFfm * 0.197 * 0.9), r1(idealFfm * 0.197 * 1.1)],
      mineralKg: [r2(idealFfm * 0.068 * 0.9), r2(idealFfm * 0.068 * 1.1)],
    },
    needsReview: model !== '270',
  };
}

/** Avaliação digitada (balança doméstica): sem faixas do aparelho, com o que o usuário informou. */
function manual(
  person: Person,
  at: Date,
  weightKg: number,
  bodyFatPct: number,
  extra: { skeletalMuscleKg?: number; visceralFatLevel?: number; brand?: string; model?: string } = {},
): DemoReading {
  const h = person.heightCm / 100;
  const weight = r1(weightKg);
  const fat = r2((weight * bodyFatPct) / 100);
  return {
    measuredAt: at,
    source: 'MANUAL',
    deviceBrand: extra.brand ?? null,
    deviceModel: extra.model ?? null,
    weightKg: weight,
    heightCm: person.heightCm,
    bodyFatPct: r1(bodyFatPct),
    fatMassKg: fat,
    skeletalMuscleKg: extra.skeletalMuscleKg != null ? r1(extra.skeletalMuscleKg) : null,
    fatFreeMassKg: r1(weight - fat),
    bodyWaterL: null,
    proteinKg: null,
    mineralKg: null,
    bmi: r1(weight / (h * h)),
    bmrKcal: null,
    waistHipRatio: null,
    visceralFatLevel: extra.visceralFatLevel ?? null,
    ranges: null,
    needsReview: false,
  };
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * Gera um cenário. As datas são relativas a `now` (a mais recente é a última da lista),
 * sempre por volta das 9h30 de Brasília. Devolve da mais antiga para a mais recente.
 */
export function buildDemoScenario(key: DemoScenarioKey, now: Date = new Date()): DemoReading[] {
  const noise = rng(key.length * 7919 + key.charCodeAt(0));
  const jitter = (amplitude: number) => (noise() - 0.5) * 2 * amplitude;
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 30, 0);
  const daysAgo = (days: number) => new Date(base - days * DAY);
  const man: Person = { heightCm: 180, male: true };
  const woman: Person = { heightCm: 163, male: false };

  switch (key) {
    case 'emagrecimento': {
      const n = 14;
      return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        // Perda rápida no começo, platô no meio, retomada no fim — como costuma ser.
        const eased = t < 0.5 ? t * 1.3 : 0.65 + (t - 0.5) * 0.7;
        return inbody(man, daysAgo(10 + (n - 1 - i) * 30 + Math.round(jitter(3))), lerp(92, 81, eased) + jitter(0.6), lerp(27, 19, eased) + jitter(0.5), lerp(35.4, 36.6, t) + jitter(0.25));
      });
    }
    case 'ganhoDeMassa': {
      const n = 8;
      return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return inbody(woman, daysAgo(5 + (n - 1 - i) * 42), lerp(58, 61.5, t) + jitter(0.4), lerp(24.5, 23.5, t) + jitter(0.6), lerp(23.2, 25.6, t) + jitter(0.2));
      });
    }
    case 'trocaDeAparelho':
      return [
        manual(man, daysAgo(200), 86.4, 25.8, { skeletalMuscleKg: 33.1, visceralFatLevel: 11, brand: 'Omron', model: 'HBF-514C' }),
        manual(man, daysAgo(160), 85.1, 25.1, { skeletalMuscleKg: 33.4, visceralFatLevel: 10, brand: 'Omron', model: 'HBF-514C' }),
        manual(man, daysAgo(120), 84.2, 24.6, { skeletalMuscleKg: 33.6, visceralFatLevel: 10, brand: 'Omron', model: 'HBF-514C' }),
        // O mesmo corpo no outro aparelho lê diferente: o "salto" é do aparelho.
        inbody(man, daysAgo(80), 83.9, 21.2, 36.6),
        inbody(man, daysAgo(45), 83.0, 20.6, 36.8),
        inbody(man, daysAgo(8), 82.4, 20.1, 37.0),
      ];
    case 'unica':
      return [inbody(woman, daysAgo(3), 64.2, 27.4, 24.1)];
    case 'antiga':
      return [inbody(man, daysAgo(420), 79.5, 22.0, 34.6), inbody(man, daysAgo(275), 78.1, 21.1, 34.9)];
    case 'semMusculo':
      return [manual(woman, daysAgo(95), 71.0, 33.5), manual(woman, daysAgo(50), 69.6, 32.4), manual(woman, daysAgo(6), 68.8, 31.7)];
    case 'foraDaFaixa':
      return [inbody(man, daysAgo(400), 66.0, 6.2, 36.0), inbody(man, daysAgo(12), 118.5, 41.3, 38.2)];
    case 'densa': {
      const n = 60;
      return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const wave = Math.sin(t * Math.PI * 3) * 0.8;
        return inbody(man, daysAgo(2 + (n - 1 - i) * 7), lerp(88, 80, t) + wave + jitter(0.5), lerp(25, 18.5, t) + wave * 0.4 + jitter(0.4), lerp(35.4, 36.8, t) + jitter(0.2));
      });
    }
    case 'modeloNaoConferido':
      return [inbody(woman, daysAgo(40), 60.3, 26.0, 23.0, '570'), inbody(woman, daysAgo(4), 59.6, 25.2, 23.3, '570')];
  }
}
