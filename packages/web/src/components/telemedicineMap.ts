// Mapa: marcador alterado (nameCanonical) → especialidade médica no Doctoralia.
// Quando um exame vem alterado, o botão de telemedicina leva ao especialista certo.
// Configurável: ajuste slug/label livremente. Slugs = páginas públicas do Doctoralia BR.
// Chaves = nameCanonical (MAIÚSCULAS, sem acento, espaços simples) — mesmo padrão do backend.

export interface Specialty {
  slug: string; // ex.: 'endocrinologista' → https://www.doctoralia.com.br/endocrinologista
  label: string; // rótulo amigável exibido no botão
}

export const DOCTORALIA_BASE = 'https://www.doctoralia.com.br';

export const SPECIALTY_BY_MARKER: Record<string, Specialty> = {
  // ===== Eixo Tireoidiano =====
  TSH: { slug: 'endocrinologista', label: 'Endocrinologista' },
  T4_LIVRE: { slug: 'endocrinologista', label: 'Endocrinologista' },
  T3: { slug: 'endocrinologista', label: 'Endocrinologista' },
  TIREOGLOBULINA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  'ANTICORPO ANTITIREOGLOBULINA': { slug: 'endocrinologista', label: 'Endocrinologista' },
  'ANTICORPO ANTITIREOIDE MICROSSOMAL': { slug: 'endocrinologista', label: 'Endocrinologista' },

  // ===== Eixo Hormonal / Androgênico =====
  TESTOSTERONA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  'TESTOSTERONA TOTAL': { slug: 'endocrinologista', label: 'Endocrinologista' },
  'TESTOSTERONA LIVRE': { slug: 'endocrinologista', label: 'Endocrinologista' },
  ESTRADIOL: { slug: 'endocrinologista', label: 'Endocrinologista' },
  PROLACTINA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  PROGESTERONA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  LH: { slug: 'endocrinologista', label: 'Endocrinologista' },
  FSH: { slug: 'endocrinologista', label: 'Endocrinologista' },
  DHT: { slug: 'endocrinologista', label: 'Endocrinologista' },
  CORTISOL: { slug: 'endocrinologista', label: 'Endocrinologista' },
  INSULINA: { slug: 'endocrinologista', label: 'Endocrinologista' },

  // ===== Glicemia / Diabetes =====
  GLICEMIA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  HEMOGLOBINA_GLICADA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  'INSULINA BASAL': { slug: 'endocrinologista', label: 'Endocrinologista' },

  // ===== Hemograma / Anemia =====
  HEMOGLOBINA: { slug: 'hematologista', label: 'Hematologista' },
  HEMATOCRITO: { slug: 'hematologista', label: 'Hematologista' },
  HEMACIAS: { slug: 'hematologista', label: 'Hematologista' },
  VCM: { slug: 'hematologista', label: 'Hematologista' },
  HCM: { slug: 'hematologista', label: 'Hematologista' },
  CHCM: { slug: 'hematologista', label: 'Hematologista' },
  RDW: { slug: 'hematologista', label: 'Hematologista' },
  PLAQUETAS: { slug: 'hematologista', label: 'Hematologista' },
  LEUCOCITOS: { slug: 'hematologista', label: 'Hematologista' },
  NEUTROFILOS: { slug: 'hematologista', label: 'Hematologista' },
  LINFOCITOS: { slug: 'hematologista', label: 'Hematologista' },
  MONOCITOS: { slug: 'hematologista', label: 'Hematologista' },
  EOSINOFILOS: { slug: 'hematologista', label: 'Hematologista' },
  BASOFILOS: { slug: 'hematologista', label: 'Hematologista' },

  // ===== Ferro =====
  FERRITINA: { slug: 'hematologista', label: 'Hematologista' },
  FERRO: { slug: 'hematologista', label: 'Hematologista' },
  'CAPACIDADE LATENTE DE LIGACAO DO FERRO': { slug: 'hematologista', label: 'Hematologista' },
  'CAPACIDADE TOTAL DE LIGACAO DO FERRO': { slug: 'hematologista', label: 'Hematologista' },
  TRANSFERRINA: { slug: 'hematologista', label: 'Hematologista' },
  'SATURACAO DA TRANSFERRINA': { slug: 'hematologista', label: 'Hematologista' },
  VITAMINA_B12: { slug: 'hematologista', label: 'Hematologista' },
  'ACIDO FOLICO': { slug: 'hematologista', label: 'Hematologista' },

  // ===== Lipídios / Coração =====
  COLESTEROL_TOTAL: { slug: 'cardiologista', label: 'Cardiologista' },
  LDL: { slug: 'cardiologista', label: 'Cardiologista' },
  HDL: { slug: 'cardiologista', label: 'Cardiologista' },
  TRIGLICERIDES: { slug: 'cardiologista', label: 'Cardiologista' },
  PCR: { slug: 'cardiologista', label: 'Cardiologista' },

  // ===== Rins / Eletrólitos =====
  CREATININA: { slug: 'nefrologista', label: 'Nefrologista' },
  UREIA: { slug: 'nefrologista', label: 'Nefrologista' },
  'ESTIMATIVA DA TAXA DE FILTRACAO GLOMERULAR': { slug: 'nefrologista', label: 'Nefrologista' },
  'TAXA DE FILTRACAO GLOMERULAR': { slug: 'nefrologista', label: 'Nefrologista' },
  'FILTRACAO GLOMERULAR': { slug: 'nefrologista', label: 'Nefrologista' },
  TFG: { slug: 'nefrologista', label: 'Nefrologista' },
  SODIO: { slug: 'nefrologista', label: 'Nefrologista' },
  POTASSIO: { slug: 'nefrologista', label: 'Nefrologista' },
  CALCIO: { slug: 'nefrologista', label: 'Nefrologista' },
  MAGNESIO: { slug: 'nefrologista', label: 'Nefrologista' },
  CLORO: { slug: 'nefrologista', label: 'Nefrologista' },
  FOSFORO: { slug: 'nefrologista', label: 'Nefrologista' },

  // ===== Fígado =====
  TGO: { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  TGP: { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  GAMA_GT: { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  BILIRRUBINA: { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  'BILIRRUBINA TOTAL': { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  'BILIRRUBINA DIRETA': { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  'FOSFATASE ALCALINA': { slug: 'gastroenterologista', label: 'Gastroenterologista' },

  // ===== Ácido úrico / Gota =====
  ACIDO_URICO: { slug: 'reumatologista', label: 'Reumatologista' },

  // ===== Vitaminas =====
  VITAMINA_D: { slug: 'endocrinologista', label: 'Endocrinologista' },
};

/** Devolve a especialidade mapeada para um marcador (ou null). */
export function specialtyForMarker(canonical?: string | null): Specialty | null {
  if (!canonical) return null;
  if (SPECIALTY_BY_MARKER[canonical]) return SPECIALTY_BY_MARKER[canonical];
  // fallback: casamento por contains (contra variação de nomenclatura de lab)
  const keys = Object.keys(SPECIALTY_BY_MARKER);
  const hit = keys.find((k) => canonical.includes(k) || k.includes(canonical));
  return hit ? SPECIALTY_BY_MARKER[hit] : null;
}

/** URL pública do Doctoralia para a especialidade. */
export function doctoraliaUrl(slug: string): string {
  return `${DOCTORALIA_BASE}/${slug}`;
}
