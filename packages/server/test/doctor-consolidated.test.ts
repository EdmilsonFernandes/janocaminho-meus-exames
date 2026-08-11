import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, authHeader, createUser, createDoctor, createExam } from './helpers';
import { prisma } from '../src/prisma';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });

const setupShare = async (crm: string, docEmail: string, pacEmail: string, scopes: string[]) => {
  const { token: docToken } = await createDoctor({ name: 'Dra ' + crm, crm, email: docEmail });
  const { user, token } = await createUser({ email: pacEmail });
  const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes });
  return { docToken, patientId: patient!.id };
};

const makeReport = async (patientId: string, contentMd = '# Relatório') =>
  prisma.aiAnalysis.create({ data: { patientId, examId: null, type: 'SUMMARY', userMessage: null, contentMd, structured: { resumoGeral: 'ok' } } });

describe('Doctor Portal — relatório consolidado (GET /doctor/patients/:id/analyses/consolidated/latest)', () => {
  beforeEach(async () => { await resetDb(); });

  it('200 + {analysis, sourceExams} quando scope summary', async () => {
    const { docToken, patientId } = await setupShare('C1-SP', 'c1@t.com', 'pc1@t.com', ['summary']);
    await createExam(patientId, { title: 'Hemograma' });
    await makeReport(patientId, 'Relatório do paciente');

    const r = await api().get(`/api/doctor/patients/${patientId}/analyses/consolidated/latest`).set(docH(docToken));
    expect(r.status).toBe(200);
    expect(r.body.analysis).toBeTruthy();
    expect(r.body.analysis.contentMd).toBe('Relatório do paciente');
    expect(Array.isArray(r.body.sourceExams)).toBe(true);
    expect(r.body.sourceExams.length).toBeGreaterThanOrEqual(1);
  });

  it('403 quando scope NÃO inclui summary', async () => {
    const { docToken, patientId } = await setupShare('C2-SP', 'c2@t.com', 'pc2@t.com', ['exams']);
    const r = await api().get(`/api/doctor/patients/${patientId}/analyses/consolidated/latest`).set(docH(docToken));
    expect(r.status).toBe(403);
  });

  it('analysis:null quando paciente nunca gerou (sem 402, sem cobrança)', async () => {
    const { docToken, patientId } = await setupShare('C3-SP', 'c3@t.com', 'pc3@t.com', ['summary']);
    await createExam(patientId);
    const r = await api().get(`/api/doctor/patients/${patientId}/analyses/consolidated/latest`).set(docH(docToken));
    expect(r.status).toBe(200);
    expect(r.body.analysis).toBeNull();
  });

  it('dedup: exames do mesmo dia + mesmo título viram 1 sourceExam', async () => {
    const { docToken, patientId } = await setupShare('C4-SP', 'c4@t.com', 'pc4@t.com', ['summary']);
    const day = new Date('2026-03-10T00:00:00Z');
    await createExam(patientId, { title: 'Hemograma', performedAt: day, sha: 'dup-a' });
    await createExam(patientId, { title: 'Hemograma', performedAt: day, sha: 'dup-b' }); // reenvio
    await makeReport(patientId);

    const r = await api().get(`/api/doctor/patients/${patientId}/analyses/consolidated/latest`).set(docH(docToken));
    expect(r.body.sourceExams).toHaveLength(1);
  });

  it('sourceExams limitado a 5', async () => {
    const { docToken, patientId } = await setupShare('C5-SP', 'c5@t.com', 'pc5@t.com', ['summary']);
    for (let i = 0; i < 6; i++) await createExam(patientId, { title: `Exame ${i}`, performedAt: new Date(2026, 0, i + 1) });
    await makeReport(patientId);
    const r = await api().get(`/api/doctor/patients/${patientId}/analyses/consolidated/latest`).set(docH(docToken));
    expect(r.body.sourceExams.length).toBeLessThanOrEqual(5);
  });
});
