import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb } from './helpers';

const authH = (t: string) => ({ Authorization: `Bearer ${t}` });

// Brief v2 (24/10): GET /doctor/patients/:id/context — medicações ATIVAS + alergias
// pro brief do médico. Mesmo guard do /vitals (share scope 'exams').
describe('Doctor: contexto clínico (GET /context)', () => {
  beforeEach(async () => { await resetDb(); });

  async function setup(share = true) {
    const { patient } = await createUser();
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { doctor, token } = await createDoctor({ email: `doc-${n}@exemplo.com`, crm: `${n.slice(-5)}-SP` });
    if (share) {
      await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['exams', 'alerts'], active: true } });
    }
    return { patientId: patient.id, token };
  }

  it('retorna medicações ATIVAS (ignora inativa) + alergias do paciente', async () => {
    const { patientId, token } = await setup();
    await prisma.patient.update({ where: { id: patientId }, data: { allergies: 'Penicilina; AAS' } });
    await prisma.medication.create({ data: { patientId, name: 'Levotiroxina', dosage: '50 mcg', frequency: '1× dia', active: true } });
    await prisma.medication.create({ data: { patientId, name: 'Varfarina', active: false } }); // suspensa — não aparece

    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    expect(r.body.medications).toHaveLength(1);
    expect(r.body.medications[0]).toMatchObject({ name: 'Levotiroxina', dosage: '50 mcg', frequency: '1× dia' });
    expect(r.body.allergies).toBe('Penicilina; AAS');
    expect(r.body.clinicalProfile === null || typeof r.body.clinicalProfile === 'string').toBe(true);
  });

  it('sem alergias/meds registradas → null/vazio (não é "sem alergias", é não-informado)', async () => {
    const { patientId, token } = await setup();
    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    expect(r.body.allergies).toBeNull();
    expect(r.body.medications).toEqual([]);
  });

  it('sem share ativo → 403', async () => {
    const { patientId, token } = await setup(false);
    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(403);
  });

  it('share sem scope exams → 403', async () => {
    const { patient } = await createUser();
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { doctor, token } = await createDoctor({ email: `doc-${n}@exemplo.com`, crm: `${n.slice(-5)}-SP` });
    await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['summary'], active: true } });
    const r = await api().get(`/api/doctor/patients/${patient.id}/context`).set(authH(token));
    expect(r.status).toBe(403);
  });
});
