/**
 * possibleCauses.ts — HIPÓTESES EDUCACIONAIS por marcador (camada 2 da interpretação).
 *
 * Para cada analito ALTERADO, 2-3 explicações possíveis em ordem de prevalência (a causa
 * benigna/comum primeiro), contextualizadas pelo que o paciente DECLAROU (treino recente,
 * hormônio). EDUCATIVO — não é diagnóstico e o front mostra o disclaimer junto.
 *
 * Princípios:
 *  - conteúdo FIXO e auditável (mesma filosofia da triagem de urgência): a IA não escolhe
 *    as hipóteses — ela já contextualiza no texto do resumo; aqui o card "ℹ️ Possíveis
 *    explicações" é determinístico e reproduzível;
 *  - linguagem simples, sem jargão, sempre com porta de saída ("converse com seu médico");
 *  - contexto do paciente só entra quando ele mesmo declarou (SportsProfile/medicação) —
 *    nunca inferido de fora do app.
 *
 * Módulo PURO (sem prisma/IA) — testável isoladamente (test/possible-causes.test.ts).
 */
import { canonicalName, normalizeKey } from '../utils/normalize';

export interface CausesContext {
  /** Coleta <24h pós-treino (declarado no SportsProfile.collectionContext). */
  hasRecentExercise?: boolean;
  /** Testosterona/hormônio declarado (perfil clínico, Medication ativa ou SportsProfile). */
  hasHormone?: boolean;
  /** Direção da alteração (do flag do item) — causas distintas p/ alto vs baixo. */
  direction?: 'high' | 'low';
}

/** Entradas puras p/ buildCausesContext (quem chama faz as queries). */
export interface CausesInput {
  clinicalProfile?: string | null;
  sportsProfile?: { active?: boolean | null; collectionContext?: unknown; declaredSubstances?: unknown } | null;
  medications?: string[];
}

const truthy = (v: unknown): boolean => v === true || v === 'true' || v === 'sim' || v === 1 || v === '1';

/** Jsonb declarado → lista de nomes (string crua ou {name}) — mesmo contrato do sports-context. */
function declaredNames(v: unknown): string[] {
  const out: string[] = [];
  const push = (s: unknown) => {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t) out.push(t);
  };
  if (Array.isArray(v)) {
    for (const it of v) {
      if (typeof it === 'string') push(it);
      else if (it && typeof it === 'object' && typeof (it as any).name === 'string') push((it as any).name);
    }
  } else if (typeof v === 'string') push(v);
  return out;
}

/** Constrói o contexto determinístico das causas a partir do que o paciente declarou. */
export function buildCausesContext(input: CausesInput = {}): CausesContext {
  const haystack = [
    ...(input.medications ?? []),
    ...declaredNames(input.sportsProfile?.declaredSubstances),
    String(input.clinicalProfile ?? ''),
  ].map((s) => normalizeKey(s));
  const blob = haystack.join(' | ');
  const hasHormone = /TESTOSTERONA|HORMONIO/.test(blob);
  const cc = (input.sportsProfile?.collectionContext ?? {}) as Record<string, unknown>;
  const hasRecentExercise =
    input.sportsProfile?.active !== false &&
    (truthy(cc.treino24h) || truthy(cc.treino) || truthy(cc.trainingWithin24h));
  return { hasHormone, hasRecentExercise };
}

type CausesFn = (ctx: CausesContext) => string[];

/**
 * Tabela por canônico (saída de canonicalName). 2-3 causas, benigna-comum primeiro.
 * "Consulte/Converse com seu médico" fecha as listas que pedem diferenciação.
 */
const CAUSES: Record<string, CausesFn> = {
  // CK — o clássico do paciente que treina: treino recente domina quando declarado.
  CREATINO_QUINASE: (ctx) =>
    ctx.hasRecentExercise
      ? ['Treino intenso nas últimas 24–48h (causa mais provável quando há treino recente)', 'Esforço/desgaste muscular local', 'Menos comum: origem cardíaca — seu médico diferencia com outros exames']
      : ['Atividade física intensa recente (mesmo de 1–2 dias atrás)', 'Trauma ou esforço muscular local', 'Menos comum: origem cardíaca ou medicamentosa (estatinas) — converse com seu médico'],
  // Hematócrito alto — TRT é causa conhecida e monitorada; mostrar quando declarado.
  HEMATOCRITO: (ctx) => {
    if (ctx.direction === 'low') {
      return ['Anemia (perda de ferro ou de sangue)', 'Hidratação excessiva antes da coleta (hemodiluição)', 'Deficiência de B12/folato (menos comum)'];
    }
    return ctx.hasHormone
      ? ['Uso de testosterona pode elevar o hematócrito (efeito conhecido e monitorado)', 'Desidratação (hemoconcentração)', 'Se persistir acima de 54%, converse com seu médico sobre ajuste']
      : ['Desidratação (causa mais comum)', 'Tabagismo ou moradia em altitude', 'Condições hematológicas (menos comum)'];
  },
  // TGO/AST também está no músculo — treino confunde a leitura hepática.
  TGO: (ctx) =>
    ctx.hasRecentExercise
      ? ['Liberação muscular pós-treino (TGO também existe no músculo)', 'Gordura no fígado (esteatose)', 'TGP e GGT ajudam a diferenciar a origem — converse com seu médico']
      : ['Gordura no fígado (esteatose) — causa muito comum', 'Consumo de álcool', 'Medicações (ex.: estatinas) ou esforço físico intenso'],
  TGP: () => ['Gordura no fígado (esteatose) — causa muito comum', 'Consumo de álcool', 'Medicações (ex.: estatinas) ou esforço físico intenso'],
  GAMA_GT: () => ['Consumo de álcool (mesmo moderado e recente)', 'Gordura no fígado e medicações', 'Obstrução das vias biliares (menos comum)'],
  LDL: () => ['Dieta rica em gorduras saturadas (carnes gordas, frituras, queijos amarelos)', 'Predisposição genética (colesterol familiar)', 'Sedentarismo'],
  COLESTEROL_TOTAL: () => ['Dieta rica em gorduras saturadas e açúcares', 'Predisposição genética', 'Sedentarismo'],
  HDL: () => ['Sedentarismo (falta de atividade física regular)', 'Tabagismo', 'Predisposição genética'],
  TRIGLICERIDES: () => ['Dieta rica em carboidratos/açúcar e álcool', 'Excesso de peso e sedentarismo', 'Jejum insuficiente antes da coleta'],
  GLICEMIA: (ctx) =>
    ctx.direction === 'low'
      ? ['Jejum prolongado antes da coleta', 'Esforço físico intenso recente', 'Uso de medicamento para diabetes — se em uso, avise seu médico']
      : ['Refeição rica em açúcares perto da coleta (se sem jejum)', 'Pré-diabetes/diabetes (a confirmar com seu médico)', 'Estresse intenso ou uso de corticoides'],
  HEMOGLOBINA: (ctx) => {
    if (ctx.direction === 'low') {
      return ['Deficiência de ferro (causa mais comum, principalmente em mulheres com menstruação)', 'Perda de sangue (menstruação abundante ou sangramento oculto)', 'Deficiência de B12/folato (menos comum)'];
    }
    return ctx.hasHormone
      ? ['Uso de testosterona pode elevar a hemoglobina (efeito conhecido)', 'Desidratação', 'Tabagismo ou altitude (menos comum)']
      : ['Desidratação', 'Tabagismo ou moradia em altitude', 'Condições hematológicas (menos comum)'];
  },
  TSH: (ctx) =>
    ctx.direction === 'low'
      ? ['Hipertireoidismo (tireoide acelerada)', 'Dose de levotiroxina acima do necessário (se em uso)', 'Estresse ou doença recente']
      : ['Hipotireoidismo (tireoide mais lenta) — causa mais comum de TSH alto', 'Recuperação de doença recente', 'Uso de alguns medicamentos (ex.: lítio)'],
  VITAMINA_D: (ctx) =>
    ctx.direction === 'high'
      ? ['Uso de suplemento de vitamina D em dose alta']
      : ['Pouca exposição solar (causa mais comum)', 'Dieta pobre em vitamina D (peixes, ovos)', 'Uso intenso de protetor solar / pele mais escura'],
  VITAMINA_B12: () => ['Dieta pobre em carnes (vegetarianos e veganos)', 'Uso prolongado de omeprazol ou metformina', 'Má absorção (menos comum)'],
  ACIDO_URICO: () => ['Dieta rica em carnes, frutos do mar e cerveja', 'Desidratação', 'Predisposição genética (gota)'],
  CREATININA: () => ['Desidratação ou dieta muito rica em proteínas', 'Uso de creatina ou anti-inflamatórios', 'Função renal alterada — confirme com seu médico'],
  PCR: (ctx) =>
    ctx.hasRecentExercise
      ? ['Infecção ou inflamação recente (mesmo um resfriado)', 'Atividade física intensa recente (eleva a PCR)', 'Doenças inflamatórias crônicas (menos comum)']
      : ['Infecção ou inflamação recente (mesmo um resfriado)', 'Doenças inflamatórias crônicas', 'Atividade física intensa recente'],
  FERRITINA: (ctx) =>
    ctx.direction === 'low'
      ? ['Deficiência de ferro (causa mais comum)', 'Perda de sangue crônica', 'Dieta pobre em ferro']
      : ['Inflamação recente (a ferritina sobe como proteína de defesa)', 'Uso de suplementos de ferro', 'Excesso de ferro (menos comum)'],
  POTASSIO: (ctx) =>
    ctx.direction === 'low'
      ? ['Vômitos ou diarreia', 'Uso de diuréticos', 'Dieta muito pobre em potássio']
      : ['Hemólise da amostra (artefato de coleta — causa laboratorial comum)', 'Uso de diuréticos poupadores de potássio ou IECA', 'Função renal alterada — procure orientação médica'],
  UREIA: () => ['Desidratação', 'Dieta muito rica em proteínas', 'Função renal — veja a creatinina junto com seu médico'],
};

/** Hipóteses educacionais do analito (null = sem card na tabela — front não mostra nada). */
export function getPossibleCauses(nameCanonical: string, ctx: CausesContext = {}): string[] | null {
  const fn = CAUSES[canonicalName(nameCanonical)];
  return fn ? fn(ctx) : null;
}
