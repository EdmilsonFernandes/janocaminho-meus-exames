// E5.3 — DoctorReview: estado de achado no portal médico (REVISADO/EM_ACOMPANHAMENTO/
// RESOLVIDO). Segurança: token do médico da URL; share ATIVO com scope do kind ('exams'
// p/ item/exam, 'sports' p/ goal); achado precisa pertencer ao paciente (404 senão) e ao
// recorte examIds do share. NUNCA apaga: upsert muda status (histórico preservado) e toda
// transição é auditada (DOCTOR_REVIEW_UPSERTED com before/after).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem, createDoctor } from './helpers';
import { prisma } from '../src/prisma';

const share = (patientId: string, doctorId: string, scopes = ['exams']) =>
  prisma.doctorShare.create({ data: { patientId, doctorId, scopes, active: true } });

describe('doctor-reviews (E5.3): autenticação e escopo', () => {
  beforeEach(async () => { await resetDb(); });

  it('sem auth → 401; token de PACIENTE → 401; médico de outro token → 403', async () => {
    const a = await createDoctor({ crm: '61611-SP', email: 'rv-a@t.com' });
    const b = await createDoctor({ crm: '61612-SP', email: 'rv-b@t.com' });
    const { patient, token } = await createUser();
    await share(patient.id, a.doctor.id);
    const base = `/api/doctor/${a.doctor.id}/reviews`;

    expect((await api().get(`${base}?patientId=${patient.id}`)).status).toBe(401);
    expect((await api().get(`${base}?patientId=${patient.id}`).set(authHeader(token))).status).toBe(401);
    expect((await api().post(base).set(authHeader(token)).send({ patientId: patient.id, kind: 'exam', status: 'REVISADO' })).status).toBe(401);
    expect((await api().get(`${base}?patientId=${patient.id}`).set(authHeader(b.token))).status).toBe(403);
  });

  it('sem share ativo → 403; share SEM o scope do kind → 403; revogado → 403', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '61611-SP', email: 'rv-c@t.com' });
    const base = `/api/doctor/${doctor.doctor.id}/reviews`;

    // sem share
    expect((await api().post(base).set(authHeader(doctor.token)).send({ patientId: patient.id, kind: 'goal', status: 'REVISADO' })).status).toBe(403);

    // share só sports: kind=item (precisa exams) → 403; kind=goal → cria
    const s = await share(patient.id, doctor.doctor.id, ['sports']);
    expect((await api().post(base).set(authHeader(doctor.token)).send({ patientId: patient.id, kind: 'item', examItemId: 'x', status: 'REVISADO' })).status).toBe(403);
    const goal = await api().post(base).set(authHeader(doctor.token)).send({ patientId: patient.id, kind: 'goal', status: 'EM_ACOMPANHAMENTO' });
    expect(goal.status).toBe(201);

    await prisma.doctorShare.update({ where: { id: s.id }, data: { active: false } });
    expect((await api().post(base).set(authHeader(doctor.token)).send({ patientId: patient.id, kind: 'goal', status: 'RESOLVIDO' })).status).toBe(403);
  });

  it('validação: kind/status inválidos → 400; kind=item sem examItemId → 400; kind=exam sem examId → 400; note > 1000 trunca', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '61611-SP', email: 'rv-d@t.com' });
    await share(patient.id, doctor.doctor.id);
    const base = `/api/doctor/${doctor.doctor.id}/reviews`;
    const send = (body: Record<string, unknown>) => api().post(base).set(authHeader(doctor.token)).send(body);

    expect((await send({ patientId: patient.id, kind: 'exotico', status: 'REVISADO' })).status).toBe(400);
    expect((await send({ patientId: patient.id, kind: 'item', status: 'STATUS' })).status).toBe(400);
    expect((await send({ patientId: patient.id, kind: 'item', status: 'REVISADO' })).status).toBe(400);
    expect((await send({ patientId: patient.id, kind: 'exam', status: 'REVISADO' })).status).toBe(400);
    expect(await prisma.doctorReview.count()).toBe(0);
  });
});

describe('doctor-reviews (E5.3): upsert por achado — nunca apaga, audita, isola', () => {
  beforeEach(async () => { await resetDb(); });

  it('cria review de item (201) e ATUALIZA a mesma row (200) — status muda, count segue 1', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '61611-SP', email: 'rv-e@t.com' });
    await share(patient.id, doctor.doctor.id);
    const exam = await createExam(patient.id, {});
    const item = await createItem(exam.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 19, isAbnormal: true, flag: 'HIGH' });
    const base = `/api/doctor/${doctor.doctor.id}/reviews`;

    const c = await api().post(base).set(authHeader(doctor.token))
      .send({ patientId: patient.id, kind: 'item', examItemId: item.id, status: 'REVISADO', note: 'Achado conhecido' });
    expect(c.status).toBe(201);
    expect(c.body.review.status).toBe('REVISADO');
    expect(c.body.review.examId).toBe(exam.id);

    const u = await api().post(base).set(authHeader(doctor.token))
      .send({ patientId: patient.id, kind: 'item', examItemId: item.id, status: 'EM_ACOMPANHAMENTO', note: 'Represcriar em 3m' });
    expect(u.status).toBe(200);
    expect(u.body.review.id).toBe(c.body.review.id);
    expect(u.body.review.status).toBe('EM_ACOMPANHAMENTO');
    expect(await prisma.doctorReview.count()).toBe(1); // NUNCA apaga/duplica

    const logs = await prisma.auditLog.findMany({ where: { action: 'DOCTOR_REVIEW_UPSERTED' }, orderBy: { id: 'asc' } });
    expect(logs).toHaveLength(2);
    expect(logs[0].before).toBeNull();
    expect(logs[1].before?.status).toBe('REVISADO');
    expect(logs[1].after?.status).toBe('EM_ACOMPANHAMENTO');
  });

  it('item de OUTRO paciente → 404; exame fora do recorte examIds → 403', async () => {
    const owner = await createUser();
    const other = await createUser();
    const doctor = await createDoctor({ crm: '61611-SP', email: 'rv-f@t.com' });
    const examOther = await createExam(other.patient.id, {});
    const itemOther = await createItem(examOther.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 10, isAbnormal: true });
    const base = `/api/doctor/${doctor.doctor.id}/reviews`;

    await share(owner.patient.id, doctor.doctor.id);
    const steal = await api().post(base).set(authHeader(doctor.token))
      .send({ patientId: owner.patient.id, kind: 'item', examItemId: itemOther.id, status: 'REVISADO' });
    expect(steal.status).toBe(404);

    // recorte examIds: share só cobre o exame A; item do exame B (do MESMO paciente) → 403
    const examA = await createExam(owner.patient.id, {});
    const examB = await createExam(owner.patient.id, {});
    const itemB = await createItem(examB.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 11, isAbnormal: true });
    await prisma.doctorShare.updateMany({ where: { doctorId: doctor.doctor.id }, data: { examIds: [examA.id] } });
    const cut = await api().post(base).set(authHeader(doctor.token))
      .send({ patientId: owner.patient.id, kind: 'item', examItemId: itemB.id, status: 'REVISADO' });
    expect(cut.status).toBe(403);
    expect(await prisma.doctorReview.count()).toBe(0);
  });

  it('isolamento entre médicos: cada médico tem a PRÓPRIA review do mesmo achado; lista traz join do médico', async () => {
    const { patient } = await createUser();
    const a = await createDoctor({ crm: '61611-SP', email: 'rv-g@t.com' });
    const b = await createDoctor({ crm: '61612-SP', email: 'rv-h@t.com' });
    await share(patient.id, a.doctor.id);
    await share(patient.id, b.doctor.id);
    const exam = await createExam(patient.id, {});
    const item = await createItem(exam.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 12, isAbnormal: true });

    await api().post(`/api/doctor/${a.doctor.id}/reviews`).set(authHeader(a.token))
      .send({ patientId: patient.id, kind: 'item', examItemId: item.id, status: 'REVISADO' });
    await api().post(`/api/doctor/${b.doctor.id}/reviews`).set(authHeader(b.token))
      .send({ patientId: patient.id, kind: 'item', examItemId: item.id, status: 'EM_ACOMPANHAMENTO' });

    expect(await prisma.doctorReview.count()).toBe(2);
    const la = await api().get(`/api/doctor/${a.doctor.id}/reviews?patientId=${patient.id}`).set(authHeader(a.token));
    expect(la.status).toBe(200);
    expect(la.body.reviews).toHaveLength(1);
    expect(la.body.reviews[0].status).toBe('REVISADO');
    expect(la.body.reviews[0].doctor.crm).toBe('61611-SP'); // join do médico

    const lb = await api().get(`/api/doctor/${b.doctor.id}/reviews?patientId=${patient.id}`).set(authHeader(b.token));
    expect(lb.body.reviews[0].status).toBe('EM_ACOMPANHAMENTO');
    expect(lb.body.reviews).not.toHaveLength(2);
  });

  it('review do EXAME TODO (kind=exam, examItemId null): upsert não duplica (findFirst por NULL)', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '61611-SP', email: 'rv-i@t.com' });
    await share(patient.id, doctor.doctor.id);
    const exam = await createExam(patient.id, {});
    const base = `/api/doctor/${doctor.doctor.id}/reviews`;

    const c1 = await api().post(base).set(authHeader(doctor.token)).send({ patientId: patient.id, kind: 'exam', examId: exam.id, status: 'REVISADO' });
    const c2 = await api().post(base).set(authHeader(doctor.token)).send({ patientId: patient.id, kind: 'exam', examId: exam.id, status: 'RESOLVIDO' });
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(200);
    expect(await prisma.doctorReview.count()).toBe(1);
    expect(c2.body.review.status).toBe('RESOLVIDO');
  });
});
