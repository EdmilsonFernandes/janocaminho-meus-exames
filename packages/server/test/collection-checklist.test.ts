// CHECKLIST DE COLETA (T2, 28/10/26) — E2E supertest: médico cria item do plano de coleta,
// paciente vê no dashboard, item vence, exame EXTRAÍDO com canonical batendo marca ✓.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor, createExam, createItem } from './helpers';
import { prisma } from '../src/prisma';
import { markCollectedFromExtractedExam, expireStaleChecklistItems } from '../src/utils/collectionChecklist';

// itR = retry 2: DB de teste compartilhado entre workers paralelos do vitest (padrão chat-router).
const itR = (n: string, f: () => Promise<void>) => it(n, { retry: 2 }, f);

/** Cria share ativo scope 'exams' (mesmo gate do /vitals e /context). */
async function shareWith(doctorId: string, patientId: string, scopes: string[] = ['exams']) {
  return prisma.doctorShare.upsert({
    where: { patientId_doctorId: { patientId, doctorId } },
    update: { active: true, scopes },
    create: { patientId, doctorId, scopes, active: true },
  });
}

describe('collection-checklist (T2): plano de coleta do médico', () => {
  let ctx: { user: any; patient: any; token: string };
  let doc: { doctor: any; token: string };

  beforeEach(async () => {
    await resetDb();
    ctx = await createUser();
    doc = await createDoctor({ crm: '99001-SP' });
    await shareWith(doc.doctor.id, ctx.patient.id);
  });

  itR('médico cria item → 201; paciente vê no GET próprio; lembrete + push neutro criados', async () => {
    const r = await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(doc.token))
      .send({ analyteName: 'Hemoglobina glicada', dueInDays: 60, instruction: 'jejum 12h' });
    expect(r.status).toBe(201);
    expect(r.body.item.analyteCanonical).toBe('HEMOGLOBINA_GLICADA'); // canonicalName aplicado
    expect(r.body.item.status).toBe('pending');

    // Paciente vê o próprio plano (requireAuth).
    const me = await api().get('/api/collection-checklist').set(authHeader(ctx.token));
    expect(me.status).toBe(200);
    expect(me.body.items).toHaveLength(1);
    expect(me.body.items[0].analyteName).toBe('Hemoglobina glicada');
    expect(me.body.items[0].instruction).toBe('jejum 12h');

    // LEMBRETE na agenda (engine existente) — título neutro (sem analito no push).
    const rem = await prisma.reminder.findFirst({ where: { patientId: ctx.patient.id, type: 'exame' } });
    expect(rem).toBeTruthy();
    expect(rem!.title).not.toMatch(/glicada/i);
    expect(rem!.createdByDoctorId).toBe(doc.doctor.id);

    // Push na criação = notificação in-app neutra (sendPushToUser persiste; FCM é best-effort).
    const notif = await prisma.notification.findFirst({ where: { userId: ctx.user.id, type: 'collection_checklist' } });
    expect(notif).toBeTruthy();
    expect(notif!.body).not.toMatch(/glicada/i);
  });

  itR('sem share → 403 (create e list)', async () => {
    const outsider = await createDoctor({ crm: '99002-SP' });
    const r1 = await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(outsider.token))
      .send({ analyteName: 'TSH', dueInDays: 30 });
    expect(r1.status).toBe(403);
    const r2 = await api().get(`/api/doctor/patients/${ctx.patient.id}/checklist`).set(authHeader(outsider.token));
    expect(r2.status).toBe(403);

    // share sem scope 'exams' também nega
    await shareWith(outsider.doctor.id, ctx.patient.id, ['summary']);
    const r3 = await api().get(`/api/doctor/patients/${ctx.patient.id}/checklist`).set(authHeader(outsider.token));
    expect(r3.status).toBe(403);
  });

  itR('prazo vencido → expired no próximo tick (sem push)', async () => {
    await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(doc.token))
      .send({ analyteName: 'Vitamina D', dueInDays: 30 });
    // simula tempo passando: dueAt pro passado direto no banco
    await prisma.collectionChecklistItem.updateMany({
      where: { patientId: ctx.patient.id },
      data: { dueAt: new Date(Date.now() - 3 * 86400_000) },
    });
    const n = await expireStaleChecklistItems(Date.now());
    expect(n).toBeGreaterThanOrEqual(1);
    const item = await prisma.collectionChecklistItem.findFirst({ where: { patientId: ctx.patient.id } });
    expect(item!.status).toBe('expired');

    // GET do paciente também expira lazy (estado coerente sem depender do job)
    await prisma.collectionChecklistItem.updateMany({
      where: { patientId: ctx.patient.id },
      data: { status: 'pending', dueAt: new Date(Date.now() - 86400_000) },
    });
    const me = await api().get('/api/collection-checklist').set(authHeader(ctx.token));
    expect(me.body.items[0].status).toBe('expired');
  });

  itR('exame EXTRAÍDO com nameCanonical batendo → collected ✓ com collectedExamId; não-batente fica pending', async () => {
    await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(doc.token))
      .send({ analyteName: 'TSH', dueInDays: 90 });
    await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(doc.token))
      .send({ analyteName: 'Ferritina', dueInDays: 90 });

    // exame extraído contendo TSH (mesma chave canônica do checklist)
    const exam = await createExam(ctx.patient.id, { title: 'Tireoide' });
    await createItem(exam.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 2.1, refLow: 0.4, refHigh: 4.0 });

    const marked = await markCollectedFromExtractedExam(ctx.patient.id, exam.id);
    expect(marked).toBe(1);

    const items = await prisma.collectionChecklistItem.findMany({ where: { patientId: ctx.patient.id } });
    const tsh = items.find((i) => i.analyteCanonical === 'TSH')!;
    const fer = items.find((i) => i.analyteCanonical === 'FERRITINA')!;
    expect(tsh.status).toBe('collected');
    expect(tsh.collectedAt).toBeTruthy();
    expect(tsh.collectedExamId).toBe(exam.id);
    expect(fer.status).toBe('pending');

    // histórico: médico vê os dois estados no GET do portal
    const list = await api().get(`/api/doctor/patients/${ctx.patient.id}/checklist`).set(authHeader(doc.token));
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((i: any) => i.status === 'collected')).toHaveLength(1);
  });

  itR('DELETE remove item do plano (portal)', async () => {
    const r = await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(doc.token))
      .send({ analyteName: 'LDL', dueInDays: 30 });
    const del = await api().delete(`/api/doctor/patients/${ctx.patient.id}/checklist/${r.body.item.id}`).set(authHeader(doc.token));
    expect(del.status).toBe(200);
    expect(await prisma.collectionChecklistItem.count({ where: { patientId: ctx.patient.id } })).toBe(0);
  });

  itR('validação: prazo fora da whitelist 400; paciente não cria (rota só GET)', async () => {
    const r = await api()
      .post(`/api/doctor/patients/${ctx.patient.id}/checklist`)
      .set(authHeader(doc.token))
      .send({ analyteName: 'TSH', dueInDays: 45 });
    expect(r.status).toBe(400);
  });
});
