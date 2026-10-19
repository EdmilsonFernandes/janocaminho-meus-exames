// E2E (supertest) — F3 Telemedicina premium, backend1 (be1): pedidos de exame do médico.
// Contrato: docs/research/2026-10-20-f3-arquitetura.md §3e/3f/3g/§7.
// Sem rede: doctor/share/exam criados direto no prisma (sendPushToUser sem Firebase só
// grava a Notification in-app).
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, createExam, resetDb, authHeader } from './helpers';

/** Cria Reminder type=teleconsulta direto no banco (mesma factory do teleconsulta-livekit). */
async function createTeleconsulta(ownerId: string, patientId: string) {
  return prisma.reminder.create({
    data: {
      ownerId, patientId, title: 'Teleconsulta',
      dueDate: new Date(Date.now() + 24 * 3600_000),
      type: 'teleconsulta', notifyOffsetsMin: [1440, 60, 0],
      provider: 'livekit', roomName: 'teleconsulta-er1',
    },
    select: { id: true, patientId: true },
  });
}

let crmSeq = 91000;
const uniqCrm = () => `${crmSeq++}-SP`;

/** Setup completo: paciente + médico + share ATIVO (examIds opcional) + token do owner. */
async function setupShare(opts: { examIds?: string[] } = {}) {
  const { user, patient, token } = await createUser();
  const doc = await createDoctor({ crm: uniqCrm(), email: `doc-er${crmSeq}@test.com` });
  const share = await prisma.doctorShare.create({
    data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'], examIds: opts.examIds ?? [] },
    select: { id: true, examIds: true },
  });
  return { user, patient, token, doc, share };
}

describe('POST /api/teleconsulta/:id/exam-request (§3e — dentro da chamada)', () => {
  beforeEach(resetDb);

  it('médico com share cria pedido pending + notifica paciente (in-app info) + audit AWAIT', async () => {
    const { user, patient, doc } = await setupShare();
    const r = await createTeleconsulta(user.id, patient.id);

    const res = await api().post(`/api/teleconsulta/${r.id}/exam-request`)
      .set(authHeader(doc.token)).send({ title: 'Hemoglobina glicada', note: 'Jejum de 12h' });
    expect(res.status).toBe(201);
    expect(res.body.examRequest).toMatchObject({
      status: 'pending', patientId: patient.id, doctorId: doc.doctor.id, reminderId: r.id, title: 'Hemoglobina glicada',
    });

    // Notificação in-app AWAIT (sendPushToUser persiste antes do 201 — família void extinta).
    const notif = await prisma.notification.findFirst({
      where: { userId: user.id, title: 'Pedido do médico', body: 'Hemoglobina glicada' },
    });
    expect(notif).not.toBeNull();
    expect((notif?.data as any)?.examRequestId).toBe(res.body.examRequest.id);
    expect((notif?.data as any)?.reminderId).toBe(r.id);

    const log = await prisma.auditLog.findFirst({ where: { action: 'EXAM_REQUEST_CREATE', targetId: res.body.examRequest.id } });
    expect(log?.actorType).toBe('DOCTOR');
  });

  it('médico SEM share → 403; título >120 → 400; sem auth → 401; existingExamId alheio → 404', async () => {
    const base = await setupShare();
    const r = await createTeleconsulta(base.user.id, base.patient.id);
    const stranger = await createDoctor({ crm: uniqCrm(), email: `doc-er2${crmSeq}@test.com` });
    const forbidden = await api().post(`/api/teleconsulta/${r.id}/exam-request`).set(authHeader(stranger.token)).send({ title: 'X' });
    expect(forbidden.status).toBe(403);

    const long = await api().post(`/api/teleconsulta/${r.id}/exam-request`).set(authHeader(base.doc.token)).send({ title: 'a'.repeat(121) });
    expect(long.status).toBe(400);

    const noAuth = await api().post(`/api/teleconsulta/${r.id}/exam-request`).send({ title: 'X' });
    expect(noAuth.status).toBe(401);

    const other = await createUser();
    const otherExam = await createExam(other.patient.id, { sha: 'sha-er-x' });
    const foreign = await api().post(`/api/teleconsulta/${r.id}/exam-request`).set(authHeader(base.doc.token)).send({ title: 'Exame alheio', existingExamId: otherExam.id });
    expect(foreign.status).toBe(404);
  });

  it('gêmea fora de chamada: POST /api/exam-requests com patientId → 201 reminderId null', async () => {
    const { patient, doc } = await setupShare();
    const res = await api().post('/api/exam-requests')
      .set(authHeader(doc.token)).send({ patientId: patient.id, title: 'Ultrassom tireoide' });
    expect(res.status).toBe(201);
    expect(res.body.examRequest).toMatchObject({ status: 'pending', reminderId: null, patientId: patient.id });
  });
});

describe('PATCH /api/exam-requests/:id (§3f — resposta do paciente)', () => {
  beforeEach(resetDb);

  it('authorize estende recorte NÃO-VAZIO do share', async () => {
    const base = await setupShare();
    const first = await createExam(base.patient.id, { sha: 'sha-er-a' });
    const second = await createExam(base.patient.id, { sha: 'sha-er-b' });
    await prisma.doctorShare.update({ where: { id: base.share.id }, data: { examIds: [first.id] } });

    const er = await prisma.examRequest.create({
      data: { patientId: base.patient.id, doctorId: base.doc.doctor.id, title: 'Ver exame', existingExamId: second.id },
    });
    const res = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(base.token)).send({ action: 'authorize' });
    expect(res.status).toBe(200);
    expect(res.body.examRequest.status).toBe('authorized');
    expect(res.body.examRequest.respondedAt).not.toBeNull();

    const after = await prisma.doctorShare.findUnique({ where: { id: base.share.id }, select: { examIds: true } });
    expect(after?.examIds).toEqual([first.id, second.id]);

    const log = await prisma.auditLog.findFirst({ where: { action: 'EXAM_REQUEST_RESPOND', targetId: er.id } });
    expect(log?.actorType).toBe('USER');
    expect(log?.after).toMatchObject({ action: 'authorize', status: 'authorized' });
  });

  it('authorize com examIds VAZIO = no-op (D6: vazio = TODOS, push restringiria)', async () => {
    const { patient, token, doc, share } = await setupShare();
    const exam = await createExam(patient.id, { sha: 'sha-er-c' });
    const er = await prisma.examRequest.create({
      data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Ver tudo', existingExamId: exam.id },
    });
    const res = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token)).send({ action: 'authorize' });
    expect(res.status).toBe(200);
    const after = await prisma.doctorShare.findUnique({ where: { id: share.id }, select: { examIds: true } });
    expect(after?.examIds).toEqual([]); // continua vazio = TODOS
  });

  it('authorize: sem existingExamId → 400; exame de outro paciente → 404; share revogado → 409 SHARE_INACTIVE', async () => {
    const { patient, token, doc } = await setupShare();
    const erNoExam = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Sem exame' } });
    const noExam = await api().patch(`/api/exam-requests/${erNoExam.id}`).set(authHeader(token)).send({ action: 'authorize' });
    expect(noExam.status).toBe(400);

    const other = await createUser();
    const otherExam = await createExam(other.patient.id, { sha: 'sha-er-d' });
    const erForeign = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Exame alheio' } });
    const foreign = await api().patch(`/api/exam-requests/${erForeign.id}`).set(authHeader(token)).send({ action: 'authorize', existingExamId: otherExam.id });
    expect(foreign.status).toBe(404);

    const exam = await createExam(patient.id, { sha: 'sha-er-e' });
    await prisma.doctorShare.update({ where: { patientId_doctorId: { patientId: patient.id, doctorId: doc.doctor.id } }, data: { active: false } });
    const erRevoked = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Revogado', existingExamId: exam.id } });
    const revoked = await api().patch(`/api/exam-requests/${erRevoked.id}`).set(authHeader(token)).send({ action: 'authorize' });
    expect(revoked.status).toBe(409);
    expect(revoked.body.code).toBe('SHARE_INACTIVE');
  });

  it('schedule com dueDate futura cria Reminder type=exame (médico como criador)', async () => {
    const { user, patient, token, doc } = await setupShare();
    const er = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Glicemia' } });
    const due = new Date(Date.now() + 7 * 86400000);
    const res = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token))
      .send({ action: 'schedule', dueDate: due.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.examRequest.status).toBe('scheduled');

    const reminder = await prisma.reminder.findFirst({ where: { patientId: patient.id, type: 'exame', title: 'Exame: Glicemia' } });
    expect(reminder).not.toBeNull();
    expect(reminder?.ownerId).toBe(user.id);
    expect(reminder?.createdByDoctorId).toBe(doc.doctor.id);
    expect(new Date(reminder!.dueDate).toISOString()).toBe(due.toISOString());
  });

  it('schedule sem dueDate → default ~30d às 09:00; dueDate no passado → 400', async () => {
    const { patient, token, doc } = await setupShare();
    const er = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Colesterol' } });
    const past = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token))
      .send({ action: 'schedule', dueDate: new Date(Date.now() - 86400000).toISOString() });
    expect(past.status).toBe(400);

    const res = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token)).send({ action: 'schedule' });
    expect(res.status).toBe(200);
    const reminder = await prisma.reminder.findFirst({ where: { patientId: patient.id, type: 'exame' } });
    expect(reminder).not.toBeNull();
    const diffDays = (new Date(reminder!.dueDate).getTime() - Date.now()) / 86400000;
    expect(diffDays).toBeGreaterThan(28);
    expect(diffDays).toBeLessThan(31);
    expect(new Date(reminder!.dueDate).getHours()).toBe(9);
  });

  it('deny → denied + respondedAt + audit', async () => {
    const { patient, token, doc } = await setupShare();
    const er = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Negar' } });
    const res = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token)).send({ action: 'deny' });
    expect(res.status).toBe(200);
    expect(res.body.examRequest).toMatchObject({ status: 'denied' });
    expect(res.body.examRequest.respondedAt).not.toBeNull();
    const log = await prisma.auditLog.findFirst({ where: { action: 'EXAM_REQUEST_RESPOND', targetId: er.id } });
    expect(log?.after).toMatchObject({ action: 'deny', status: 'denied' });
  });

  it('paciente ALHEIO → 403; token de médico no PATCH → 401 (resposta é do titular)', async () => {
    const { patient, doc } = await setupShare();
    const er = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Cruzado' } });
    const other = await createUser();
    const crossed = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(other.token)).send({ action: 'deny' });
    expect(crossed.status).toBe(403);
    const asDoc = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(doc.token)).send({ action: 'deny' });
    expect(asDoc.status).toBe(401);
  });

  it('re-respond após respondido → 409', async () => {
    const { patient, token, doc } = await setupShare();
    const er = await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: '2x' } });
    const first = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token)).send({ action: 'deny' });
    expect(first.status).toBe(200);
    const second = await api().patch(`/api/exam-requests/${er.id}`).set(authHeader(token)).send({ action: 'deny' });
    expect(second.status).toBe(409);
  });
});

describe('GET /api/exam-requests (§3g — role-aware)', () => {
  beforeEach(resetDb);

  it('paciente vê pendentes+histórico dos SEUS pacientes; médico vê só os dele (?patientId filtra)', async () => {
    const { user, patient, token, doc } = await setupShare();
    const dep = await prisma.patient.create({ data: { ownerId: user.id, fullName: 'Filha', relationship: 'Filha' } });
    await prisma.examRequest.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, title: 'Titular' } });
    const done = await prisma.examRequest.create({
      data: { patientId: dep.id, doctorId: doc.doctor.id, title: 'Dependente', status: 'denied', respondedAt: new Date() },
    });

    const asPatient = await api().get('/api/exam-requests').set(authHeader(token));
    expect(asPatient.status).toBe(200);
    expect(asPatient.body.items.map((i: any) => i.title)).toEqual(['Titular', 'Dependente']);

    // Outro médico não vaza; o médico certo vê tudo; ?patientId filtra; paciente alheio vê nada.
    const otherDoc = await createDoctor({ crm: uniqCrm(), email: `doc-er3${crmSeq}@test.com` });
    const empty = await api().get('/api/exam-requests').set(authHeader(otherDoc.token));
    expect(empty.body.items).toEqual([]);
    const asDoc = await api().get('/api/exam-requests').set(authHeader(doc.token));
    expect(asDoc.body.items).toHaveLength(2);
    const filtered = await api().get(`/api/exam-requests?patientId=${dep.id}`).set(authHeader(doc.token));
    expect(filtered.body.items.map((i: any) => i.id)).toEqual([done.id]);

    const stranger = await createUser();
    const none = await api().get('/api/exam-requests').set(authHeader(stranger.token));
    expect(none.body.items).toEqual([]);
  });
});
