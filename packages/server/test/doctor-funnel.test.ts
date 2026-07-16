import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor, testCpf } from './helpers';
import { prisma } from '../src/prisma';
import { consumePatientInvite } from '../src/utils/patient-invite';

const SCOPES = ['exams', 'evolution', 'alerts', 'summary'];
let _n = 0;
// createDoctor valida email (z.string().email); o helper default gera domínio inválido.
const dmail = () => `doc${++_n}@${Date.now()}.com`;

describe('funil do médico: convite + aceite + gate + Atendi', () => {
  beforeEach(async () => { await resetDb(); });

  it('médico cria convite, lista e o lookup público retorna os dados', async () => {
    const { doctor, token } = await createDoctor({ crm: '11111-SP', email: dmail() });
    const r = await api().post('/api/doctor/invites').set(authHeader(token))
      .send({ patientName: 'Paciente Convite', phone: '11988887777' });
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    expect(r.body.link).toContain('/#/convite/');
    expect(r.body.doctorName).toBe(doctor.name);

    const list = await api().get('/api/doctor/invites').set(authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].patientName).toBe('Paciente Convite');
    expect(list.body.items[0].status).toBe('pending');

    const pub = await api().get(`/api/doctor/invites/by-token/${r.body.token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.doctorName).toBe(doctor.name);
    expect(pub.body.patientName).toBe('Paciente Convite');
    expect(pub.body.expired).toBe(false);
  });

  it('convite sem nome ou sem contato → 400', async () => {
    const { token } = await createDoctor({ crm: '22222-SP', email: dmail() });
    expect((await api().post('/api/doctor/invites').set(authHeader(token)).send({ phone: '119' })).status).toBe(400);
    expect((await api().post('/api/doctor/invites').set(authHeader(token)).send({ patientName: 'Sem Contato' })).status).toBe(400);
  });

  it('aceite do convite ativa o share (pré-autorizado) e marca aceito; token é single-use', async () => {
    const { doctor } = await createDoctor({ crm: '33333-SP', email: dmail() });
    const inv = await prisma.patientInvite.create({ data: { doctorId: doctor.id, patientName: 'Novo Paciente', phone: '119', token: 'tok-aceite', scopes: SCOPES, expiresAt: new Date(Date.now() + 86400_000) } });
    const { user, patient } = await createUser({ name: 'Novo Paciente' });

    expect(await consumePatientInvite('tok-aceite', user.id, patient.id)).toBe(true);
    const share = await prisma.doctorShare.findUnique({ where: { patientId_doctorId: { patientId: patient.id, doctorId: doctor.id } } });
    expect(share?.active).toBe(true);
    expect(share?.scopes).toEqual(SCOPES);
    const after = await prisma.patientInvite.findUnique({ where: { id: inv.id } });
    expect(after?.status).toBe('accepted');
    expect(after?.acceptedUserId).toBe(user.id);

    // single-use: segunda tentativa c/ o mesmo token não refaz
    expect(await consumePatientInvite('tok-aceite', user.id, patient.id)).toBe(false);
  });

  it('gate: bloqueia a 6ª pergunta em aberto (limite 5) com 409 sem cobrar', async () => {
    const { doctor } = await createDoctor({ crm: '44444-SP', email: dmail() });
    const { patient, token } = await createUser({ credits: 100 });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.id, scopes: SCOPES, active: true, openQuestionLimit: 5 } });
    const post = (n: number) => api().post('/api/doctor-questions').set(authHeader(token))
      .send({ patientId: patient.id, doctorId: doctor.id, subject: `Pergunta ${n}`, body: `Pergunta ${n}` });
    for (let i = 1; i <= 5; i++) expect((await post(i)).status).toBe(201);
    const sixth = await post(6);
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toBe('question_limit');
  });

  it('register com inviteToken ativa o share pelo endpoint real (validate não stripa o token)', async () => {
    const { doctor } = await createDoctor({ crm: '66666-SP', email: dmail() });
    await prisma.patientInvite.create({ data: { doctorId: doctor.id, patientName: 'Via Register', phone: '119', token: 'tok-reg', scopes: SCOPES, expiresAt: new Date(Date.now() + 86400_000) } });
    const r = await api().post('/api/auth/register')
      .send({ name: 'Via Register', cpf: testCpf(7001), email: `vr${Date.now()}@test.com`, password: 'senha123', inviteToken: 'tok-reg' });
    expect(r.status).toBe(201);
    // O share é ativado JÁ no registro (mesmo antes de verificar o e-mail) — prova que o
    // inviteToken sobreviveu ao validate (Zod) e chegou ao consumePatientInvite.
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: doctor.id }, include: { patient: { select: { ownerId: true } } } });
    expect(share?.active).toBe(true);
    expect(await prisma.patientInvite.findUnique({ where: { token: 'tok-reg' } })).toMatchObject({ status: 'accepted' });
  });

  it('Atendi: registra consulta e soma +1 ao limite de perguntas em aberto', async () => {
    const { doctor, token } = await createDoctor({ crm: '55555-SP', email: dmail() });
    const { patient } = await createUser({ credits: 100 });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.id, scopes: SCOPES, active: true, openQuestionLimit: 5 } });
    const r = await api().post(`/api/doctor/patients/${patient.id}/consultation`).set(authHeader(token)).send({});
    expect(r.status).toBe(201);
    const share = await prisma.doctorShare.findUnique({ where: { patientId_doctorId: { patientId: patient.id, doctorId: doctor.id } } });
    expect(share?.openQuestionLimit).toBe(6);
    expect(await prisma.consultation.count({ where: { patientId: patient.id, doctorId: doctor.id } })).toBe(1);
  });

  it('dedup: bloqueia reenviar pergunta idêntica em aberto (409 question_duplicate); pergunta diferente passa', async () => {
    const { doctor } = await createDoctor({ crm: '77777-SP', email: dmail() });
    const { patient, token } = await createUser({ credits: 100 });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.id, scopes: SCOPES, active: true, openQuestionLimit: 5 } });
    const body = { patientId: patient.id, doctorId: doctor.id, subject: 'Mesma pergunta', body: 'Conteúdo idêntico da pergunta ao médico' };
    expect((await api().post('/api/doctor-questions').set(authHeader(token)).send(body)).status).toBe(201);
    const dup = await api().post('/api/doctor-questions').set(authHeader(token)).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('question_duplicate');
    // Conteúdo DIFERENTE não é dup; gate (1 em aberto < 5) libera.
    const other = await api().post('/api/doctor-questions').set(authHeader(token)).send({ ...body, subject: 'Outra pergunta', body: 'Conteúdo diferente' });
    expect(other.status).toBe(201);
  });

  it('doctor-shares expõe a cota (openQuestions + questionLimit) pra o app desabilitar o envio no limite', async () => {
    const { doctor } = await createDoctor({ crm: '88888-SP', email: dmail() });
    const { patient, token } = await createUser({ credits: 100 });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.id, scopes: SCOPES, active: true, openQuestionLimit: 5 } });
    for (let i = 0; i < 2; i++) await api().post('/api/doctor-questions').set(authHeader(token)).send({ patientId: patient.id, doctorId: doctor.id, subject: `P${i}`, body: `Pergunta diferente ${i}` });
    const r = await api().get('/api/doctor-shares').set(authHeader(token));
    expect(r.status).toBe(200);
    const sh = r.body.items.find((x: any) => x.doctorId === doctor.id);
    expect(sh.openQuestions).toBe(2);
    expect(sh.questionLimit).toBe(5);
  });
});
