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
import { api, authHeader, resetDb, createDoctor, mintToken, testCpf } from './helpers';
import { cpfFingerprint, formatCpf } from '../src/utils/cpf';
import { decryptPII } from '../src/utils/crypto';
import { createUaiidVerification, getUaiidVerification, UaiidError } from '../src/utils/uaiid';
import { saveSettings } from '../src/utils/settings';
import { sendEmail } from '../src/utils/mailer';
import { lookupCfm } from '../src/utils/cfm';
import { resetUaiidAlertThrottleForTests, resetKycOnDemandBackoffForTests } from '../src/routes/doctor-verification.routes';

const alerts = () => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.subject.includes('UaiID recusou'));
const settle = () => new Promise((r) => setTimeout(r, 60));

let seq = 81000;
const crm = () => `${seq++}-SP`;
const created = { verificationId: 'v-r1', verifyUrl: 'https://uaiid.com.br/verify/ab12cd34', expiresAt: new Date('2026-10-29T12:00:00Z'), reused: false };
const post = (token: string) => api().post('/api/doctor/verification').set(authHeader(token));

describe('/api/doctor/verification (spec §3)', () => {
  beforeEach(async () => {
    await resetDb();
    resetKycOnDemandBackoffForTests();
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

// Revisão final do KYC — I6a: a conta criada pelo convite (/api/public/doctor-invite/:token/register) nunca tem CPF e
// nenhuma rota o gravava depois: POST /verification dava 400 CPF_REQUIRED para sempre ("cadastre seu CPF no perfil",
// mas não existe esse campo). Agora o POST aceita { cpf } quando o médico ainda não tem CPF.
describe('POST /api/doctor/verification com { cpf } — médico sem CPF (conta do convite)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(createUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockReset();
  });

  /** Médico no estado em que o convite o deixa: sem nenhum dado de CPF. */
  async function semCpf(opts: { emailVerified?: boolean } = {}) {
    const d = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    await prisma.doctor.update({
      where: { id: d.doctor.id },
      data: { cpfEncrypted: null, cpfIv: null, cpfHash: null, cpfLast4: null, identityLockedAt: null, emailVerified: opts.emailVerified ?? true },
    });
    return d;
  }
  const row = (id: string) => prisma.doctor.findUniqueOrThrow({ where: { id } });

  it('sem CPF + cpf válido → 201; guarda CRIPTOGRAFADO (nada em claro), trava a identidade e abre a sessão com ESSE CPF', async () => {
    const { doctor, token } = await semCpf();
    const cpf = testCpf();
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-cpf1' });
    const r = await post(token).send({ cpf: formatCpf(cpf) }); // com máscara: encryptedCpfData normaliza
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ verifyUrl: created.verifyUrl, status: 'in_progress' });
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledWith(expect.objectContaining({ cpf }));

    const saved = await row(doctor.id);
    expect(saved.cpfEncrypted).toBeTruthy();
    expect(saved.cpfEncrypted).not.toContain(cpf); // criptografado, nunca em claro
    expect(JSON.stringify(saved)).not.toContain(cpf);
    expect(decryptPII(saved.cpfEncrypted, saved.cpfIv)).toBe(cpf);
    expect(saved.cpfHash).toBe(cpfFingerprint(cpf));
    expect(saved.cpfLast4).toBe(cpf.slice(-4));
    expect(saved.identityLockedAt).not.toBeNull(); // e-mail já verificado: espelha o registro
    expect(JSON.stringify(r.body)).not.toContain(cpf); // nunca devolve o CPF
    expect(saved.verificationStatus).toBe('in_progress');
  });

  it('e-mail ainda NÃO verificado → grava o CPF, mas não trava a identidade (o /verify-email trava depois)', async () => {
    const { doctor, token } = await semCpf({ emailVerified: false });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-cpf2' });
    expect((await post(token).send({ cpf: testCpf() })).status).toBe(201);
    const saved = await row(doctor.id);
    expect(saved.cpfHash).toBeTruthy();
    expect(saved.identityLockedAt).toBeNull();
  });

  it('cpf inválido → 400 CPF_INVALID; nada gravado e o UaiID nem é chamado', async () => {
    const { doctor, token } = await semCpf();
    for (const cpf of ['111.111.111-11', '123', 'abc', '123.456.789-00']) { // repetido, curto, sem dígitos, dígito verificador errado
      const r = await post(token).send({ cpf });
      expect(r.status, `cpf=${cpf}`).toBe(400);
      expect(r.body.code).toBe('CPF_INVALID');
    }
    expect(vi.mocked(createUaiidVerification)).not.toHaveBeenCalled();
    const saved = await row(doctor.id);
    expect(saved).toMatchObject({ cpfEncrypted: null, cpfHash: null, cpfLast4: null });
  });

  it('CPF de OUTRO médico → 409 CPF_IN_USE; nada gravado, UaiID não chamado', async () => {
    const dono = testCpf();
    await createDoctor({ crm: crm(), cpf: dono });
    const { doctor, token } = await semCpf();
    const r = await post(token).send({ cpf: dono });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'CPF_IN_USE', error: 'Este CPF já está cadastrado em outra conta. Fale com o suporte.' });
    expect(vi.mocked(createUaiidVerification)).not.toHaveBeenCalled();
    expect(await row(doctor.id)).toMatchObject({ cpfEncrypted: null, cpfHash: null });
  });

  it('sem CPF em lugar nenhum (corpo vazio ou cpf em branco) → 400 CPF_REQUIRED', async () => {
    const { token } = await semCpf();
    for (const body of [{}, { cpf: '' }, { cpf: '   ' }, { cpf: null }]) {
      const r = await post(token).send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.code).toBe('CPF_REQUIRED');
    }
    expect(vi.mocked(createUaiidVerification)).not.toHaveBeenCalled();
  });

  it('médico que JÁ tem CPF ignora body.cpf (válido ou não): sessão com o CPF dele e banco intacto', async () => {
    const meu = testCpf();
    const { doctor, token } = await createDoctor({ crm: crm(), cpf: meu, verificationStatus: 'pending' });
    const antes = await row(doctor.id);
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-cpf3' });
    const r = await post(token).send({ cpf: testCpf() });
    expect(r.status).toBe(201);
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledWith(expect.objectContaining({ cpf: meu }));
    const depois = await row(doctor.id);
    expect(depois.cpfHash).toBe(antes.cpfHash);
    expect(depois.cpfEncrypted).toBe(antes.cpfEncrypted);
    expect(depois.cpfLast4).toBe(antes.cpfLast4);

    vi.mocked(createUaiidVerification).mockClear();
    await prisma.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: 'rejected' } }); // pode tentar de novo
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-cpf4' });
    expect((await post(token).send({ cpf: 'lixo' })).status).toBe(201); // inválido também é ignorado (não vira CPF_INVALID)
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledWith(expect.objectContaining({ cpf: meu }));
  });
});

// Revisão final do KYC — M3/M7/M8 (e a tentativa SEGURADA, addendum do controlador).
describe('GET /api/doctor/verification — UaiID fora do ar não vira chamada bloqueante a cada consulta (M3)', () => {
  beforeEach(async () => {
    await resetDb();
    resetKycOnDemandBackoffForTests();
    vi.mocked(createUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockReset();
  });
  const get = (token: string) => api().get('/api/doctor/verification').set(authHeader(token));
  const stale = (doctorId: string, providerId: string, extra: Record<string, unknown> = {}) => prisma.doctorVerification.create({
    data: { doctorId, crm: '5-SP', providerId, status: 'collecting', cfmName: 'DRA MARIA SOUZA', cfmSituation: 'Ativo', lastSyncedAt: new Date(Date.now() - 120_000), ...extra } as any,
  });

  it('on-demand que falhou (UaiID fora) não se repete por 60 s por providerId; passado esse tempo tenta de novo', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await stale(doctor.id, 'v-m3');
    vi.mocked(getUaiidVerification).mockResolvedValue(null); // UaiID fora

    const first = await get(token);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'in_progress', attempt: { status: 'collecting' } }); // segue respondendo com o último estado
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) expect((await get(token)).status).toBe(200); // o portal consulta a cada ~5 s
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(1); // nenhuma nova chamada bloqueante ao UaiID

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 61_000)); // passou a janela de 60 s
      expect((await get(token)).status).toBe(200);
    } finally { vi.useRealTimers(); }
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(2);
  });

  it('a falha de um providerId não segura o on-demand de outro médico', async () => {
    const a = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    const b = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await stale(a.doctor.id, 'v-m3-a');
    await stale(b.doctor.id, 'v-m3-b');
    vi.mocked(getUaiidVerification).mockResolvedValue(null);
    await get(a.token);
    await get(a.token);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(1);
    await get(b.token);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenLastCalledWith('v-m3-b');
  });

  // Addendum: tentativa SEGURADA = final no UaiID (approved/rejected) mas sem decisão gravada (identidade OK, esperando o
  // nome do documento que só o webhook traz). A espera tem prazo (10 min após a conclusão); o GET reconcilia na hora em
  // vez de esperar o job.
  it('tentativa SEGURADA parada há >60 s: o GET reconcilia na hora; com a espera vencida (>10 min) o médico vai p/ needs_admin', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    const concluida = new Date(Date.now() - 11 * 60_000);
    await stale(doctor.id, 'v-held', { status: 'approved', decision: null, completedAt: concluida });
    vi.mocked(getUaiidVerification).mockResolvedValue({ id: 'v-held', status: 'approved', reasonCode: null, score: 900, nameRatio: null, cpfSituacao: 'REGULAR', externalReference: doctor.id, completedAt: concluida });
    const r = await get(token);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledWith('v-held');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('needs_admin'); // espera vencida => o caso vai ao dono
    expect(r.body.attempt).toMatchObject({ status: 'approved', reasonCode: 'document_name_unavailable' });
    expect(JSON.stringify(r.body)).not.toContain('decision'); // a decisão interna não vaza
    expect((await prisma.doctorVerification.findUniqueOrThrow({ where: { providerId: 'v-held' } })).decision).toBe('needs_admin');
  });

  it('tentativa SEGURADA com a espera ainda fresca: reconcilia, mas segue in_progress; tentativa final JÁ decidida não é reconciliada', async () => {
    const a = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    const fresca = new Date(Date.now() - 60_000);
    await stale(a.doctor.id, 'v-held2', { status: 'approved', decision: null, completedAt: fresca });
    vi.mocked(getUaiidVerification).mockResolvedValue({ id: 'v-held2', status: 'approved', reasonCode: null, score: 900, nameRatio: null, cpfSituacao: 'REGULAR', externalReference: a.doctor.id, completedAt: fresca });
    const r = await get(a.token);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(1);
    expect(r.body.status).toBe('in_progress'); // ainda segurando o nome do documento
    expect((await prisma.doctorVerification.findUniqueOrThrow({ where: { providerId: 'v-held2' } })).decision).toBeNull();

    const b = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await stale(b.doctor.id, 'v-decided', { status: 'approved', decision: 'needs_admin', completedAt: new Date(Date.now() - 3_600_000) });
    vi.mocked(getUaiidVerification).mockClear();
    expect((await get(b.token)).status).toBe(200);
    expect(vi.mocked(getUaiidVerification)).not.toHaveBeenCalled(); // decisão gravada: nada a reconciliar
  });
});

describe('POST /api/doctor/verification — M7 (sem sessão paralela) e M8 (snapshot do CFM com idade máxima)', () => {
  beforeEach(async () => {
    await resetDb();
    resetKycOnDemandBackoffForTests();
    vi.mocked(createUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockReset();
  });
  const attempt = (doctorId: string, providerId: string, status: string, extra: Record<string, unknown> = {}) => prisma.doctorVerification.create({
    data: { doctorId, crm: '5-SP', providerId, status, lastSyncedAt: new Date(), ...extra } as any,
  });

  it.each(['processing', 'manual_review'])('última tentativa %s → 409 IN_REVIEW com o status do médico; nada é criado no UaiID', async (status) => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await attempt(doctor.id, `v-m7-${status}`, status);
    const r = await post(token);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'IN_REVIEW', status: 'in_progress' });
    expect(vi.mocked(createUaiidVerification)).not.toHaveBeenCalled();
    expect(await prisma.doctorVerification.count({ where: { doctorId: doctor.id } })).toBe(1);
  });

  it('só a ÚLTIMA tentativa conta, e captura em andamento (collecting) ainda deixa reabrir/reaproveitar a sessão', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await attempt(doctor.id, 'v-old', 'processing', { createdAt: new Date(Date.now() - 3 * 3_600_000) }); // antiga, já superada
    await attempt(doctor.id, 'v-new', 'collecting', { createdAt: new Date(Date.now() - 60_000) });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-new', reused: true });
    expect((await post(token)).status).toBe(201);
  });

  it('M8: snapshot do CFM com ≤30 dias é reaproveitado (sem gastar o consultaCRM); com >30 dias refaz o lookup', async () => {
    const recent = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await attempt(recent.doctor.id, 'v-snap-new', 'rejected', { cfmName: 'NOME DE 10 DIAS', cfmSituation: 'Ativo', createdAt: new Date(Date.now() - 10 * 86_400_000) });
    vi.mocked(lookupCfm).mockClear();
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-m8-a' });
    expect((await post(recent.token)).status).toBe(201);
    expect(vi.mocked(lookupCfm)).not.toHaveBeenCalled();
    expect(vi.mocked(createUaiidVerification)).toHaveBeenLastCalledWith(expect.objectContaining({ fullName: 'NOME DE 10 DIAS' }));

    const old = await createDoctor({ crm: crm(), verificationStatus: 'rejected' });
    await attempt(old.doctor.id, 'v-snap-old', 'rejected', { cfmName: 'NOME DE 40 DIAS', cfmSituation: 'Ativo', createdAt: new Date(Date.now() - 40 * 86_400_000) });
    vi.mocked(lookupCfm).mockClear();
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-m8-b' });
    expect((await post(old.token)).status).toBe(201);
    expect(vi.mocked(lookupCfm)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createUaiidVerification)).toHaveBeenLastCalledWith(expect.objectContaining({ fullName: 'DRA MARIA SOUZA' })); // o CFM de hoje
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: 'v-m8-b' } })).toMatchObject({ cfmName: 'DRA MARIA SOUZA', cfmSituation: 'Ativo' });
  });
});
