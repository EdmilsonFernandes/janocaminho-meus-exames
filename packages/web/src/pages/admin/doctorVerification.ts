/**
 * Verificação de identidade do médico — lógica PURA do painel do dono (Plano 2 · W2).
 *
 * Sem React, sem rede, sem MUI: tudo aqui é testável em ambiente node
 * (doctorVerification.test.ts). O painel (DoctorVerificationPanel.tsx) só desenha.
 *
 * Contratos do servidor (admin.routes.ts):
 *  - GET  /admin/doctors/verification-queue → { review[], legacy[] }
 *  - POST /admin/doctors/:id/verification/approve {note?} → 200 | 409 INVALID_STATE {status}
 *  - POST /admin/doctors/:id/verification/reject  {reason} → 200 | 400 REASON_REQUIRED
 *  - POST /admin/doctors/verification/approve-legacy {ids} → { ok, approved }
 *  - PATCH /admin/config/costs {category:'doctorKyc', legacyGraceUntilMs} → 400 KYC_CONFIG_INVALID
 * `unchanged:true` (2º clique / outro admin) é SUCESSO — nunca vira erro.
 */

export type DecideIn = 'drexame' | 'uaiid';
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export interface ReviewDoctor {
  id: string;
  name: string;
  crm: string;
  crmUf: string | null;
  email: string;
  verificationStatus: string | null;
}
/** Uma tentativa de verificação que espera decisão humana (fila do dono ou painel do UaiID). */
export interface ReviewItem {
  id: string;
  providerId: string;
  crm: string;
  status: string;
  reasonCode: string | null;
  decision: string | null;
  documentName: string | null;
  cfmName: string | null;
  nameRatio: number | null;
  score: number | null;
  createdAt: string;
  doctor: ReviewDoctor;
  priorAttempts: number;
  decideIn: DecideIn;
}
export interface LegacyItem {
  id: string;
  name: string;
  crm: string;
  crmUf: string | null;
  email: string;
  createdAt: string;
}
export interface VerificationQueue {
  review: ReviewItem[];
  legacy: LegacyItem[];
}

// ── textos fixos (plano W2 / R4) ─────────────────────────────────────────────
/** R4: o motivo digitado pelo dono VAI por e-mail ao médico — o campo avisa antes de enviar. */
export const REJECT_EMAIL_NOTICE = 'Este motivo será enviado por e-mail ao médico.';
export const UAIID_DECIDE_NOTICE = 'Decida no painel do UaiID — o resultado volta sozinho.';
/** Atalhos de motivo (preenchem o campo; o dono pode editar antes de enviar). */
export const REJECT_SHORTCUTS: readonly string[] = [
  'Documento ilegível',
  'Nome do documento não confere com o CRM',
  'CRM inativo no CFM',
  'Suspeita de documento de terceiros',
];
/** O servidor corta motivo e nota em 500 caracteres (admin.routes.ts). */
export const REASON_MAX = 500;

// ── helpers genéricos ────────────────────────────────────────────────────────
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const pad = (n: number) => String(n).padStart(2, '0');

export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Inicial do nome próprio (pula "Dr."/"Dra."); "?" quando não há nome. */
export const initialOf = (name: string): string => {
  const w = String(name ?? '').trim().split(/\s+/).find((x) => x && !/^dr[a]?\.?$/i.test(x));
  return w ? w.charAt(0).toUpperCase() : '?';
};

/** "CRM 123456-SP" — não duplica a UF quando o CRM já vem como "numero-UF". */
export const crmLabel = (crm: string, uf?: string | null): string => {
  const c = String(crm ?? '').trim();
  const u = String(uf ?? '').trim().toUpperCase();
  return `CRM ${c}${u && !c.includes('-') ? `-${u}` : ''}`.trim();
};

// ── status do médico → chip "Identidade: …" ──────────────────────────────────
const CHIPS: Record<string, { label: string; tone: Tone }> = {
  approved: { label: 'Identidade: verificada', tone: 'ok' },
  needs_admin: { label: 'Identidade: aguardando você', tone: 'warn' },
  uaiid_review: { label: 'Identidade: no UaiID', tone: 'info' },
  in_progress: { label: 'Identidade: em andamento', tone: 'info' },
  pending: { label: 'Identidade: pendente', tone: 'neutral' },
  rejected: { label: 'Identidade: recusada', tone: 'bad' },
  legacy: { label: 'Identidade: não verificada (antigo)', tone: 'neutral' },
};

/** Chip da lista de médicos. `null` = esconder (campo ausente em server antigo ou status novo).
 *  Sempre prefixado com "Identidade" — o filtro "✓ Verificados" da aba é de E-MAIL. */
export function identityChip(status: unknown): { label: string; tone: Tone } | null {
  return typeof status === 'string' && has(CHIPS, status) ? { ...CHIPS[status] } : null;
}

const STATUS_WORDS: Record<string, string> = {
  pending: 'pendente',
  in_progress: 'em andamento',
  uaiid_review: 'no painel do UaiID',
  needs_admin: 'aguardando você',
  approved: 'aprovado',
  rejected: 'recusado',
  legacy: 'antigo',
};
/** Situação do médico em palavras (mensagens de erro). */
export const statusLabel = (status: string | null | undefined): string =>
  typeof status === 'string' && has(STATUS_WORDS, status) ? STATUS_WORDS[status] : 'desconhecida';

// ── fila ─────────────────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Normaliza a resposta da fila. Defensivo de propósito: o fetch offline-first devolve
 *  `{items:[],data:[],total:0}` quando a rede cai — isso vira fila vazia, nunca exceção. */
export function parseQueue(raw: unknown): VerificationQueue {
  const root = isObj(raw) ? raw : {};
  const review: ReviewItem[] = [];
  for (const r of Array.isArray(root.review) ? root.review : []) {
    if (!isObj(r) || !isObj(r.doctor) || !str(r.id) || !str(r.doctor.id)) continue;
    const decision = strOrNull(r.decision);
    const decideIn: DecideIn =
      r.decideIn === 'uaiid' || r.decideIn === 'drexame' ? r.decideIn : decision === 'uaiid_review' ? 'uaiid' : 'drexame';
    review.push({
      id: str(r.id),
      providerId: str(r.providerId),
      crm: str(r.crm),
      status: str(r.status),
      reasonCode: strOrNull(r.reasonCode),
      decision,
      documentName: strOrNull(r.documentName),
      cfmName: strOrNull(r.cfmName),
      nameRatio: numOrNull(r.nameRatio),
      score: numOrNull(r.score),
      createdAt: str(r.createdAt),
      doctor: {
        id: str(r.doctor.id),
        name: str(r.doctor.name),
        crm: str(r.doctor.crm),
        crmUf: strOrNull(r.doctor.crmUf),
        email: str(r.doctor.email),
        verificationStatus: strOrNull(r.doctor.verificationStatus),
      },
      priorAttempts: Math.max(0, Math.floor(Number(r.priorAttempts) || 0)),
      decideIn,
    });
  }
  const legacy: LegacyItem[] = [];
  for (const l of Array.isArray(root.legacy) ? root.legacy : []) {
    if (!isObj(l) || !str(l.id)) continue;
    legacy.push({
      id: str(l.id),
      name: str(l.name),
      crm: str(l.crm),
      crmUf: strOrNull(l.crmUf),
      email: str(l.email),
      createdAt: str(l.createdAt),
    });
  }
  return { review, legacy };
}

/** "Aguardando você" primeiro; dentro de cada grupo vale a ordem do servidor (mais novos antes). */
export function sortReview(items: ReviewItem[]): ReviewItem[] {
  return [...items.filter((i) => i.decideIn === 'drexame'), ...items.filter((i) => i.decideIn !== 'drexame')];
}

export function queueCounts(q: VerificationQueue): { waiting: number; inUaiid: number; legacy: number } {
  return {
    waiting: q.review.filter((i) => i.decideIn === 'drexame').length,
    inUaiid: q.review.filter((i) => i.decideIn === 'uaiid').length,
    legacy: q.legacy.length,
  };
}

// ── por que o caso está na fila ──────────────────────────────────────────────
const REASONS: Record<string, { text: string; tone: Tone }> = {
  manual_policy: { tone: 'ok', text: 'Tudo conferiu — falta só a sua aprovação.' },
  name_mismatch: { tone: 'warn', text: 'O nome do documento é diferente do nome no CFM. Confira antes de decidir.' },
  data_mismatch_name: { tone: 'warn', text: 'O nome do documento é diferente do nome informado. Confira antes de decidir.' },
  data_mismatch_cpf: { tone: 'warn', text: 'O CPF do documento é diferente do CPF do cadastro.' },
  document_name_unavailable: { tone: 'warn', text: 'Não recebemos o nome do documento. Confira a identidade no painel do UaiID.' },
  cfm_unavailable: { tone: 'warn', text: 'Não foi possível consultar o CFM na hora. Confira o CRM manualmente.' },
  cfm_situation_unknown: { tone: 'warn', text: 'A situação do CRM no CFM não ficou clara. Confira manualmente.' },
  face_mismatch_review: { tone: 'info', text: 'O UaiID pediu revisão: o rosto não bateu com certeza.' },
  face_mismatch: { tone: 'warn', text: 'O rosto não bateu com a foto do documento.' },
  liveness_fail: { tone: 'warn', text: 'A prova de vida não foi confirmada.' },
  challenge_failed: { tone: 'warn', text: 'O desafio de movimento não foi concluído.' },
  document_expired: { tone: 'warn', text: 'Documento vencido ou emitido há muito tempo.' },
  document_not_recognized: { tone: 'warn', text: 'O UaiID não reconheceu o documento.' },
  crm_inactive: { tone: 'bad', text: 'O CRM consta como inativo no CFM.' },
  fraud_confirmed: { tone: 'bad', text: 'O UaiID confirmou indício de fraude.' },
};

/** Texto + tom da faixa "por que está aqui". Código desconhecido mostra o código junto,
 *  para o dono/dev conseguir identificar o caso. */
export function reviewReason(reasonCode: string | null | undefined, decideIn: DecideIn): { text: string; tone: Tone } {
  if (reasonCode && has(REASONS, reasonCode)) return { ...REASONS[reasonCode] };
  const base: { text: string; tone: Tone } =
    decideIn === 'uaiid'
      ? { tone: 'info', text: 'O UaiID pediu uma revisão manual.' }
      : { tone: 'warn', text: 'Precisa da sua conferência.' };
  return reasonCode ? { ...base, text: `${base.text} (${reasonCode})` } : base;
}

// ── nome no documento × nome no CFM ──────────────────────────────────────────
const PARTICLES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);

const normKey = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Nome canônico p/ comparação ESTRITA — idêntico ao `strictName` do servidor (kyc/decide.ts):
 *  sem pontuação, maiúsculas, sem acento, sem partículas (DE, DA, DO, DAS, DOS, E). */
export function strictName(s: string | null | undefined): string {
  return normKey(String(s ?? '').normalize('NFC').replace(/[^\p{L}\s]/gu, ' '))
    .split(' ')
    .filter((w) => w && !PARTICLES.has(w))
    .join(' ');
}

export interface NameWord {
  text: string;
  diff: boolean;
}
export interface NameComparison {
  /** match = o servidor consideraria iguais · differ = divergem · unknown = falta um dos nomes */
  status: 'match' | 'differ' | 'unknown';
  doc: NameWord[];
  cfm: NameWord[];
  /** divergem só na ORDEM das palavras (nenhuma palavra destacada) */
  orderOnly: boolean;
}

const wordsOf = (s: string | null | undefined): string[] => String(s ?? '').trim().split(/\s+/).filter(Boolean);
const keysOf = (word: string): string[] => strictName(word).split(' ').filter(Boolean);
const countOf = (keys: string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

/** Marca as palavras que NÃO existem no outro nome (multiconjunto; partículas nunca são marcadas,
 *  como no servidor). O texto original (acento/pontuação) é preservado para exibição. */
function flagWords(words: string[], otherKeys: string[]): NameWord[] {
  const pool = countOf(otherKeys);
  return words.map((text) => {
    let diff = false;
    for (const k of keysOf(text)) {
      const left = pool.get(k) ?? 0;
      if (left > 0) pool.set(k, left - 1);
      else diff = true;
    }
    return { text, diff };
  });
}

export function compareNames(documentName: string | null | undefined, cfmName: string | null | undefined): NameComparison {
  const dw = wordsOf(documentName);
  const cw = wordsOf(cfmName);
  if (!dw.length || !cw.length) {
    return {
      status: 'unknown',
      doc: dw.map((text) => ({ text, diff: false })),
      cfm: cw.map((text) => ({ text, diff: false })),
      orderOnly: false,
    };
  }
  const sd = strictName(documentName);
  if (sd !== '' && sd === strictName(cfmName)) {
    return {
      status: 'match',
      doc: dw.map((text) => ({ text, diff: false })),
      cfm: cw.map((text) => ({ text, diff: false })),
      orderOnly: false,
    };
  }
  const dKeys = dw.flatMap(keysOf);
  const cKeys = cw.flatMap(keysOf);
  const doc = flagWords(dw, cKeys);
  const cfm = flagWords(cw, dKeys);
  const anyDiff = doc.some((w) => w.diff) || cfm.some((w) => w.diff);
  const orderOnly = !anyDiff && dKeys.length > 0 && [...dKeys].sort().join(' ') === [...cKeys].sort().join(' ');
  return { status: 'differ', doc, cfm, orderOnly };
}

// ── números e rótulos ────────────────────────────────────────────────────────
/** `nameRatio` do UaiID (0–1) → "88%". Valor > 1 já é percentual. */
export function formatRatio(v: number | null | undefined): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  const pct = v <= 1 ? v * 100 : v;
  return `${Math.round(Math.min(pct, 100))}%`;
}
export function formatScore(v: number | null | undefined): string | null {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : null;
}
/** Sinal de risco: o mesmo CRM já tentou antes (inclusive contas excluídas). */
export function priorAttemptsLabel(n: number): string | null {
  if (!Number.isFinite(n) || n < 1) return null;
  return n === 1 ? '1 tentativa anterior neste CRM' : `${n} tentativas anteriores neste CRM`;
}

// ── datas ────────────────────────────────────────────────────────────────────
/** DD/MM/AAAA HH:mm no fuso local; ISO inválida → "". */
export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function formatDateBR(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export type GraceResult = { ok: true; ms: number } | { ok: false; error: string };

/** <input type="date"> (YYYY-MM-DD) → `legacyGraceUntilMs`. Vazio = 0 (sem prazo). A data vale
 *  até o FIM do dia local (23:59:59.999) — o médico antigo atende até a data inclusive.
 *  Regra do servidor: 0 ou inteiro futuro < 2100-01-01. */
export function graceInputToMs(value: string, now: number = Date.now()): GraceResult {
  const v = String(value ?? '').trim();
  if (!v) return { ok: true, ms: 0 };
  const invalid: GraceResult = { ok: false, error: 'Data inválida. Use o seletor de data.' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return invalid;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  if (end.getFullYear() !== y || end.getMonth() !== mo - 1 || end.getDate() !== d) return invalid;
  if (y >= 2100) return { ok: false, error: 'Data muito distante. Escolha um prazo até 2099.' };
  if (end.getTime() <= now) return { ok: false, error: 'Escolha uma data futura.' };
  return { ok: true, ms: end.getTime() };
}

/** ms → valor do <input type="date"> (YYYY-MM-DD local); 0/nulo → "". */
export function msToDateInput(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** "até 15/11/2026" ou "sem prazo". */
export const graceLabel = (ms: number | null | undefined): string =>
  typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? `até ${formatDateBR(ms)}` : 'sem prazo';

// ── motivo da recusa ─────────────────────────────────────────────────────────
export const reasonOk = (text: string): boolean => String(text ?? '').trim().length > 0;

/** Atalho de motivo: preenche o campo vazio; com texto, acrescenta como nova frase (sem duplicar). */
export function applyShortcut(current: string, shortcut: string): string {
  const cur = String(current ?? '').trim();
  if (!cur) return shortcut.slice(0, REASON_MAX);
  if (cur.toLowerCase().includes(shortcut.toLowerCase())) return current;
  const sep = /[.!?]$/.test(cur) ? ' ' : '. ';
  return `${cur}${sep}${shortcut}`.slice(0, REASON_MAX);
}

// ── mensagens ────────────────────────────────────────────────────────────────
/** Erro do servidor → português para o painel. Nunca mostra o código técnico. */
export function kycErrorMessage(
  code: string | null | undefined,
  ctx: { status?: string | null; httpStatus?: number } = {},
): string {
  switch (code) {
    case 'INVALID_STATE':
      return ctx.status === 'uaiid_review'
        ? 'Este caso foi para o painel do UaiID — a decisão é lá. Atualizamos a lista.'
        : `Este médico não está mais aguardando a sua decisão (situação atual: ${statusLabel(ctx.status)}). Atualizamos a lista.`;
    case 'REASON_REQUIRED':
      return 'Escreva o motivo da recusa. Ele é enviado por e-mail ao médico.';
    case 'KYC_CONFIG_INVALID':
      return 'Prazo inválido. Escolha uma data futura ou deixe sem prazo.';
    case 'IDS_REQUIRED':
      return 'Selecione ao menos um médico.';
    case 'NOT_FOUND':
      return 'Médico não encontrado. Atualizamos a lista.';
    case 'NETWORK':
      return 'Sem conexão. Tente novamente.';
    default:
      if (ctx.httpStatus === 401) return 'Sua sessão expirou. Entre novamente.';
      if (ctx.httpStatus === 403) return 'Você não tem permissão para esta ação.';
      return 'Não foi possível concluir. Tente novamente.';
  }
}

/**
 * Aviso depois do "Aprovar selecionados" (o servidor só mexe em quem ainda é `legacy`). `skipped` = os legados que o
 * servidor deixou DE FORA por terem verificação em andamento ou recusada (alerta na fila): o dono decide um a um.
 */
export function legacyApprovedNotice(approved: number, requested: number, skipped = 0): string {
  if (approved <= 0 && skipped <= 0) return 'Nenhum médico foi alterado — a situação deles já tinha mudado. Atualizamos a lista.';
  const parts: string[] = [];
  if (approved > 0) parts.push(`${approved} ${plural(approved, 'médico antigo aprovado', 'médicos antigos aprovados')}.`);
  if (skipped > 0) {
    parts.push(`${skipped} ${plural(skipped, 'ficou', 'ficaram')} de fora: ${plural(skipped, 'tem', 'têm')} verificação em andamento ou recusada — decida ${plural(skipped, 'esse', 'esses')} um a um na fila acima.`);
  }
  const rest = requested - approved - skipped;
  if (rest > 0) parts.push(`${rest} ${plural(rest, 'já tinha', 'já tinham')} mudado de situação.`);
  return parts.join(' ');
}
