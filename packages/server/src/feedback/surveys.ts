/**
 * OPINIÕES DOS USUÁRIOS — definições VERSIONADAS das pesquisas (02/11/26).
 *
 * Não é um construtor genérico: são 2 pesquisas curtas (paciente e médico), 3 perguntas
 * + comentário opcional, ~30–60s. Mudou o sentido de uma pergunta/opção → sobe `version`
 * (respostas antigas guardam surveyVersion e continuam legíveis pelos labels daqui).
 *
 * Regras de copy: neutra, permite contrariar nossas hipóteses (há "Outro"/"Nada por
 * enquanto"), nunca presume preço/feature como causa. O comentário orienta a NÃO
 * incluir dado médico pessoal.
 */

export type SurveyKey = 'patient-core' | 'doctor-core';
export type Outcome = 'done' | 'partial' | 'not' | 'exploring';
export type FeedbackCategory = 'usability' | 'technical' | 'value' | 'pricing' | 'feature' | 'other';

export interface SurveyOption { id: string; label: string }

export interface SurveyDefinition {
  key: SurveyKey;
  version: number;
  audience: 'patient' | 'doctor';
  estimatedSeconds: number;
  title: string;
  subtitle: string;
  q1: { id: 'outcome'; text: string; options: { id: Outcome; label: string }[] };
  q2: { id: 'detail'; multi: true; max: number; textByOutcome: Record<Outcome, string>; options: SurveyOption[] };
  q3: { id: 'improvement'; text: string; options: SurveyOption[] };
  comment: { label: string; hint: string; max: number };
  privacyNote: string;
  thanks: { title: string; text: string };
}

const OUTCOME_OPTIONS: { id: Outcome; label: string }[] = [
  { id: 'done', label: 'Sim' },
  { id: 'partial', label: 'Em parte' },
  { id: 'not', label: 'Não' },
  { id: 'exploring', label: 'Ainda estou conhecendo' },
];

export const OUTCOME_LABELS: Record<Outcome, string> = { done: 'Conseguiu', partial: 'Em parte', not: 'Não conseguiu', exploring: 'Ainda conhecendo' };

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  usability: 'Usabilidade',
  technical: 'Falha técnica',
  value: 'Entender o valor',
  pricing: 'Créditos / preço',
  feature: 'Pedido de funcionalidade',
  other: 'Outro',
};

const PRIVACY_NOTE = 'Sua opinião fica vinculada à sua conta para que a equipe entenda o contexto. Ela não é anônima e não é usada para avaliar sua saúde.';

export const SURVEYS: Record<SurveyKey, SurveyDefinition> = {
  'patient-core': {
    key: 'patient-core',
    version: 1,
    audience: 'patient',
    estimatedSeconds: 45,
    title: 'Ajude a melhorar o Dr. Exame',
    subtitle: 'Três perguntas rápidas. Leva menos de um minuto.',
    q1: { id: 'outcome', text: 'Você conseguiu fazer o que precisava no Dr. Exame?', options: OUTCOME_OPTIONS },
    q2: {
      id: 'detail', multi: true, max: 3,
      textByOutcome: {
        done: 'O que mais ajudou você?',
        partial: 'Onde você encontrou dificuldade?',
        not: 'Onde você encontrou dificuldade?',
        exploring: 'O que ajudaria você a começar?',
      },
      options: [
        { id: 'upload', label: 'Enviar exames' },
        { id: 'ai_analysis', label: 'Entender a análise da IA' },
        { id: 'trends', label: 'Acompanhar resultados ao longo do tempo' },
        { id: 'share_doctor', label: 'Compartilhar exames com meu médico' },
        { id: 'find_doctor', label: 'Encontrar médico ou acessar consulta' },
        { id: 'credits', label: 'Entender créditos e valores' },
        { id: 'find_feature', label: 'Encontrar uma função no aplicativo' },
        { id: 'slow_error', label: 'Lentidão ou erro' },
        { id: 'other', label: 'Outro' },
      ],
    },
    q3: {
      id: 'improvement', text: 'O que mais faria diferença para você?',
      options: [
        { id: 'simplify', label: 'Deixar o aplicativo mais simples' },
        { id: 'explain_results', label: 'Explicar melhor os resultados' },
        { id: 'trends_history', label: 'Melhorar comparação e histórico' },
        { id: 'doctor_contact', label: 'Facilitar o contato com médicos' },
        { id: 'credits_clarity', label: 'Explicar melhor os créditos e o que está incluído' },
        { id: 'other', label: 'Outra melhoria' },
        { id: 'nothing', label: 'Nada por enquanto' },
      ],
    },
    comment: { label: 'Conte o que faltou ou o que você mudaria.', hint: 'Opcional. Não inclua resultados de exames nem informações médicas pessoais.', max: 600 },
    privacyNote: PRIVACY_NOTE,
    thanks: { title: 'Obrigado por ajudar!', text: 'Sua opinião vai direto para quem constrói o Dr. Exame.' },
  },
  'doctor-core': {
    key: 'doctor-core',
    version: 1,
    audience: 'doctor',
    estimatedSeconds: 45,
    title: 'Ajude a melhorar o Portal do Médico',
    subtitle: 'Três perguntas rápidas. Leva menos de um minuto.',
    q1: { id: 'outcome', text: 'Você conseguiu fazer o que precisava no portal?', options: OUTCOME_OPTIONS },
    q2: {
      id: 'detail', multi: true, max: 3,
      textByOutcome: {
        done: 'O que mais ajudou no seu atendimento?',
        partial: 'Onde você encontrou dificuldade?',
        not: 'Onde você encontrou dificuldade?',
        exploring: 'O que ajudaria você a começar a usar?',
      },
      options: [
        { id: 'patients', label: 'Ver e organizar meus pacientes' },
        { id: 'shared_exams', label: 'Ler os exames compartilhados' },
        { id: 'organize', label: 'Organizar o atendimento' },
        { id: 'teleconsulta', label: 'Realizar teleconsulta' },
        { id: 'documentation', label: 'Registrar notas e documentos' },
        { id: 'questions', label: 'Responder perguntas de pacientes' },
        { id: 'find_feature', label: 'Encontrar uma função no portal' },
        { id: 'slow_error', label: 'Lentidão ou erro' },
        { id: 'other', label: 'Outro' },
      ],
    },
    q3: {
      id: 'improvement', text: 'O que mais faria diferença para você?',
      options: [
        { id: 'simplify', label: 'Deixar o portal mais simples' },
        { id: 'exam_reading', label: 'Melhorar a leitura dos exames' },
        { id: 'scheduling', label: 'Melhorar agenda e teleconsulta' },
        { id: 'documentation', label: 'Facilitar notas e documentação' },
        { id: 'payouts', label: 'Explicar melhor valores e repasses' },
        { id: 'other', label: 'Outra melhoria' },
        { id: 'nothing', label: 'Nada por enquanto' },
      ],
    },
    comment: { label: 'Conte o que faltou ou o que você mudaria.', hint: 'Opcional. Não inclua dados de pacientes nem informações clínicas.', max: 600 },
    privacyNote: PRIVACY_NOTE,
    thanks: { title: 'Obrigado por ajudar!', text: 'Sua opinião vai direto para quem constrói o portal.' },
  },
};

export const SURVEY_KEYS = Object.keys(SURVEYS) as SurveyKey[];

export function getSurvey(key: unknown): SurveyDefinition | null {
  return typeof key === 'string' && key in SURVEYS ? SURVEYS[key as SurveyKey] : null;
}

// ───────────────────────── validação / normalização ─────────────────────────

export interface NormalizedAnswers { outcome: Outcome; detail: string[]; improvement: string }

/** Valida o payload de respostas contra a definição. Só ids conhecidos; Q2 1..max; Q1 e Q3 1 cada. */
export function validateAnswers(def: SurveyDefinition, raw: unknown): { ok: true; answers: NormalizedAnswers } | { ok: false; error: string } {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const outcome = a.outcome;
  if (typeof outcome !== 'string' || !def.q1.options.some((o) => o.id === outcome)) return { ok: false, error: 'Responda a primeira pergunta.' };
  const detailRaw = Array.isArray(a.detail) ? a.detail : (typeof a.detail === 'string' ? [a.detail] : []);
  const detail = Array.from(new Set(detailRaw.filter((d): d is string => typeof d === 'string')));
  if (detail.length === 0) return { ok: false, error: 'Escolha pelo menos uma opção na segunda pergunta.' };
  if (detail.length > def.q2.max) return { ok: false, error: `Escolha no máximo ${def.q2.max} opções na segunda pergunta.` };
  if (!detail.every((d) => def.q2.options.some((o) => o.id === d))) return { ok: false, error: 'Opção inválida na segunda pergunta.' };
  const improvement = a.improvement;
  if (typeof improvement !== 'string' || !def.q3.options.some((o) => o.id === improvement)) return { ok: false, error: 'Responda a terceira pergunta.' };
  return { ok: true, answers: { outcome: outcome as Outcome, detail, improvement } };
}

/** Comentário: remove caracteres de controle (mantém quebra de linha), tags e espaços
 *  excessivos; corta no máximo da pesquisa. Vazio → null. */
export function sanitizeComment(raw: unknown, max = 600): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
    .trim();
  return cleaned.length ? cleaned : null;
}

/** Contexto técnico mínimo aceito (whitelist) — nunca conteúdo clínico. */
export function sanitizeContext(raw: unknown): Record<string, string | boolean> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};
  const str = (k: string, max: number) => { if (typeof r[k] === 'string' && (r[k] as string).trim()) out[k] = (r[k] as string).trim().slice(0, max); };
  str('trigger', 40);
  str('screen', 80);
  str('platform', 16);
  str('appVersion', 32);
  if (typeof r.hasExams === 'boolean') out.hasExams = r.hasExams;
  return Object.keys(out).length ? out : null;
}

/** Categoria DERIVADA (triagem automática, sem IA): técnica > preço > usabilidade > valor > feature > outro.
 *  É só o ponto de partida — o admin pode reclassificar; o relato original fica intacto. */
export function deriveCategory(a: NormalizedAnswers): FeedbackCategory {
  const has = (id: string) => a.detail.includes(id);
  if (has('slow_error')) return 'technical';
  if (has('credits') || a.improvement === 'credits_clarity' || a.improvement === 'payouts') return 'pricing';
  if (has('find_feature') || a.improvement === 'simplify') return 'usability';
  const valueSignals = has('ai_analysis') || has('shared_exams') || a.improvement === 'explain_results' || a.improvement === 'exam_reading';
  if ((a.outcome === 'not' || a.outcome === 'exploring') && valueSignals) return 'value';
  if (a.improvement !== 'nothing' && a.improvement !== 'other') return 'feature';
  if (a.outcome === 'exploring') return 'value';
  return 'other';
}

/** Rótulo humano de uma opção (admin) — tolera versões antigas (id desconhecido → o próprio id). */
export function optionLabel(def: SurveyDefinition | null, question: 'detail' | 'improvement' | 'outcome', id: string): string {
  if (!def) return id;
  const list: { id: string; label: string }[] = question === 'detail' ? def.q2.options : question === 'improvement' ? def.q3.options : def.q1.options;
  return list.find((o) => o.id === id)?.label ?? id;
}

// ───────────────────────── elegibilidade do CONVITE ─────────────────────────

export interface PromptStateLike {
  lastInvitedAt: Date | null;
  lastDismissedAt: Date | null;
  dismissCount: number;
  lastAnsweredVersion: number | null;
}

export interface FeedbackSettings { enabled: number | boolean; minAccountAgeDays: number; inviteIntervalDays: number; maxDismissals: number }

export type IneligibleReason = 'disabled' | 'too_new' | 'answered' | 'max_dismissals' | 'cooldown' | 'recently_invited';

const DAY = 86_400_000;

/** Regras do convite contextual (o acesso permanente no Perfil NÃO passa por aqui):
 *  feature ligada; conta com idade mínima (oportunidade real de uso); não respondeu esta
 *  versão; não estourou dispensas; respeita intervalo após dispensa; não foi convidado hoje. */
export function computeInviteEligibility(args: { settings: FeedbackSettings; accountCreatedAt: Date; state: PromptStateLike | null; currentVersion: number; now?: Date }): { eligible: true } | { eligible: false; reason: IneligibleReason } {
  const { settings, accountCreatedAt, state, currentVersion } = args;
  const now = args.now ?? new Date();
  if (!(settings.enabled === true || Number(settings.enabled) === 1)) return { eligible: false, reason: 'disabled' };
  if (state?.lastAnsweredVersion != null && state.lastAnsweredVersion >= currentVersion) return { eligible: false, reason: 'answered' };
  const minAge = Math.max(0, Number(settings.minAccountAgeDays) || 0);
  if (now.getTime() - accountCreatedAt.getTime() < minAge * DAY) return { eligible: false, reason: 'too_new' };
  const maxDismiss = Math.max(1, Number(settings.maxDismissals) || 3);
  if ((state?.dismissCount ?? 0) >= maxDismiss) return { eligible: false, reason: 'max_dismissals' };
  const interval = Math.max(0, Number(settings.inviteIntervalDays) || 0);
  if (state?.lastDismissedAt && now.getTime() - state.lastDismissedAt.getTime() < interval * DAY) return { eligible: false, reason: 'cooldown' };
  if (state?.lastInvitedAt && now.getTime() - state.lastInvitedAt.getTime() < DAY) return { eligible: false, reason: 'recently_invited' };
  return { eligible: true };
}
