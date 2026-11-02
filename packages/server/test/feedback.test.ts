import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, createDoctor, createExam, resetDb, mintToken } from './helpers';
import { prisma } from '../src/prisma';
import { SURVEYS, validateAnswers, sanitizeComment, sanitizeContext, deriveCategory, computeInviteEligibility } from '../src/feedback/surveys';
import { saveSettings } from '../src/utils/settings';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

const DAY = 86_400_000;
const SETTINGS = { enabled: 1, minAccountAgeDays: 2, inviteIntervalDays: 30, maxDismissals: 3 };

describe('feedback — definições e regras puras', () => {
  const def = SURVEYS['patient-core'];

  it('valida respostas: só ids conhecidos, Q2 1..max, Q1/Q3 obrigatórias', () => {
    expect(validateAnswers(def, { outcome: 'done', detail: ['upload'], improvement: 'nothing' }).ok).toBe(true);
    expect(validateAnswers(def, { outcome: 'yes', detail: ['upload'], improvement: 'nothing' }).ok).toBe(false);
    expect(validateAnswers(def, { outcome: 'done', detail: [], improvement: 'nothing' }).ok).toBe(false);
    expect(validateAnswers(def, { outcome: 'done', detail: ['upload', 'ai_analysis', 'trends', 'credits'], improvement: 'nothing' }).ok).toBe(false);
    expect(validateAnswers(def, { outcome: 'done', detail: ['hack'], improvement: 'nothing' }).ok).toBe(false);
    expect(validateAnswers(def, { outcome: 'done', detail: ['upload'], improvement: 'x' }).ok).toBe(false);
    const dedup = validateAnswers(def, { outcome: 'partial', detail: ['upload', 'upload'], improvement: 'simplify' });
    expect(dedup.ok && dedup.answers.detail).toEqual(['upload']);
  });

  it('comentário: strip de tags/controle, corte no máximo, vazio → null; contexto só whitelist', () => {
    expect(sanitizeComment('  <b>oi</b>\u0000 tudo   bem\n\n\n\nfim ', 600)).toBe('oi tudo bem\n\nfim');
    expect(sanitizeComment('   ', 600)).toBeNull();
    expect(sanitizeComment(42, 600)).toBeNull();
    expect(sanitizeComment('a'.repeat(700), 600)?.length).toBe(600);
    expect(sanitizeContext({ trigger: 'report_generated', screen: '/relatorio', platform: 'android', appVersion: '2.7.311', hasExams: true, glicemia: 180, cpf: '123' }))
      .toEqual({ trigger: 'report_generated', screen: '/relatorio', platform: 'android', appVersion: '2.7.311', hasExams: true });
    expect(sanitizeContext('x')).toBeNull();
  });

  it('categoria derivada: técnica > preço > usabilidade > valor > feature > outro', () => {
    expect(deriveCategory({ outcome: 'partial', detail: ['slow_error', 'credits'], improvement: 'simplify' })).toBe('technical');
    expect(deriveCategory({ outcome: 'partial', detail: ['credits'], improvement: 'simplify' })).toBe('pricing');
    expect(deriveCategory({ outcome: 'done', detail: ['upload'], improvement: 'credits_clarity' })).toBe('pricing');
    expect(deriveCategory({ outcome: 'partial', detail: ['find_feature'], improvement: 'nothing' })).toBe('usability');
    expect(deriveCategory({ outcome: 'exploring', detail: ['ai_analysis'], improvement: 'nothing' })).toBe('value');
    expect(deriveCategory({ outcome: 'not', detail: ['upload'], improvement: 'explain_results' })).toBe('value');
    expect(deriveCategory({ outcome: 'done', detail: ['upload'], improvement: 'trends_history' })).toBe('feature');
    expect(deriveCategory({ outcome: 'done', detail: ['upload'], improvement: 'nothing' })).toBe('other');
    expect(deriveCategory({ outcome: 'exploring', detail: ['other'], improvement: 'other' })).toBe('value');
  });

  it('elegibilidade do convite: desligado, conta nova, já respondeu, dispensas, cooldown, convidado hoje', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const old = new Date(now.getTime() - 10 * DAY);
    const ok = { settings: SETTINGS, accountCreatedAt: old, state: null, currentVersion: 1, now };
    expect(computeInviteEligibility(ok)).toEqual({ eligible: true });
    expect(computeInviteEligibility({ ...ok, settings: { ...SETTINGS, enabled: 0 } })).toMatchObject({ reason: 'disabled' });
    expect(computeInviteEligibility({ ...ok, accountCreatedAt: new Date(now.getTime() - DAY) })).toMatchObject({ reason: 'too_new' });
    const st = { lastInvitedAt: null, lastDismissedAt: null, dismissCount: 0, lastAnsweredVersion: null };
    expect(computeInviteEligibility({ ...ok, state: { ...st, lastAnsweredVersion: 1 } })).toMatchObject({ reason: 'answered' });
    expect(computeInviteEligibility({ ...ok, state: { ...st, lastAnsweredVersion: 1 }, currentVersion: 2 })).toEqual({ eligible: true }); // versão nova → pergunta de novo
    expect(computeInviteEligibility({ ...ok, state: { ...st, dismissCount: 3 } })).toMatchObject({ reason: 'max_dismissals' });
    expect(computeInviteEligibility({ ...ok, state: { ...st, dismissCount: 1, lastDismissedAt: new Date(now.getTime() - 5 * DAY) } })).toMatchObject({ reason: 'cooldown' });
    expect(computeInviteEligibility({ ...ok, state: { ...st, dismissCount: 1, lastDismissedAt: new Date(now.getTime() - 31 * DAY) } })).toEqual({ eligible: true });
    expect(computeInviteEligibility({ ...ok, state: { ...st, lastInvitedAt: new Date(now.getTime() - 3600_000) } })).toMatchObject({ reason: 'recently_invited' });
  });
});

describe('feedback — API paciente/médico/admin', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('feedback', SETTINGS);
  });

  const answers = { outcome: 'partial', detail: ['ai_analysis', 'credits'], improvement: 'explain_results' };

  it('fluxo completo: definição → envio → agradecimento → retry não duplica → não é mais elegível', async () => {
    const u = await createUser();
    const H = authHeader(u.token);
    let r = await api().get('/api/feedback/survey').set(H);
    expect(r.status).toBe(200);
    expect(r.body.survey.key).toBe('patient-core');
    expect(r.body.survey.q2.options.length).toBeGreaterThan(5);
    // pesquisa de médico não vaza pro paciente
    expect((await api().get('/api/feedback/survey?key=doctor-core').set(H)).status).toBe(404);

    const clientKey = 'ck-11111111-aaaa';
    r = await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 1, answers, comment: ' Faltou <b>explicar</b> os créditos ', context: { trigger: 'profile', platform: 'web', glicemia: 999 }, clientKey });
    expect(r.status).toBe(201);
    expect(r.body.thanks.title).toMatch(/Obrigado/);
    const id = r.body.id;

    // retry (mesmo clientKey) → mesma resposta, sem duplicar
    r = await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 1, answers, clientKey });
    expect(r.status).toBe(200); expect(r.body.id).toBe(id); expect(r.body.duplicate).toBe(true);
    expect(await prisma.feedbackResponse.count()).toBe(1);

    const saved = await prisma.feedbackResponse.findUnique({ where: { id } });
    expect(saved?.comment).toBe('Faltou explicar os créditos');
    expect(saved?.category).toBe('pricing');
    expect(saved?.outcome).toBe('partial');
    expect((saved?.context as any)?.glicemia).toBeUndefined();
    expect((saved?.context as any)?.trigger).toBe('profile');

    // já respondeu esta versão → convite não elegível
    r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body.eligible).toBe(false); expect(r.body.reason).toBe('answered');
  });

  it('validações: versão desatualizada 409, respostas inválidas 400, clientKey inválido 400, clientKey de outro usuário 409', async () => {
    const u = await createUser(); const H = authHeader(u.token);
    expect((await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 0, answers, clientKey: 'ck-11111111-aaaa' })).status).toBe(409);
    expect((await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 1, answers: { outcome: 'done' }, clientKey: 'ck-11111111-aaaa' })).status).toBe(400);
    expect((await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 1, answers, clientKey: 'x' })).status).toBe(400);
    expect((await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 1, answers, clientKey: 'ck-11111111-aaaa' })).status).toBe(201);
    const u2 = await createUser();
    expect((await api().post('/api/feedback').set(authHeader(u2.token)).send({ surveyKey: 'patient-core', surveyVersion: 1, answers, clientKey: 'ck-11111111-aaaa' })).status).toBe(409);
    expect((await api().post('/api/feedback').send({})).status).toBe(401);
  });

  it('convite: conta nova não é convidada; conta com 3 dias é; hasExams reflete envio; dispensar aplica intervalo; convidado hoje não repete', async () => {
    const u = await createUser(); const H = authHeader(u.token);
    let r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body).toMatchObject({ eligible: false, reason: 'too_new', hasExams: false });

    await prisma.user.update({ where: { id: u.user.id }, data: { createdAt: new Date(Date.now() - 3 * DAY) } });
    r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body).toMatchObject({ eligible: true, hasExams: false, surveyKey: 'patient-core', surveyVersion: 1 });

    await createExam(u.patient.id);
    r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body.hasExams).toBe(true);

    expect((await api().post('/api/feedback/invited').set(H).send({})).status).toBe(200);
    r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body).toMatchObject({ eligible: false, reason: 'recently_invited' });

    r = await api().post('/api/feedback/dismiss').set(H).send({});
    expect(r.body.dismissCount).toBe(1);
    r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body).toMatchObject({ eligible: false, reason: 'cooldown' });

    // 3 dispensas → só pelo acesso permanente
    await prisma.feedbackPromptState.updateMany({ where: { subjectId: u.user.id }, data: { dismissCount: 3, lastDismissedAt: new Date(Date.now() - 60 * DAY), lastInvitedAt: null } });
    r = await api().get('/api/feedback/eligibility').set(H);
    expect(r.body.reason).toBe('max_dismissals');
    // ...mas o envio direto continua funcionando
    expect((await api().post('/api/feedback').set(H).send({ surveyKey: 'patient-core', surveyVersion: 1, answers, clientKey: 'ck-direct-0001' })).status).toBe(201);
  });

  it('médico: pesquisa própria (doctor-core), token de paciente não entra, opções de paciente não aparecem', async () => {
    const d = await createDoctor({ crm: '77777-SP' });
    const H = authHeader(d.token);
    let r = await api().get('/api/doctor/feedback/survey').set(H);
    expect(r.status).toBe(200);
    expect(r.body.survey.key).toBe('doctor-core');
    expect(r.body.survey.q2.options.map((o: any) => o.id)).toContain('teleconsulta');
    expect(r.body.survey.q2.options.map((o: any) => o.id)).not.toContain('upload');
    expect((await api().get('/api/doctor/feedback/survey?key=patient-core').set(H)).status).toBe(404);
    r = await api().post('/api/doctor/feedback').set(H).send({ surveyKey: 'doctor-core', surveyVersion: 1, answers: { outcome: 'done', detail: ['shared_exams'], improvement: 'scheduling' }, clientKey: 'ck-doc-00000001' });
    expect(r.status).toBe(201);
    const saved = await prisma.feedbackResponse.findFirst({ where: { subjectType: 'doctor' } });
    expect(saved?.subjectId).toBe(d.doctor.id);
    const u = await createUser();
    expect((await api().get('/api/doctor/feedback/survey').set(authHeader(u.token))).status).toBe(401);
  });

  it('admin: lista com resumo/denominadores, filtros, detalhe com identificação, triagem auditada, agrupamento por melhoria; não-admin 403', async () => {
    const admin = await createAdmin(); const A = authHeader(admin.token);
    const u1 = await createUser({ name: 'Ana Paciente' });
    const u2 = await createUser();
    const d = await createDoctor({ crm: '88888-SP' });
    await api().post('/api/feedback').set(authHeader(u1.token)).send({ surveyKey: 'patient-core', surveyVersion: 1, answers: { outcome: 'partial', detail: ['credits', 'ai_analysis'], improvement: 'credits_clarity' }, comment: 'não entendi os créditos', context: { trigger: 'report_generated', platform: 'android', appVersion: '2.7.311' }, clientKey: 'ck-a-00000001' });
    await api().post('/api/feedback').set(authHeader(u2.token)).send({ surveyKey: 'patient-core', surveyVersion: 1, answers: { outcome: 'done', detail: ['upload'], improvement: 'nothing' }, clientKey: 'ck-b-00000001' });
    await api().post('/api/doctor/feedback').set(authHeader(d.token)).send({ surveyKey: 'doctor-core', surveyVersion: 1, answers: { outcome: 'not', detail: ['slow_error'], improvement: 'simplify' }, clientKey: 'ck-c-00000001' });

    expect((await api().get('/api/admin/feedback').set(authHeader(u1.token))).status).toBe(403);

    let r = await api().get('/api/admin/feedback').set(A);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body.summary.responses).toBe(3);
    expect(r.body.summary.participants).toBe(3);
    expect(r.body.summary.eligibleBase.users).toBeGreaterThanOrEqual(2);
    expect(r.body.summary.byOutcome).toMatchObject({ partial: 1, done: 1, not: 1 });
    expect(r.body.summary.byCategory).toMatchObject({ pricing: 1, technical: 1 });
    expect(r.body.summary.topDifficulties[0].id).toBeDefined();
    expect(r.body.summary.weekly.length).toBeGreaterThan(0);
    expect(r.body.items[0].outcomeLabel).toBeDefined();
    const ana = r.body.items.find((i: any) => i.subject?.name === 'Ana Paciente');
    expect(ana.subject.email).toBe(u1.user.email);
    expect(ana.detail.map((x: any) => x.label)).toContain('Entender créditos e valores');
    expect(ana.context.platform).toBe('android');

    // filtros
    r = await api().get('/api/admin/feedback?category=technical').set(A);
    expect(r.body.total).toBe(1); expect(r.body.items[0].subjectType).toBe('doctor'); expect(r.body.items[0].subject.name).toBeDefined();
    r = await api().get('/api/admin/feedback?subjectType=user&outcome=done').set(A);
    expect(r.body.total).toBe(1);
    r = await api().get('/api/admin/feedback?q=créditos').set(A);
    expect(r.body.total).toBe(1);
    r = await api().get('/api/admin/feedback?trigger=report_generated').set(A);
    expect(r.body.total).toBe(1);
    r = await api().get('/api/admin/feedback?detail=slow_error').set(A);
    expect(r.body.total).toBe(1);
    r = await api().get(`/api/admin/feedback?from=${new Date(Date.now() + DAY).toISOString()}`).set(A);
    expect(r.body.total).toBe(0);

    // triagem
    r = await api().patch(`/api/admin/feedback/${ana.id}`).set(A).send({ status: 'planned', tags: ['Créditos', 'onboarding'], improvementKey: 'Explicar créditos no 402', adminNotes: 'Relacionar com o dialog 402.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'planned', tags: ['créditos', 'onboarding'], improvementKey: 'explicar-crditos-no-402' });
    expect(r.body.comment).toBe('não entendi os créditos'); // relato original intacto
    expect((await api().patch(`/api/admin/feedback/${ana.id}`).set(A).send({ status: 'nope' })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'FEEDBACK_TRIAGED', targetId: ana.id } })).toBe(1);

    r = await api().get(`/api/admin/feedback/${ana.id}`).set(A);
    expect(r.body.subject.name).toBe('Ana Paciente');
    expect(r.body.otherResponsesFromSubject).toBe(0);

    r = await api().get('/api/admin/feedback/improvements').set(A);
    expect(r.body.improvements[0]).toMatchObject({ key: 'explicar-crditos-no-402', count: 1, byStatus: { planned: 1 } });
    r = await api().get('/api/admin/feedback?improvementKey=explicar-crditos-no-402').set(A);
    expect(r.body.total).toBe(1);
  });
});
