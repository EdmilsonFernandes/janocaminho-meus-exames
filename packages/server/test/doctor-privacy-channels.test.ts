// Revisão final do KYC — C1 (dado de paciente por e-mail a médico que NÃO pode atuar) e C2 (POST /doctor-shares
// devolvia a linha inteira do médico, com passwordHash, ao paciente). Os testes do gate cobrem só ROTAS HTTP do
// médico; estes cobrem os canais FORA dele (e-mail do share, e-mail da pergunta) e o vazamento pela rota do paciente.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor, getUserCredits } from './helpers';
import { prisma } from '../src/prisma';
import { sendEmail } from '../src/utils/mailer';

const PUBLIC_KEYS = ['id', 'name', 'crm', 'crmUf', 'specialty', 'photoUrl', 'email', 'clinicName', 'clinicCity'];
let seq = 91000;
const crm = () => `${seq++}-SP`;
// Filtra pelo ASSUNTO: createDoctor cadastra pela API e isso já manda ao médico o e-mail de confirmação de cadastro.
const mailsTo = (email: string, subjectPart: string) => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.to === email && m.subject.includes(subjectPart));
const shareMails = (email: string) => mailsTo(email, 'compartilhou dados com você');
const questionMails = (email: string) => mailsTo(email, 'fez uma pergunta');

describe('C2 — POST /api/doctor-shares não vaza a linha do médico', () => {
  beforeEach(async () => { await resetDb(); });

  it('criar e reativar: o médico devolvido só tem campos públicos (nada de passwordHash, CPF, PIX, tokens, status KYC)', async () => {
    const { token } = await createUser({ credits: 100 });
    const { doctor } = await createDoctor({ crm: crm() });
    const body = { doctorCrm: doctor.crm, scopes: ['exams'] };
    const first = await api().post('/api/doctor-shares').set(authHeader(token)).send(body);
    expect(first.status).toBe(201);
    const again = await api().post('/api/doctor-shares').set(authHeader(token)).send(body); // reativa (200)
    expect(again.status).toBe(200);
    for (const r of [first, again]) {
      expect(r.body.doctor.id).toBe(doctor.id);
      expect(Object.keys(r.body.doctor).filter((k) => !PUBLIC_KEYS.includes(k))).toEqual([]);
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|cpfEncrypted|cpfHash|verificationStatus|verifiedBy|blockedReason/);
    }
  });

  it('médico criado na hora (placeholder) também sai só com campos públicos', async () => {
    const { token } = await createUser({ credits: 100 });
    const r = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorName: 'Dra Nova', doctorCrm: '77777-SP', scopes: ['exams'] });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body.doctor).filter((k) => !PUBLIC_KEYS.includes(k))).toEqual([]);
    expect(JSON.stringify(r.body)).not.toContain('pending-invite');
  });
});

describe('C1 — e-mail do share só vai a médico que pode atuar', () => {
  beforeEach(async () => { await resetDb(); vi.mocked(sendEmail).mockClear(); });

  it.each(['pending', 'in_progress', 'needs_admin', 'uaiid_review', 'rejected'])('médico %s: share é criado, mas NENHUM e-mail com o nome do paciente', async (verificationStatus) => {
    const { token } = await createUser({ credits: 100 });
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus });
    const r = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: doctor.crm, scopes: ['exams'] });
    expect(r.status).toBe(201);
    expect(r.body.notified).toBe(false);
    expect(shareMails(doctor.email)).toHaveLength(0);
  });

  it('médico bloqueado (mesmo aprovado) não recebe o aviso', async () => {
    const { token } = await createUser({ credits: 100 });
    const { doctor } = await createDoctor({ crm: crm() });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true, blockedReason: 'kyc_fraud' } });
    const r = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: doctor.crm, scopes: ['exams'] });
    expect(r.status).toBe(201);
    expect(shareMails(doctor.email)).toHaveLength(0);
  });

  it('aprovado e legado (em prazo) continuam sendo avisados', async () => {
    const { token } = await createUser({ credits: 100 });
    const ap = await createDoctor({ crm: crm() });
    const lg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    for (const d of [ap, lg]) {
      const r = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: d.doctor.crm, scopes: ['exams'] });
      expect(r.status).toBe(201);
      expect(r.body.notified).toBe(true);
      expect(shareMails(d.doctor.email)).toHaveLength(1);
    }
  });
});

describe('C1 — pergunta do paciente só chega a médico que pode atuar', () => {
  beforeEach(async () => { await resetDb(); vi.mocked(sendEmail).mockClear(); });

  async function withShare(doctorOpts: Parameters<typeof createDoctor>[0]) {
    const u = await createUser({ credits: 100 });
    const d = await createDoctor({ crm: crm(), ...doctorOpts });
    await prisma.doctorShare.create({ data: { patientId: u.patient.id, doctorId: d.doctor.id, scopes: ['exams'] } });
    return { u, d };
  }
  const ask = (token: string, doctorId: string) => api().post('/api/doctor-questions').set(authHeader(token)).send({ doctorId, subject: 'Meu colesterol subiu, é grave?' });

  it.each(['pending', 'in_progress', 'needs_admin', 'rejected'])('médico %s → 409 DOCTOR_UNAVAILABLE: nada cobrado, nada criado, nada enviado', async (verificationStatus) => {
    const { u, d } = await withShare({ verificationStatus });
    const r = await ask(u.token, d.doctor.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DOCTOR_UNAVAILABLE');
    expect(await getUserCredits(u.user.id)).toBe(100);
    expect(await prisma.doctorQuestion.count({ where: { doctorId: d.doctor.id } })).toBe(0);
    expect(questionMails(d.doctor.email)).toHaveLength(0);
  });

  it('médico bloqueado por fraude que ainda tem share ativo → 409, sem e-mail com a pergunta', async () => {
    const { u, d } = await withShare({});
    await prisma.doctor.update({ where: { id: d.doctor.id }, data: { blocked: true, blockedReason: 'kyc_fraud' } });
    const r = await ask(u.token, d.doctor.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DOCTOR_UNAVAILABLE');
    expect(await getUserCredits(u.user.id)).toBe(100);
    expect(questionMails(d.doctor.email)).toHaveLength(0);
  });

  it('controle: aprovado e legado (em prazo) recebem a pergunta e o e-mail, e os créditos são cobrados', async () => {
    for (const verificationStatus of ['approved', 'legacy']) {
      const { u, d } = await withShare({ verificationStatus });
      const r = await ask(u.token, d.doctor.id);
      expect(r.status).toBe(201);
      expect(await getUserCredits(u.user.id)).toBeLessThan(100);
      await vi.waitFor(() => expect(questionMails(d.doctor.email)).toHaveLength(1));
    }
  });
});
