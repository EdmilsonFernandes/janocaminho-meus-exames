/**
 * personalized-targets.ts — ALVOS PERSONALIZADOS por medicação/condição (F1).
 *
 * Princípio: o tratamento do paciente muda o ALVO de alguns analitos (ex.: quem usa
 * levotiroxina tem alvo de TSH mais estrito que a faixa genérica do laudo). Estes alvos
 * são LEITURA COMPLEMENTAR — NUNCA substituem a faixa de referência do laboratório na
 * exibição do item, e NÃO alteram score/flags/prioridade (expor apenas; a IA do chat e
 * o front consomem depois).
 *
 * REGRA DE OURO: só entra regra com CITAÇÃO REAL de diretriz (sociedade médica).
 * NÃO inventar alvo "por parecer clínico". Regras atuais (todas aprovadas pelo dono):
 *
 *   a. Levotiroxina (reposição)            → TSH alvo 0,4–2,5 mUI/L (ATA/SBD).
 *   b. Diabetes (remédio OU condição)      → LDL alvo < 100 mg/dL e HbA1c < 7% (SBD/ADA).
 *      (Só a regra base < 100 — o < 70 de evento cardiovascular exige contexto clínico
 *       que não temos aqui; NÃO implementar sem estudo.)
 *   c. Hipertensão / anti-hipertensivo     → NENHUM alvo de analito (alvo de PA não é
 *      analito de exame aqui — apenas reconhecida, não aplicada).
 *   d. Estatina                            → não cria regra isolada; só REFORÇA o LDL < 100
 *      da regra b quando o gatilho de diabetes já existe.
 *   e. NENHUMA outra regra nesta fase.
 *
 * Nomenclatura de analitos: nameCanonical SEM acento, MAIÚSCULO (TSH, LDL,
 * HEMOGLOBINA_GLICADA) — mesma chave de src/utils/normalize.ts.
 *
 * Matching de medicamento: normalizeKey (sem acento, MAIÚSCULAS) + `includes` por
 * PRINCÍPIO ATIVO principal, com mapa mínimo de marcas BR→princípio (a ideia do
 * INN_EN de src/utils/faers.ts, reutilizada — não o arquivo).
 */
import { normalizeKey } from '../utils/normalize';

// ───────────────────────────── tipos ─────────────────────────────

/** Analito medido do paciente (entrada — usado p/ ordenar alvos de analitos medidos primeiro). */
export interface PersonalizedTargetAnalyte {
  nameCanonical: string;
  valueNumeric: number | null;
}

/** Perfil de tratamento: remédios ATIVOS (texto livre) + perfil clínico (texto livre). */
export interface PatientTreatmentProfile {
  medications: string[];
  conditions: string;
}

/** Um alvo personalizado — leitura complementar à faixa do laboratório. */
export interface PersonalizedTarget {
  /** nameCanonical do analito (TSH, LDL, HEMOGLOBINA_GLICADA…). */
  analyte: string;
  /** Teto/floor do alvo personalizado (null quando só um lado existe). */
  refLow: number | null;
  refHigh: number | null;
  /** Unidade do alvo (mUI/L, mg/dL, %) — para exibição. */
  unit: string;
  /** Motivo em PT claro (por que ESTE paciente tem ESTE alvo). */
  reason: string;
  /** Citação REAL da diretriz (sociedade médica + publicação). */
  citation: string;
  /** Gatilho legível: "você usa levotiroxina", "diabetes — tratamento com metformina"… */
  appliesTo: string;
}

// ─────────────────── matching de medicamentos ───────────────────

/** Marcas BR → princípio ativo (mínimo e verificável — mesma ideia do INN_EN do faers.ts).
 *  O paciente digita nome de marca ("Euthyrox"); o alvo é do PRINCÍPIO (levotiroxina). */
const MED_BRAND_ALIASES: [string, string][] = [
  // tireoide (Euthyrox é a grafia da marca; Eutirox cobre o erro de digitação comum)
  ['EUTHYROX', 'LEVOTIROXINA'], ['EUTIROX', 'LEVOTIROXINA'], ['PURAN T4', 'LEVOTIROXINA'], ['SYNTHROID', 'LEVOTIROXINA'],
  // diabetes
  ['GLIFAGE', 'METFORMINA'], ['JANUVIA', 'SITAGLIPTINA'], ['OZEMPIC', 'SEMAGLUTIDA'],
  ['WEGOVY', 'SEMAGLUTIDA'], ['MOUNJARO', 'TIRZEPATIDA'], ['FORXIGA', 'DAPAGLIFLOZINA'],
  ['JARDIANCE', 'EMPAGLIFLOZINA'], ['DIAMICRON', 'GLICLAZIDA'],
  ['LANTUS', 'INSULINA'], ['TOUJEO', 'INSULINA'], ['LEVEMIR', 'INSULINA'],
  ['NOVORAPID', 'INSULINA'], ['HUMALOG', 'INSULINA'], ['APIDRA', 'INSULINA'],
  // estatinas
  ['LIPITOR', 'ATORVASTATINA'], ['CRESTOR', 'ROSUVASTATINA'], ['SINVACOR', 'SINVASTATINA'],
];

/** Princípios ativos que caracterizam cada gatilho (match por includes no texto normalizado). */
const LEVOTHYROXINE_TOKENS = ['LEVOTIROXINA'];
const DIABETES_MED_TOKENS = [
  'METFORMINA', 'INSULINA', 'SITAGLIPTINA', 'DAPAGLIFLOZINA', 'EMPAGLIFLOZINA',
  'SEMAGLUTIDA', 'TIRZEPATIDA', 'GLICLAZIDA',
];
const STATIN_TOKENS = ['SINVASTATINA', 'ATORVASTATINA', 'ROSUVASTATINA'];
// NOTA (regra c): anti-hipertensivos (losartana, enalaprila, amlodipina, hidroclorotiazida,
// valsartana…) são reconhecidos no perfil mas NÃO geram alvo de analito — alvo de PRESSÃO
// ARTERIAL não é analito de exame nesta fase. Sem regra, sem lista.

/** Converte a lista de remédios (texto livre) num "haystack" normalizado: nome cru +
 *  expansão de marcas → princípio ativo. Sem acento/MAIÚSCULAS via normalizeKey. */
function medicationsHaystack(medications: string[]): string {
  const parts: string[] = [];
  for (const raw of medications) {
    const n = normalizeKey(raw);
    if (!n) continue;
    parts.push(n);
    for (const [brand, principle] of MED_BRAND_ALIASES) {
      if (n.includes(brand)) parts.push(principle);
    }
  }
  return parts.join(' ');
}

/** Gatilho por princípio ativo: devolve o 1º token que casar (ou null). */
function firstMatch(haystack: string, tokens: string[]): string | null {
  return tokens.find((t) => haystack.includes(t)) ?? null;
}

// ─────────────────── gatilho por condição (perfil clínico) ───────────────────

// Texto já normalizado (sem acento, MAIÚSCULAS). Borda de não-alfanumérico impede
// "PREDIABETES"/"PRE-DIABETES" (pré-diabetes tem metas próprias — NÃO é a regra b).
const DIABETES_COND_RE = /(?:^|[^A-Z])DIABETE/;
// Guarda negativa simples (spec F1): "SEM DIABETES" NÃO dispara. Cobre também
// "não tem/não tenho diabetes", "diabetes negado/descartado".
const NEGATED_DIABETES_RE = /(?:SEM|NAO TEM|NAO TENHO|NAO POSSUI|NEGAD[OA]|DESCARTAD[OA])\s+DIABETE/;
// Pré-diabetes (com ou sem hífen) — excluído da regra do diabetes.
const PRE_DIABETES_RE = /PRE[- ]?DIABETE/;

// ───────────────────────────── regras ─────────────────────────────

/**
 * Calcula os alvos personalizados do paciente.
 * @param analytes  Analitos medidos ({nameCanonical, valueNumeric}) — usados só para
 *                  ORDENAR (alvos de analitos medidos primeiro); o gatilho vem do perfil.
 * @param profile   Remédios ativos (texto livre) + condições (clinicalProfile texto).
 * @returns Alvos personalizados (possivelmente vazios). NUNCA substituem a faixa do lab.
 */
export function personalizedTargets(
  analytes: PersonalizedTargetAnalyte[],
  profile: PatientTreatmentProfile,
): PersonalizedTarget[] {
  const meds = medicationsHaystack(profile?.medications ?? []);
  const cond = normalizeKey(profile?.conditions ?? '');
  const out: PersonalizedTarget[] = [];

  // (a) Levotiroxina/reposição → TSH 0,4–2,5 mUI/L (alvo de reposição do adulto é mais
  //     estrito que a faixa genérica do laboratório).
  if (firstMatch(meds, LEVOTHYROXINE_TOKENS)) {
    out.push({
      analyte: 'TSH',
      refLow: 0.4,
      refHigh: 2.5,
      unit: 'mUI/L',
      reason: 'Em tratamento com levotiroxina, o alvo de TSH de reposição no adulto é mais estrito que a faixa genérica do laboratório (0,4–2,5 mUI/L).',
      citation: 'ATA — Guidelines for the Treatment of Hypothyroidism (Thyroid, 2014); SBD — Diretriz de Hipotireoidismo',
      appliesTo: 'você usa levotiroxina',
    });
  }

  // (b) Diabetes (remédio no texto OU condição no perfil) → LDL < 100 mg/dL e HbA1c < 7%.
  //     Só a regra base (< 100); o < 70 de evento cardiovascular NÃO se aplica aqui.
  const diabetesMed = firstMatch(meds, DIABETES_MED_TOKENS);
  const diabetesCond = DIABETES_COND_RE.test(cond) && !NEGATED_DIABETES_RE.test(cond) && !PRE_DIABETES_RE.test(cond);
  if (diabetesMed || diabetesCond) {
    // (d) Estatina não cria regra isolada — só REFORÇA o alvo de LDL do diabetes.
    const statin = firstMatch(meds, STATIN_TOKENS);
    const appliesTo = diabetesMed
      ? `diabetes — tratamento com ${diabetesMed.toLowerCase()}`
      : 'diabetes — relatado no perfil clínico';
    out.push({
      analyte: 'LDL',
      refLow: null,
      refHigh: 100,
      unit: 'mg/dL',
      reason: `No diabetes, o alvo de LDL-colesterol é < 100 mg/dL — mais estrito que a faixa genérica do laboratório.${statin ? ' O uso de estatina reforça este alvo.' : ''}`,
      citation: 'SBD/ADA — Standards of Care in Diabetes (doença cardiovascular e manejo de risco)',
      appliesTo,
    });
    out.push({
      analyte: 'HEMOGLOBINA_GLICADA',
      refLow: null,
      refHigh: 7,
      unit: '%',
      reason: 'No diabetes, o alvo de hemoglobina glicada (HbA1c) é < 7% para a maioria dos adultos.',
      citation: 'SBD/ADA — Standards of Care in Diabetes (metas glicêmicas)',
      appliesTo,
    });
  }

  // (c) Hipertensão/anti-hipertensivo: reconhecida no perfil, NENHUM alvo de analito
  //     (alvo de PA não é analito de exame aqui — não aplicar).
  // (e) Nenhuma outra regra. Toda regra futura exige citação real de diretriz.

  // Ordenação: alvo de analito MEDIDO pelo paciente vem primeiro (o mais acionável
  // para exibição/chat); dentro de cada grupo mantém a ordem das regras (sort estável).
  const measured = new Set(analytes.map((a) => a.nameCanonical));
  return out.sort((a, b) => Number(measured.has(b.analyte)) - Number(measured.has(a.analyte)));
}

/** Renderiza o alvo em pt-BR: "0,4–2,5", "< 100", "> 10" (vírgula decimal). */
export function formatTarget(t: Pick<PersonalizedTarget, 'refLow' | 'refHigh'>): string {
  const pt = (n: number) => String(n).replace('.', ',');
  if (t.refLow != null && t.refHigh != null) return `${pt(t.refLow)}–${pt(t.refHigh)}`;
  if (t.refHigh != null) return `< ${pt(t.refHigh)}`;
  if (t.refLow != null) return `> ${pt(t.refLow)}`;
  return '—';
}
