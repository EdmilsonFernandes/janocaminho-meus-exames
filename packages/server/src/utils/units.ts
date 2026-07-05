/**
 * Conversão de unidades por analito — camada CANÔNICA de escala (Frente 1B).
 *
 * Cada analito tem uma UNIDADE-PADRÃO e fatores de conversão das escalas alternativas.
 * Resolve o bug do Edmilson: Testosterona Livre extraída em nmol/L E pg/mL (2 itens, escalas
 * diferentes) cruzava na evolução ("+182/mês"). Convertendo ambos a pg/mL (padrão), viram a
 * MESMA série — o guard anti-cruzamento (1A) não trava mais e a regressão é coerente.
 *
 * Fatores: PM do analito (1 nmol/L = PM em ng/L = PM em pg/mL; pois ng/L = pg/mL).
 *   Testosterona (PM 288.4): nmol/L × 288.4 = pg/mL (livre) | nmol/L × 28.84 = ng/dL (total)
 *   Vitamina D (PM 384.6):   nmol/L × 0.4006 = ng/mL
 *   Glicose (PM 180):        mmol/L × 18.02 = mg/dL
 *   Colesterol (PM 386.65):  mmol/L × 38.67 = mg/dL
 *   Triglicerídeos (PM 885): mmol/L × 88.57 = mg/dL
 *   Creatinina (PM 113):     µmol/L × 0.01131 = mg/dL
 *   Hemoglobina (g/L→g/dL):  g/L × 0.1 = g/dL
 */
type UnitCfg = { unit: string; factors: Record<string, number> }; // unit = padrão; factors = alt→padrão
const UNIT_CONVERSIONS: Record<string, UnitCfg> = {
  TESTOSTERONA_LIVRE: { unit: 'pg/mL', factors: { 'nmol/l': 288.4, 'nmol': 288.4 } },
  TESTOSTERONA_TOTAL: { unit: 'ng/dL', factors: { 'nmol/l': 28.84, 'nmol': 28.84 } },
  HEMOGLOBINA: { unit: 'g/dL', factors: { 'g/l': 0.1 } },
  VITAMINA_D: { unit: 'ng/mL', factors: { 'nmol/l': 0.4006, 'nmol': 0.4006 } },
  GLICEMIA: { unit: 'mg/dL', factors: { 'mmol/l': 18.02, 'mmol': 18.02 } },
  HEMOGLOBINA_GLICADA: { unit: '%', factors: {} }, // % vs mmol/mol é não-linear — não converte
  CREATININA: { unit: 'mg/dL', factors: { 'umol/l': 0.01131, 'µmol/l': 0.01131 } },
  COLESTEROL_TOTAL: { unit: 'mg/dL', factors: { 'mmol/l': 38.67, 'mmol': 38.67 } },
  LDL: { unit: 'mg/dL', factors: { 'mmol/l': 38.67, 'mmol': 38.67 } },
  HDL: { unit: 'mg/dL', factors: { 'mmol/l': 38.67, 'mmol': 38.67 } },
  TRIGLICERIDES: { unit: 'mg/dL', factors: { 'mmol/l': 88.57, 'mmol': 88.57 } },
  CALCIO: { unit: 'mg/dL', factors: { 'mmol/l': 4.008, 'mmol': 4.008 } }, // PM 40.08
};

/** Normaliza unidade p/ casar (lowercase, sem espaços/pontos, µ→u). */
const normUnit = (u: string): string => u.toLowerCase().replace(/[\s.]/g, '').replace(/µ/g, 'u');

/**
 * Converte (value, fromUnit) à unidade-padrão do analito `canonical`.
 * Retorna {value, unit} no padrão, ou null se:
 *   - analito sem padronização definida (deixa cru, cada tela decide), ou
 *   - fromUnit não casa nem padrão nem fator conhecido (sem conversão confiável).
 */
export function toCanonicalUnit(
  canonical: string | null | undefined,
  value: number,
  fromUnit: string | null | undefined,
): { value: number; unit: string } | null {
  if (!canonical || !Number.isFinite(value)) return null;
  const cfg = UNIT_CONVERSIONS[canonical];
  if (!cfg) return null;
  const u = normUnit(String(fromUnit ?? ''));
  if (!u) return null;
  if (u === normUnit(cfg.unit)) return { value, unit: cfg.unit }; // já no padrão
  // casa fator exato OU por substring (ex.: "nmol/l" dentro de "nmol/l(0,29-5,77)")
  const key = Object.keys(cfg.factors).find((k) => u === normUnit(k)) ?? Object.keys(cfg.factors).find((k) => u.includes(normUnit(k)));
  if (!key) return null; // unidade desconhecida — não arrisca conversão
  return { value: Number((value * cfg.factors[key]).toFixed(4)), unit: cfg.unit };
}
