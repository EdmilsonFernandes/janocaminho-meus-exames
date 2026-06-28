import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem, createDoctor } from './helpers';
import { prisma } from '../src/prisma';

/** Cria vínculo DoctorShare ativo com os escopos informados. */
const share = (patientId: string, doctorId: string, scopes: string[]) =>
  prisma.doctorShare.create({ data: { patientId, doctorId, scopes, active: true } });

/**
 * M4 — rota doctor health-summary: a visão de 1 min do médico consumindo a MESMA camada M1
 * do paciente. Guard de share ativo + scope 'alerts'. (Portal médico não tem dados no dev,
 * então o teste valida pelo backend/scope — a fundação que o portal vai consumir.)
 */
describe('M4 — GET /api/doctor/patients/:patientId/health-summary', () => {
  beforeEach(async () => { await resetDb(); });

  it('médico com share ativo + scope alerts recebe o snapshot (estado atual + prioridade)', async () => {
    const { patient } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'GLICOSE', nameCanonical: 'GLICOSE', valueNumeric: 150, refLow: 70, refHigh: 99, flag: 'HIGH', isAbnormal: true });
    const { doctor, token } = await createDoctor({ crm: '11111-SP', email: 'doc1@test.com' });
    await share(patient.id, doctor.id, ['alerts']);

    const r = await api().get(`/api/doctor/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.patientId).toBe(patient.id);
    expect(r.body.markers).toBeGreaterThan(0);
    expect(r.body.score).not.toBeNull();
    expect(r.body.byPriority).toBeDefined();
    expect(Array.isArray(r.body.topAttention)).toBe(true);
    expect(Array.isArray(r.body.whatChanged)).toBe(true);
  });

  it('sem share (paciente não compartilhado c/ o médico) → 403', async () => {
    const { patient } = await createUser();
    const { token } = await createDoctor({ crm: '22222-SP', email: 'doc2@test.com' });
    const r = await api().get(`/api/doctor/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(r.status).toBe(403);
  });

  it('share ativo mas SEM scope alerts → 403 (guard de escopo granular)', async () => {
    const { patient } = await createUser();
    const { doctor, token } = await createDoctor({ crm: '33333-SP', email: 'doc3@test.com' });
    await share(patient.id, doctor.id, ['summary']); // só resumos, não alerts
    const r = await api().get(`/api/doctor/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(r.status).toBe(403);
  });

  it('sem token de médico → 401', async () => {
    const { patient } = await createUser();
    const r = await api().get(`/api/doctor/patients/${patient.id}/health-summary`);
    expect(r.status).toBe(401);
  });
});
