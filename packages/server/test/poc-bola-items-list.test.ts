import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem } from './helpers';

// BOLA PoC 2 — GET /api/items?patientId=<victim-patientId> (src/routes/item.routes.ts:347-348)
// LIST route builds `where.exam = { patientId: q.patientId }` from the RAW query param,
// overwriting the pids scope with NO pids.includes() check — unlike every sibling handler.
describe('BOLA: GET /api/items?patientId= ignora escopo de tenant', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('user B lists user A\'s ExamItem rows via ?patientId=<A-pid>', async () => {
    // Victim A: one extracted exam with a distinctive abnormal analyte.
    const victim = await createUser({ name: 'Vítima A' });
    const examA = await createExam(victim.patient.id, { title: 'Painel Vítima' });
    await createItem(examA.id, {
      name: 'GLICEMIA-JEJUM-VITIMA-A', valueNumeric: 168, valueText: '168', unit: 'mg/dL',
      refLow: 70, refHigh: 99, flag: 'HIGH', isAbnormal: true,
    });

    // Attacker B: own exam+item (proves B is a functioning tenant, not a broken client).
    const attacker = await createUser({ name: 'Atacante B' });
    const examB = await createExam(attacker.patient.id, { title: 'Painel Atacante' });
    await createItem(examB.id, { name: 'HEMOGLOBINA-B' });

    // Baseline: B lists without filter → only own rows.
    const own = await api().get('/api/items').set(authHeader(attacker.token));
    expect(own.status).toBe(200);
    expect(own.body.map((i: any) => i.name)).toContain('HEMOGLOBINA-B');
    expect(own.body.map((i: any) => i.name)).not.toContain('GLICEMIA-JEJUM-VITIMA-A');

    // ATTACK: B forces ?patientId=<A's patient id>.
    const r = await api()
      .get(`/api/items?patientId=${victim.patient.id}`)
      .set(authHeader(attacker.token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0].name).toBe('GLICEMIA-JEJUM-VITIMA-A');
    expect(r.body[0].valueText).toBe('168');
    expect(r.body[0].examId).toBe(examA.id);

    // NEGATIVE CONTROL — sibling /abnormal validates pids.includes() → A's rows stay hidden.
    const ctrl = await api()
      .get(`/api/items/abnormal?patientId=${victim.patient.id}`)
      .set(authHeader(attacker.token));
    expect(ctrl.status).toBe(200);
    expect(ctrl.body.items.map((i: any) => i.name)).not.toContain('GLICEMIA-JEJUM-VITIMA-A');
  });
});