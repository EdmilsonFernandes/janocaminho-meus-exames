import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createExam } from './helpers';
import { prisma } from '../src/prisma';

/**
 * GET /api/patients/:id/dashboard-summary — 1 round-trip consolidando os 8 GETs que o
 * Dashboard V2 fazia no load. Contrato: exams (total/lastExamAt/failed/rejected),
 * buckets (flag-summary, exclui CPF divergente), health (Layer 2), me, credits.
 * POST /api/patients/demo-event — contadores do modo exemplo (R1).
 */
const H = (t: string) => ({ Authorization: `Bearer ${t}` });

async function seedItem(examId: string, name: string, flag: 'NORMAL' | 'HIGH' | 'LOW', value = 10) {
  await prisma.examItem.create({
    data: {
      examId, name, nameCanonical: name.toUpperCase(), flag, extractedPage: 1,
      valueNumeric: value, unit: 'mg/dL', refLow: 1, refHigh: 100, isAbnormal: flag !== 'NORMAL',
    },
  });
}

describe('GET /api/patients/:id/dashboard-summary', () => {
  beforeEach(async () => { await resetDb(); });

  it('consolida tudo num round-trip com a mesma semântica das fontes originais', async () => {
    const { token, patient, user } = await createUser({ credits: 77 });
    const e1 = await createExam(patient.id, { performedAt: new Date('2026-01-10T00:00:00Z') });
    const e2 = await createExam(patient.id, { performedAt: new Date('2026-02-20T00:00:00Z') });
    await createExam(patient.id, { status: 'FAILED', performedAt: new Date('2026-03-01T00:00:00Z') });
    await createExam(patient.id, { status: 'REJECTED' });
    await seedItem(e1.id, 'Glicose', 'NORMAL');
    await seedItem(e1.id, 'LDL', 'HIGH', 150);
    await seedItem(e2.id, 'TSH', 'LOW', 0.2);
    await seedItem(e2.id, 'HDL', 'NORMAL', 55);

    const r = await api().get(`/api/patients/${patient.id}/dashboard-summary`).set(H(token));
    expect(r.status).toBe(200);
    // exams: total = TODOS (qualquer status, como a lista); lastExamAt = performedAt desc.
    expect(r.body.exams.total).toBe(4);
    expect(new Date(r.body.exams.lastExamAt).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.body.exams.failed).toBe(1);
    expect(r.body.exams.rejected).toBe(1);
    // buckets: mesma régua do flag-summary (HIGH+ABNORMAL+CRITICAL = alterados).
    expect(r.body.buckets).toEqual({ bons: 2, alerta: 1, alterados: 1 });
    // health (Layer 2) presente com o essencial do dashboard.
    expect(r.body.health).toBeTruthy();
    expect(typeof r.body.health.score).toBe('number');
    expect(Array.isArray(r.body.health.worsening)).toBe(true);
    expect(Array.isArray(r.body.health.improving)).toBe(true);
    // me + credits.
    expect(r.body.me.id).toBe(patient.id);
    expect(r.body.me.fullName).toBeTruthy();
    expect(r.body.credits).toBe(77);
    expect(user).toBeTruthy();
  });

  it('403 para paciente de outro usuário', async () => {
    const a = await createUser();
    const b = await createUser();
    const r = await api().get(`/api/patients/${a.patient.id}/dashboard-summary`).set(H(b.token));
    expect(r.status).toBe(403);
  });
});

describe('POST /api/patients/demo-event', () => {
  beforeEach(async () => { await resetDb(); });

  it('incrementa contadores de started/converted e rejeita type inválido', async () => {
    const { token } = await createUser();
    const post = (type: string) => api().post('/api/patients/demo-event').set(H(token)).send({ type });
    expect((await post('started')).status).toBe(200);
    expect((await post('started')).status).toBe(200);
    expect((await post('converted')).status).toBe(200);
    expect((await post('hack')).status).toBe(400);
    const row = await prisma.appSetting.findUnique({ where: { key: 'demoMetrics' } });
    expect(row?.value).toEqual({ started: 2, converted: 1 });
  });
});
