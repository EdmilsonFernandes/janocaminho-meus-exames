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

/**
 * Unidade pra exibir AO LADO do valor (render secundário, menor).
 * Devolve '' quando o valueText já traz a unidade embutida — a extração grava
 * valueText = "17,1 g/dL" (com unidade) E unit = "g/dL" separadamente, então
 * exibir ambos duplicava: "46,7 %%", "26,0 pgpg", "5,78 milhões/mm*milhões/mm*".
 * Só mostra a unidade avulsa quando o valor NÃO a traz (ex.: fallback numérico).
 */
export function unitSuffix(it: { valueText?: string | null; unit?: string | null } | null | undefined): string {
  if (!it?.unit) return '';
  const t = (it.valueText ?? '').trim().toLowerCase();
  const u = it.unit.trim().toLowerCase();
  if (t && u && t.includes(u)) return '';
  return it.unit;
}
