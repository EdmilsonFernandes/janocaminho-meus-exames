/**
 * Valor de exame para exibição. Trata null/undefined/''/string 'null'
 * (às vezes a extração grava literal "null") → cai pro valor numérico, senão '—'.
 */
export function fmtVal(it: { valueText?: string | null; valueNumeric?: number | null } | null | undefined): string {
  if (!it) return '—';
  const t = it.valueText;
  if (t != null && t !== '' && String(t).toLowerCase() !== 'null') return t;
  if (it.valueNumeric != null) return String(Number(it.valueNumeric.toFixed(4))).replace('.', ',');
  return '—';
}

/**
 * Número p/ exibição em PT-BR sem artefatos de float (5.714285714285714 → "5,71").
 * Fonte única — antes cada card renderizava valueNumeric cru (14 casas, QA 2026-08).
 */
export function fmtNum(v: number | null | undefined, maxDec = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: maxDec });
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

const ME_MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/**
 * Data de exame pra exibição compacta/premium: "15 mar 2026" (dia + mês abreviado + ano).
 * Mais legível "batendo o olho" que "15/03/2026". Manual (sem depender de locale do browser).
 */
export function fmtDateShort(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')} ${ME_MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

/**
 * Tempo relativo legível: "agora" / "há 5 min" / "ontem" / "há 9 dias" / "há 3 meses" / "há 1 ano".
 * Fonte canônica — antes havia 5 cópias (ExamCard, PatientSummary, ValoresAlterados,
 * DoctorValoresAlterados, DoctorPortal). Imune a clock skew futuro ("em breve").
 */
export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const ms = Date.now() - dt.getTime();
  if (ms < 0) return 'em breve';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}
