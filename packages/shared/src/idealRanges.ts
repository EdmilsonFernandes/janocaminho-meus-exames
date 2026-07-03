/**
 * Faixas IDEAIS (não apenas de referência) para marcadores-chave.
 *
 * Referência = intervalo "aceitável" do laudo; IDEAL = alvo ótimo de saúde.
 * Ex.: LDL ref <130, ideal <100. Glicemia ref <100, ideal <90. HDL ideal >60.
 *
 * Fonte: diretrizes (SBC/SBI/ADA). Educativo — não substitui avaliação clínica.
 * Consumido pelo web (HealthSummary) pra mostrar o alvo ideal ao lado do valor.
 *
 * Match por palavra-chave no nome (sem acento, minúsculas) — o HealthSummary recebe
 * nome livre da IA ("Colesterol LDL", "Glicemia de Jejum"...), não a chave canônica.
 * Ordem importa: 'hemoglobina glicada' antes de 'glicemia' etc.
 */
export interface IdealRange {
  /** Palavras-chave (sem acento, minúsculas) que casam o nome do exame. */
  match: string[];
  low?: number;  // ideal mínimo (inclusivo)
  high?: number; // ideal máximo (acima dele = "acima do ideal")
  label: string; // texto curto: "ideal <100 mg/dL"
}

export const IDEAL_RANGES: IdealRange[] = [
  { match: ['hemoglobina glicada', 'hba1c', 'glicada'], high: 5.7, label: 'ideal <5,7%' },
  { match: ['ldl'], high: 100, label: 'ideal <100 mg/dL' },
  { match: ['hdl'], low: 60, label: 'ideal >60 mg/dL' },
  { match: ['nao hdl', 'não hdl', 'colesterol nao hdl'], high: 130, label: 'ideal <130 mg/dL' },
  { match: ['colesterol total', 'col total'], high: 190, label: 'ideal <190 mg/dL' },
  { match: ['trigliceri', 'triglicerid', 'tg '], high: 150, label: 'ideal <150 mg/dL' },
  { match: ['glicemia', 'glicose'], high: 90, label: 'ideal <90 mg/dL' },
  { match: ['sistolica', 'pas', 'pressao arterial'], high: 120, label: 'ideal <120 mmHg' },
  { match: ['diastolica', 'pad'], high: 80, label: 'ideal <80 mmHg' },
  { match: ['tfg', 'egfr'], low: 90, label: 'ideal >90 mL/min' },
  { match: ['imc', 'indice de massa'], high: 25, label: 'ideal 18,5–24,9' },
];

/** Encontra a faixa ideal pelo nome do exame (match por palavra-chave, sem acento). */
export function findIdealRange(name: string): IdealRange | null {
  const n = (name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (!n) return null;
  for (const r of IDEAL_RANGES) {
    if (r.match.some((kw) => n.includes(kw))) return r;
  }
  return null;
}

/** Valor numérico acima do ideal? (para destacar). Null se não dá pra afirmar. */
export function isAboveIdeal(value: number | null, ideal: IdealRange): boolean | null {
  if (value == null) return null;
  if (ideal.high != null && value >= ideal.high) return true;
  if (ideal.low != null && value < ideal.low) return true;
  return false;
}
