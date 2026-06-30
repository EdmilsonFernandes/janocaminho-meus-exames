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
  HEMOGLOBINA: ['HGB', 'HB', 'HBS'],
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
const COMPOUND_HINT = /(?:^|[^A-Z0-9])(RELACAO|RAZAO|ESTIMAD[AO]|MEDIA ESTIMADA|URINARI[AO]|URINA|IONIC[AO]|IONIZAD[AO]|DESIDROGENASE|FOSFATO|ANTICORPOS|ANTICORPO|NAO|FETAL)(?:[^A-Z0-9]|$)/;

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
