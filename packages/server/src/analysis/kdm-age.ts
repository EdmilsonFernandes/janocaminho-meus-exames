/**
 * kdm-age.ts — Idade biológica pelo método Klemera-Doubal (KDM), 2º estimador independente.
 *
 * Fonte científica: Klemera P, Doubal S. "A new approach to the concept and computation of
 * biological age." Mech Ageing Dev. 2006;127(2):240-248. Base metodológica da adaptação:
 * a implementação clássica de D. Kwon (pacote BioAge, NHANES III) — LÓGICA PRÓPRIA, nenhum
 * código copiado. O KDM trata cada biomarcador como função linear da idade (m(x) = ref +
 * slope·(x−45)) com desvio-residual s; a idade biológica é a idade que MELHOR explica os
 * valores observados, ponderada pela precisão de cada marcador e "encolhida" em direção à
 * idade cronológica pela variabilidade populacional da idade (s_x):
 *
 *   BA = x + [ Σ_j slope_j·(y_j − m_j(x)) / s_j² ] / [ Σ_j slope_j²/s_j² + 1/s_x² ]
 *
 * (Algebricamente idêntica à forma publicada com x·Σb²/s² no numerador — só reorganizada.)
 *
 * ADAPTAÇÃO HONESTA (Kwon usa ~12 biomarcadores de NHANES III incl. pressão sistólica e FEV1,
 * que este app NÃO tem): usamos os 10 do conjunto dela que o app extrai — glicose, creatinina,
 * ln(PCR), albumina, VCM, RDW, fosfatase alcalina, colesterol total, linfócitos %, leucócitos.
 *
 * LIMITAÇÕES DOCUMENTADAS (nunca inventar precisão):
 *  1. Os parâmetros de referência (média aos 45a, inclinação/ano, SD residual) são aproximações
 *     ARREDONDADAS de resumos publicados de NHANES III/NHANES — não regressões sobre microdados.
 *  2. Colesterol total NÃO é linear com idade (sobe até ~55-60a e depois cai) — a aproximação
 *     linear subestima jovens/idosos e superestima meia-idade; SD largo ameniza o efeito.
 *  3. População brasileira ≠ NHANES (EUA, anos 1988-1994): etnia/métodos de laboratório diferem.
 *     Os SDs deliberadamente largos absorvem parte disso, mas é fonte de imprecisão real.
 *  4. Sem PA sistólica nem FEV1, a precisão é menor que a do KDM clássico — por construção o
 *     estimador "encolhe" mais pra idade cronológica (comportamento conservador, não bug).
 *  5. Marcadores fora de faixa fisiológica são DESCARTADOS (erro de extração não gera idade
 *     absurda); abaixo de KDM_MIN_MARKERS válidos → null (não improvisa).
 *
 * EDUCATIVO: não substitui avaliação médica. Resultado informativo, exibido AO LADO do
 * PhenoAge (nunca o substitui — hierarquia phenoage > z-score permanece).
 */

export interface KdmInput {
  chronologicalAge: number;        // anos
  /** Sexo biológico ('female' usa parâmetros femininos de creatinina; ausente/other assume masculino — mesmo comportamento do z-score simplificado). */
  sex?: 'male' | 'female' | null;
  albuminGDdL?: number | null;     // g/dL
  creatinineMgDdL?: number | null; // mg/dL
  glucoseMgDdL?: number | null;    // mg/dL (jejum)
  crpMgL?: number | null;          // mg/L (normalizado pela unidade do exame — PhenoAge usa mg/dL, aqui mantém mg/L pro ln)
  lymphocytePercent?: number | null; // %
  mcvFemtoliter?: number | null;   // fL
  rdwPercent?: number | null;      // %
  alkalinePhosphatase?: number | null; // U/L
  totalCholesterolMgDdL?: number | null; // mg/dL
  whiteBloodCellCount?: number | null;   // /µL (ex.: 5780) — converte p/ 10³/µL
}

export interface KdmResult {
  age: number;              // idade biológica KDM, clamp ±15a da cronológica, 1 decimal
  method: 'kdm';
  markersUsed: string[];    // labels canônicos que entraram na conta
  /** Idade sem clamp (diagnóstico/teste — clamp é regra do app, não do método). */
  rawUnclamped: number;
  /** Correção total em anos (raw − cronológica) antes do clamp. */
  correctionYears: number;
}

/** Mínimo de marcadores válidos pra calcular (abaixo → null). Kwon usa ~12; com 4+ a
 *  fórmula ainda é matemática correta, só mais "encolhida" pra cronológica (conservador). */
export const KDM_MIN_MARKERS = 4;

/** Idade de referência dos parâmetros (média do adulto NHANES III). */
const REF_AGE = 45;
/** s_x — SD da idade cronológica na população adulta de referência (NHANES III 20+). */
const AGE_SD = 15;
/** Clamp igual ao resto do app (z-score e PhenoAge): ±15 anos da cronológica. */
const CLAMP_YEARS = 15;

interface SexParams { refAt45: number; slope: number; sd: number }

/** Definição de cada biomarcador KDM.
 *  Fontes por parâmetro (valores REDONDOS, aproximações de resumos publicados — ver header):
 *   - Glicose jejum: NHANES III ~92 mg/dL (20-39a) → ~105 (60+a); SD residual ~20.
 *   - Creatinina: NHANES III homens ~1.01 (20-29a) → ~1.15 (70+a); mulheres ~0.77 → ~0.86.
 *   - ln(PCR): hsCRP NHANES mediana ~1.2 mg/L (jovem) → ~2.5 (idoso) → ln slope ~+0.012/a;
 *     distribuição log-normal com SD ~1.0 (Kwon também usa ln(CRP)).
 *   - Albumina: NHANES III 4.46 g/dL (20-29a) → 4.21 (70+a) → slope ~−0.006/a.
 *   - VCM: NHANES III ~89-90 fL adulto, sobe leve (~+1-2 fL/40a) → slope +0.05.
 *   - RDW: NHANES III ~12.8% (jovem) → ~13.8% (idoso) → slope +0.025 (preditor forte de
 *     mortalidade — sinal de idade consistente na literatura).
 *   - Fosfatase alcalina: NHANES III ~65 U/L (adulto) → ~80 (60+a) → slope +0.30.
 *   - Colesterol total: NHANES III ~185 (20-34a) → ~215 (55-64a) → ~205 (70+a); linear
 *     b=+0.40 é COMPROMISSO sobre trajetória não-linear (limitação nº 2 do header).
 *   - Linfócitos %: NHANES III ~31-32% (jovem) → ~27% (idoso) → slope −0.08.
 *   - Leucócitos: NHANES ~6.5-7.5 10³/µL, sobe leve com idade → slope +0.012.
 */
interface MarkerDef {
  key: string;                          // label canônico em markersUsed
  field: keyof KdmInput;                // campo do input
  params: SexParams | { male: SexParams; female: SexParams };
  lo: number;                           // plausibilidade fisiológica (exclusive)
  hi: number;                           // plausibilidade fisiológica (inclusive)
  transform?: (raw: number) => number;  // ln(CRP), WBC /µL → 10³/µL
}

const KDM_MARKERS: MarkerDef[] = [
  { key: 'GLICEMIA', field: 'glucoseMgDdL', lo: 20, hi: 600,
    params: { refAt45: 95, slope: 0.25, sd: 20 } },
  { key: 'CREATININA', field: 'creatinineMgDdL', lo: 0.05, hi: 20,
    params: {
      male: { refAt45: 1.05, slope: 0.004, sd: 0.20 },
      female: { refAt45: 0.82, slope: 0.004, sd: 0.15 },
    } },
  { key: 'PCR', field: 'crpMgL', lo: 0, hi: 500,
    transform: Math.log, // ln(mg/L) — mesma transformação do Kwon/PhenoAge (distribuição log-normal)
    params: { refAt45: 0.45, slope: 0.012, sd: 1.0 } }, // ln(1.57 mg/L) aos 45a
  { key: 'ALBUMINA', field: 'albuminGDdL', lo: 0.5, hi: 7,
    params: { refAt45: 4.35, slope: -0.006, sd: 0.30 } },
  { key: 'VCM', field: 'mcvFemtoliter', lo: 40, hi: 140,
    params: { refAt45: 90, slope: 0.05, sd: 3.5 } },
  { key: 'RDW', field: 'rdwPercent', lo: 5, hi: 30,
    params: { refAt45: 13.2, slope: 0.025, sd: 0.9 } },
  { key: 'FOSFATASE', field: 'alkalinePhosphatase', lo: 5, hi: 5000,
    params: { refAt45: 68, slope: 0.30, sd: 19 } },
  { key: 'COLESTEROL_TOTAL', field: 'totalCholesterolMgDdL', lo: 50, hi: 1000,
    params: { refAt45: 200, slope: 0.40, sd: 38 } },
  { key: 'LINFOCITOS', field: 'lymphocytePercent', lo: 0, hi: 100,
    params: { refAt45: 30, slope: -0.08, sd: 7.0 } },
  { key: 'LEUCOCITOS', field: 'whiteBloodCellCount', lo: 100, hi: 200000,
    transform: (w) => w / 1000,
    params: { refAt45: 7.1, slope: 0.012, sd: 1.9 } },
];

/**
 * Calcula a idade biológica KDM. Retorna null se:
 *  - idade cronológica fora de [18, 120] (mesma sanidade do PhenoAge);
 *  - menos de KDM_MIN_MARKERS biomarcadores válidos (insumo insuficiente — não improvisa);
 *  - resultado não-finito (matemática degenerada).
 * Marcadores individuais fora da faixa fisiológica são descartados (erro de extração não
 * contamina a estimativa — mesmo princípio do filtro |z|>4 do z-score simplificado).
 */
export function calculateKdmAge(input: KdmInput): KdmResult | null {
  const x = input.chronologicalAge;
  // Sanidade dura igual phenoage.ts: menor de idade / idade absurda não calcula.
  if (!(x >= 18 && x <= 120)) return null;
  // Sexo ausente/other assume masculino (mesmo comportamento documentado do z-score).
  const sex: 'male' | 'female' = input.sex === 'female' ? 'female' : 'male';

  let num = 0;   // Σ slope·(y − m(x)) / s²
  let den = 0;   // Σ slope² / s²
  const used: string[] = [];
  for (const def of KDM_MARKERS) {
    const raw = input[def.field];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    if (!(raw > def.lo && raw <= def.hi)) continue; // descarta absurdo, não trava o resto
    const p = 'male' in def.params ? def.params[sex] : def.params;
    const v = def.transform ? def.transform(raw) : raw;
    if (!Number.isFinite(v)) continue;
    const expected = p.refAt45 + p.slope * (x - REF_AGE); // m(x)
    num += (p.slope * (v - expected)) / (p.sd * p.sd);
    den += (p.slope * p.slope) / (p.sd * p.sd);
    used.push(def.key);
  }

  if (used.length < KDM_MIN_MARKERS) return null; // insumo insuficiente → null

  den += 1 / (AGE_SD * AGE_SD); // prior da idade (s_x) — encolhe pra cronológica
  const rawAge = x + num / den;
  if (!Number.isFinite(rawAge)) return null;

  const clamped = Math.max(x - CLAMP_YEARS, Math.min(x + CLAMP_YEARS, rawAge));
  return {
    age: Math.round(clamped * 10) / 10,
    method: 'kdm',
    markersUsed: used,
    rawUnclamped: Math.round(rawAge * 10) / 10,
    correctionYears: Math.round((rawAge - x) * 10) / 10,
  };
}
