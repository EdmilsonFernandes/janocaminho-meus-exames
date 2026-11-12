/**
 * Leitor do QR code da folha de resultado InBody (parâmetro `IBData` da URL).
 *
 * A InBody NÃO documenta este formato. O layout abaixo vem de engenharia reversa pública
 * (projeto Pulso) e foi CONFERIDO contra uma folha real do modelo 270: peso, gordura,
 * músculo esquelético, IMC e % de gordura bateram com a página oficial do fabricante.
 * Pendentes: nível de gordura visceral, pontuação e análise por segmento (não mapeados).
 *
 * Regras de segurança (erro de leitura aqui é risco de saúde, não detalhe de UI):
 *  1. Nunca confiar em posição cega: o bloco de medidas é achado pelo PADRÃO de início
 *     (altura+idade+sexo+data), não pelo índice — a contagem de blocos varia por firmware.
 *  2. Só aceitar se as identidades físicas fecharem (peso − gordura = massa livre de
 *     gordura; % gordura = gordura ÷ peso; IMC = peso ÷ altura²). Não fechou → erro.
 *  3. Modelo fora da lista conferida → `needsReview` (o usuário confirma os valores).
 *  4. Privacidade: o bloco inicial (série + ID) e o telefone são DESCARTADOS. O `raw`
 *     devolvido contém só os blocos numéricos de medidas, para reprocessar no futuro.
 */

export const INBODY_QR_PARSER_VERSION = 'inbody-qr@1';

/** Modelos cujo layout foi conferido contra folha real. */
const VERIFIED_MODELS = new Set(['270']);

export interface InBodyReading {
  deviceBrand: 'InBody';
  deviceModel: string | null;
  measuredAt: Date;
  sex: 'M' | 'F';
  age: number | null;
  heightCm: number;
  weightKg: number;
  fatMassKg: number;
  bodyFatPct: number;
  fatFreeMassKg: number;
  skeletalMuscleKg: number | null;
  bodyWaterL: number | null;
  proteinKg: number | null;
  mineralKg: number | null;
  bmi: number;
  bmrKcal: number | null;
  waistHipRatio: number | null;
  /** Faixas "normais" impressas pelo aparelho (definidas pelo fabricante). */
  ranges: Record<string, [number, number]>;
  needsReview: boolean;
  /** Blocos de medidas, sem identificação. */
  raw: string;
  parserVersion: string;
}

export type InBodyParseResult =
  | { ok: true; reading: InBodyReading }
  | { ok: false; code: 'NOT_INBODY' | 'NO_MEASURE_BLOCK' | 'INCONSISTENT' | 'BAD_DATE'; message: string };

const num = (s: string, offset: number, len: number, decimals: number): number | null => {
  const part = s.substr(offset, len);
  if (part.length !== len || !/^\d+$/.test(part)) return null;
  return Number(part) / 10 ** decimals;
};

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Extrai o valor de IBData de uma URL (ou aceita o próprio payload cru). */
export function extractIBData(input: string): string | null {
  const text = String(input ?? '').trim();
  if (!text) return null;
  const m = /[?&#]IBData=([^&#\s]+)/i.exec(text);
  let payload = m ? m[1] : text;
  // `!` codificado como %21 desloca todos os offsets — decodificar ANTES de fatiar.
  try { payload = decodeURIComponent(payload); } catch { /* payload já decodificado */ }
  return payload.includes('!') ? payload : null;
}

export function parseInBodyQr(input: string): InBodyParseResult {
  const payload = extractIBData(input);
  if (!payload) return { ok: false, code: 'NOT_INBODY', message: 'Este código não parece ser de uma folha InBody.' };

  const segments = payload.split('!');
  const idx = segments.findIndex((s) => /^\d{8}[MF]\d{14}\d{80,}/.test(s));
  if (idx < 0) return { ok: false, code: 'NO_MEASURE_BLOCK', message: 'Não encontrei as medidas neste código. Confira se é o QR da folha de resultado.' };
  const main = segments[idx];
  const next = segments[idx + 1] ?? '';

  const heightCm = num(main, 0, 4, 1)!;
  const age = num(main, 4, 4, 1);
  const sex = main[8] as 'M' | 'F';
  const ts = main.substr(9, 14);
  // O aparelho grava hora local; a base de usuários é brasileira → fuso de Brasília.
  const measuredAt = new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}-03:00`);
  if (Number.isNaN(measuredAt.getTime()) || measuredAt.getFullYear() < 2005 || measuredAt.getTime() > Date.now() + 48 * 3600 * 1000) {
    return { ok: false, code: 'BAD_DATE', message: 'A data deste resultado não pôde ser lida.' };
  }

  // Cada valor é seguido do limite inferior e superior da faixa do aparelho.
  const triple = (offset: number, decimals = 1) => ({
    value: num(main, offset, 4, decimals), low: num(main, offset + 4, 4, decimals), high: num(main, offset + 8, 4, decimals),
  });
  const protein = triple(23);
  const mineral = triple(35, 2);
  const fat = triple(47);
  const water = triple(59);
  const ffm = num(main, 71, 4, 1);
  const weight = triple(75);
  const smm = num(main, 91, 4, 1);
  const bmi = num(main, 104, 4, 1);
  const pbf = num(main, 108, 4, 1);

  if (fat.value == null || ffm == null || weight.value == null || bmi == null || pbf == null) {
    return { ok: false, code: 'NO_MEASURE_BLOCK', message: 'As medidas deste código estão incompletas.' };
  }
  const w = weight.value;
  const plausible = heightCm >= 100 && heightCm <= 230 && w >= 20 && w <= 300 && pbf >= 2 && pbf <= 75;
  const identities =
    close(ffm, w - fat.value, 0.3) &&
    close(pbf, (fat.value / w) * 100, 0.6) &&
    close(bmi, w / (heightCm / 100) ** 2, 0.4);
  if (!plausible || !identities) {
    return { ok: false, code: 'INCONSISTENT', message: 'Li o código, mas os valores não fecham entre si. Para não gravar nada errado, registre esta avaliação manualmente.' };
  }

  const ranges: Record<string, [number, number]> = {};
  const addRange = (key: string, t: { value: number | null; low: number | null; high: number | null }) => {
    if (t.value != null && t.low != null && t.high != null && t.low > 0 && t.high > t.low) ranges[key] = [t.low, t.high];
  };
  addRange('weightKg', weight);
  addRange('fatMassKg', fat);
  addRange('bodyWaterL', water);
  addRange('proteinKg', protein);
  addRange('mineralKg', mineral);

  // Bloco seguinte: TMB (kcal, inteiro) e relação cintura-quadril. Só aceita se plausível.
  const bmr = /^\d{12}/.test(next) ? Number(next.substr(4, 4)) : null;
  const whr = /^\d{12}/.test(next) ? Number(next.substr(8, 4)) / 100 : null;

  const modelMatch = /^(\d{3}[A-Z]?)-/.exec(segments[0] ?? '');
  const deviceModel = modelMatch ? modelMatch[1] : null;
  const inRange = (v: number | null, lo: number, hi: number) => (v != null && v >= lo && v <= hi ? v : null);

  return {
    ok: true,
    reading: {
      deviceBrand: 'InBody',
      deviceModel,
      measuredAt,
      sex,
      age: inRange(age, 3, 110),
      heightCm,
      weightKg: w,
      fatMassKg: fat.value,
      bodyFatPct: pbf,
      fatFreeMassKg: ffm,
      skeletalMuscleKg: inRange(smm, 5, 80),
      bodyWaterL: inRange(water.value, 10, 90),
      proteinKg: inRange(protein.value, 2, 30),
      mineralKg: inRange(mineral.value, 1, 8),
      bmi,
      bmrKcal: inRange(bmr, 600, 4500),
      waistHipRatio: inRange(whr, 0.55, 1.5),
      ranges,
      needsReview: !deviceModel || !VERIFIED_MODELS.has(deviceModel),
      raw: `${main}!${/^\d+/.exec(next)?.[0] ?? ''}`,
      parserVersion: INBODY_QR_PARSER_VERSION,
    },
  };
}

/**
 * Faixa de % de gordura por sexo e idade — tabela impressa no manual brasileiro da Omron
 * (HBF-514C), atribuída a Gallagher et al., 2000. É referência populacional educativa,
 * independente de fabricante. Fora de 20–79 anos não há faixa (devolve null).
 */
export function bodyFatReference(gender: string | null | undefined, ageYears: number | null | undefined): { low: number; high: number; source: string } | null {
  if (ageYears == null || ageYears < 20 || ageYears > 79) return null;
  const g = String(gender ?? '').toLowerCase();
  const male = g === 'male' || g === 'm' || g === 'masculino';
  const female = g === 'female' || g === 'f' || g === 'feminino';
  if (!male && !female) return null;
  const band = ageYears <= 39 ? 0 : ageYears <= 59 ? 1 : 2;
  const table = male ? [[8.0, 19.9], [11.0, 21.9], [13.0, 24.9]] : [[21.0, 32.9], [23.0, 33.9], [24.0, 35.9]];
  return { low: table[band][0], high: table[band][1], source: 'Gallagher et al., 2000 (por sexo e idade)' };
}
