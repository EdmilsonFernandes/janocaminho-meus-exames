import { ItemFlag } from '@prisma/client';

/** Normaliza um texto: maiúsculas, sem acento, espaços colados. */
export function normalizeKey(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mapa de sinônimos: chave canônica -> variantes comuns entre laboratórios.
// Permite casar o mesmo analito entre exames de labs/datas diferentes (necessário p/ evolução).
const SYNONYMS: Record<string, string[]> = {
  // HBS = hemoglobina S (falciforme), uma FRAÇÃO (%), NÃO hemoglobina total. Era sinônimo de
  // HEMOGLOBINA e colapsava "HbS 40%" em Hb total = 40 g/dL (série falsa). Removido (revisão 2026-07).
  HEMOGLOBINA: ['HGB', 'HB'],
  HEMATOCRITO: ['HCT', 'HT', 'HTO'],
  HEMACIAS: ['RBC', 'ERITROCITOS', 'HEMACIAS'],
  VCM: ['VOLUME GLOBULAR MEDIO', 'MCV'],
  HCM: ['HCM', 'MCH'],
  CHCM: ['CHCM', 'MCHC'],
  RDW: ['RDW'],
  LEUCOCITOS: ['WBC', 'LEUCOCITOS TOTAIS', 'GB', 'SERIE BRANCA'],
  NEUTROFILOS: ['NEUTROFILOS', 'SEGMENTADOS', 'NEUT', 'PMN'],
  LINFOCITOS: ['LINFOCITOS', 'LINFS', 'LYMPH'],
  MONOCITOS: ['MONOCITOS', 'MONOS', 'MONO'],
  EOSINOFILOS: ['EOSINOFILOS', 'EOS', 'EOSIN'],
  BASOFILOS: ['BASOFILOS', 'BASOS', 'BASO'],
  PLAQUETAS: ['PLT', 'PLAQUETAS', 'PLAQUETOCITOS'],
  GLICEMIA: ['GLICOSE', 'GLICEMIA JEJUM', 'GLICEMIA DE JEJUM', 'GLIC'],
  HEMOGLOBINA_GLICADA: ['HBA1C', 'GLICADA', 'HEMOGLOBINA GLICADA'],
  INSULINA: ['INSULINA JEJUM', 'INSULINEMIA', 'INSULINA'], // jejum (µIU/mL) — base do HOMA-IR
  COLESTEROL_TOTAL: ['COLESTEROL TOTAL', 'COL TOTAL', 'CT'],
  LDL: ['LDL COLESTEROL', 'COLESTEROL LDL', 'LDL C', 'LDL'],
  HDL: ['HDL COLESTEROL', 'COLESTEROL HDL', 'HDL C', 'HDL'],
  TRIGLICERIDES: ['TRIGLICERIDES', 'TRIGLICERIDIOS', 'TG', 'TRIG'],
  CREATININA: ['CREATININA SERICA', 'CREAT', 'CREATIN'],
  UREIA: ['UREIA', 'UREA'],
  ACIDO_URICO: ['ACIDO URICO', 'AU'],
  TGO: ['AST', 'ASPARTATO AMINOTRANSFERASE', 'GOT'],
  TGP: ['ALT', 'ALANINA AMINOTRANSFERASE', 'GPT'],
  GAMA_GT: ['GAMA GT', 'GGT', 'GAMAGLUTAMILTRANSFERASE'],
  // Fosfatase Alcalina (marcador do PhenoAge / função hepática). 'FA' NÃO entra (substring
  // perigosa no fuzzy — casa em muita coisa). Guard ACIDA no COMPOUND_HINT impede
  // 'FOSFATASE ACIDA' (próstata, analito distinto) colapsar aqui.
  FOSFATASE: ['FOSFATASE ALCALINA', 'FOSFATASE ALCALINA TOTAL', 'ALP', 'ALKALINE PHOSPHATASE'],
  // PCR (Proteína C Reativa) — marcador do PhenoAge. Labs BR reportam ultrasensível em mg/L
  // com nomes variados; sem isto o nameCanonical ficava cru ('PROTEINA C REATIVA ULTRASSENSIVEL')
  // e não casava mv('PCR') no health-state → PhenoAge nunca rodava.
  PCR: ['PROTEINA C REATIVA', 'PROTEINA C REATIVA ULTRASSENSIVEL', 'PCR - PROTEINA C REATIVA', 'PCR ULTRASSENSIVEL', 'HS-CRP', 'PROTEINA C REATIVA US'],
  FERRITINA: ['FERRITINA'],
  VITAMINA_D: ['25 OH VITAMINA D', '25-OH-D', 'VITAMINA D'],
  VITAMINA_B12: ['B12', 'COBALAMINA'],
  TSH: ['HORMONIO TIREOESTIMULANTE', 'TSH'],
  T4_LIVRE: ['T4 LIVRE', 'FT4'],
  T3: ['T3', 'TRIIODOTIRONINA'],
  SODIO: ['NA', 'SODIO'],
  POTASSIO: ['K', 'POTASSIO'],
  CALCIO: ['CA', 'CALCIO'],
  MAGNESIO: ['MG', 'MAGNESIO'],
  // Testosterona: separar TOTAL (ng/dL, ~240-950) de LIVRE (pg/mL, ~9-50) — são analitos
  // DIFERENTES em escalas diferentes. Se caíssem no mesmo canonical, a evolução cruzava os
  // valores (0,44 pg/mL livre vs 591 ng/dL total pareciam série do mesmo marcador). O DEFAULT
  // ("Testosterona" sozinho) é TOTAL (mais comum nos labs); "Livre" explícito → LIVRE.
  TESTOSTERONA_TOTAL: ['TESTOSTERONA TOTAL', 'TESTOSTERONA', 'TESTOSTERONA SERICA', 'TESTOTERONA'],
  TESTOSTERONA_LIVRE: ['TESTOSTERONA LIVRE', 'TESTOSTERONA LIVRE CALCULADA', 'TESTOSTERONA LIVRE E FRACAO LIVRE', 'TEST LIVRE'],
  // DHT (Dihidrotestosterona) é analito DISTINTO de Testosterona (é o metabólito ativo 5α-redutase).
  // Se caísse em TESTOSTERONA_TOTAL (por substring/fuzzy), cruzaria séries diferentes. Chave própria.
  DIHIDROTESTOSTERONA: ['DHT', 'DIHIDROTESTOSTERONA', '5 ALFA DIHIDROTESTOSTERONA', 'ALFA DIHIDROTESTOSTERONA'],
};

const REVERSE: Map<string, string> = new Map();
for (const [canon, variants] of Object.entries(SYNONYMS)) {
  REVERSE.set(normalizeKey(canon), canon);
  for (const v of variants) REVERSE.set(normalizeKey(v), canon);
}

// Pré-computa 1x os padrões de match FUZZY: todas as chaves (canônicas + sinônimos)
// com >=3 chars alfanuméricos, ordenadas do MAIOR pro menor — assim "HEMOGLOBINA GLICADA"
// casa antes de "HEMOGLOBINA", e "TRANSAMINASE OXALACETICA TGO" não para no 1o token.
// Usado por canonicalName (sufixos de lab) e findMarkerInText (perguntas do chat).
const FUZZY_PATTERNS: { canon: string; re: RegExp }[] = [...REVERSE.keys()]
  .filter((k) => k.replace(/[^A-Z0-9]/g, '').length >= 3)
  .sort((a, b) => b.length - a.length)
  .map((k) => ({
    canon: REVERSE.get(k)!,
    re: new RegExp(`(^|[^A-Z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`),
  }));

/** Procura o analito canônico cujo nome/sinônimo aparece no texto (borda + longest-first). */
function fuzzyMatchCanonical(normalized: string): string | null {
  for (const p of FUZZY_PATTERNS) if (p.re.test(normalized)) return p.canon;
  return null;
}

// Indicadores de analito COMPOSTO/DERIVADO: razão, fração, estimativa, espécime
// urinário, cálcio iônico, anticorpo, enzima (G6PD), "não-HDL"... Esses NÃO podem
// colapsar no analito-base (G6PD ≠ glicose; anti-HBs ≠ hemoglobina; relação
// proteína/creatinina ≠ creatinina; HbA2/HbF ≠ hemoglobina total). Boundary de não
// alfanumérico p/ não casar substring. Texto já normalizado (sem acento, MAIÚSCULAS).
const COMPOUND_HINT = /(?:^|[^A-Z0-9])(RELACAO|RAZAO|ESTIMAD[AO]|MEDIA ESTIMADA|URINARI[AO]|URINA|IONIC[AO]|IONIZAD[AO]|DESIDROGENASE|FOSFATO|ACIDA|ANTICORPOS|ANTICORPO|NAO|FETAL|PESQUISA)(?:[^A-Z0-9]|$)/;

// Hemoglobina como FRAÇÃO eletroforética (HbA, HbA2, HbF, HbS, HbC) — distinta da Hb total.
const HEMOGLOBIN_FRACTION = /^HEMOGLOBINA\s+[A-Z][0-9]?(?:[^A-Z0-9]|$)/;

/**
 * Devolve a chave canônica de um nome de analito (casa sinônimos entre labs).
 * Caminhos (do mais seguro ao mais flexível):
 *  1) EXATO: o nome inteiro é um sinônimo/canônico conhecido.
 *  2) SEM PARÊNTESES: "TGO (AST)" -> "TGO", "SEGMENTADOS (ABS)" -> "SEGMENTADOS"
 *     (sufixo entre parênteses é qualificador do lab, não muda o analito).
 *  3) FUZZY CONSERVADOR: match por borda/longest-first — mas SÓ se o nome não for um
 *     analito composto/derivado (guarda acima). Reduz "TRANSAMINASE OXALACETICA TGO"
 *     -> TGO, "TSH - TIREOESTIMULANTE" -> TSH, "HEMOGLOBINA GLICADA - HBA1C" -> HBA1C.
 *
 * Sem isto, cada laboratório gerava um nameCanonical DIFERENTE pro mesmo analito,
 * quebrando evolução/tendência (viravam 2 séries) e o roteador do chat (buscava
 * nameCanonical='TGO' e não achava o item guardado como 'TGO (AST)').
 */
export function canonicalName(raw: string): string {
  const n = normalizeKey(raw);
  if (!n) return n;
  // 1) exato
  const exact = REVERSE.get(n);
  if (exact) return exact;
  // 2) descarta sufixo entre parênteses e re-tenta exato
  const base = n.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (base !== n) {
    const e2 = REVERSE.get(base);
    if (e2) return e2;
  }
  // 3) fuzzy só p/ nomes que NÃO são analito composto/derivado (evita merge clínico errado)
  if (!COMPOUND_HINT.test(base) && !HEMOGLOBIN_FRACTION.test(base)) {
    const f = fuzzyMatchCanonical(base);
    if (f) return f;
  }
  return n;
}

/** Compara um valor numérico à faixa de referência e devolve a flag. */
export function computeFlag(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): { flag: ItemFlag; isAbnormal: boolean } {
  if (value == null) return { flag: 'UNKNOWN' as ItemFlag, isAbnormal: false };
  if (low != null && value < low) return { flag: 'LOW' as ItemFlag, isAbnormal: true };
  if (high != null && value > high) return { flag: 'HIGH' as ItemFlag, isAbnormal: true };
  if (low != null || high != null) return { flag: 'NORMAL' as ItemFlag, isAbnormal: false };
  return { flag: 'UNKNOWN' as ItemFlag, isAbnormal: false };
}

/**
 * Normaliza o campo UNIDADE devolvido pela extração. O pdftotext/poppler corrompe glifos de
 * superescrito (³ → '*' ou '3') em PDFs com fonte/matriz não-padrão, então Plaquetas vem como
 * '/mm*' em vez de '/mm³'. Padroniza também notação exponencial (10^3 → ×10³) e o case de
 * unidades comuns (g/dl → g/dL). Conservadora: só reescreve padrões reconhecíveis.
 */
const UNIT_FIX: Array<[RegExp, string]> = [
  // Volume/células: mm*, mm3, mm³, /mm* → /mm³ (Plaquetas, leucócitos)
  [/\/?\s*mm\s*[\*3³]/gi, '/mm³'],
  // Notação exponencial corrompida: x10^3 / 10**3 / 10^3 → ×10³ (e 10^6, 10^9)
  [/(?:x|\*)\s*10\s*[\^\*]?\s*(3|³)\b/gi, '×10³'],
  [/\b10\s*[\^\*]\s*3\b/gi, '×10³'],
  [/\b10\s*[\^\*]\s*6\b/gi, '×10⁶'],
  [/\b10\s*[\^\*]\s*9\b/gi, '×10⁹'],
  // Case padrão de unidades comuns
  [/\bg\/dl\b/gi, 'g/dL'],
  [/\bmg\/dl\b/gi, 'mg/dL'],
  [/\bu\.?i\.?\/?\s*l\b/gi, 'UI/L'],
  [/\bfl\b/gi, 'fL'],
  [/\bmmol\/l\b/gi, 'mmol/L'],
];
export function normalizeUnit(u?: string | null): string | null {
  if (!u) return null;
  let s = String(u).trim().replace(/\s+/g, ' ');
  for (const [re, rep] of UNIT_FIX) s = s.replace(re, rep);
  return s || null;
}

/**
 * Aplica só a correção de superescrito (mm* → /mm³) num texto livre — usado no `valueText`
 * quando a unidade vem colada ao valor (ex.: "116.000/mm*"). Não toca no resto p/ não alterar
 * valores numéricos. Subset seguro do normalizeUnit.
 */
export function sanitizeUnitInText(t?: string | null): string | null {
  if (!t) return null;
  return String(t)
    .replace(/\/?\s*mm\s*[\*3³]/gi, '/mm³')
    .replace(/(?:x|\*)\s*10\s*[\^\*]?\s*(3|³)\b/gi, '×10³')
    .replace(/\b10\s*[\^\*]\s*([369])\b/gi, '×10$1') || null;
}

/**
 * Refina o flag do computeFlag quando há CONFLITO DE ESCALA entre o valor e a referência —
 * causa #1 de LOW/HIGH falso no hemograma e maior inimigo da confiança do paciente.
 *
 * Padrão do erro: a IA extrai valor e referência em escalas diferentes, e computeFlag (que só
 * compara números) marca errado. O paciente vê um exame normal "todo baixo".
 *   - Hemoglobina 15 g/dL  c/ ref 130–170 (g/L)        → LOW falso (escala ×10)
 *   - Linfócitos  28,5 %   c/ ref 1200–5200 (absoluto) → LOW falso (% vs /mm³)
 *   - Hemácias    5,78 mi  c/ ref 450–550 (milhares)   → LOW falso (×1000)
 *   - HCM         26 pg    c/ ref 270–320              → LOW falso (×10)
 *
 * CONSERVADOR (não mascara LOW/HIGH real): só neutraliza pra UNKNOWN quando a UNIDADE confirma
 * escala incompatível. NÃO usa ratio puro — neutropenia severa (200 vs 1800 = 0,11) e plaquetas
 * baixas (20k vs 150k = 0,13) têm ratio ~0,1 e são LOWs reais que não podem ser mascarados.
 */
export function reconcileScaleFlag(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string | null | undefined,
): { flag: ItemFlag; isAbnormal: boolean; scaleConflict: boolean } {
  const base = computeFlag(value, low, high);
  if (!base.isAbnormal) return { ...base, scaleConflict: false };
  const u = (unit ?? '').toLowerCase();
  const refMax = Math.max(low ?? 0, high ?? 0);
  let conflict = false;
  if (u.includes('%') && refMax > 100) conflict = true;                         // % vs absoluto
  // g/dL vs g/L (×10) — lookbehind nega letra antes do 'g' p/ NÃO casar 'ng/dl' (testosterona)
  // nem 'mg/dl' (glicemia/colesterol). Antes a regex /g\/d[lit]/ casava 'ng/dl' por substring e
  // marcava TestosteronaTotal 558 ng/dL como UNKNOWN falso. Só 'g/dL' (hemoglobina) e 'g/dt' (OCR) disparam.
  if ((/(?<![a-z])g\/d[lit]/.test(u) || /(?<![a-z])g\/dt/.test(u)) && refMax > 50) conflict = true;
  if (/\bpg\b/.test(u) && !/pg\/?[ml]/i.test(u) && refMax > 50) conflict = true;                          // HCM/CHCM pg vs ×10 (NÃO pg/mL de testosterona)
  if (/milh/.test(u) && refMax > 50 && refMax < 100000) conflict = true;         // milhões vs milhares
  // pg/mL vs ref em ng/dL (testosterona livre) — só dispara se o VALOR for baixo (<10) com refMax
  // alto (>100), sinal de escalas claramente diferentes. Sem o gate `value<10`, marcava Testosterona
  // Livre 485 pg/mL (ref 57-178 pg/mL, escala LEGÍTIMA) como UNKNOWN — perdendo um HIGH real.
  if (/pg\/?\s*ml/i.test(u) && refMax > 100 && (value ?? 0) < 10) conflict = true;
  return conflict ? { flag: 'UNKNOWN' as ItemFlag, isAbnormal: false, scaleConflict: true } : { ...base, scaleConflict: false };
}

/** Tenta extrair um número de um valor textual (lida com decimal brasileiro e milhares). */
export function parseNumeric(valueText?: string | null): number | null {
  if (!valueText) return null;
  const cleaned = valueText.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}


/** Procura um marcador conhecido num texto livre (ex.: pergunta do chat) e devolve o nome canônico, ou null. */
export function findMarkerInText(text: string): string | null {
  const n = normalizeKey(text);
  if (!n) return null;
  // delega pro mesmo fuzzy match de canonicalName (boundary-aware, longest-first,
  // ignora sinônimos < 3 chars alfanuméricos p/ não colidir com palavras comuns do PT).
  return fuzzyMatchCanonical(n);
}
