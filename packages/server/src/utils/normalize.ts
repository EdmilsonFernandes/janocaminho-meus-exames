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

/** Devolve a chave canônica de um nome de analito (casa sinônimos entre labs). */
export function canonicalName(raw: string): string {
  const n = normalizeKey(raw);
  return REVERSE.get(n) ?? n;
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
  // testa do token mais longo pro mais curto (prioriza "HEMOGLOBINA GLICADA" > "HEMOGLOBINA").
  // ignora sinônimos < 3 chars alfanuméricos (K, CA, NA, MG...) — colidem com palavras comuns do PT.
  const candidates = [...REVERSE.keys()]
    .filter((k) => k.replace(/[^A-Z0-9]/g, '').length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const k of candidates) {
    const needle = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // borda de não-alfanumérico p/ não casar substring ("LDL" não casa dentro de "LDLC")
    if (new RegExp(`(^|[^A-Z0-9])${needle}([^A-Z0-9]|$)`).test(n)) {
      return REVERSE.get(k) ?? null;
    }
  }
  return null;
}
