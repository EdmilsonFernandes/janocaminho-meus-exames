/**
 * "O que pede atenção" no cartão principal da tela inicial (27/11/26): os marcadores que o placar
 * conta como atenção, com o exame de onde veio o valor (campo `health.attention` do
 * dashboard-summary). Funções puras do texto que a pessoa lê sobre cada valor.
 */
export interface AttentionItem {
  name: string; valueText: string | null; valueNumeric: number | null; unit: string | null;
  refLow: number | null; refHigh: number | null; flag: string | null; priority: string;
  examId: string | null; performedAt: string | null;
}

const num = (v: number) => String(v).replace('.', ',');

/** Faixa de referência em texto curto: "faixa até 130 mg/dL", "faixa 30 a 100 ng/mL". */
export const refRange = (a: Pick<AttentionItem, 'refLow' | 'refHigh' | 'unit'>): string => {
  const u = a.unit ? ` ${a.unit}` : '';
  if (a.refLow != null && a.refHigh != null) return `faixa ${num(a.refLow)} a ${num(a.refHigh)}${u}`;
  if (a.refHigh != null) return `faixa até ${num(a.refHigh)}${u}`;
  if (a.refLow != null) return `faixa a partir de ${num(a.refLow)}${u}`;
  return 'fora da faixa do laboratório';
};

/** Para que lado o valor saiu da faixa. O número decide; a marcação do laudo só vale sem número. */
export const attentionDir = (a: Pick<AttentionItem, 'valueNumeric' | 'refLow' | 'refHigh' | 'flag'>): 'up' | 'down' | null => {
  if (a.valueNumeric != null && a.refHigh != null && a.valueNumeric > a.refHigh) return 'up';
  if (a.valueNumeric != null && a.refLow != null && a.valueNumeric < a.refLow) return 'down';
  if (a.valueNumeric != null && (a.refLow != null || a.refHigh != null)) return null;
  const f = String(a.flag ?? '').toUpperCase();
  return f === 'HIGH' ? 'up' : f === 'LOW' ? 'down' : null;
};
