/**
 * Faixas de referência PEDIÁTRICAS por banda etária (Lote 2 — "família de verdade").
 *
 * Problema (UC1 da estratégia): exame de criança avaliado com régua de ADULTO
 * assusta errado — leucócitos 9.800 é NORMAL aos 4 anos, fosfatase alcalina de
 * criança é 2-3× a do adulto (crescimento ósseo). Nenhum concorrente global
 * faz pediatria (todos 18+ — pesquisa ago/2026, 22 deep-dives).
 *
 * REGRA DE OURO (não quebrar o que funciona):
 *   1. Laudo traz faixa própria (e não é a típica adulta) → faixa do LAUDO vence (comportamento atual)
 *   2. Sem faixa do laudo OU faixa ≈ típica adulta (lab usou default adulto) → banda da IDADE
 *   3. Paciente ≥18a / sem nascimento / item fora da tabela → exatamente como hoje
 * Idade é calculada NA DATA DO EXAME (performedAt), não hoje.
 *
 * Kill-switch: settings.pediatricRanges.enabled = 0 desliga tudo (admin, live).
 * Valores são aproximados e método-dependentes: fonte Harriet Lane Handbook
 * (intervalos de referência pediátricos), curados p/ os 7 analitos que mais
 * divergem na infância. Aproximação EDUCATIVA — nunca substitui o pediatra.
 */
import { getSettings } from '../utils/settings';

export type AgeBand = '0-1m' | '1-6m' | '6m-2a' | '2-6a' | '6-12a' | '12-18a';

export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  '0-1m': '0–1 mês', '1-6m': '1–6 meses', '6m-2a': '6m–2 anos', '2-6a': '2–6 anos', '6-12a': '6–12 anos', '12-18a': '12–18 anos',
};

/** Banda etária numa data de referência (a data do EXAME). null = adulto/idade desconhecida → NÃO mexe. */
export function ageBandAt(dob: Date | null | undefined, at: Date | null | undefined): AgeBand | null {
  if (!dob || !at) return null;
  const b = new Date(dob); const t = new Date(at);
  if (Number.isNaN(b.getTime()) || Number.isNaN(t.getTime())) return null;
  if (t <= b) return null;
  const ms = t.getTime() - b.getTime();
  const days = ms / 86400000;
  if (days < 0) return null;
  if (days < 31) return '0-1m';
  if (days < 183) return '1-6m';
  if (days < 365.25 * 2) return '6m-2a';
  if (days < 365.25 * 6) return '2-6a';
  if (days < 365.25 * 12) return '6-12a';
  if (days < 365.25 * 18) return '12-18a';
  return null; // adulto
}

/**
 * [low, high] por banda. Unidades = as canônicas do app (g/dL, %, /mm³, fL, UI/L, ng/mL, mg/dL).
 * AdultTypical = régua adulta "genérica de lab" usada p/ detectar que o laudo imprimiu default
 * de adulto num exame de criança (branch B) — tolerância 18% nos dois extremos.
 */
const TABLE: Record<string, { bands: Record<AgeBand, [number, number]>; adultTypical: [number, number] }> = {
  HEMOGLOBINA: {
    bands: { '0-1m': [14, 22], '1-6m': [9.5, 13.5], '6m-2a': [10.5, 13], '2-6a': [11.5, 13.5], '6-12a': [11.5, 15.5], '12-18a': [12, 16] },
    adultTypical: [12, 17],
  },
  HEMATOCRITO: {
    bands: { '0-1m': [42, 64], '1-6m': [31, 41], '6m-2a': [32, 42], '2-6a': [33, 43], '6-12a': [34, 44], '12-18a': [36, 48] },
    adultTypical: [36, 52],
  },
  LEUCOCITOS: {
    bands: { '0-1m': [9000, 32000], '1-6m': [5000, 18000], '6m-2a': [6000, 17000], '2-6a': [5000, 15000], '6-12a': [4500, 13500], '12-18a': [4500, 13000] },
    adultTypical: [4000, 11000],
  },
  VCM: {
    bands: { '0-1m': [95, 125], '1-6m': [76, 98], '6m-2a': [70, 86], '2-6a': [73, 87], '6-12a': [75, 91], '12-18a': [78, 95] },
    adultTypical: [80, 100],
  },
  // O caso clássico do falso-alarme: fosfatase de criança em crescimento é 2-3× a adulta.
  FOSFATASE: {
    bands: { '0-1m': [80, 350], '1-6m': [110, 460], '6m-2a': [105, 420], '2-6a': [105, 420], '6-12a': [105, 420], '12-18a': [130, 560] },
    adultTypical: [40, 130],
  },
  FERRITINA: {
    bands: { '0-1m': [25, 250], '1-6m': [50, 200], '6m-2a': [7, 140], '2-6a': [7, 140], '6-12a': [7, 140], '12-18a': [12, 150] },
    adultTypical: [20, 300],
  },
  // Creatinina infantil é MENOR (menos massa muscular) — LOW falso em adulto-régua.
  CREATININA: {
    bands: { '0-1m': [0.3, 0.9], '1-6m': [0.2, 0.5], '6m-2a': [0.2, 0.5], '2-6a': [0.3, 0.6], '6-12a': [0.3, 0.7], '12-18a': [0.5, 1.0] },
    adultTypical: [0.6, 1.3],
  },
};

const TOLERANCE = 0.18;

/** A faixa do laudo é ≈ a típica adulta? (lab imprimiu default adulto num exame de criança) */
function looksAdultRange(low: number | null, high: number | null, adultTypical: [number, number]): boolean {
  if (low == null || high == null) return false;
  const [al, ah] = adultTypical;
  const near = (v: number, ref: number) => Math.abs(v - ref) <= ref * TOLERANCE;
  return near(low, al) && near(high, ah);
}

export interface PediatricResult {
  low: number | null;
  high: number | null;
  /** Marcador de proveniência — vira o refAppliesTo do item (UI mostra badge). */
  appliesTo: string;
}

/**
 * Decide a régua pediátrica p/ um item. null = NÃO mexe (adulto, fora da tabela,
 * laudo trouxe faixa própria não-adulta, ou kill-switch desligado).
 */
export function applyPediatricRange(
  canonical: string | null,
  low: number | null,
  high: number | null,
  band: AgeBand | null,
): PediatricResult | null {
  if (!canonical || !band) return null;
  const entry = TABLE[canonical];
  if (!entry) return null;
  if (getSettings().pediatricRanges?.enabled === 0) return null; // kill-switch admin
  const hasLabRange = low != null || high != null;
  if (hasLabRange && !looksAdultRange(low, high, entry.adultTypical)) return null; // laudo vence
  const [pl, ph] = entry.bands[band];
  return { low: pl, high: ph, appliesTo: `Pediátrico · ${AGE_BAND_LABEL[band]} (Harriet Lane aprox.)` };
}
