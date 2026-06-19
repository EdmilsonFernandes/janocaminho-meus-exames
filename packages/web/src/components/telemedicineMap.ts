// Mapa: marcador alterado (nameCanonical) → especialidade médica no Doctoralia.
// Quando um exame vem alterado, o botão de telemedicina leva direto ao especialista certo.
// Configurável: ajuste o slug/label livremente. Slugs = páginas públicas do Doctoralia BR.

export interface Specialty {
  slug: string; // ex.: 'endocrinologista' → https://www.doctoralia.com.br/endocrinologista
  label: string; // rótulo amigável exibido no botão
}

export const DOCTORALIA_BASE = 'https://www.doctoralia.com.br';

// Chaves = nameCanonical (mesmas do SYNONYMS no backend /utils/normalize.ts).
export const SPECIALTY_BY_MARKER: Record<string, Specialty> = {
  // Tireoide / diabetes / hormônios
  TSH: { slug: 'endocrinologista', label: 'Endocrinologista' },
  T4_LIVRE: { slug: 'endocrinologista', label: 'Endocrinologista' },
  T3: { slug: 'endocrinologista', label: 'Endocrinologista' },
  GLICEMIA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  HEMOGLOBINA_GLICADA: { slug: 'endocrinologista', label: 'Endocrinologista' },
  VITAMINA_D: { slug: 'endocrinologista', label: 'Endocrinologista' },

  // Hemograma / anemia
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
  FERRITINA: { slug: 'hematologista', label: 'Hematologista' },
  VITAMINA_B12: { slug: 'hematologista', label: 'Hematologista' },

  // Lipídios / coração
  COLESTEROL_TOTAL: { slug: 'cardiologista', label: 'Cardiologista' },
  LDL: { slug: 'cardiologista', label: 'Cardiologista' },
  HDL: { slug: 'cardiologista', label: 'Cardiologista' },
  TRIGLICERIDES: { slug: 'cardiologista', label: 'Cardiologista' },

  // Rins / eletrólitos
  CREATININA: { slug: 'nefrologista', label: 'Nefrologista' },
  UREIA: { slug: 'nefrologista', label: 'Nefrologista' },
  SODIO: { slug: 'nefrologista', label: 'Nefrologista' },
  POTASSIO: { slug: 'nefrologista', label: 'Nefrologista' },
  CALCIO: { slug: 'nefrologista', label: 'Nefrologista' },
  MAGNESIO: { slug: 'nefrologista', label: 'Nefrologista' },

  // Fígado
  TGO: { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  TGP: { slug: 'gastroenterologista', label: 'Gastroenterologista' },
  GAMA_GT: { slug: 'gastroenterologista', label: 'Gastroenterologista' },

  // Ácido úrico / gota
  ACIDO_URICO: { slug: 'reumatologista', label: 'Reumatologista' },
};

/** Devolve a especialidade mapeada para um marcador (ou null). */
export function specialtyForMarker(canonical?: string | null): Specialty | null {
  if (!canonical) return null;
  return SPECIALTY_BY_MARKER[canonical] ?? null;
}

/** URL pública do Doctoralia para a especialidade. */
export function doctoraliaUrl(slug: string): string {
  return `${DOCTORALIA_BASE}/${slug}`;
}
