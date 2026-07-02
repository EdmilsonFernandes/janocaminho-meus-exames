import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createExam, createItem, createDoctor, resetDb } from './helpers';

const authH = (t: string) => ({ Authorization: `Bearer ${t}` });

// Helper: cria user+patient+exam+item + doctor+share → devolve { patientId, doctorToken }
async function mkDoctor() {
  const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return createDoctor({ email: `doc-${n}@exemplo.com`, crm: `${n.slice(-5)}-SP` });
}
async function setupPatientWithDoctor(opts: { item?: Parameters<typeof createItem>[1] } = {}) {
  const { patient } = await createUser();
  await createItem((await createExam(patient.id)).id, opts.item ?? { nameCanonical: 'GLICEMIA', valueNumeric: 168, unit: 'mg/dL', isAbnormal: true, flag: 'HIGH' });
  const { doctor, token } = await mkDoctor();
  await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['exams', 'alerts', 'summary'], active: true } });
  return { patientId: patient.id, token };
}

describe('Doctor: Pre-Consulta (GET /pre-visit)', () => {
  beforeEach(async () => { await resetDb(); });

  it('retorna brief com topIssues + score + markers', async () => {
    const { patientId, token } = await setupPatientWithDoctor();
    const r = await api().get(`/api/doctor/patients/${patientId}/pre-visit`).set(authH(token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.topIssues)).toBe(true);
    expect(r.body.markers).toBeGreaterThan(0);
    expect(r.body.score).not.toBe(null);
  });

  it('inclui patientQuestions vazias quando nao ha chat', async () => {
    const { patientId, token } = await setupPatientWithDoctor();
    const r = await api().get(`/api/doctor/patients/${patientId}/pre-visit`).set(authH(token));
    expect(r.body.patientQuestions).toEqual([]);
    expect(r.body.lastVisit).toBe(null);
  });

  it('sem share -> 403', async () => {
    const { patient } = await createUser();
    const { token } = await mkDoctor();
    const r = await api().get(`/api/doctor/patients/${patient.id}/pre-visit`).set(authH(token));
    expect(r.status).toBe(403);
  });

  it('sem auth -> 401', async () => {
    const { patientId } = await setupPatientWithDoctor();
    const r = await api().get(`/api/doctor/patients/${patientId}/pre-visit`);
    expect(r.status).toBe(401);
  });
});

describe('Doctor: SOAP (POST /soap)', () => {
  beforeEach(async () => { await resetDb(); });

  it('gera SOAP com IA mockada (contentMd com secoes)', async () => {
    const { patientId, token } = await setupPatientWithDoctor();
    const r = await api().post(`/api/doctor/patients/${patientId}/soap`).set(authH(token));
    expect(r.status).toBe(201);
    expect(r.body.contentMd).toBeTruthy();
    expect(r.body.contentMd).toContain('Subjetivo');
    expect(r.body.contentMd).toContain('Plano');
  });

  it('sem exames extraidos -> 400 (generateSoap rejeita)', async () => {
    const { patient } = await createUser();
    const { doctor, token } = await mkDoctor();
    await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['exams'], active: true } });
    const { generateSoap } = await import('../src/analysis/doctor-soap');
    vi.mocked(generateSoap).mockRejectedValueOnce(Object.assign(new Error('Sem exames'), { status: 400 }));
    const r = await api().post(`/api/doctor/patients/${patient.id}/soap`).set(authH(token));
    expect(r.status).toBe(400);
  });

  it('sem share -> 403', async () => {
    const { patient } = await createUser();
    const { token } = await mkDoctor();
    const r = await api().post(`/api/doctor/patients/${patient.id}/soap`).set(authH(token));
    expect(r.status).toBe(403);
  });
});
