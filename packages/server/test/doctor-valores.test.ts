import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, authHeader, createUser, createDoctor, createExam, createItem } from './helpers';
import { prisma } from '../src/prisma';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });

const setupShare = async (crm: string, docEmail: string, pacEmail: string, scopes: string[], examIds?: string[]) => {
  const { token: docToken } = await createDoctor({ name: 'Dra ' + crm, crm, email: docEmail });
  const { user, token } = await createUser({ email: pacEmail });
  const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes, ...(examIds ? { examIds } : {}) });
  return { docToken, patientId: patient!.id, patientToken: token };
};

describe('Doctor Portal — valores alterados (GET /doctor/patients/:id/items/abnormal)', () => {
  beforeEach(async () => { await resetDb(); });

  it('200 + itens anormais quando scope inclui exams', async () => {
    const { docToken, patientId } = await setupShare('V1-SP', 'v1@t.com', 'pv1@t.com', ['exams']);
    const exam = await createExam(patientId, { title: 'Hemograma' });
    await createItem(exam.id, { name: 'GLICEMIA', valueNumeric: 220, valueText: '220', flag: 'HIGH', isAbnormal: true, refLow: 70, refHigh: 100 });
    await createItem(exam.id, { name: 'HEMOGLOBINA', valueNumeric: 14, flag: 'NORMAL', isAbnormal: false });

    const r = await api().get(`/api/doctor/patients/${patientId}/items/abnormal`).set(docH(docToken));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].name).toBe('GLICEMIA');
  });

  it('403 quando scope NÃO inclui exams', async () => {
    const { docToken, patientId } = await setupShare('V2-SP', 'v2@t.com', 'pv2@t.com', ['summary']);
    const r = await api().get(`/api/doctor/patients/${patientId}/items/abnormal`).set(docH(docToken));
    expect(r.status).toBe(403);
  });

  it('403 quando share inativo', async () => {
    const { docToken, patientId } = await setupShare('V3-SP', 'v3@t.com', 'pv3@t.com', ['exams']);
    await prisma.doctorShare.updateMany({ where: { patientId }, data: { active: false } });
    const r = await api().get(`/api/doctor/patients/${patientId}/items/abnormal`).set(docH(docToken));
    expect(r.status).toBe(403);
  });

  it('respeita examIds (per-exam share) — só lista itens dos exames autorizados', async () => {
    const { docToken, patientId, patientToken } = await setupShare('V4-SP', 'v4@t.com', 'pv4@t.com', []);
    const a = await createExam(patientId, { title: 'Exame A' });
    const b = await createExam(patientId, { title: 'Exame B' });
    await createItem(a.id, { name: 'A_ALT', flag: 'HIGH', isAbnormal: true });
    await createItem(b.id, { name: 'B_ALT', flag: 'HIGH', isAbnormal: true });
    // recria share autorizando só o exame A
    await prisma.doctorShare.updateMany({ where: { patientId }, data: { active: false } });
    await api().post('/api/doctor-shares').set(authHeader(patientToken)).send({ doctorCrm: 'V4-SP', scopes: ['exams'], examIds: [a.id] });

    const r = await api().get(`/api/doctor/patients/${patientId}/items/abnormal`).set(docH(docToken));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].name).toBe('A_ALT');
  });

  it('só retorna itens com isAbnormal:true', async () => {
    const { docToken, patientId } = await setupShare('V5-SP', 'v5@t.com', 'pv5@t.com', ['exams']);
    const exam = await createExam(patientId);
    await createItem(exam.id, { name: 'ALT', flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'NORM', flag: 'NORMAL', isAbnormal: false });
    await createItem(exam.id, { name: 'ALT2', flag: 'LOW', isAbnormal: true });
    const r = await api().get(`/api/doctor/patients/${patientId}/items/abnormal`).set(docH(docToken));
    expect(r.body.items.map((i: any) => i.name).sort()).toEqual(['ALT', 'ALT2']);
  });

  it('shape igual ao /items/abnormal do paciente', async () => {
    const { docToken, patientId } = await setupShare('V6-SP', 'v6@t.com', 'pv6@t.com', ['exams']);
    const exam = await createExam(patientId, { title: 'Bioquímica' });
    await createItem(exam.id, { name: 'CREATININA', valueNumeric: 1.8, valueText: '1.8', unit: 'mg/dL', flag: 'HIGH', isAbnormal: true, refLow: 0.7, refHigh: 1.2 });
    const r = await api().get(`/api/doctor/patients/${patientId}/items/abnormal`).set(docH(docToken));
    const keys = Object.keys(r.body.items[0]).sort();
    expect(keys).toEqual(['examId', 'examTitle', 'flag', 'id', 'name', 'nameCanonical', 'performedAt', 'refHigh', 'refLow', 'refText', 'requestingDoctor', 'unit', 'valueNumeric', 'valueText']);
    expect(r.body.items[0].examTitle).toBe('Bioquímica');
  });
});
