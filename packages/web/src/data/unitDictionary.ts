/**
 * unitDictionary.ts — Glossário LEIGO de unidades de medida (determinístico, sem IA).
 *
 * O usuário comum não sabe o que é mg/dL, µUI/mL, pg/mL... Este dicionário dá uma explicação
 * curta e amigável pra unidade, exibida num balão ao tocar no rótulo (UnitLabel).
 *
 * Busca por alias normalizada (uppercase, sem acento, µ→U, ²→2/³→3, sem ./espaços/barras).
 * Se não houver entrada, UnitLabel só mostra o texto cru (sem "?") — nada quebra.
 */
export interface UnitInfo {
  nome: string; // como exibir (formato bonito)
  explicacao: string; // o que significa em português simples
}

const norm = (s: string): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[µμ]/g, 'U') // micro → U (µUI/mL, µg/dL)
    .replace(/[²³]/g, (m) => (m === '²' ? '2' : '3'))
    .replace(/[×^*]/g, '')
    .replace(/[/.\s\-_]/g, '')
    .trim();

const ENTRIES: Array<{ aliases: string[]; nome: string; explicacao: string }> = [
  {
    aliases: ['mg/dL', 'mg/dl', 'mg'],
    nome: 'mg/dL',
    explicacao: 'Miligrama por decilitro — quanto da substância existe em 100 mL de sangue. É o padrão dos laboratórios brasileiros (glicose, colesterol, creatinina...).',
  },
  {
    aliases: ['µg/dL', 'mcg/dL', 'ug/dL'],
    nome: 'µg/dL',
    explicacao: 'Micrograma por decilitro — uma quantidade muito pequena (um milionésimo de grama) em 100 mL de sangue.',
  },
  {
    aliases: ['ng/dL'],
    nome: 'ng/dL',
    explicacao: 'Nanograma por decilitro — fração minúscula (um bilionésimo de grama). Usada em hormônios como a testosterona total.',
  },
  {
    aliases: ['pg/mL', 'pg/ml'],
    nome: 'pg/mL',
    explicacao: 'Picograma por mililitro — fração muitíssimo pequena (um trilionésimo de grama). Usada em hormônios em baixa concentração, como a testosterona livre.',
  },
  {
    aliases: ['mg/L'],
    nome: 'mg/L',
    explicacao: 'Miligrama por litro — concentração em 1 L. Comum na Proteína C Reativa (PCR) ultrasensível. Diferente de mg/dL (que é em 100 mL).',
  },
  {
    aliases: ['g/dL', 'g/dl'],
    nome: 'g/dL',
    explicacao: 'Grama por decilitro — concentração em 100 mL de sangue. Usada na hemoglobina.',
  },
  {
    aliases: ['g/L'],
    nome: 'g/L',
    explicacao: 'Grama por litro — concentração em 1 L. Alguns laboratórios usam no lugar de g/dL (valor fica ~10× maior).',
  },
  {
    aliases: ['U/L', 'UI/L', 'u/L'],
    nome: 'U/L',
    explicacao: 'Unidades (internacionais) por litro — mede a ATIVIDADE de algo, não o peso. Usada em enzimas (TGO, TGP, fosfatase alcalina).',
  },
  {
    aliases: ['µUI/mL', 'mUI/mL', 'µIU/mL', 'uIU/mL', 'UIU/mL', 'mU/mL'],
    nome: 'µUI/mL',
    explicacao: 'Micro-unidade internacional por mililitro — medida de hormônios (insulina, TSH). Quanto maior, mais hormônio circulando.',
  },
  {
    aliases: ['mmol/L', 'mmol/l'],
    nome: 'mmol/L',
    explicacao: 'Milimol por litro — padrão internacional (laboratórios de fora do Brasil). Atenção: não é a mesma escala do mg/dL — os números são bem menores.',
  },
  {
    aliases: ['%'],
    nome: '%',
    explicacao: 'Porcentagem — para cada 100 partes. Usada em hemoglobina glicada (HbA1c), saturação, e contagem de células (por cada 100 glóbulos brancos).',
  },
  {
    aliases: ['/mm³', '/mm3', 'mm³', 'mm3', '×10³/µL', 'x10^3/uL', '10^3', '×10³'],
    nome: '/mm³',
    explicacao: 'Por milímetro cúbico — contagem de células numa gota de sangue (plaquetas, glóbulos brancos). "×10³" = milhares.',
  },
  {
    aliases: ['fL'],
    nome: 'fL',
    explicacao: 'Femtolitro — medida do TAMANHO médio dos glóbulos vermelhos (VCM). Femto = quatrilionésimo de litro.',
  },
  {
    aliases: ['pg'],
    nome: 'pg',
    explicacao: 'Picograma — peso de uma única célula (HCM). Um trilionésimo de grama.',
  },
  {
    aliases: ['mmHg'],
    nome: 'mmHg',
    explicacao: 'Milímetros de mercúrio — como se mede a pressão arterial (sistólica/diastólica, ex.: 120×80).',
  },
  {
    aliases: ['kg/m²', 'kg/m2'],
    nome: 'kg/m²',
    explicacao: 'Quilograma por metro quadrado — é o IMC (peso dividido pela altura ao quadrado).',
  },
  {
    aliases: ['bpm'],
    nome: 'bpm',
    explicacao: 'Batimentos por minuto — frequência cardíaca.',
  },
  {
    aliases: ['mL/min/1.73m²', 'mL/min/1.73m2'],
    nome: 'mL/min/1.73m²',
    explicacao: 'Mililitro por minuto por 1,73 m² — é a taxa de filtração renal estimada (eGFR), já ajustada à superfície corporal.',
  },
];

const LOOKUP: Map<string, UnitInfo> = new Map();
for (const e of ENTRIES) {
  const info: UnitInfo = { nome: e.nome, explicacao: e.explicacao };
  for (const a of e.aliases) LOOKUP.set(norm(a), info);
}

/** Devolve a explicação da unidade, ou null se não houver no dicionário. */
export function explainUnit(unit: string | null | undefined): UnitInfo | null {
  if (!unit) return null;
  const n = norm(unit);
  if (!n) return null;
  if (LOOKUP.has(n)) return LOOKUP.get(n)!;
  // tenta sem a barra final/inicial e sem ²/³ (ex.: "/mm3", "mm³/")
  const stripped = n.replace(/^L+|L+$/g, '');
  return LOOKUP.get(stripped) ?? null;
}
