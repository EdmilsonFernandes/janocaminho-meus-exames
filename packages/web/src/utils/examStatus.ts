/**
 * Helper central: traduz a flag técnica (ItemFlag do server: NORMAL/HIGH/LOW/ABNORMAL/CRITICAL/
 * UNKNOWN) em texto amigável p/ a UI. Regra de ouro: **UNKNOWN nunca aparece cru** na tela —
 * vira "Referência não informada pelo laboratório" ou, p/ exames dependentes de contexto clínico
 * (LDL, Colesterol não-HDL), "Interpretação depende do contexto clínico".
 *
 * Separa 3 dimensões (não mistura): (1) status clínico (NORMAL/LOW/HIGH = como o valor se compara
 * à faixa); (2) ausência de referência (o laudo não trouxe faixa); (3) tendência (numérica, ver
 * health-state/evolution). O enum do server mantém UNKNOWN internamente (compatibilidade); só a
 * exibição é traduzida aqui (front-mapping, sem migration).
 */

/** Strip acentos + maiúsculas + espaços colados (espelha normalizeKey do server). */
export function normalizeKey(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Exames cuja interpretação depende de CONTEXTO CLÍNICO (a "meta" varia conforme o risco
 * cardiovascular individual) — não dá pra rotular de normal/alterado só pela faixa. Hoje: LDL e
 * Colesterol não-HDL (SBC/SBC-Im/AHA usam metas por estrato de risco). NÃO afirma meta — só
 * sinaliza que depende de contexto. Fonte: diretrizes de dislipidemias (SBC 2023, AHA/ACC).
 */
const CONTEXT_DEPENDENT = ['LDL', 'NAO HDL', 'NON-HDL', 'NON HDL'];
export function isContextDependent(name: string | null | undefined): boolean {
  const n = normalizeKey(name);
  if (!n) return false;
  return CONTEXT_DEPENDENT.some((k) => n === k || n.includes(k));
}

export type StatusTone = 'normal' | 'atencao' | 'critico' | 'neutro' | 'contexto';
export interface DisplayStatus { label: string; short: string; tone: StatusTone }

const KNOWN: Record<string, DisplayStatus> = {
  NORMAL: { label: 'Dentro da referência', short: 'Normal', tone: 'normal' },
  LOW: { label: 'Abaixo da referência', short: 'Abaixo', tone: 'atencao' },
  HIGH: { label: 'Acima da referência', short: 'Acima', tone: 'atencao' },
  ABNORMAL: { label: 'Alterado', short: 'Alterado', tone: 'atencao' },
  CRITICAL: { label: 'Atenção necessária', short: 'Crítico', tone: 'critico' },
};

/**
 * Traduz flag → {label, short, tone}. UNKNOWN (ou flag vazia) NUNCA retorna cru:
 *  - sem faixa (refLow/refHigh null) + LDL/não-HDL → "Interpretação depende do contexto clínico"
 *  - sem faixa + demais → "Referência não informada pelo laboratório"
 *  - tem faixa mas flag desconhecida → "Não classificado automaticamente"
 */
export function displayStatus(
  flag: string | null | undefined,
  name?: string | null,
  refLow?: number | null,
  refHigh?: number | null,
): DisplayStatus {
  const f = (flag ?? '').toUpperCase();
  if (KNOWN[f]) return KNOWN[f];
  const hasRef = refLow != null || refHigh != null;
  if (!hasRef) {
    if (isContextDependent(name)) return { label: 'Interpretação depende do contexto clínico', short: 'Contexto', tone: 'contexto' };
    return { label: 'Referência não informada pelo laboratório', short: 'S/ referência', tone: 'neutro' };
  }
  return { label: 'Não classificado automaticamente', short: '—', tone: 'neutro' };
}

/**
 * Label pronto da faixa de referência p/ exibir. Com faixa: "Ref: 3,5 - 5,0". Sem faixa:
 * mensagem segura (context-dependent vs no-reference) — nunca "Ref: —".
 */
export function refInfo(
  name: string | null | undefined,
  refText?: string | null,
  refLow?: number | null,
  refHigh?: number | null,
  unit?: string | null,
): string {
  if (refText) return `Ref: ${refText}`;
  if (refLow != null || refHigh != null) {
    const range = refLow != null && refHigh != null ? `${refLow} - ${refHigh}` : `${refLow ?? refHigh}`;
    return unit ? `Ref: ${range} ${unit}` : `Ref: ${range}`;
  }
  return isContextDependent(name)
    ? 'Interpretação depende do contexto clínico'
    : 'Referência não informada pelo laboratório';
}
