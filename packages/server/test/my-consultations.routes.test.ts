import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam } from './helpers';
import { prisma } from '../src/prisma';

// §2 "Minhas consultas" (28/10/26): registro PARTICULAR do paciente — não é agendamento
// no consultório. Contratos: posse de exames validada; convênio exige operadora;
// lembrete reaproveita Reminder; isolamento entre contas; status sync.

const FUTURE = new Date(Date.now() + 3 * 86400_000).toISOString();

describe('my-consultations: registro do paciente (§2)', () => {
  beforeEach(async () => { await resetDb(); });

  it('registra consulta completa: lembrete (type consulta) + convênio patient_reported', async () => {
    const { user, patient, token } = await createUser({});
    const exam = await createExam(patient.id);
    const doctor = await prisma.doctor.create({
      data: { name: 'Dra Helena', crm: '77777-SP', specialty: 'Endocrinologista', email: 'hel@invite.com', passwordHash: 'pending-invite' },
    });

    const r = await api().post('/api/my-consultations').set(authHeader(token)).send({
      doctorId: doctor.id,
      scheduledAt: FUTURE,
      mode: 'presencial',
      placeName: 'Clínica Vida',
      address: 'Av. Principal 100, SJC',
      paymentType: 'convenio',
      insuranceOperator: 'Unimed',
      insurancePlan: 'Nacional',
      priceCents: 15000,
      reason: 'Retorno exame de tireoide',
      privateNotes: 'Levar PDF do ultrassom',
      examIds: [exam.id],
    });
    expect(r.status).toBe(201);
    const item = r.body.item;

    // snapshot denormalizado (Doctor pending é deletável → consulta sobrevive)
    expect(item.doctorName).toBe('Dra Helena');
    expect(item.specialty).toBe('Endocrinologista');
    expect(item.linkUrl ?? null).toBeNull();

    // lembrete nasceu (infra de push existente, type='consulta')
    expect(item.reminderId).toBeTruthy();
    const reminder = await prisma.reminder.findUnique({ where: { id: item.reminderId } });
    expect(reminder?.type).toBe('consulta');
    expect(reminder?.dueDate.toISOString()).toBe(FUTURE);

    // §5: convênio registrado com provenance "informado pelo paciente"
    const ins = await prisma.doctorInsurance.findFirst({ where: { doctorId: doctor.id } });
    expect(ins?.operator).toBe('Unimed');
    expect(ins?.verificationStatus).toBe('patient_reported');
    expect(ins?.source).toBe(`patient:${patient.id}`);

    // exames selecionados gravados
    const row = await prisma.patientConsultation.findUnique({ where: { id: item.id } });
    expect(row?.examIds).toEqual([exam.id]);
    expect(row?.ownerId).toBe(user.id);
  });

  it('consulta no PASSADO não gera lembrete (histórico é registro, não alerta)', async () => {
    const { token } = await createUser({});
    const r = await api().post('/api/my-consultations').set(authHeader(token)).send({
      doctorName: 'Dr Passado', scheduledAt: new Date(Date.now() - 86400_000).toISOString(),
      status: 'completed',
    });
    expect(r.status).toBe(201);
    expect(r.body.item.reminderId ?? null).toBeNull();
    expect(await prisma.reminder.count()).toBe(0);
  });

  it('convênio sem operadora → 400; link de teleconsulta inválido → 400', async () => {
    const { token } = await createUser({});
    const semOperadora = await api().post('/api/my-consultations').set(authHeader(token))
      .send({ doctorName: 'Dr X', scheduledAt: FUTURE, paymentType: 'convenio' });
    expect(semOperadora.status).toBe(400);

    const linkRuim = await api().post('/api/my-consultations').set(authHeader(token))
      .send({ doctorName: 'Dr X', scheduledAt: FUTURE, mode: 'teleconsulta', linkUrl: 'javascript:alert(1)' });
    expect(linkRuim.status).toBe(400);
  });

  it('rejeita exame de OUTRO paciente (isolamento §9)', async () => {
    const a = await createUser({});
    const examDeA = await createExam(a.patient.id);
    const b = await createUser({});
    const r = await api().post('/api/my-consultations').set(authHeader(b.token))
      .send({ doctorName: 'Dr Roubo', scheduledAt: FUTURE, examIds: [examDeA.id] });
    expect(r.status).toBe(400);
  });

  it('PATCH: cancelar marca o lembrete done; mudar data move o dueDate', async () => {
    const { token } = await createUser({});
    const created = await api().post('/api/my-consultations').set(authHeader(token))
      .send({ doctorName: 'Dra Agenda', scheduledAt: FUTURE });
    const id = created.body.item.id;
    const reminderId = created.body.item.reminderId;

    const novaData = new Date(Date.now() + 5 * 86400_000).toISOString();
    await api().patch(`/api/my-consultations/${id}`).set(authHeader(token)).send({ scheduledAt: novaData });
    expect((await prisma.reminder.findUnique({ where: { id: reminderId } }))!.dueDate.toISOString()).toBe(novaData);

    await api().patch(`/api/my-consultations/${id}`).set(authHeader(token)).send({ status: 'cancelled' });
    expect((await prisma.reminder.findUnique({ where: { id: reminderId } }))!.done).toBe(true);
    expect((await prisma.patientConsultation.findUnique({ where: { id } }))!.status).toBe('cancelled');
  });

  it('conta B não edita nem exclui consulta da conta A (404)', async () => {
    const a = await createUser({});
    const created = await api().post('/api/my-consultations').set(authHeader(a.token))
      .send({ doctorName: 'Dr Alheio', scheduledAt: FUTURE });
    const b = await createUser({});
    expect((await api().patch(`/api/my-consultations/${created.body.item.id}`).set(authHeader(b.token)).send({ status: 'completed' })).status).toBe(404);
    expect((await api().delete(`/api/my-consultations/${created.body.item.id}`).set(authHeader(b.token))).status).toBe(404);
    expect(await prisma.patientConsultation.count()).toBe(1);
  });
});
