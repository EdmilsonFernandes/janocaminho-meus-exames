// E2.2/E2.3/E2.6 — Metas clínicas (camada 2 da política de referências, RELATORIO §4).
// Segurança: PACIENTE nunca escreve (401 nas rotas de médico); médico exige share ATIVO;
// justificativa obrigatória; supersedes encadeia histórico (nunca DELETE físico); expire
// só seta validTo; auditoria registra create/expire. REGRA INEGOCIÁVEL: meta NUNCA altera
// isAbnormal/flag/health-state — alterado com meta "atingida" segue alterado.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createPatient, createExam, createItem, createDoctor } from './helpers';
import { prisma } from '../src/prisma';
import { buildCurrentHealthSummary } from '../src/analysis/health-state';

const share = (patientId: string, doctorId: string, scopes = ['exams', 'evolution', 'alerts', 'summary']) =>
  prisma.doctorShare.create({ data: { patientId, doctorId, scopes, active: true } });

const goalBody = (patientId: string, over: Record<string, unknown> = {}) => ({
  patientId,
  analyte: 'TESTOSTERONA_TOTAL',
  targetLow: 450,
  targetHigh: 600,
  unit: 'ng/dL',
  justification: 'Alvo terapêutico de TRT prescrito; acompanhar em 3 meses.',
  source: 'Diretrizes TRT (uso prescrito) — meta de sociedade médica; revisar caso a caso',
  ...over,
});

describe('clinical-goals: API médico (E2.2)', () => {
  beforeEach(async () => { await resetDb(); });

  it('sem auth → 401; token de PACIENTE → 401 (paciente jamais escreve/gerencia metas)', async () => {
    const { user, token } = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    const g = `/api/doctor/${doctor.doctor.id}/clinical-goals?patientId=xyz`;

    expect((await api().get(g)).status).toBe(401);
    // token de paciente não é token de médico → 401 em TODAS as rotas de meta
    expect((await api().get(g).set(authHeader(token))).status).toBe(401);
    expect((await api().post(`/api/doctor/${doctor.doctor.id}/clinical-goals`).set(authHeader(token)).send(goalBody('x'))).status).toBe(401);
    expect((await api().post(`/api/doctor/${doctor.doctor.id}/clinical-goals/abc/expire`).set(authHeader(token))).status).toBe(401);
    expect((await api().get(`/api/doctor/${doctor.doctor.id}/clinical-goal-suggestions?patientId=x`).set(authHeader(token))).status).toBe(401);
    expect(await prisma.clinicalGoal.count()).toBe(0);
    expect(user.id).toBeTruthy();
  });

  it('médico de OUTRO token (doctorId na URL ≠ token) → 403', async () => {
    const a = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    const b = await createDoctor({ crm: '22222-SP', email: 'cg-b@t.com' });
    const { patient } = await createUser();
    await share(patient.id, a.doctor.id);
    const r = await api().get(`/api/doctor/${a.doctor.id}/clinical-goals?patientId=${patient.id}`).set(authHeader(b.token));
    expect(r.status).toBe(403);
  });

  it('sem share ativo → 403 (nada persiste); share revogado também bloqueia', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    const base = `/api/doctor/${doctor.doctor.id}/clinical-goals`;
    expect((await api().get(`${base}?patientId=${patient.id}`).set(authHeader(doctor.token))).status).toBe(403);
    expect((await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id))).status).toBe(403);

    const s = await share(patient.id, doctor.doctor.id);
    await prisma.doctorShare.update({ where: { id: s.id }, data: { active: false } });
    expect((await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id))).status).toBe(403);
    expect(await prisma.clinicalGoal.count()).toBe(0);
  });

  it('validação: sem justification → 400; sem limites → 400; low>high → 400; justification >500 → 400', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(patient.id, doctor.doctor.id);
    const base = `/api/doctor/${doctor.doctor.id}/clinical-goals`;

    expect((await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { justification: '' }))).status).toBe(400);
    expect((await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { justification: 'x'.repeat(501) }))).status).toBe(400);
    expect((await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { targetLow: null, targetHigh: null }))).status).toBe(400);
    expect((await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { targetLow: 600, targetHigh: 450 }))).status).toBe(400);
    expect(await prisma.clinicalGoal.count()).toBe(0);
  });

  it('cria vigente, lista vigentes+expiradas, SUPERSEDE a anterior (histórico preservado)', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(patient.id, doctor.doctor.id);
    const base = `/api/doctor/${doctor.doctor.id}/clinical-goals`;

    const c1 = await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { targetLow: 300, targetHigh: 500 }));
    expect(c1.status).toBe(201);
    expect(c1.body.goal.vigente).toBe(true);
    expect(c1.body.goal.supersedesId).toBeNull();

    const c2 = await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { targetLow: 450, targetHigh: 600 }));
    expect(c2.status).toBe(201);
    expect(c2.body.goal.supersedesId).toBe(c1.body.goal.id);

    // antiga expirou (validTo=now), física continua no banco
    const old = await prisma.clinicalGoal.findUnique({ where: { id: c1.body.goal.id } });
    expect(old).toBeTruthy();
    expect(old!.validTo).toBeTruthy();

    const list = await api().get(`${base}?patientId=${patient.id}`).set(authHeader(doctor.token));
    expect(list.status).toBe(200);
    expect(list.body.goals).toHaveLength(2);
    const vigentes = list.body.goals.filter((g: any) => g.vigente);
    const expiradas = list.body.goals.filter((g: any) => !g.vigente);
    expect(vigentes).toHaveLength(1);
    expect(expiradas).toHaveLength(1);
    expect(vigentes[0].id).toBe(c2.body.goal.id);
    expect(vigentes[0].setBy).toContain('Dr.');
    expect(vigentes[0].setBy).toContain('CRM');
  });

  it('expire só seta validTo (nunca DELETE); idempotente; audita', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(patient.id, doctor.doctor.id);
    const base = `/api/doctor/${doctor.doctor.id}/clinical-goals`;

    const c = await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id));
    const id = c.body.goal.id;
    const e1 = await api().post(`${base}/${id}/expire`).set(authHeader(doctor.token));
    expect(e1.status).toBe(200);
    expect(e1.body.goal.vigente).toBe(false);
    expect(e1.body.goal.validTo).toBeTruthy();
    // de novo → ainda 200 (idempotente), row continua no banco
    const e2 = await api().post(`${base}/${id}/expire`).set(authHeader(doctor.token));
    expect(e2.status).toBe(200);
    expect(await prisma.clinicalGoal.count()).toBe(1);

    const logs = await prisma.auditLog.findMany({ where: { action: { in: ['CLINICAL_GOAL_CREATED', 'CLINICAL_GOAL_EXPIRED'] } }, orderBy: { id: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['CLINICAL_GOAL_CREATED', 'CLINICAL_GOAL_EXPIRED']);
    expect(logs[0].actorType).toBe('DOCTOR');
    expect(logs[0].actorId).toBe(doctor.doctor.id);
    expect(logs[1].after?.validTo).toBeTruthy();
  });
});

describe('clinical-goals: leitura do PACIENTE (E2.3)', () => {
  beforeEach(async () => { await resetDb(); });

  it('paciente LÊ metas vigentes dos próprios pacientes, com autoria visível; nunca as de outro user', async () => {
    const a = await createUser();
    const b = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(a.patient.id, doctor.doctor.id);
    await share(b.patient.id, doctor.doctor.id);
    const base = `/api/doctor/${doctor.doctor.id}/clinical-goals`;
    await api().post(base).set(authHeader(doctor.token)).send(goalBody(a.patient.id, { analyte: 'TESTOSTERONA_TOTAL' }));
    await api().post(base).set(authHeader(doctor.token)).send(goalBody(b.patient.id, { analyte: 'HEMATOCRITO' }));

    const g = await api().get('/api/sports/clinical-goals').set(authHeader(a.token));
    expect(g.status).toBe(200);
    expect(g.body.goals).toHaveLength(1);
    expect(g.body.goals[0].analyte).toBe('TESTOSTERONA_TOTAL');
    expect(g.body.goals[0].patientId).toBe(a.patient.id);
    expect(g.body.goals[0].setBy).toBe(`Dr. ${doctor.doctor.name} (CRM 11111-SP)`);
    expect(g.body.goals[0].justification).toBeTruthy();
    expect(g.body.goals[0].targetLow).toBe(450);

    // sem auth → 401
    expect((await api().get('/api/sports/clinical-goals')).status).toBe(401);
  });

  it('dependente do user também aparece; meta expirada NÃO aparece', async () => {
    const { user, token, patient } = await createUser();
    const dep = await createPatient(user.id, { relationship: 'Filha' });
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(patient.id, doctor.doctor.id);
    await share(dep.id, doctor.doctor.id);
    const base = `/api/doctor/${doctor.doctor.id}/clinical-goals`;
    await api().post(base).set(authHeader(doctor.token)).send(goalBody(patient.id, { analyte: 'HEMOGLOBINA' }));
    const depGoal = await api().post(base).set(authHeader(doctor.token)).send(goalBody(dep.id, { analyte: 'HEMATOCRITO' }));
    await api().post(`${base}/${depGoal.body.goal.id}/expire`).set(authHeader(doctor.token));

    const g = await api().get('/api/sports/clinical-goals').set(authHeader(token));
    expect(g.body.goals.map((x: any) => x.analyte)).toEqual(['HEMOGLOBINA']);
  });
});

describe('clinical-goals: REGRA INEGOCIÁVEL — meta nunca altera flags/alertas (E2)', () => {
  beforeEach(async () => { await resetDb(); });

  it('item ALTERADO com meta "atingida" continua alterado; health-state idêntico', async () => {
    const { patient, token } = await createUser();
    // Hemoglobina 19.0 com faixa 13–17 → HIGH/alterado; meta clínica 18–20 "cobre" o valor.
    const exam = await createExam(patient.id, { performedAt: new Date('2026-09-01T00:00:00Z') });
    await createItem(exam.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 19, refLow: 13, refHigh: 17, flag: 'HIGH', isAbnormal: true });

    const before = await buildCurrentHealthSummary(patient.id);
    const evoBefore = await api().get('/api/items/evolution').set(authHeader(token));
    const itemBefore = await prisma.examItem.findFirst({ where: { examId: exam.id } });
    /** Remove campos voláteis (timestamp de geração; idade em meses é float que muda a cada ms). */
    const stable = (s: any) => JSON.parse(JSON.stringify(s, (k, v) =>
      k === 'generatedAt' || k === 'ageMonths' ? undefined : (typeof v === 'number' ? Number(v.toFixed(4)) : v)));

    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(patient.id, doctor.doctor.id);
    const c = await api().post(`/api/doctor/${doctor.doctor.id}/clinical-goals`).set(authHeader(doctor.token))
      .send(goalBody(patient.id, { analyte: 'HEMOGLOBINA', targetLow: 18, targetHigh: 20, unit: 'g/dL' }));
    expect(c.status).toBe(201);

    const after = await buildCurrentHealthSummary(patient.id);
    const evoAfter = await api().get('/api/items/evolution').set(authHeader(token));
    const itemAfter = await prisma.examItem.findFirst({ where: { examId: exam.id } });

    // camada 4 INTOCADA pela meta: flag/isAbnormal e o motor de alerta seguem idênticos
    expect(itemAfter!.flag).toBe(itemBefore!.flag);
    expect(itemAfter!.isAbnormal).toBe(true);
    expect(stable(after)).toEqual(stable(before));
    expect(evoAfter.body.items.find((i: any) => i.nameCanonical === 'HEMOGLOBINA'))
      .toEqual(evoBefore.body.items.find((i: any) => i.nameCanonical === 'HEMOGLOBINA'));
    expect(evoAfter.body.items.find((i: any) => i.nameCanonical === 'HEMOGLOBINA')?.abnormal).toBe(true);
  });
});

describe('clinical-goals: sugestões (E2.6 — só médico)', () => {
  beforeEach(async () => { await resetDb(); });

  it('TESTOSTERONA_TOTAL medida + hormônio declarado → sugestão requiresReview; sem hormônio → vazia', async () => {
    const { patient, token } = await createUser();
    const doctor = await createDoctor({ crm: '11111-SP', email: 'cg-a@t.com' });
    await share(patient.id, doctor.doctor.id);
    const exam = await createExam(patient.id, {});
    await createItem(exam.id, { name: 'TESTOSTERONA', nameCanonical: 'TESTOSTERONA_TOTAL', valueNumeric: 380, refLow: 300, refHigh: 900 });

    const url = `/api/doctor/${doctor.doctor.id}/clinical-goal-suggestions?patientId=${patient.id}`;
    const empty = await api().get(url).set(authHeader(doctor.token));
    expect(empty.status).toBe(200);
    expect(empty.body.suggestions).toEqual([]);

    // E1.4: substância declarada = Medication com prefixo de classe no name
    await prisma.medication.create({ data: { patientId: patient.id, name: 'Hormônio — Testosterona (TRT)', dosage: 'prescrito', notes: 'uso médico' } });
    const s = await api().get(url).set(authHeader(doctor.token));
    expect(s.status).toBe(200);
    expect(s.body.suggestions).toHaveLength(1);
    expect(s.body.suggestions[0]).toMatchObject({ analyte: 'TESTOSTERONA_TOTAL', targetLow: 450, targetHigh: 600, unit: 'ng/dL', requiresReview: true });
    expect(s.body.suggestions[0].source).toContain('TRT');

    // paciente NÃO vê sugestões (rota médica)
    expect((await api().get(url).set(authHeader(token))).status).toBe(401);
  });
});
