import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor, createExam, createItem } from './helpers';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });
import { prisma } from '../src/prisma';
import { buildRiskAssessment } from '../src/analysis/risk-service';

// §12.4 do spec de teleconsulta (24/10): brief/prioridade sempre atualizados.
// A análise de risco é PERSISTIDA com cache de 24h — antes, um exame extraído DEPOIS da
// última análise não invalidava o cache: paciente e médico viam prioridade velha por até
// 24h. Regra nova: análise mais velha que o último exame extraído NUNCA é servida como
// atual (buildRiskAssessment recalcula; GET /doctor/.../risk sinaliza newDataReceived).
describe('análise de risco desatualizada × exame novo (§12.4)', () => {
  beforeEach(async () => { await resetDb(); });

  it('exame extraído DEPOIS da análise → cache de 24h é ignorado e recalcula', async () => {
    const { patient } = await createUser();
    const e1 = await createExam(patient.id, { sha: 'stale-1' });
    await createItem(e1.id, { nameCanonical: 'GLICEMIA', valueNumeric: 168, unit: 'mg/dL', flag: 'HIGH', isAbnormal: true });
    await prisma.exam.update({ where: { id: e1.id }, data: { extractedAt: new Date() } });

    const v1 = await buildRiskAssessment(patient.id);
    expect(v1.fromCache).toBe(false);
    expect(v1.result.markersEvaluated).toBeGreaterThan(0);

    // exame NOVO extraído depois da análise v1 (mesma janela de 24h do cache)
    const e2 = await createExam(patient.id, { sha: 'stale-2' });
    await createItem(e2.id, { nameCanonical: 'HEMOGLOBINA_GLICADA', valueNumeric: 9.5, unit: '%', flag: 'HIGH', isAbnormal: true });
    await prisma.exam.update({ where: { id: e2.id }, data: { extractedAt: new Date() } }); // > v1.createdAt

    const v2 = await buildRiskAssessment(patient.id); // SEM force
    expect(v2.fromCache).toBe(false); // recusou a análise defasada
    const rows = await prisma.riskAssessment.findMany({ where: { patientId: patient.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.length).toBe(2); // persistiu a recalculada

    // sem exame novo depois disso → cache volta a valer (sem reprocessar à toa)
    const v3 = await buildRiskAssessment(patient.id);
    expect(v3.fromCache).toBe(true);
  });

  it('GET /doctor/patients/:id/risk: sinaliza newDataReceived e devolve análise fresca', async () => {
    const { token: docToken } = await createDoctor({ name: 'Dr Fresco', crm: '444-SP', email: 'fresco@t.com' });
    const { patient, token } = await createUser({ credits: 100 });
    const e1 = await createExam(patient.id, { sha: 'fresh-1' });
    await createItem(e1.id, { nameCanonical: 'GLICEMIA', valueNumeric: 168, unit: 'mg/dL', flag: 'HIGH', isAbnormal: true });
    await prisma.exam.update({ where: { id: e1.id }, data: { extractedAt: new Date() } });
    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: '444-SP', scopes: ['exams'] });
    expect(share.status).toBe(201);

    // análise "antiga" (persistida antes do exame novo)
    const v1 = await buildRiskAssessment(patient.id);
    const e2 = await createExam(patient.id, { sha: 'fresh-2' });
    await createItem(e2.id, { nameCanonical: 'HEMOGLOBINA_GLICADA', valueNumeric: 9.5, unit: '%', flag: 'HIGH', isAbnormal: true });
    await prisma.exam.update({ where: { id: e2.id }, data: { extractedAt: new Date() } });

    // médico abre o prontuário: banner (newDataReceived) + análise recalculada na hora
    const r = await api().get(`/api/doctor/patients/${patient.id}/risk`).set(docH(docToken));
    expect(r.status).toBe(200);
    expect(r.body.newDataReceived).toBe(true);
    expect(new Date(r.body.createdAt).getTime()).toBeGreaterThan(new Date(v1.saved.createdAt).getTime());
    expect(r.body.result.detectedFindings.length).toBe(2); // inclui o dado do exame NOVO

    // 2ª abertura: já está fresca → sem banner
    const r2 = await api().get(`/api/doctor/patients/${patient.id}/risk`).set(docH(docToken));
    expect(r2.body.newDataReceived).toBe(false);
    expect(new Date(r2.body.createdAt).getTime()).toBe(new Date(r.body.createdAt).getTime());
  });

  it('share por-exame: exame novo FORA do recorte não conta como "dados novos" pro médico', async () => {
    const { token: docToken } = await createDoctor({ name: 'Dr Recorte', crm: '555-SP', email: 'recorte@t.com' });
    const { patient, token } = await createUser({ credits: 100 });
    const visible = await createExam(patient.id, { sha: 'cut-1' });
    await createItem(visible.id, { nameCanonical: 'GLICEMIA', valueNumeric: 168, unit: 'mg/dL', flag: 'HIGH', isAbnormal: true });
    await prisma.exam.update({ where: { id: visible.id }, data: { extractedAt: new Date() } });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: '555-SP', scopes: ['exams'], examIds: [visible.id] });

    await buildRiskAssessment(patient.id); // análise cobre o exame visível

    // exame novo (invisível ao médico — fora do recorte por-exame) extraído depois
    const hidden = await createExam(patient.id, { sha: 'cut-2' });
    await createItem(hidden.id, { nameCanonical: 'HEMOGLOBINA_GLICADA', valueNumeric: 9.5, unit: '%', flag: 'HIGH', isAbnormal: true });
    await prisma.exam.update({ where: { id: hidden.id }, data: { extractedAt: new Date() } });

    const r = await api().get(`/api/doctor/patients/${patient.id}/risk`).set(docH(docToken));
    expect(r.status).toBe(200);
    expect(r.body.newDataReceived).toBe(false); // nada novo NO ESCOPO do médico
  });
});
