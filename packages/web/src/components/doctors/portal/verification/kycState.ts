/**
 * Verificação de identidade do médico (KYC UaiID) — estado PURO da jornada do portal.
 *
 * Tudo que decide "qual tela" mora aqui, sem React nem rede (testável em ambiente node):
 *  - `resolveKycView`: a matriz de estados do plano (docs/design/2026-10-29-verificacao-medico-plano-web.md);
 *  - `normalizeVerification` / `classifyStartResponse`: leitura tolerante do contrato do servidor;
 *  - `hasKycParam`: a volta do UaiID (`#/doctor?kyc=1&…`) — SÓ o `kyc=1` conta;
 *  - a copy (pt-BR, tom acolhedor e direto, sem promessa de prazo) numa fonte única.
 *
 * SEGURANÇA: o `status`, o `verification_id` e o `external_reference` que o UaiID anexa à URL de
 * retorno são texto controlável pelo usuário. Nada daqui lê, exibe, registra ou decide por eles —
 * a verdade é sempre o `GET /api/doctor/verification`.
 */

import { isValidCpf, normalizeCpf } from '../../../../utils/cpf';

/** `Doctor.verificationStatus` no servidor. */
export type KycStatus = 'pending' | 'in_progress' | 'uaiid_review' | 'needs_admin' | 'approved' | 'rejected' | 'legacy';

const KNOWN_STATUSES: readonly string[] = ['pending', 'in_progress', 'uaiid_review', 'needs_admin', 'approved', 'rejected', 'legacy'];

/** Tentativa mais recente (`attempt` do GET). `captureIssue` entra com o servidor da S1 — ausente = false. */
export interface KycAttempt {
  /** created|consent_pending|collecting|processing|challenge|manual_review|approved|rejected|expired|cancelled */
  status: string;
  reasonCode: string | null;
  message: string | null;
  expiresAt: string | null;
  captureIssue: boolean;
}

export interface KycSnapshot {
  status: KycStatus;
  attempt: KycAttempt | null;
  /** Só vem para `legacy` com prazo configurado; ausente = null (sem prazo). */
  legacyGraceUntilMs: number | null;
}

/** Tempos do plano. O poll só roda no "Conferindo" (teto 90 s); o "Em análise" relê a cada 30 s. */
export const KYC_TIMING = { checkPollMs: 4000, checkMaxMs: 90_000, reviewRefreshMs: 30_000 } as const;

/** Cadência das linhas do "Conferindo" (a última — "Quase lá" — fica). */
export const CHECKING_LINE_MS = 4500;

/* ── copy (pt-BR) ────────────────────────────────────────────────────────────────── */

const SUPPORT = 'contato@janocaminho.com.br';

export const KYC_COPY = {
  supportEmail: SUPPORT,
  supportMailto: `mailto:${SUPPORT}`,
  common: { logout: 'Sair', support: 'Falar com o suporte', brand: 'Dr. Exame', portal: 'Portal do Médico' },
  loading: 'Carregando…',
  loadError: { title: 'Não foi possível carregar', body: 'Sem conexão. Tente novamente.', retry: 'Tentar de novo' },
  intro: {
    chip: 'Passo 2 de 3 · Verificação de identidade',
    chipExpired: 'Verificação de identidade',
    title: 'Vamos validar sua identidade',
    lead: 'Queremos te conhecer melhor. Antes de atender pacientes, confirmamos quem você é — é isso que mantém o Dr. Exame seguro para todo mundo, inclusive para você.',
    needsTitle: 'O que você vai precisar',
    needs: [
      { key: 'doc', title: 'Um documento com foto', body: 'RG, CNH ou RNE, original e sem reflexo' },
      { key: 'selfie', title: 'Uma selfie', body: 'câmera do celular ou do computador, em local bem iluminado' },
      { key: 'time', title: 'Cerca de 2 minutos', body: 'pode parar e continuar depois' },
    ],
    privacyTitle: 'Seus dados, protegidos',
    privacyBody: 'A verificação é feita pelo UaiID, nosso parceiro especializado. As imagens ficam apenas com ele: o Dr. Exame guarda só o resultado. Tratamos tudo conforme a LGPD.',
    cta: 'Validar minha identidade',
    phonePrompt: 'Prefere no celular?',
    copyLink: 'Copiar link',
  },
  copied: {
    ok: 'Link copiado! Abra no celular e conclua a verificação. Depois, volte aqui.',
    manual: 'Não deu para copiar sozinho. Toque e segure o link abaixo para copiar.',
    fieldLabel: 'Link da verificação',
  },
  continue: {
    title: 'Falta pouco para terminar',
    lead: 'Você começou a verificação mas não chegou ao fim. Continue de onde parou.',
    cta: 'Continuar verificação',
  },
  checking: {
    title: 'Conferindo seus dados…',
    lead: 'Recebemos suas imagens. Leva só alguns instantes — pode deixar esta tela aberta.',
    lines: ['Comparando seu rosto com o documento', 'Conferindo seu CRM no CFM', 'Quase lá'],
    slow: 'Está demorando mais que o normal. Pode fechar esta tela — avisamos por e-mail assim que houver novidade.',
    refresh: 'Atualizar',
    notFinished: 'Ainda não terminou?',
    resume: 'Continuar verificação',
  },
  review: {
    chip: 'EM ANÁLISE',
    title: 'Recebemos! Seu cadastro está em análise',
    lead: 'Sua identidade foi enviada. Agora nossa equipe confere seus dados e o seu CRM no CFM.',
    trailLabel: 'Etapas do seu cadastro',
    steps: [
      { key: 'signup', title: 'Cadastro no portal', body: 'Conta criada e e-mail confirmado' },
      { key: 'identity', title: 'Verificação de identidade', body: 'Documento e selfie enviados' },
      { key: 'review', title: 'Análise da equipe', body: 'Conferindo seus dados e o seu CRM no CFM' },
      { key: 'live', title: 'Atendimento liberado', body: 'Você passa a receber pacientes pelo Dr. Exame' },
    ],
    reviewBody: (crm: string | null) => (crm ? `Conferindo seus dados e o CRM ${crm}` : 'Conferindo seus dados e o seu CRM no CFM'),
    stateDone: 'concluída',
    stateNow: 'em andamento',
    stateNext: 'pendente',
    note: 'Você recebe um e-mail assim que terminarmos. Não precisa fazer mais nada.',
    refresh: 'Atualizar status',
  },
  rejected: {
    chip: 'NÃO APROVADO',
    title: 'Não conseguimos aprovar sua verificação',
    reasonLabel: 'Motivo',
    reasonFallback: 'Não foi possível confirmar sua identidade.',
    adminNote: 'Enviamos os detalhes para o seu e-mail.',
    howTitle: 'Como resolver',
    tips: [
      'Use um documento original (RG, CNH ou RNE), sem reflexo.',
      'Faça a selfie em local bem iluminado, sem óculos ou boné.',
      'Confira se o nome do documento é o mesmo do seu registro no CFM.',
    ],
    nextTitle: 'E agora?',
    nextBefore: 'Leia o motivo acima. Se foi engano, escreva para ',
    nextAfter: ' — respondemos rápido. Quando estiver tudo certo, tente de novo.',
    cta: 'Tentar de novo',
  },
  blocked: {
    title: 'Conta suspensa',
    body: 'Seu acesso está temporariamente suspenso pela administração.',
    contact: 'Para entender o motivo ou pedir revisão, fale com o suporte:',
  },
  approved: {
    title: 'Conta aprovada',
    emoji: '🎉',
    body: 'Sua identidade foi verificada. Você já pode atender.',
    cta: 'Ir para o portal',
  },
  banner: {
    title: 'Verifique sua identidade',
    until: (date: string) => ` até ${date}`,
    body: 'Para continuar atendendo, confirme quem você é — leva 2 minutos.',
    cta: 'Verificar agora',
    dismiss: 'Dispensar aviso',
    reviewTitle: 'Recebemos sua verificação',
    reviewBody: 'Estamos conferindo seus dados. Avisamos por e-mail assim que terminarmos.',
  },
  errors: {
    unavailable: 'A verificação está indisponível no momento. Tente em alguns minutos.',
    cpfRequired: 'Precisamos do seu CPF para verificar.',
    network: 'Sem conexão. Tente novamente.',
    generic: 'Não foi possível iniciar a verificação agora. Tente novamente em instantes.',
    limitWait: (hours: number) => `Você atingiu o limite de tentativas. Tente de novo em cerca de ${hours} h.`,
    limitSupport: 'Você atingiu o limite de tentativas de verificação. Fale com o suporte para liberar uma nova tentativa.',
    inReview: 'Sua verificação já está em análise. Atualizamos o status para você.',
    alreadyApproved: 'Sua identidade já foi verificada. Atualizamos o status para você.',
  },
  /** Médico que entrou pelo convite não tem CPF no cadastro: o servidor aceita `{ cpf }` no POST (só dígitos). */
  cpf: {
    label: 'Seu CPF',
    placeholder: '000.000.000-00',
    helper: 'Usamos o CPF só para confirmar sua identidade com o documento',
    short: 'Informe os 11 números do seu CPF.',
    invalid: 'CPF inválido. Confira os números e tente de novo.',
    inUse: 'Este CPF já está cadastrado em outra conta. Fale com o suporte.',
  },
} as const;

/* ── leitura do contrato ─────────────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * GET /api/doctor/verification → snapshot, ou null se o corpo NÃO é do contrato.
 * (O fetch offline do app devolve `{items:[],data:[],total:0}` com status 200 — isso não é um estado.)
 */
export function normalizeVerification(raw: unknown): KycSnapshot | null {
  if (!isObj(raw) || typeof raw.status !== 'string') return null;
  const status: KycStatus = KNOWN_STATUSES.includes(raw.status) ? (raw.status as KycStatus) : 'pending';
  let attempt: KycAttempt | null = null;
  if (isObj(raw.attempt) && typeof raw.attempt.status === 'string') {
    attempt = {
      status: raw.attempt.status,
      reasonCode: str(raw.attempt.reasonCode),
      message: str(raw.attempt.message),
      expiresAt: str(raw.attempt.expiresAt),
      captureIssue: raw.attempt.captureIssue === true,
    };
  }
  const grace = raw.legacyGraceUntilMs;
  return { status, attempt, legacyGraceUntilMs: typeof grace === 'number' && Number.isFinite(grace) && grace > 0 ? grace : null };
}

/** Quem está sendo verificado (GET /api/doctor/me) — só para personalizar; falha = sem pill. */
export interface KycDoctorInfo {
  name: string | null;
  crm: string | null;
  /**
   * O cadastro já tem CPF? true/false só quando o /me deixa claro (`cpfMasked` preenchido = tem; `hasCpf:false` sem máscara = não tem);
   * null = não dá para saber — nesse caso o campo de CPF só aparece depois do 400 CPF_REQUIRED.
   */
  cpfOnFile: boolean | null;
}

export function normalizeDoctorInfo(raw: unknown): KycDoctorInfo | null {
  const d = isObj(raw) && isObj(raw.doctor) ? raw.doctor : null;
  if (!d) return null;
  const name = str(d.name);
  const crm = formatCrm(str(d.crm), str(d.crmUf));
  const cpfOnFile = str(d.cpfMasked) ? true : d.hasCpf === true ? true : d.hasCpf === false ? false : null;
  return name || crm ? { name, crm, cpfOnFile } : null;
}

/** O que falta no CPF digitado: menos de 11 números ('short') ou dígitos verificadores errados ('invalid'). */
export function cpfProblem(value: string): 'short' | 'invalid' | null {
  const digits = normalizeCpf(value);
  if (digits.length < 11) return 'short';
  return isValidCpf(digits) ? null : 'invalid';
}

/** "116739-SP" (chave numero-UF); completa com a UF quando só veio o número. */
export function formatCrm(crm?: string | null, uf?: string | null): string | null {
  const c = (crm ?? '').trim();
  if (!c) return null;
  if (/-[A-Za-z]{2}$/.test(c)) return c.slice(0, -2) + c.slice(-2).toUpperCase();
  const u = (uf ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(u) ? `${c}-${u}` : c;
}

/** Iniciais do 1º e do último nome, sem o título ("Dra. Maria da Silva Souza" → "MS"). */
export function initials(name?: string | null): string {
  const parts = (name ?? '').replace(/^\s*(dr|dra|doutor|doutora)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

/** DD/MM/AAAA no fuso do aparelho (o prazo do legado é uma data de calendário para o médico). */
export function formatGraceDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/* ── tentativa e estado ──────────────────────────────────────────────────────────── */

/**
 * Em que ponto a tentativa está, do ponto de vista do médico:
 *  pre       — ainda precisa agir no UaiID (created|consent_pending|collecting|challenge)
 *  submitted — já enviou as imagens, o UaiID está processando (processing)
 *  review    — revisão humana do UaiID (manual_review)
 *  approved  — o UaiID aprovou a identidade; falta a nossa conferência / o OK do dono
 *  rejected  — recusada
 *  dead      — expirada, cancelada ou status que não conhecemos
 */
export type AttemptPhase = 'none' | 'pre' | 'submitted' | 'review' | 'approved' | 'rejected' | 'dead';

export function attemptPhase(attempt: KycAttempt | null): AttemptPhase {
  if (!attempt) return 'none';
  switch (attempt.status) {
    case 'created': case 'consent_pending': case 'collecting': case 'challenge': return 'pre';
    case 'processing': return 'submitted';
    case 'manual_review': return 'review';
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    default: return 'dead';
  }
}

/** Legado com prazo configurado e já vencido — o servidor responde 403 nas rotas de atendimento (now < prazo). */
export function isLegacyExpired(s: KycSnapshot, now: number): boolean {
  return s.status === 'legacy' && s.legacyGraceUntilMs !== null && s.legacyGraceUntilMs <= now;
}

/** Pode usar o portal agora (mesma regra do servidor): approved, ou legacy dentro do prazo (ausente = sem prazo). */
export function isPracticing(s: KycSnapshot, now: number): boolean {
  return s.status === 'approved' || (s.status === 'legacy' && !isLegacyExpired(s, now));
}

/* ── a matriz de estados ─────────────────────────────────────────────────────────── */

export type KycScreen = 'loading' | 'error' | 'blocked' | 'dashboard' | 'approved' | 'intro' | 'continue' | 'checking' | 'review' | 'rejected';
export type LegacyBannerKind = 'verify' | 'review';
export interface KycView { screen: KycScreen; banner: LegacyBannerKind | null }

export interface KycViewInput {
  /** Última leitura válida do servidor; null = ainda não carregou. */
  snapshot: KycSnapshot | null;
  /** O 1º GET falhou (rede/5xx). Com leitura em mãos, uma falha de refresh não derruba a tela. */
  loadFailed?: boolean;
  /** 403 DOCTOR_BLOCKED. */
  blocked?: { reason: string | null } | null;
  /** `#/doctor?kyc=1` — volta do UaiID. O ÚNICO sinal que lemos da URL. */
  kycFlag?: boolean;
  /** O app voltou ao primeiro plano depois de abrirmos o UaiID nesta sessão. */
  returned?: boolean;
  /** Já vimos o médico SEM acesso nesta sessão — habilita "Conta aprovada" uma vez. */
  sawUnapproved?: boolean;
  /** O médico já confirmou "Ir para o portal". */
  celebrated?: boolean;
  /** epoch ms; injetável nos testes. */
  now?: number;
}

const V = (screen: KycScreen, banner: LegacyBannerKind | null = null): KycView => ({ screen, banner });

/**
 * Qual tela mostrar. Ordem de precedência: suspensa → sem leitura → approved → legacy → resto.
 * `?kyc=1`/"voltou ao primeiro plano" só valem enquanto o servidor ainda não decidiu (in_progress);
 * needs_admin/uaiid_review/rejected/approved são verdades do servidor e vencem o gatilho.
 */
export function resolveKycView(i: KycViewInput): KycView {
  if (i.blocked) return V('blocked');
  const s = i.snapshot;
  if (!s) return V(i.loadFailed ? 'error' : 'loading');
  const now = i.now ?? Date.now();

  if (s.status === 'approved') return V(i.sawUnapproved && !i.celebrated ? 'approved' : 'dashboard');

  const phase = attemptPhase(s.attempt);
  const back = !!(i.kycFlag || i.returned);

  if (s.status === 'legacy') {
    if (!isLegacyExpired(s, now)) {
      // No prazo: segue atendendo. Quem já enviou os dados não é cobrado de novo.
      const sent = phase === 'submitted' || phase === 'review' || phase === 'approved';
      return V('dashboard', sent ? 'review' : 'verify');
    }
    // Prazo vencido: não atende mais → vira jornada, guiada pela tentativa.
    switch (phase) {
      case 'pre': return V(back ? 'checking' : 'continue');
      case 'submitted': return V('checking');
      case 'review': case 'approved': return V('review');
      case 'rejected': return V('rejected');
      default: return V('intro');
    }
  }

  switch (s.status) {
    case 'needs_admin': case 'uaiid_review': return V('review');
    case 'rejected': return V(s.attempt ? 'rejected' : 'intro');
    case 'in_progress':
      switch (phase) {
        case 'pre': return V(back ? 'checking' : 'continue');
        case 'submitted': case 'approved': return V('checking'); // a parte do médico acabou: só falta a conferência
        case 'review': return V('review');
        default: return V('intro');
      }
    default: return V('intro'); // pending
  }
}

/* ── volta do UaiID ──────────────────────────────────────────────────────────────── */

const KYC_PARAM = /[?&]kyc=1(?=$|[&#])/;

/**
 * A URL de retorno é `#/doctor?kyc=1&status=…&verification_id=…&external_reference=…`.
 * Devolve SÓ um booleano: o resto da query (status, ids) é descartado de propósito.
 */
export function hasKycParam(hash: string, search = ''): boolean {
  return KYC_PARAM.test(hash || '') || KYC_PARAM.test(search || '');
}

/* ── POST /api/doctor/verification ───────────────────────────────────────────────── */

/** Só abrimos URL http(s): nunca navegar para javascript:/data: se a resposta vier adulterada. */
export function safeVerifyUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const t = u.trim();
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : null;
}

export type KycStartErrorCode =
  | 'KYC_UNAVAILABLE' | 'CPF_REQUIRED' | 'CPF_INVALID' | 'CPF_IN_USE' | 'KYC_ATTEMPT_LIMIT' | 'IN_REVIEW' | 'ALREADY_APPROVED' | 'NETWORK' | 'UNKNOWN';

export interface KycStartError {
  code: KycStartErrorCode;
  message: string;
  /** 429 com espera (após recusa recente): horas até poder tentar; null = sem previsão. */
  retryAfterHours: number | null;
  /** Só o suporte resolve → mostrar o botão "Falar com o suporte". */
  supportOnly: boolean;
  /** O CTA fica desabilitado (limite de tentativas). */
  blocksStart: boolean;
  /** Mostrar (ou manter) o campo de CPF — o erro é daquele campo. */
  needsCpf: boolean;
}

/** O que o `start()` devolve à tela: abriu o UaiID, copiou o link, falhou (erro na tela) ou o estado mudou (releitura/saída). */
export type StartResult = 'opened' | 'copied' | 'failed' | 'handled';

export type StartOutcome =
  | { kind: 'ok'; verifyUrl: string }
  /** 409 ALREADY_APPROVED / IN_REVIEW: reler o estado; `notice` aparece só se a tela não mudar. */
  | { kind: 'refresh'; notice: KycStartError }
  | { kind: 'blocked'; reason: string | null }
  | { kind: 'logout' }
  | { kind: 'error'; error: KycStartError };

/** Conta suspensa (403 DOCTOR_BLOCKED) — vale para o GET e para o POST. */
export function parseBlocked(status: number, body: unknown): { reason: string | null } | null {
  if (status !== 403 || !isObj(body)) return null;
  return body.code === 'DOCTOR_BLOCKED' || body.blocked === true ? { reason: str(body.reason) } : null;
}

/** O motivo do bloqueio só aparece se for uma frase (códigos internos como `kyc_fraud` não vão para a tela). */
export function humanBlockedReason(reason: string | null | undefined): string | null {
  const r = (reason ?? '').trim();
  return r && /\s/.test(r) && r.length <= 240 ? r : null;
}

const mk = (code: KycStartErrorCode, message: string, o: Partial<Omit<KycStartError, 'code' | 'message'>> = {}): KycStartError =>
  ({ code, message, retryAfterHours: null, supportOnly: false, blocksStart: false, needsCpf: false, ...o });
const err = (code: KycStartErrorCode, message: string, o: Partial<Omit<KycStartError, 'code' | 'message'>> = {}): StartOutcome =>
  ({ kind: 'error', error: mk(code, message, o) });

export function classifyStartResponse(status: number, body: unknown): StartOutcome {
  const b = isObj(body) ? body : {};
  const code = typeof b.code === 'string' ? b.code : '';

  if (status === 201) {
    const verifyUrl = safeVerifyUrl(b.verifyUrl);
    return verifyUrl ? { kind: 'ok', verifyUrl } : err('UNKNOWN', KYC_COPY.errors.generic);
  }
  if (status === 401) return { kind: 'logout' };
  const blocked = parseBlocked(status, body);
  if (blocked) return { kind: 'blocked', reason: blocked.reason };
  if (status === 409 && code === 'ALREADY_APPROVED') return { kind: 'refresh', notice: mk('ALREADY_APPROVED', KYC_COPY.errors.alreadyApproved) };
  if (status === 409 && code === 'IN_REVIEW') return { kind: 'refresh', notice: mk('IN_REVIEW', KYC_COPY.errors.inReview) };
  // CPF: o médico que entrou pelo convite não tem CPF no cadastro → o campo aparece na própria Intro e o POST leva `{ cpf }`
  if (status === 400 && code === 'CPF_REQUIRED') return err('CPF_REQUIRED', KYC_COPY.errors.cpfRequired, { needsCpf: true });
  if (status === 400 && code === 'CPF_INVALID') return err('CPF_INVALID', KYC_COPY.cpf.invalid, { needsCpf: true });
  if (status === 409 && code === 'CPF_IN_USE') return err('CPF_IN_USE', KYC_COPY.cpf.inUse, { needsCpf: true, supportOnly: true });
  if (status === 429 && code === 'KYC_ATTEMPT_LIMIT') {
    const h = b.retryAfterHours;
    // Duas variantes: espera (recusa recente → horas) ou limite estourado (sem horas → só o suporte libera).
    if (typeof h === 'number' && Number.isFinite(h) && h > 0) {
      const hours = Math.max(1, Math.ceil(h));
      return err('KYC_ATTEMPT_LIMIT', KYC_COPY.errors.limitWait(hours), { retryAfterHours: hours, blocksStart: true });
    }
    return err('KYC_ATTEMPT_LIMIT', KYC_COPY.errors.limitSupport, { supportOnly: true, blocksStart: true });
  }
  // UaiID fora / sem crédito / chave: o servidor converte tudo em 503 KYC_UNAVAILABLE; gateway (502/504) sem JSON idem.
  if (code === 'KYC_UNAVAILABLE' || status === 502 || status === 503 || status === 504) return err('KYC_UNAVAILABLE', KYC_COPY.errors.unavailable);
  return err('UNKNOWN', KYC_COPY.errors.generic);
}

/** Falha de rede no POST. */
export const NETWORK_START_ERROR: KycStartError = mk('NETWORK', KYC_COPY.errors.network);
