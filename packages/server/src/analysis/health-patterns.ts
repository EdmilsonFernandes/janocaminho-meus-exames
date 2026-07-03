/**
 * health-patterns.ts — Agrupa marcadores em SISTEMAS/PADRÕES fisiológicos (determinístico).
 *
 * Inspirado no relatório do BloodGPT ("Blood Sugar Regulation Pattern", "Kidney Filtration
 * Pattern"...) — mostra ao médico, num relance, quais SISTEMAS do paciente concentraram
 * alterações, sem ler marcador por marcador. PURA (sem DB/IA).
 *
 * Usado pelo brief de pré-consulta (doctor.routes) pra alimentar o bloco "Padrões".
 */

export interface PatternDef {
  id: string;
  title: string;
  emoji: string;
  canonicals: string[]; // chaves canônicas que pertencem a este sistema
}

export const PATTERNS: PatternDef[] = [
  { id: 'glicemico', title: 'Regulação glicêmica', emoji: '🍬', canonicals: ['GLICEMIA', 'HEMOGLOBINA_GLICADA', 'INSULINA', 'HOMA_IR'] },
  { id: 'lipidico', title: 'Transporte lipídico', emoji: '🧈', canonicals: ['LDL', 'HDL', 'TRIGLICERIDES', 'COLESTEROL_TOTAL'] },
  { id: 'renal', title: 'Filtração renal', emoji: '🚰', canonicals: ['CREATININA', 'EGFR', 'UREIA'] },
  { id: 'hematologico', title: 'Série vermelha (anemia)', emoji: '🩸', canonicals: ['HEMOGLOBINA', 'VCM', 'HCM', 'HEMATOCRITO'] },
  { id: 'pressao', title: 'Pressão arterial', emoji: '💓', canonicals: ['PRESSAO_SISTOLICA', 'PRESSAO_DIASTOLICA'] },
  { id: 'metabolico', title: 'Risco metabólico', emoji: '⚖️', canonicals: ['IMC', 'HOMA_IR', 'TRIGLICERIDES', 'HDL', 'GLICEMIA'] },
  { id: 'hepatico', title: 'Função hepática', emoji: '🫀', canonicals: ['TGO', 'TGP', 'GAMA_GT'] },
];

export interface ActivePattern {
  id: string;
  title: string;
  emoji: string;
  markers: string[]; // marcadores canônicos presentes neste sistema
}

/**
 * Agrupa marcadores presentes em sistemas fisiológicos. Retorna só sistemas com ≥1 marcador
 * (ordenados por PATTERNS). `items` = marcadores do paciente (topAttention, findings, etc.).
 */
export function summarizePatterns(items: { name?: string | null; nameCanonical?: string | null }[]): ActivePattern[] {
  const present = new Set(items.map((m) => m.nameCanonical || m.name || '').filter(Boolean));
  const out: ActivePattern[] = [];
  for (const p of PATTERNS) {
    const hits = p.canonicals.filter((c) => present.has(c));
    if (hits.length) out.push({ id: p.id, title: p.title, emoji: p.emoji, markers: hits });
  }
  return out;
}
