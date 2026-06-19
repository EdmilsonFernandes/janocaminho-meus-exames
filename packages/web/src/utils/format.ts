/**
 * Valor de exame para exibição. Trata null/undefined/''/string 'null'
 * (às vezes a extração grava literal "null") → cai pro valor numérico, senão '—'.
 */
export function fmtVal(it: { valueText?: string | null; valueNumeric?: number | null } | null | undefined): string {
  if (!it) return '—';
  const t = it.valueText;
  if (t != null && t !== '' && String(t).toLowerCase() !== 'null') return t;
  if (it.valueNumeric != null) return String(it.valueNumeric).replace('.', ',');
  return '—';
}
