import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { CREDIT_COSTS } from '../src/utils/credits';
import { api, authHeader, createUser, createExam, createItem, getUserCredits, resetDb } from './helpers';

// Teste de INTEGRAÇÃO ponta-a-ponta da rota /api/risk:
// ExamItem -> MarkerState (real) -> risk-engine -> RiskAssessment (persistido) -> JSON.
describe('POST /api/risk/assess', () => {
  beforeEach(async () => { await resetDb(); });

  it('avalia paciente diabético a partir de exame + PA e persiste', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id, { performedAt: new Date('2026-06-01T00:00:00Z') });
    await createItem(exam.id, { name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueNumeric: 168, unit: 'mg/dL', flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'HEMOGLOBINA GLICADA', nameCanonical: 'HEMOGLOBINA_GLICADA', valueNumeric: 8.1, unit: '%', flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 14, unit: 'g/dL' });
    // PA (value=sistólica, valueSecondary=diastólica — padrão do front)
    await prisma.measurement.create({ data: { patientId: patient.id, type: 'BLOOD_PRESSURE', value: 118, valueSecondary: 75, unit: 'mmHg', measuredAt: new Date('2026-06-01T00:00:00Z') } });

    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(201);
    expect(r.body.fromCache).toBe(false);
    expect(r.body.predictedConditionKey).toBe('diabetes');
    expect(r.body.predictedCondition).toContain('diabetes');
    expect(r.body.riskLevel).toBe('high');
    expect(r.body.detectedFindings.length).toBe(2);
    expect(r.body.medicalDisclaimer).toContain('não substitui');
    expect(r.body.trend).toBe('primeiro'); // 1ª leitura: sem anterior
    expect(r.body.doctorQuestions.length).toBeGreaterThan(0);

    // persistiu?
    const rows = await prisma.riskAssessment.findMany({ where: { patientId: patient.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].conditionKey).toBe('diabetes');
  });

  it('cache: segunda chamada sem force devolve a avaliação recente (200, fromCache)', async () => {
    const { patient, token } = await createUser();
    await createItem((await createExam(patient.id)).id, { nameCanonical: 'GLICEMIA', valueNumeric: 88, unit: 'mg/dL' });

    const r1 = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r1.status).toBe(201);
    const r2 = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r2.status).toBe(200);
    expect(r2.body.fromCache).toBe(true);
    // não criou 2º registro
    expect(await prisma.riskAssessment.count({ where: { patientId: patient.id } })).toBe(1);
  });

  it('force=true recomputa (ignora cache) e cria novo registro', async () => {
    const { patient, token } = await createUser();
    await createItem((await createExam(patient.id)).id, { nameCanonical: 'GLICEMIA', valueNumeric: 88, unit: 'mg/dL' });
    await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id, force: true });
    expect(r.status).toBe(201);
    expect(r.body.fromCache).toBe(false);
    expect(await prisma.riskAssessment.count({ where: { patientId: patient.id } })).toBe(2);
  });

  it('paciente sem alterações -> none/low', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { nameCanonical: 'GLICEMIA', valueNumeric: 88, unit: 'mg/dL' });
    await createItem(exam.id, { nameCanonical: 'LDL', valueNumeric: 95, unit: 'mg/dL' });
    await createItem(exam.id, { nameCanonical: 'HDL', valueNumeric: 55, unit: 'mg/dL' });
    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.body.predictedConditionKey).toBe('none');
    expect(r.body.riskLevel).toBe('low');
  });

  it('recusa paciente de outro usuário (403)', async () => {
    const a = await createUser();
    const b = await createUser();
    const r = await api().post('/api/risk/assess').set(authHeader(b.token)).send({ patientId: a.patient.id });
    expect(r.status).toBe(403);
  });

  it('GET /latest devolve a última avaliação sem recomputar', async () => {
    const { patient, token } = await createUser();
    await createItem((await createExam(patient.id)).id, { nameCanonical: 'GLICEMIA', valueNumeric: 168, unit: 'mg/dL' });
    await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    const r = await api().get('/api/risk/latest').set(authHeader(token)).query({ patientId: patient.id });
    expect(r.status).toBe(200);
    expect(r.body.assessment).not.toBeNull();
    expect(r.body.assessment.result.predictedConditionKey).toBe('diabetes');
  });

  it('sem auth -> 401', async () => {
    const r = await api().post('/api/risk/assess').send({ patientId: 'x' });
    expect(r.status).toBe(401);
  });

  // ---- cenários clínicos adicionais ----

  it('comorbidade: HAS (PAS 135) + colesterol (LDL 170) -> high + 2 condições', async () => {
    const { patient, token } = await createUser();
    await createItem((await createExam(patient.id)).id, { nameCanonical: 'LDL', valueNumeric: 170, unit: 'mg/dL' });
    await createItem((await createExam(patient.id)).id, { nameCanonical: 'HDL', valueNumeric: 50, unit: 'mg/dL' });
    await prisma.measurement.create({ data: { patientId: patient.id, type: 'BLOOD_PRESSURE', value: 135, valueSecondary: 85, unit: 'mmHg', measuredAt: new Date() } });

    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.body.riskLevel).toBe('high');           // escalonamento multi-sistema
    expect(r.body.conditions).toEqual(expect.arrayContaining(['hypertension', 'high_cholesterol']));
    expect(r.body.conditions.length).toBe(2);
    // PA entrou como 2 marcadores (sistólica + diastólica)
    expect(r.body.findings.some((f: any) => f.key === 'PRESSAO_SISTOLICA')).toBe(true);
    expect(r.body.findings.some((f: any) => f.key === 'PRESSAO_DIASTOLICA')).toBe(true);
  });

  it('anemia: Hb 9.5 + VCM 68 -> condition anemia, 2 findings', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { nameCanonical: 'HEMOGLOBINA', valueNumeric: 9.5, unit: 'g/dL' });
    await createItem(exam.id, { nameCanonical: 'VCM', valueNumeric: 68, unit: 'fL' });
    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.body.predictedConditionKey).toBe('anemia');
    expect(r.body.detectedFindings.length).toBe(2);
  });

  it('GET /latest mantém markersEvaluated consistente com o assess', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { nameCanonical: 'GLICEMIA', valueNumeric: 88, unit: 'mg/dL' });
    await createItem(exam.id, { nameCanonical: 'LDL', valueNumeric: 95, unit: 'mg/dL' });
    await createItem(exam.id, { nameCanonical: 'HDL', valueNumeric: 55, unit: 'mg/dL' });

    const assess = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    const latest = await api().get('/api/risk/latest').set(authHeader(token)).query({ patientId: patient.id });
    expect(latest.body.assessment.result.markersEvaluated).toBe(assess.body.markersEvaluated);
    expect(latest.body.assessment.result.markersEvaluated).toBe(3);
  });

  it('patientId inválido -> 403', async () => {
    const { token } = await createUser();
    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: 'nao-existe' });
    expect(r.status).toBe(403);
  });
});

// Plano de ação (IA — cobra créditos). generateActionPlan é mockado em setup.ts.
describe('POST /api/risk/action-plan', () => {
  beforeEach(async () => { await resetDb(); });

  it('402 quando não há créditos suficientes (antes de gastar IA)', async () => {
    const { patient, token, user } = await createUser({ credits: CREDIT_COSTS.actionPlan - 1 });
    const r = await api().post('/api/risk/action-plan').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('insufficient_credits');
    // não debitou
    expect(await getUserCredits(user.id)).toBe(CREDIT_COSTS.actionPlan - 1);
  });

  it('201 + débita actionPlan créditos + devolve contentMd', async () => {
    const { patient, token, user } = await createUser({ credits: 100 });
    // generateActionPlan (mock) independe do assessment; criamos mesmo assim p/ realismo
    await prisma.riskAssessment.create({ data: { patientId: patient.id, conditionKey: 'diabetes', conditionLabel: 'Possível risco de diabetes', riskLevel: 'high', confidence: 0.8, ruleConfidence: 'alta', findings: [], snapshot: [] } });
    const before = await getUserCredits(user.id);
    const r = await api().post('/api/risk/action-plan').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(201);
    expect(r.body.contentMd).toBeTruthy();
    expect(r.body.basedOn.conditionKey).toBe('diabetes');
    expect(before - (await getUserCredits(user.id))).toBe(CREDIT_COSTS.actionPlan);
  });

  it('recusa paciente de outro usuário (403)', async () => {
    const a = await createUser({ credits: 100 });
    const b = await createUser({ credits: 100 });
    const r = await api().post('/api/risk/action-plan').set(authHeader(b.token)).send({ patientId: a.patient.id });
    expect(r.status).toBe(403);
  });
});

// Tendência de risco (último vs anterior).
describe('GET /api/risk/latest — tendência', () => {
  beforeEach(async () => { await resetDb(); });

  it('sem leituras -> assessment null', async () => {
    const { patient, token } = await createUser();
    const r = await api().get('/api/risk/latest').set(authHeader(token)).query({ patientId: patient.id });
    expect(r.body.assessment).toBeNull();
  });

  it('1 leitura -> trend "primeiro", sem prior', async () => {
    const { patient, token } = await createUser();
    await prisma.riskAssessment.create({ data: { patientId: patient.id, conditionKey: 'high_cholesterol', conditionLabel: 'Possível risco de colesterol alto', riskLevel: 'high', confidence: 0.7, ruleConfidence: 'alta', findings: [], snapshot: [] } });
    const r = await api().get('/api/risk/latest').set(authHeader(token)).query({ patientId: patient.id });
    expect(r.body.assessment.trend).toBe('primeiro');
    expect(r.body.assessment.prior).toBeNull();
  });

  it('risco caiu de high -> low: trend "melhorou"', async () => {
    const { patient, token } = await createUser();
    await prisma.riskAssessment.create({ data: { patientId: patient.id, conditionKey: 'diabetes', conditionLabel: 'Diabetes', riskLevel: 'high', confidence: 0.8, ruleConfidence: 'alta', findings: [], snapshot: [], createdAt: new Date(Date.now() - 86_400_000) } });
    await prisma.riskAssessment.create({ data: { patientId: patient.id, conditionKey: 'none', conditionLabel: 'Sem alterações', riskLevel: 'low', confidence: 0.9, ruleConfidence: 'alta', findings: [], snapshot: [] } });
    const r = await api().get('/api/risk/latest').set(authHeader(token)).query({ patientId: patient.id });
    expect(r.body.assessment.trend).toBe('melhorou');
    expect(r.body.assessment.prior.riskLevel).toBe('high');
  });

  it('risco subiu de low -> moderate: trend "piorou"', async () => {
    const { patient, token } = await createUser();
    await prisma.riskAssessment.create({ data: { patientId: patient.id, conditionKey: 'none', conditionLabel: 'Sem alterações', riskLevel: 'low', confidence: 0.9, ruleConfidence: 'alta', findings: [], snapshot: [], createdAt: new Date(Date.now() - 86_400_000) } });
    await prisma.riskAssessment.create({ data: { patientId: patient.id, conditionKey: 'hypertension', conditionLabel: 'HAS', riskLevel: 'moderate', confidence: 0.7, ruleConfidence: 'alta', findings: [], snapshot: [] } });
    const r = await api().get('/api/risk/latest').set(authHeader(token)).query({ patientId: patient.id });
    expect(r.body.assessment.trend).toBe('piorou');
  });
});
