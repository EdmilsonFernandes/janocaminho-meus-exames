import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  createUaiidVerification: vi.fn(),
  getUaiidVerification: vi.fn(),
}));
vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => ({ name: 'DRA MARIA SOUZA', specialty: null, crm: '12345-SP', uf: 'SP', situation: 'Ativo', source: 'cfm' as const })),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, mintToken } from './helpers';
import { createUaiidVerification, getUaiidVerification, UaiidError } from '../src/utils/uaiid';
import { saveSettings } from '../src/utils/settings';
import { sendEmail } from '../src/utils/mailer';
import { resetUaiidAlertThrottleForTests } from '../src/routes/doctor-verification.routes';

const alerts = () => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.subject.includes('UaiID recusou'));
const settle = () => new Promise((r) => setTimeout(r, 60));

let seq = 81000;
const crm = () => `${seq++}-SP`;
const created = { verificationId: 'v-r1', verifyUrl: 'https://uaiid.com.br/verify/ab12cd34', expiresAt: new Date('2026-10-29T12:00:00Z'), reused: false };
const post = (token: string) => api().post('/api/doctor/verification').set(authHeader(token));

describe('/api/doctor/verification (spec §3)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(createUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockReset();
  });

  it('pending → 201; declara o nome do CFM e o CPF do cadastro; médico vira in_progress', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created });
    const r = await post(token);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ verifyUrl: created.verifyUrl, status: 'in_progress' });
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'DRA MARIA SOUZA', externalReference: doctor.id, cpf: expect.any(String),
      returnUrl: 'https://drexame.janocaminho.com.br/#/doctor?kyc=1',
    }));
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: 'v-r1' } }))
      .toMatchObject({ doctorId: doctor.id, status: 'created', cfmName: 'DRA MARIA SOUZA', cfmSituation: 'Ativo' });
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('in_progress');
  });

  it('legacy → 201 e continua legacy', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-leg' });
    expect((await post(token)).body.status).toBe('legacy');
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('legacy');
  });

  it('approved → 409 ALREADY_APPROVED; needs_admin → 409 IN_REVIEW', async () => {
    const a = await createDoctor({ crm: crm() });
    expect((await post(a.token)).body.code).toBe('ALREADY_APPROVED');
    const b = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    const r = await post(b.token);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('IN_REVIEW');
  });

  it('limite de tentativas → 429; UaiID fora → 503', async () => {
    const { token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockRejectedValueOnce(new UaiidError('KYC_ATTEMPT_LIMIT', 3));
    const r = await post(token);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3 });
    vi.mocked(createUaiidVerification).mockRejectedValueOnce(new UaiidError('KYC_UNAVAILABLE'));
    expect((await post(token)).status).toBe(503);
  });

  it('sem CPF no cadastro → 400 CPF_REQUIRED', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { cpfEncrypted: null, cpfIv: null } });
    const r = await post(token);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CPF_REQUIRED');
  });

  it('bloqueado → 403 DOCTOR_BLOCKED', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true } });
    expect((await post(token)).body.code).toBe('DOCTOR_BLOCKED');
  });

  it('GET reconcilia na hora se parado há >60s', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: '1-SP', providerId: 'v-g1', status: 'collecting', cfmName: 'DRA MARIA SOUZA', cfmSituation: 'Ativo', lastSyncedAt: new Date(Date.now() - 120_000) } });
    vi.mocked(getUaiidVerification).mockResolvedValue({ id: 'v-g1', status: 'approved', reasonCode: null, score: 900, nameRatio: 1, cpfSituacao: 'REGULAR', externalReference: doctor.id, completedAt: new Date() });
    const r = await api().get('/api/doctor/verification').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('needs_admin'); // política do começo: tudo verde → fila do dono
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledWith('v-g1');
  });

  it('sem token → 401 AUTH_REQUIRED; token que não é de médico → 401 INVALID_TOKEN', async () => {
    expect((await api().post('/api/doctor/verification')).body.code).toBe('AUTH_REQUIRED');
    const r = await api().get('/api/doctor/verification').set(authHeader(mintToken('u-qualquer')));
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('INVALID_TOKEN');
  });

  it('UaiID recusa criar sessão (402 empresa suspensa) → 503 ao médico + e-mail ao dono, no máximo 1x por janela', async () => {
    resetUaiidAlertThrottleForTests();
    vi.mocked(sendEmail).mockClear();
    const { token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockRejectedValue(new UaiidError('KYC_UNAVAILABLE', undefined, 402));
    expect((await post(token)).status).toBe(503);
    await vi.waitFor(() => expect(alerts()).toHaveLength(1));
    expect(alerts()[0].html).toContain('402');
    expect((await post(token)).status).toBe(503); // 2º pedido dentro da janela: nenhum e-mail novo
    await settle();
    expect(alerts()).toHaveLength(1);
  });

  it('falha do UaiID que NÃO é de conta (5xx, rede) não alerta o dono', async () => {
    resetUaiidAlertThrottleForTests();
    vi.mocked(sendEmail).mockClear();
    const { token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockRejectedValueOnce(new UaiidError('KYC_UNAVAILABLE', undefined, 500));
    expect((await post(token)).status).toBe(503);
    vi.mocked(createUaiidVerification).mockRejectedValueOnce(new UaiidError('KYC_UNAVAILABLE'));
    expect((await post(token)).status).toBe(503);
    await settle();
    expect(alerts()).toHaveLength(0);
  });

  it('GET: captureIssue só p/ motivo de foto/documento/nome; legacyGraceUntilMs só p/ legado COM prazo', async () => {
    const a = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await prisma.doctorVerification.create({ data: { doctorId: a.doctor.id, crm: '3-SP', providerId: 'v-c1', status: 'rejected', reasonCode: 'face_mismatch', lastSyncedAt: new Date() } });
    expect((await api().get('/api/doctor/verification').set(authHeader(a.token))).body)
      .toMatchObject({ status: 'rejected', legacyGraceUntilMs: null, attempt: { reasonCode: 'face_mismatch', captureIssue: true } });

    const b = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await prisma.doctorVerification.create({ data: { doctorId: b.doctor.id, crm: '4-SP', providerId: 'v-c2', status: 'rejected', reasonCode: 'crm_inactive', lastSyncedAt: new Date() } });
    expect((await api().get('/api/doctor/verification').set(authHeader(b.token))).body.attempt).toMatchObject({ reasonCode: 'crm_inactive', captureIssue: false });

    const until = Date.now() + 30 * 86_400_000;
    await saveSettings('doctorKyc', { legacyGraceUntilMs: until, autoApprove: 0 });
    try {
      const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
      expect((await api().get('/api/doctor/verification').set(authHeader(leg.token))).body).toMatchObject({ status: 'legacy', legacyGraceUntilMs: until, attempt: null });
      const ok = await createDoctor({ crm: crm() }); // approved: prazo não se aplica
      expect((await api().get('/api/doctor/verification').set(authHeader(ok.token))).body.legacyGraceUntilMs).toBeNull();
      await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); // sem prazo
      expect((await api().get('/api/doctor/verification').set(authHeader(leg.token))).body.legacyGraceUntilMs).toBeNull();
    } finally {
      await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    }
  });

  it('GET sincronizado há pouco não chama o UaiID', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: '2-SP', providerId: 'v-g2', status: 'collecting', lastSyncedAt: new Date() } });
    const r = await api().get('/api/doctor/verification').set(authHeader(token));
    expect(r.body).toMatchObject({ status: 'in_progress', attempt: { status: 'collecting' } });
    expect(vi.mocked(getUaiidVerification)).not.toHaveBeenCalled();
  });
});
