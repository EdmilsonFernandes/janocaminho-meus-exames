// @vitest-environment node
/**
 * Verificação de identidade do médico (KYC UaiID) — jornada do portal.
 * Parte 1: lógica PURA (`resolveKycView` = matriz de estados do plano, parser da volta do UaiID,
 * normalização da resposta, classificação dos erros do POST). Parte 2: cada tela via
 * renderToString (SSR puro, mesma convenção do SportsModeCard.test — sem jsdom/RTL) e o portão.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('react-router-dom', () => ({ useNavigate: () => () => undefined }));
// Sem rede no render (os fetch só rodam em efeitos/ações) — config só p/ importar sem browser.
vi.mock('../../../../config', () => ({ API_URL: '/api' }));

import {
  KYC_COPY, KYC_TIMING,
  attemptPhase, classifyStartResponse, formatCrm, formatGraceDate, hasKycParam, humanBlockedReason, initials,
  isLegacyExpired, isPracticing, normalizeDoctorInfo, normalizeVerification, parseBlocked, resolveKycView, safeVerifyUrl,
  type KycAttempt, type KycSnapshot, type KycViewInput,
} from './kycState';
import {
  KycApproved, KycBlocked, KycChecking, KycContinue, KycIntro, KycLiveRegion, KycLoadError, KycLoading, KycRejected, KycReview,
  LegacyVerifyBanner, type KycStartControls,
} from './KycScreens';
import { DoctorVerificationGate } from './DoctorVerificationGate';
import { openVerifyUrl } from './useDoctorVerification';

const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime(); // 29/10/2026 12:00 local (sem off-by-one por fuso)
const DAY = 86_400_000;

const att = (status: string, extra: Partial<KycAttempt> = {}): KycAttempt =>
  ({ status, reasonCode: null, message: null, expiresAt: null, captureIssue: false, ...extra });
const snap = (status: KycSnapshot['status'], attempt: KycAttempt | null = null, extra: Partial<KycSnapshot> = {}): KycSnapshot =>
  ({ status, attempt, legacyGraceUntilMs: null, ...extra });
const view = (snapshot: KycSnapshot | null, extra: Partial<KycViewInput> = {}) =>
  resolveKycView({ snapshot, now: NOW, ...extra });

describe('resolveKycView — matriz de estados do portal (plano W1)', () => {
  it('approved → dashboard, sem nada novo', () => {
    expect(view(snap('approved'))).toEqual({ screen: 'dashboard', banner: null });
  });

  it('approved que VIROU approved durante a sessão → "Conta aprovada" uma vez', () => {
    expect(view(snap('approved'), { sawUnapproved: true }).screen).toBe('approved');
    // já confirmou ("Ir para o portal") → dashboard, não repete
    expect(view(snap('approved'), { sawUnapproved: true, celebrated: true }).screen).toBe('dashboard');
  });

  it('legacy → dashboard + banner "Verifique sua identidade" (com ou sem prazo)', () => {
    expect(view(snap('legacy'))).toEqual({ screen: 'dashboard', banner: 'verify' });
    expect(view(snap('legacy', null, { legacyGraceUntilMs: NOW + 30 * DAY }))).toEqual({ screen: 'dashboard', banner: 'verify' });
  });

  it('legacy com o prazo VENCIDO não atende mais (o servidor dá 403) → jornada, não dashboard cheio de erro', () => {
    expect(view(snap('legacy', null, { legacyGraceUntilMs: NOW - DAY }))).toEqual({ screen: 'intro', banner: null });
    // exatamente no instante do prazo já venceu (servidor: now < prazo)
    expect(view(snap('legacy', null, { legacyGraceUntilMs: NOW })).screen).toBe('intro');
  });

  it('legacy vencido segue a tentativa: aberta → continuar · processando → conferindo · aprovada no UaiID/revisão → em análise · recusada → recusado', () => {
    const expired = { legacyGraceUntilMs: NOW - DAY };
    expect(view(snap('legacy', att('collecting'), expired)).screen).toBe('continue');
    expect(view(snap('legacy', att('processing'), expired)).screen).toBe('checking');
    expect(view(snap('legacy', att('approved'), expired)).screen).toBe('review');
    expect(view(snap('legacy', att('manual_review'), expired)).screen).toBe('review');
    expect(view(snap('legacy', att('rejected', { reasonCode: 'face_mismatch' }), expired)).screen).toBe('rejected');
    expect(view(snap('legacy', att('expired'), expired)).screen).toBe('intro');
  });

  it('legacy no prazo que já enviou os dados → dashboard + banner "em análise" (não pede de novo)', () => {
    expect(view(snap('legacy', att('processing')))).toEqual({ screen: 'dashboard', banner: 'review' });
    expect(view(snap('legacy', att('manual_review')))).toEqual({ screen: 'dashboard', banner: 'review' });
    expect(view(snap('legacy', att('approved')))).toEqual({ screen: 'dashboard', banner: 'review' });
    // tentativa aberta mas ainda sem enviar, ou recusada → continua pedindo
    expect(view(snap('legacy', att('collecting'))).banner).toBe('verify');
    expect(view(snap('legacy', att('rejected'))).banner).toBe('verify');
  });

  it('pending → Intro (mesmo com ?kyc=1: nada a conferir)', () => {
    expect(view(snap('pending')).screen).toBe('intro');
    expect(view(snap('pending'), { kycFlag: true }).screen).toBe('intro');
  });

  it('rejected SEM tentativa → Intro', () => {
    expect(view(snap('rejected')).screen).toBe('intro');
  });

  it('in_progress SEM tentativa aberta → Intro (sem tentativa, expirada ou cancelada)', () => {
    expect(view(snap('in_progress')).screen).toBe('intro');
    expect(view(snap('in_progress', att('expired'))).screen).toBe('intro');
    expect(view(snap('in_progress', att('cancelled'))).screen).toBe('intro');
  });

  it('in_progress COM tentativa aberta (antes de enviar) → Continuar', () => {
    for (const s of ['created', 'consent_pending', 'collecting', 'challenge']) {
      expect(view(snap('in_progress', att(s))).screen).toBe('continue');
    }
  });

  it('?kyc=1 (volta do UaiID) com tentativa aberta → Conferindo', () => {
    expect(view(snap('in_progress', att('collecting')), { kycFlag: true }).screen).toBe('checking');
    expect(view(snap('in_progress', att('processing')), { kycFlag: true }).screen).toBe('checking');
  });

  it('app voltou ao primeiro plano depois de abrirmos o UaiID, com tentativa aberta → Conferindo', () => {
    expect(view(snap('in_progress', att('created')), { returned: true }).screen).toBe('checking');
    // sem ter aberto o UaiID nesta sessão, só estar no "Continuar" não vira "Conferindo"
    expect(view(snap('in_progress', att('created')), { returned: false }).screen).toBe('continue');
  });

  it('já enviou (processing) ou o UaiID já aprovou e falta a nossa conferência → Conferindo mesmo sem ?kyc=1', () => {
    expect(view(snap('in_progress', att('processing'))).screen).toBe('checking');
    expect(view(snap('in_progress', att('approved'))).screen).toBe('checking');
  });

  it('in_progress com revisão manual do UaiID → Em análise', () => {
    expect(view(snap('in_progress', att('manual_review'))).screen).toBe('review');
  });

  it('needs_admin e uaiid_review → Em análise (o ?kyc=1 não rebaixa para Conferindo)', () => {
    expect(view(snap('needs_admin', att('approved'))).screen).toBe('review');
    expect(view(snap('uaiid_review', att('manual_review'))).screen).toBe('review');
    expect(view(snap('needs_admin', att('approved')), { kycFlag: true }).screen).toBe('review');
    expect(view(snap('uaiid_review'), { returned: true }).screen).toBe('review');
  });

  it('rejected COM tentativa → Recusado (o ?kyc=1 também não rebaixa)', () => {
    expect(view(snap('rejected', att('rejected', { reasonCode: 'face_mismatch' }))).screen).toBe('rejected');
    expect(view(snap('rejected', att('approved', { reasonCode: 'admin_rejected' })), { kycFlag: true }).screen).toBe('rejected');
  });

  it('403 DOCTOR_BLOCKED → Conta suspensa (vence qualquer outro estado)', () => {
    expect(view(null, { blocked: { reason: null } }).screen).toBe('blocked');
    expect(view(snap('approved'), { blocked: { reason: 'x y' } }).screen).toBe('blocked');
    expect(view(snap('needs_admin'), { blocked: { reason: null } }).screen).toBe('blocked');
  });

  it('sem resposta ainda → carregando; falha de rede no 1º GET → erro', () => {
    expect(view(null).screen).toBe('loading');
    expect(view(null, { loadFailed: true }).screen).toBe('error');
    // com leitura anterior em mãos uma falha de refresh NÃO derruba a tela
    expect(view(snap('needs_admin', att('approved')), { loadFailed: true }).screen).toBe('review');
  });

  it('?kyc=1 sobre approved/legacy não muda nada (já resolvido no servidor)', () => {
    expect(view(snap('approved'), { kycFlag: true }).screen).toBe('dashboard');
    expect(view(snap('legacy'), { kycFlag: true })).toEqual({ screen: 'dashboard', banner: 'verify' });
  });
});

describe('volta do UaiID — só `kyc=1` conta; o `status` da URL NUNCA decide (é texto controlável pelo usuário)', () => {
  const RETURN = '#/doctor?kyc=1&status=approved&verification_id=3f2a9c1e-0000-4000-8000-000000000001&external_reference=cmdoctor123';

  it('hasKycParam reconhece kyc=1 no hash (com ou sem os outros parâmetros) e em location.search', () => {
    expect(hasKycParam('#/doctor?kyc=1')).toBe(true);
    expect(hasKycParam(RETURN)).toBe(true);
    expect(hasKycParam('#/doctor?foo=1&kyc=1')).toBe(true);
    expect(hasKycParam('#/doctor', '?kyc=1')).toBe(true);
  });

  it('sem kyc=1 nada dispara — status/verification_id sozinhos são ignorados', () => {
    expect(hasKycParam('')).toBe(false);
    expect(hasKycParam('#/doctor')).toBe(false);
    expect(hasKycParam('#/doctor?status=approved&verification_id=abc&external_reference=d1')).toBe(false);
    expect(hasKycParam('#/doctor?kyc=0')).toBe(false);
    expect(hasKycParam('#/doctor?kyc=10')).toBe(false);
    expect(hasKycParam('#/doctor?xkyc=1')).toBe(false);
    expect(hasKycParam('#/doctor?mykyc=1&status=approved')).toBe(false);
  });

  it('URL com status=approved enquanto o servidor ainda diz in_progress → a tela segue em "Conferindo"', () => {
    const kycFlag = hasKycParam(RETURN);
    // o servidor ainda está processando…
    expect(view(snap('in_progress', att('processing')), { kycFlag }).screen).toBe('checking');
    // …ou nem terminou de coletar: a URL afirmar "approved" não promove ninguém
    expect(view(snap('in_progress', att('collecting')), { kycFlag }).screen).toBe('checking');
    // e jamais abre o dashboard por conta do texto da URL
    expect(view(snap('in_progress', att('processing')), { kycFlag }).screen).not.toBe('dashboard');
    expect(view(snap('in_progress', att('processing')), { kycFlag }).screen).not.toBe('approved');
  });

  it('o status que a URL carrega não tem como entrar: o resolvedor só recebe o booleano do kyc=1', () => {
    const kycFlag = hasKycParam(RETURN);
    expect(typeof kycFlag).toBe('boolean');
    // a mesma jornada com status=rejected na URL dá exatamente o mesmo resultado
    const rejectedUrl = '#/doctor?kyc=1&status=rejected&verification_id=x&external_reference=y';
    expect(view(snap('in_progress', att('processing')), { kycFlag: hasKycParam(rejectedUrl) }))
      .toEqual(view(snap('in_progress', att('processing')), { kycFlag }));
  });
});

describe('isPracticing / isLegacyExpired / attemptPhase', () => {
  it('só approved e legacy dentro do prazo atendem (mesma regra do servidor: now < prazo; 0/ausente = sem prazo)', () => {
    expect(isPracticing(snap('approved'), NOW)).toBe(true);
    expect(isPracticing(snap('legacy'), NOW)).toBe(true);
    expect(isPracticing(snap('legacy', null, { legacyGraceUntilMs: NOW + 1 }), NOW)).toBe(true);
    expect(isPracticing(snap('legacy', null, { legacyGraceUntilMs: NOW }), NOW)).toBe(false);
    for (const s of ['pending', 'in_progress', 'uaiid_review', 'needs_admin', 'rejected'] as const) {
      expect(isPracticing(snap(s), NOW)).toBe(false);
    }
  });

  it('isLegacyExpired ignora quem não é legacy', () => {
    expect(isLegacyExpired(snap('approved', null, { legacyGraceUntilMs: NOW - DAY }), NOW)).toBe(false);
    expect(isLegacyExpired(snap('legacy', null, { legacyGraceUntilMs: NOW - DAY }), NOW)).toBe(true);
  });

  it('attemptPhase agrupa os status da tentativa', () => {
    expect(attemptPhase(null)).toBe('none');
    for (const s of ['created', 'consent_pending', 'collecting', 'challenge']) expect(attemptPhase(att(s))).toBe('pre');
    expect(attemptPhase(att('processing'))).toBe('submitted');
    expect(attemptPhase(att('manual_review'))).toBe('review');
    expect(attemptPhase(att('approved'))).toBe('approved');
    expect(attemptPhase(att('rejected'))).toBe('rejected');
    for (const s of ['expired', 'cancelled', 'algo_novo']) expect(attemptPhase(att(s))).toBe('dead');
  });
});

describe('normalizeVerification — GET /api/doctor/verification', () => {
  it('lê o contrato completo', () => {
    expect(normalizeVerification({
      status: 'rejected',
      attempt: { status: 'rejected', reasonCode: 'face_mismatch', message: 'O rosto não bateu.', expiresAt: '2026-11-05T12:00:00.000Z', captureIssue: true },
      legacyGraceUntilMs: null,
    })).toEqual({
      status: 'rejected',
      attempt: { status: 'rejected', reasonCode: 'face_mismatch', message: 'O rosto não bateu.', expiresAt: '2026-11-05T12:00:00.000Z', captureIssue: true },
      legacyGraceUntilMs: null,
    });
  });

  it('campos opcionais ausentes (captureIssue, legacyGraceUntilMs) viram false/null', () => {
    const s = normalizeVerification({ status: 'in_progress', attempt: { status: 'collecting', reasonCode: null, message: null, expiresAt: null } });
    expect(s?.attempt?.captureIssue).toBe(false);
    expect(s?.legacyGraceUntilMs).toBeNull();
    expect(normalizeVerification({ status: 'pending', attempt: null })).toEqual({ status: 'pending', attempt: null, legacyGraceUntilMs: null });
  });

  it('legacyGraceUntilMs só vale se for número positivo', () => {
    expect(normalizeVerification({ status: 'legacy', attempt: null, legacyGraceUntilMs: 1_800_000_000_000 })?.legacyGraceUntilMs).toBe(1_800_000_000_000);
    for (const bad of [0, -5, '1800000000000', NaN, null, undefined]) {
      expect(normalizeVerification({ status: 'legacy', attempt: null, legacyGraceUntilMs: bad })?.legacyGraceUntilMs).toBeNull();
    }
  });

  it('status desconhecido cai em pending (jornada começa do zero; o POST diz se não pode)', () => {
    expect(normalizeVerification({ status: 'novo_status_do_futuro', attempt: null })?.status).toBe('pending');
  });

  it('resposta que não é do contrato vira null — inclusive o "vazio limpo" do fetch offline do app', () => {
    expect(normalizeVerification({ items: [], data: [], total: 0 })).toBeNull();
    expect(normalizeVerification(null)).toBeNull();
    expect(normalizeVerification(undefined)).toBeNull();
    expect(normalizeVerification('pending')).toBeNull();
    expect(normalizeVerification([])).toBeNull();
    expect(normalizeVerification({ attempt: null })).toBeNull();
  });

  it('attempt sem status é ignorado (não derruba a tela)', () => {
    expect(normalizeVerification({ status: 'rejected', attempt: { reasonCode: 'x' } })?.attempt).toBeNull();
  });
});

describe('classifyStartResponse — POST /api/doctor/verification', () => {
  it('201 → abre o UaiID', () => {
    expect(classifyStartResponse(201, { verifyUrl: 'https://uaiid.com.br/v/abc', expiresAt: '2026-11-05T00:00:00Z', status: 'in_progress' }))
      .toEqual({ kind: 'ok', verifyUrl: 'https://uaiid.com.br/v/abc' });
  });

  it('201 com URL que não é http(s) é recusada (nunca navegar para javascript:/data:)', () => {
    for (const verifyUrl of ['javascript:alert(1)', 'data:text/html,x', '', undefined, 42]) {
      expect(classifyStartResponse(201, { verifyUrl }).kind).toBe('error');
    }
    expect(safeVerifyUrl('http://localhost:3000/v/abc')).toBe('http://localhost:3000/v/abc');
    expect(safeVerifyUrl(' https://x.y/z ')).toBe('https://x.y/z');
    expect(safeVerifyUrl('//evil.test/x')).toBeNull();
  });

  it('409 ALREADY_APPROVED / IN_REVIEW → só reler o estado (não é erro para o médico)', () => {
    expect(classifyStartResponse(409, { code: 'ALREADY_APPROVED' })).toEqual({ kind: 'refresh' });
    expect(classifyStartResponse(409, { code: 'IN_REVIEW', status: 'needs_admin' })).toEqual({ kind: 'refresh' });
  });

  it('400 CPF_REQUIRED → fale com o suporte', () => {
    const o = classifyStartResponse(400, { code: 'CPF_REQUIRED' });
    expect(o.kind).toBe('error');
    if (o.kind === 'error') {
      expect(o.error.code).toBe('CPF_REQUIRED');
      expect(o.error.message).toBe('Precisamos do seu CPF para verificar. Fale com o suporte para atualizar seu cadastro.');
      expect(o.error.supportOnly).toBe(true);
    }
  });

  it('429 KYC_ATTEMPT_LIMIT com retryAfterHours numérico (espera após recusa recente) → texto do plano, CTA desabilitado', () => {
    const o = classifyStartResponse(429, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3 });
    expect(o.kind).toBe('error');
    if (o.kind === 'error') {
      expect(o.error.code).toBe('KYC_ATTEMPT_LIMIT');
      expect(o.error.message).toBe('Você atingiu o limite de tentativas. Tente de novo em cerca de 3 h.');
      expect(o.error.retryAfterHours).toBe(3);
      expect(o.error.blocksStart).toBe(true);
      expect(o.error.supportOnly).toBe(false);
    }
  });

  it('429 KYC_ATTEMPT_LIMIT com retryAfterHours null (limite estourado) → só suporte, CTA desabilitado', () => {
    const o = classifyStartResponse(429, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: null });
    expect(o.kind).toBe('error');
    if (o.kind === 'error') {
      expect(o.error.message).toBe('Você atingiu o limite de tentativas de verificação. Fale com o suporte para liberar uma nova tentativa.');
      expect(o.error.retryAfterHours).toBeNull();
      expect(o.error.supportOnly).toBe(true);
      expect(o.error.blocksStart).toBe(true);
    }
    // campo ausente ou sem sentido = o mesmo caso (nunca prometer "tente em NaN h")
    for (const body of [{ code: 'KYC_ATTEMPT_LIMIT' }, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 'x' }, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 0 }, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: -2 }]) {
      const r = classifyStartResponse(429, body);
      expect(r.kind === 'error' && r.error.supportOnly).toBe(true);
    }
  });

  it('retryAfterHours fracionário arredonda para cima (mínimo 1 h)', () => {
    const o = classifyStartResponse(429, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 0.4 });
    expect(o.kind === 'error' && o.error.retryAfterHours).toBe(1);
    const p = classifyStartResponse(429, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 2.2 });
    expect(p.kind === 'error' && p.error.message).toBe('Você atingiu o limite de tentativas. Tente de novo em cerca de 3 h.');
  });

  it('503 KYC_UNAVAILABLE (inclui UaiID 402/5xx, que o servidor converte) → texto do plano; gateway sem JSON idem', () => {
    const msg = 'A verificação está indisponível no momento. Tente em alguns minutos.';
    const a = classifyStartResponse(503, { code: 'KYC_UNAVAILABLE' });
    expect(a.kind === 'error' && a.error.message).toBe(msg);
    expect(a.kind === 'error' && a.error.blocksStart).toBe(false);
    const b = classifyStartResponse(502, null);
    expect(b.kind === 'error' && b.error.message).toBe(msg);
  });

  it('403 DOCTOR_BLOCKED → conta suspensa (com o motivo, se vier)', () => {
    expect(classifyStartResponse(403, { code: 'DOCTOR_BLOCKED', blocked: true, reason: 'Conduta inadequada' })).toEqual({ kind: 'blocked', reason: 'Conduta inadequada' });
    expect(classifyStartResponse(403, { code: 'DOCTOR_BLOCKED' })).toEqual({ kind: 'blocked', reason: null });
  });

  it('401 (AUTH_REQUIRED · INVALID_TOKEN · DOCTOR_NOT_FOUND) → logout', () => {
    for (const code of ['AUTH_REQUIRED', 'INVALID_TOKEN', 'DOCTOR_NOT_FOUND']) {
      expect(classifyStartResponse(401, { code })).toEqual({ kind: 'logout' });
    }
  });

  it('qualquer outra coisa → mensagem genérica (e nunca o texto cru do servidor)', () => {
    const o = classifyStartResponse(500, { error: 'stack trace secreto' });
    expect(o.kind).toBe('error');
    if (o.kind === 'error') {
      expect(o.error.message).not.toContain('stack');
      expect(o.error.blocksStart).toBe(false);
    }
  });
});

describe('parseBlocked / humanBlockedReason / normalizeDoctorInfo', () => {
  it('parseBlocked: só 403 DOCTOR_BLOCKED (ou blocked:true) suspende; 401/403 de outro tipo não', () => {
    expect(parseBlocked(403, { code: 'DOCTOR_BLOCKED', blocked: true, error: 'x', reason: 'Conduta' })).toEqual({ reason: 'Conduta' });
    expect(parseBlocked(403, { blocked: true })).toEqual({ reason: null });
    expect(parseBlocked(403, { code: 'VERIFICATION_REQUIRED', status: 'pending' })).toBeNull();
    expect(parseBlocked(401, { code: 'DOCTOR_BLOCKED' })).toBeNull();
    expect(parseBlocked(403, null)).toBeNull();
  });

  it('humanBlockedReason: frase passa; código interno (kyc_fraud) não vai para a tela', () => {
    expect(humanBlockedReason('Conduta inadequada reportada')).toBe('Conduta inadequada reportada');
    expect(humanBlockedReason('kyc_fraud')).toBeNull();
    expect(humanBlockedReason('')).toBeNull();
    expect(humanBlockedReason(null)).toBeNull();
    expect(humanBlockedReason(`frase ${'longa '.repeat(60)}`)).toBeNull();
  });

  it('normalizeDoctorInfo: nome + CRM formatado; falha/offline vira null', () => {
    expect(normalizeDoctorInfo({ doctor: { name: 'Maria Souza', crm: '116739', crmUf: 'SP', email: 'm@x.com' } })).toEqual({ name: 'Maria Souza', crm: '116739-SP' });
    expect(normalizeDoctorInfo({ doctor: { name: 'Maria Souza', crm: '116739-SP', crmUf: null } })).toEqual({ name: 'Maria Souza', crm: '116739-SP' });
    expect(normalizeDoctorInfo({ doctor: { name: '', crm: null } })).toBeNull();
    expect(normalizeDoctorInfo({ items: [], data: [], total: 0 })).toBeNull();
    expect(normalizeDoctorInfo(null)).toBeNull();
  });
});

describe('formatadores', () => {
  it('formatCrm: usa a chave numero-UF, completa com a UF e aguenta ausência', () => {
    expect(formatCrm('116739-SP', 'SP')).toBe('116739-SP');
    expect(formatCrm('116739', 'sp')).toBe('116739-SP');
    expect(formatCrm('116739', null)).toBe('116739');
    expect(formatCrm('  ', 'SP')).toBeNull();
    expect(formatCrm(null, 'SP')).toBeNull();
    expect(formatCrm(undefined, undefined)).toBeNull();
  });

  it('formatGraceDate: DD/MM/AAAA no fuso local', () => {
    expect(formatGraceDate(new Date(2026, 10, 28, 12).getTime())).toBe('28/11/2026');
    expect(formatGraceDate(new Date(2027, 0, 5, 12).getTime())).toBe('05/01/2027');
  });

  it('initials: iniciais do 1º e do último nome, sem o título', () => {
    expect(initials('Maria Souza')).toBe('MS');
    expect(initials('Dra. Maria da Silva Souza')).toBe('MS');
    expect(initials('Edmilson')).toBe('E');
    expect(initials('  ')).toBe('');
    expect(initials(null)).toBe('');
  });
});

describe('constantes do plano', () => {
  it('tempos: poll 4 s no "Conferindo" (teto 90 s) e refresh 30 s no "Em análise"', () => {
    expect(KYC_TIMING).toEqual({ checkPollMs: 4000, checkMaxMs: 90_000, reviewRefreshMs: 30_000 });
  });

  it('suporte: contato@janocaminho.com.br', () => {
    expect(KYC_COPY.supportEmail).toBe('contato@janocaminho.com.br');
    expect(KYC_COPY.supportMailto).toBe('mailto:contato@janocaminho.com.br');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * Parte 2 — telas (renderToString) e portão
 * ══════════════════════════════════════════════════════════════════════════════════ */

const lightTheme = createTheme();
const darkTheme = createTheme({ palette: { mode: 'dark' } });
const render = (el: React.ReactElement, theme = lightTheme) => renderToString(<ThemeProvider theme={theme}>{el}</ThemeProvider>);
const noop = () => undefined;
const controls = (over: Partial<KycStartControls> = {}): KycStartControls =>
  ({ onStart: noop, onCopyLink: noop, starting: false, error: null, copied: null, ...over });
const maria = { name: 'Maria Souza', crm: '116739-SP' };
const primaryButtons = (html: string) => (html.match(/<button[^>]*MuiButton-containedPrimary/g) ?? []).length;
const startError = (status: number, body: unknown) => {
  const o = classifyStartResponse(status, body);
  if (o.kind !== 'error') throw new Error(`esperava erro, veio ${o.kind}`);
  return o.error;
};
/** O botão "Tentar de novo" está desabilitado? (atributo disabled no <button> que contém o rótulo) */
const ctaDisabled = (html: string, label: string) => new RegExp(`<button[^>]*\\bdisabled\\b[^>]*>(?:(?!</button>).)*${label}`).test(html);

describe('KycIntro — "Vamos validar sua identidade"', () => {
  const html = render(<KycIntro doctor={maria} onLogout={noop} start={controls()} />);

  it('copy do plano, palavra por palavra', () => {
    expect(html).toContain('Passo 2 de 3 · Verificação de identidade');
    expect(html).toContain('Vamos validar sua identidade');
    expect(html).toContain('Queremos te conhecer melhor. Antes de atender pacientes, confirmamos quem você é — é isso que mantém o Dr. Exame seguro para todo mundo, inclusive para você.');
    expect(html).toContain('O que você vai precisar');
    expect(html).toContain('Um documento com foto');
    expect(html).toContain('RG, CNH ou RNE, original e sem reflexo');
    expect(html).toContain('Uma selfie');
    expect(html).toContain('câmera do celular ou do computador, em local bem iluminado');
    expect(html).toContain('Cerca de 2 minutos');
    expect(html).toContain('pode parar e continuar depois');
    expect(html).toContain('Seus dados, protegidos');
    expect(html).toContain('A verificação é feita pelo UaiID, nosso parceiro especializado. As imagens ficam apenas com ele: o Dr. Exame guarda só o resultado. Tratamos tudo conforme a LGPD.');
    expect(html).toContain('Validar minha identidade');
    expect(html).toContain('Prefere no celular?');
    expect(html).toContain('Copiar link');
  });

  it('rodapé: Sair + Falar com o suporte (mailto contato@janocaminho.com.br)', () => {
    expect(html).toContain('Sair');
    expect(html).toContain('Falar com o suporte');
    expect(html).toContain('href="mailto:contato@janocaminho.com.br"');
  });

  it('mascote Dr. Exame presente, H1 único e UMA ação primária', () => {
    expect(html).toContain('alt="Dr. Exame"');
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(primaryButtons(html)).toBe(1);
  });

  it('personaliza com nome e CRM — e funciona sem eles (falha do /me)', () => {
    expect(html).toContain('Maria Souza');
    expect(html).toContain('CRM 116739-SP');
    const bare = render(<KycIntro doctor={null} onLogout={noop} start={controls()} />);
    expect(bare).toContain('Vamos validar sua identidade');
    expect(bare).not.toContain('CRM ');
  });

  it('médico antigo com o prazo vencido: mesma jornada, sem "Passo 2 de 3"', () => {
    const expired = render(<KycIntro doctor={maria} onLogout={noop} start={controls()} expired />);
    expect(expired).toContain('Verificação de identidade');
    expect(expired).not.toContain('Passo 2 de 3');
    expect(expired).toContain('Validar minha identidade');
  });

  it('renderiza também no escuro', () => {
    const dark = render(<KycIntro doctor={maria} onLogout={noop} start={controls()} />, darkTheme);
    expect(dark).toContain('Vamos validar sua identidade');
    expect(dark).toContain('alt="Dr. Exame"');
  });

  it('enviando: o botão desabilita e avisa que está ocupado', () => {
    const busy = render(<KycIntro doctor={maria} onLogout={noop} start={controls({ starting: true })} />);
    expect(busy).toContain('aria-busy="true"');
    expect(ctaDisabled(busy, 'Validar minha identidade')).toBe(true);
  });

  it('erros do POST viram aviso no próprio card (texto do plano)', () => {
    const unavailable = render(<KycIntro doctor={maria} onLogout={noop} start={controls({ error: startError(503, { code: 'KYC_UNAVAILABLE' }) })} />);
    expect(unavailable).toContain('A verificação está indisponível no momento. Tente em alguns minutos.');
    expect(unavailable).toContain('role="alert"');
    const cpf = render(<KycIntro doctor={maria} onLogout={noop} start={controls({ error: startError(400, { code: 'CPF_REQUIRED' }) })} />);
    expect(cpf).toContain('Precisamos do seu CPF para verificar. Fale com o suporte para atualizar seu cadastro.');
    const net = render(<KycIntro doctor={maria} onLogout={noop} start={controls({ error: { code: 'NETWORK', message: KYC_COPY.errors.network, retryAfterHours: null, supportOnly: false, blocksStart: false } })} />);
    expect(net).toContain('Sem conexão. Tente novamente.');
  });

  it('copiar link: confirmação; se o aparelho não deixa copiar, mostra o link para copiar na mão', () => {
    const ok = render(<KycIntro doctor={maria} onLogout={noop} start={controls({ copied: { url: 'https://uaiid.test/v/abc', ok: true } })} />);
    expect(ok).toContain('Link copiado! Abra no celular e conclua a verificação.');
    expect(ok).not.toContain('value="https://uaiid.test/v/abc"');
    const manual = render(<KycIntro doctor={maria} onLogout={noop} start={controls({ copied: { url: 'https://uaiid.test/v/abc', ok: false } })} />);
    expect(manual).toContain('Toque e segure o link abaixo para copiar.');
    expect(manual).toContain('value="https://uaiid.test/v/abc"');
    expect(manual).toContain('readOnly');
  });
});

describe('KycContinue — "Falta pouco para terminar"', () => {
  it('copy do plano e uma ação primária', () => {
    const html = render(<KycContinue doctor={maria} onLogout={noop} start={controls()} />);
    expect(html).toContain('Falta pouco para terminar');
    expect(html).toContain('Você começou a verificação mas não chegou ao fim. Continue de onde parou.');
    expect(html).toContain('Continuar verificação');
    expect(html).toContain('alt="Dr. Exame"');
    expect(primaryButtons(html)).toBe(1);
  });
});

describe('KycChecking — "Conferindo seus dados…"', () => {
  const props = { doctor: maria, onLogout: noop, slow: false, busy: false, onRefresh: noop, canResume: true, onResume: noop };

  it('copy do plano, linha que alterna em região viva (polite) e mascote pulsando', () => {
    const html = render(<KycChecking {...props} />);
    expect(html).toContain('Conferindo seus dados…');
    expect(html).toContain('Recebemos suas imagens. Leva só alguns instantes — pode deixar esta tela aberta.');
    expect(html).toContain('Comparando seu rosto com o documento');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain('alt="Dr. Exame"');
  });

  it('antes dos 90 s não há botão nem aviso de demora', () => {
    const html = render(<KycChecking {...props} />);
    expect(html).not.toContain('Está demorando mais que o normal');
    expect(html).not.toContain('>Atualizar<');
  });

  it('depois dos 90 s: aviso + "Atualizar" (e voltar ao UaiID só se ainda não enviou)', () => {
    const html = render(<KycChecking {...props} slow />);
    expect(html).toContain('Está demorando mais que o normal. Pode fechar esta tela — avisamos por e-mail assim que houver novidade.');
    expect(html).toContain('Atualizar');
    expect(html).toContain('Ainda não terminou?');
    expect(html).toContain('Continuar verificação');
    const sent = render(<KycChecking {...props} slow canResume={false} />);
    expect(sent).toContain('Atualizar');
    expect(sent).not.toContain('Continuar verificação');
    expect(sent).not.toContain('Ainda não terminou?');
  });
});

describe('KycReview — "Recebemos! Seu cadastro está em análise"', () => {
  const html = render(<KycReview doctor={maria} onLogout={noop} onRefresh={noop} busy={false} />);

  it('copy do plano: chip cobre, título, lead e nota', () => {
    expect(html).toContain('EM ANÁLISE');
    expect(html).toContain('Recebemos! Seu cadastro está em análise');
    expect(html).toContain('Sua identidade foi enviada. Agora nossa equipe confere seus dados e o seu CRM no CFM.');
    expect(html).toContain('Você recebe um e-mail assim que terminarmos. Não precisa fazer mais nada.');
    expect(html).toContain('Atualizar status');
    expect(html).toContain('Sair');
  });

  it('trilha vertical: 2 concluídas, 1 em andamento (com o CRM), 1 pendente — acessível como lista ordenada', () => {
    expect(html).toContain('Cadastro no portal');
    expect(html).toContain('Conta criada e e-mail confirmado');
    expect(html).toContain('Verificação de identidade');
    expect(html).toContain('Documento e selfie enviados');
    expect(html).toContain('Análise da equipe');
    expect(html).toContain('Conferindo seus dados e o CRM 116739-SP');
    expect(html).toContain('Atendimento liberado');
    expect(html).toContain('Você passa a receber pacientes pelo Dr. Exame');
    expect(html).toContain('<ol');
    expect(html).toContain('aria-label="Etapas do seu cadastro"');
    expect((html.match(/ — concluída/g) ?? []).length).toBe(2);
    expect(html).toContain(' — em andamento');
    expect(html).toContain(' — pendente');
  });

  it('sem o CRM (falha do /me) a linha continua verdadeira', () => {
    const bare = render(<KycReview doctor={null} onLogout={noop} onRefresh={noop} busy={false} />);
    expect(bare).toContain('Conferindo seus dados e o seu CRM no CFM');
    expect(bare).not.toContain('CRM undefined');
    expect(bare).not.toContain('CRM null');
  });

  it('não promete prazo (nem horas nem dias) no texto da tela', () => {
    const text = html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\b\d+\s*(horas?|dias?|h|min|minutos)\b/i);
    expect(text).not.toMatch(/\b(em até|em poucas horas|24 ?h|48 ?h)\b/i);
  });
});

describe('KycRejected — "Não conseguimos aprovar sua verificação"', () => {
  const attempt = (extra: Partial<KycAttempt> = {}): KycAttempt =>
    att('rejected', { reasonCode: 'face_mismatch', message: 'O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.', captureIssue: true, ...extra });

  it('mostra o motivo do servidor e o chip', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt()} start={controls()} />);
    expect(html).toContain('NÃO APROVADO');
    expect(html).toContain('Não conseguimos aprovar sua verificação');
    expect(html).toContain('O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.');
    expect(html).toContain('Tentar de novo');
    expect(primaryButtons(html)).toBe(1);
  });

  it('sem mensagem → texto de reserva', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt({ message: null, reasonCode: null, captureIssue: false })} start={controls()} />);
    expect(html).toContain('Não foi possível confirmar sua identidade.');
  });

  it('recusa do dono (admin_rejected) → "Enviamos os detalhes para o seu e-mail."', () => {
    const owner = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt({ reasonCode: 'admin_rejected', captureIssue: false })} start={controls()} />);
    expect(owner).toContain('Enviamos os detalhes para o seu e-mail.');
    const auto = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt()} start={controls()} />);
    expect(auto).not.toContain('Enviamos os detalhes para o seu e-mail.');
  });

  it('problema de captura → card "Como resolver" com as 3 dicas (e sem o "E agora?")', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt({ captureIssue: true })} start={controls()} />);
    expect(html).toContain('Como resolver');
    expect(html).toContain('Use um documento original (RG, CNH ou RNE), sem reflexo.');
    expect(html).toContain('Faça a selfie em local bem iluminado, sem óculos ou boné.');
    expect(html).toContain('Confira se o nome do documento é o mesmo do seu registro no CFM.');
    expect(html).not.toContain('E agora?');
  });

  it('qualquer outro motivo → card neutro "E agora?" com o contato (e sem as dicas de foto)', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt({ reasonCode: 'crm_inactive', message: 'Seu CRM consta como inativo no CFM. Fale com o suporte.', captureIssue: false })} start={controls()} />);
    expect(html).toContain('E agora?');
    expect(html).toContain('Leia o motivo acima. Se foi engano, escreva para ');
    expect(html).toContain('contato@janocaminho.com.br');
    expect(html).toContain(' — respondemos rápido. Quando estiver tudo certo, tente de novo.');
    expect(html).not.toContain('Como resolver');
    expect(html).not.toContain('sem óculos ou boné');
  });

  it('429 com espera (retryAfterHours numérico): alerta com as horas e CTA desabilitado', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt()} start={controls({ error: startError(429, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3 }) })} />);
    expect(html).toContain('Você atingiu o limite de tentativas. Tente de novo em cerca de 3 h.');
    expect(ctaDisabled(html, 'Tentar de novo')).toBe(true);
    expect(html).not.toContain('Fale com o suporte para liberar');
  });

  it('429 sem horas (limite estourado): só o suporte libera — texto + botão mailto, CTA desabilitado', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt()} start={controls({ error: startError(429, { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: null }) })} />);
    expect(html).toContain('Você atingiu o limite de tentativas de verificação. Fale com o suporte para liberar uma nova tentativa.');
    expect(html).toContain('href="mailto:contato@janocaminho.com.br"');
    expect(ctaDisabled(html, 'Tentar de novo')).toBe(true);
    expect(html).not.toContain('Tente de novo em cerca de');
  });

  it('503 KYC_UNAVAILABLE no "Tentar de novo": aviso do plano, CTA continua habilitado', () => {
    const html = render(<KycRejected doctor={maria} onLogout={noop} attempt={attempt()} start={controls({ error: startError(503, { code: 'KYC_UNAVAILABLE' }) })} />);
    expect(html).toContain('A verificação está indisponível no momento. Tente em alguns minutos.');
    expect(ctaDisabled(html, 'Tentar de novo')).toBe(false);
  });
});

describe('KycBlocked — "Conta suspensa"', () => {
  it('copy do plano + contato; o motivo só aparece se for uma frase', () => {
    const html = render(<KycBlocked doctor={maria} onLogout={noop} reason="Denúncias de conduta em análise" />);
    expect(html).toContain('Conta suspensa');
    expect(html).toContain('Seu acesso está temporariamente suspenso pela administração.');
    expect(html).toContain('Denúncias de conduta em análise');
    expect(html).toContain('href="mailto:contato@janocaminho.com.br"');
    expect(html).toContain('Falar com o suporte');
    const code = render(<KycBlocked doctor={maria} onLogout={noop} reason="kyc_fraud" />);
    expect(code).not.toContain('kyc_fraud');
    const none = render(<KycBlocked doctor={null} onLogout={noop} reason={null} />);
    expect(none).toContain('Conta suspensa');
  });
});

describe('KycApproved — "Conta aprovada"', () => {
  it('copy do plano e uma ação', () => {
    const html = render(<KycApproved onContinue={noop} />);
    expect(html).toContain('Conta aprovada');
    expect(html).toContain('🎉');
    expect(html).toContain('Sua identidade foi verificada. Você já pode atender.');
    expect(html).toContain('Ir para o portal');
    expect(primaryButtons(html)).toBe(1);
  });
});

describe('KycLoading / KycLoadError / região viva', () => {
  it('carregando: mascote + status acessível', () => {
    const html = render(<KycLoading />);
    expect(html).toContain('Carregando…');
    expect(html).toContain('role="status"');
    expect(html).toContain('alt="Dr. Exame"');
  });

  it('erro de rede no 1º GET: texto do plano + tentar de novo', () => {
    const html = render(<KycLoadError onRetry={noop} busy={false} onLogout={noop} />);
    expect(html).toContain('Sem conexão. Tente novamente.');
    expect(html).toContain('Tentar de novo');
    expect(html).toContain('Sair');
  });

  it('KycLiveRegion anuncia em silêncio visual', () => {
    const html = render(<KycLiveRegion text="Conferindo seus dados…" />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Conferindo seus dados…');
  });
});

describe('LegacyVerifyBanner — médico antigo no prazo', () => {
  const base = { graceUntilMs: null, onVerify: noop, onDismiss: noop, busy: false, error: null };

  it('sem prazo: "Verifique sua identidade" + botão + dispensar', () => {
    const html = render(<LegacyVerifyBanner kind="verify" {...base} />);
    expect(html).toContain('Verifique sua identidade');
    expect(html).not.toContain('Verifique sua identidade até');
    expect(html).toContain('Para continuar atendendo, confirme quem você é — leva 2 minutos.');
    expect(html).toContain('Verificar agora');
    expect(html).toContain('aria-label="Dispensar aviso"');
  });

  it('com prazo: "até DD/MM/AAAA"', () => {
    const html = render(<LegacyVerifyBanner kind="verify" {...base} graceUntilMs={new Date(2026, 10, 28, 12).getTime()} />);
    expect(html).toContain('Verifique sua identidade até 28/11/2026');
  });

  it('já enviou os dados: avisa que está em análise e não pede de novo', () => {
    const html = render(<LegacyVerifyBanner kind="review" {...base} />);
    expect(html).toContain('Recebemos sua verificação');
    expect(html).not.toContain('Verificar agora');
  });

  it('erro ao iniciar aparece no próprio banner', () => {
    const html = render(<LegacyVerifyBanner kind="verify" {...base} error={startError(503, { code: 'KYC_UNAVAILABLE' })} />);
    expect(html).toContain('A verificação está indisponível no momento. Tente em alguns minutos.');
    expect(html).toContain('role="alert"');
  });
});

describe('DoctorVerificationGate — o dashboard só monta quando o portão deixa', () => {
  it('sem resposta do servidor ainda: mostra "carregando" e NÃO monta o dashboard (nenhum fetch dele dispara)', () => {
    const html = render(
      <DoctorVerificationGate token="t.o.k" onLogout={noop}>
        <div data-testid="dashboard">DASHBOARD-DO-MEDICO</div>
      </DoctorVerificationGate>,
    );
    expect(html).toContain('Carregando…');
    expect(html).not.toContain('DASHBOARD-DO-MEDICO');
  });
});

describe('openVerifyUrl — R2: web = mesma aba · APK = Custom Tab', () => {
  const deps = () => {
    const calls: string[] = [];
    return {
      calls,
      isNative: async () => false,
      openInApp: async (u: string) => { calls.push(`inapp:${u}`); },
      openWindow: (u: string) => { calls.push(`window:${u}`); },
      assign: (u: string) => { calls.push(`assign:${u}`); },
      settleMs: 0,
    };
  };

  it('web: navega na mesma aba (popup depois de await perderia o gesto e seria bloqueado)', async () => {
    const d = deps();
    expect(await openVerifyUrl('https://uaiid.test/v/1', d)).toBe('web');
    expect(d.calls).toEqual(['assign:https://uaiid.test/v/1']);
  });

  it('APK: abre a Custom Tab (@capacitor/browser) e não navega a WebView', async () => {
    const d = { ...deps(), isNative: async () => true };
    expect(await openVerifyUrl('https://uaiid.test/v/2', d)).toBe('native');
    expect(d.calls).toEqual(['inapp:https://uaiid.test/v/2']);
  });

  it('APK com a Custom Tab falhando: plano B é uma janela externa, nunca a WebView do app', async () => {
    const d = { ...deps(), isNative: async () => true, openInApp: async () => { throw new Error('sem browser'); } };
    expect(await openVerifyUrl('https://uaiid.test/v/3', d)).toBe('native');
    expect(d.calls).toEqual(['window:https://uaiid.test/v/3']);
  });

  it('não conseguiu descobrir a plataforma → trata como web', async () => {
    const d = { ...deps(), isNative: async () => { throw new Error('x'); } };
    expect(await openVerifyUrl('https://uaiid.test/v/4', d)).toBe('web');
    expect(d.calls).toEqual(['assign:https://uaiid.test/v/4']);
  });
});

describe('guardas de código — o que a jornada NUNCA pode fazer', () => {
  const SOURCES = ['kycState.ts', 'useDoctorVerification.ts', 'DoctorVerificationGate.tsx', 'KycScreens.tsx'];
  /** código sem comentários (os comentários explicam justamente o que NÃO fazer) */
  const code = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('nunca recarrega a página: location.reload()/navigate(0) crasham o APK — atualizar é reler o GET', () => {
    for (const f of SOURCES) {
      expect(code(f), f).not.toMatch(/\.reload\s*\(/);
      expect(code(f), f).not.toMatch(/navigate\(\s*0\s*\)/);
      expect(code(f), f).not.toMatch(/history\.go\(\s*0?\s*\)/);
    }
  });

  it('não lê, registra nem rastreia o que o UaiID anexa à URL (status, verification_id, external_reference)', () => {
    for (const f of SOURCES) {
      expect(code(f), f).not.toMatch(/verification_id|external_reference/);
      expect(code(f), f).not.toMatch(/console\./);
      expect(code(f), f).not.toMatch(/posthog|analytics|\btrack\(/);
      expect(code(f), f).not.toMatch(/searchParams\.get\(\s*['"]status['"]/);
    }
  });

  it('a única leitura da URL é o kyc=1 (via hasKycParam) e ela é consumida com navigate("/doctor", { replace })', () => {
    const hook = code('useDoctorVerification.ts');
    expect(hook).toMatch(/hasKycParam\(window\.location\.hash, window\.location\.search\)/);
    expect(hook).not.toMatch(/URLSearchParams/);
    expect(hook).toMatch(/navigateRef\.current\('\/doctor', \{ replace: true \}\)/);
  });
});
