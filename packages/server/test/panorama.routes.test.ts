// E2E do GET /api/patients/:id/panorama — fatos da saúde por área para a tela /relatorio.
// Contrato: packages/shared/src/panorama.ts. Cobre: auth/posse, paciente novo (nada inventado),
// paciente com dados (valor esperado por área + `changed`), CPF divergente fora, cache de 5 min
// com invalidação, fonte que falha → `unavailable` sem derrubar as outras, e as regras de status.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, resetDb, createUser, createPatient, createExam, createItem, getUserCredits, mintToken } from './helpers';
import { prisma } from '../src/prisma';
import { panoramaSources, computeChanges, withTimeout, downsample, dayIso } from '../src/analysis/panorama';
import { invalidateHealthSummary } from '../src/analysis/hs-cache';
import { lastBrDays } from '../src/analysis/daily-log-utils';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);
const noon = (brDay: string) => new Date(`${brDay}T12:00:00Z`);
const AREAS = ['exams', 'heart', 'weight', 'bodyComp', 'hormones', 'mind', 'diary', 'vitality', 'meds', 'care', 'vaccines', 'emergency'] as const;
const getPanorama = (token: string, patientId: string) => api().get(`/api/patients/${patientId}/panorama`).set(authHeader(token));

describe('GET /patients/:id/panorama — auth e contrato', () => {
  beforeEach(async () => { await resetDb(); });

  it('sem token → 401', async () => {
    const r = await api().get('/api/patients/qualquer/panorama');
    expect(r.status).toBe(401);
  });

  it('token de outra conta não lê o panorama (403) — o cache é do paciente do dono', async () => {
    const a = await createUser();
    const outsider = await createUser();
    const r = await api().get(`/api/patients/${a.patient.id}/panorama`).set(authHeader(mintToken(outsider.user.id)));
    expect(r.status).toBe(403);
  });

  it('paciente de outro usuário → 403 (mesmo bloqueio dos outros endpoints do paciente)', async () => {
    const a = await createUser();
    const b = await createUser();
    const r = await getPanorama(a.token, b.patient.id);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('Paciente não pertence ao usuário');
  });

  it('paciente novo: as 12 áreas presentes, todas `missing`, nenhum dado inventado', async () => {
    const u = await createUser();
    const r = await getPanorama(u.token, u.patient.id);
    expect(r.status).toBe(200);
    expect(r.body.patientId).toBe(u.patient.id);
    expect(new Date(r.body.generatedAt).toISOString()).toBe(r.body.generatedAt);
    expect(Object.keys(r.body).sort()).toEqual([...AREAS, 'patientId', 'generatedAt', 'changed'].sort());
    expect(r.body.changed).toEqual([]);
    for (const key of AREAS) {
      expect(r.body[key], key).toEqual({ key, status: 'missing', asOf: null, data: null });
    }
  });
});

describe('GET /patients/:id/panorama — paciente com dados', () => {
  beforeEach(async () => { await resetDb(); });

  it('cada área com os valores esperados, grátis, e `changed` correto', async () => {
    const u = await createUser({ credits: 100 });
    const pid = u.patient.id;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } });
    await prisma.patient.update({ where: { id: pid }, data: { heightCm: 178, dateOfBirth: new Date('1980-05-10'), allergies: 'Dipirona' } });

    // ── exames: A (100d) → B (10d). C é de OUTRA pessoa (CPF divergente) e é o mais recente.
    const examADate = daysAgo(100); const examBDate = daysAgo(10);
    const examA = await createExam(pid, { title: 'Hemograma', performedAt: examADate });
    await createItem(examA.id, { name: 'HEMOGLOBINA', valueNumeric: 13.5, refLow: 12, refHigh: 16 });
    await createItem(examA.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 6.5, refLow: 0.4, refHigh: 4, flag: 'HIGH', isAbnormal: true, unit: 'mUI/L' });
    await createItem(examA.id, { name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueNumeric: 95, refLow: 70, refHigh: 100, unit: 'mg/dL' });
    await createItem(examA.id, { name: 'LDL', nameCanonical: 'LDL', valueNumeric: 150, refLow: 0, refHigh: 130, flag: 'HIGH', isAbnormal: true, unit: 'mg/dL' });
    await createItem(examA.id, { name: 'VITAMINA D', nameCanonical: 'VITAMINA_D', valueNumeric: 28, refLow: 30, refHigh: 100, flag: 'LOW', isAbnormal: true, unit: 'ng/mL' });
    const examB = await createExam(pid, { title: 'Painel de rotina', performedAt: examBDate });
    await createItem(examB.id, { name: 'HEMOGLOBINA', valueNumeric: 14.2, refLow: 12, refHigh: 16 });
    await createItem(examB.id, { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 2.1, refLow: 0.4, refHigh: 4, unit: 'mUI/L' });
    await createItem(examB.id, { name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueNumeric: 110, refLow: 70, refHigh: 100, flag: 'HIGH', isAbnormal: true, unit: 'mg/dL' });
    await createItem(examB.id, { name: 'LDL', nameCanonical: 'LDL', valueNumeric: 170, refLow: 0, refHigh: 130, flag: 'HIGH', isAbnormal: true, unit: 'mg/dL' });
    await createItem(examB.id, { name: 'VITAMINA D', nameCanonical: 'VITAMINA_D', valueNumeric: 24, refLow: 30, refHigh: 100, flag: 'LOW', isAbnormal: true, unit: 'ng/mL' });
    await createItem(examB.id, { name: 'T4 LIVRE', nameCanonical: 'T4_LIVRE', valueNumeric: 1.1, refLow: 0.8, refHigh: 1.8, unit: 'ng/dL' });
    const examC = await createExam(pid, { title: 'Exame de outra pessoa', performedAt: daysAgo(1) });
    await createItem(examC.id, { name: 'HEMOGLOBINA', valueNumeric: 99, refLow: 12, refHigh: 16, flag: 'CRITICAL', isAbnormal: true });
    await prisma.exam.update({ where: { id: examC.id }, data: { rawExtraction: { identityMatch: { method: 'cpf', cpfMatch: false } } } });

    // ── peso, pressão, composição
    const wOld = daysAgo(40); const wAt = daysAgo(3); const bpAt = daysAgo(2); const bcAt = daysAgo(5);
    await prisma.measurement.createMany({ data: [
      { patientId: pid, type: 'WEIGHT', value: 83, unit: 'kg', measuredAt: wOld },
      { patientId: pid, type: 'WEIGHT', value: 81.5, unit: 'kg', measuredAt: wAt },
      { patientId: pid, type: 'BLOOD_PRESSURE', value: 120, valueSecondary: 76, unit: 'mmHg', measuredAt: daysAgo(30) },
      { patientId: pid, type: 'BLOOD_PRESSURE', value: 135, valueSecondary: 88, unit: 'mmHg', measuredAt: bpAt },
    ] });
    await prisma.bodyComposition.create({ data: { patientId: pid, measuredAt: bcAt, source: 'INBODY_QR', bodyFatPct: 22.5, skeletalMuscleKg: 34.2, weightKg: 81.5 } });

    // ── rastreio mental: PHQ-9 (leve) → GAD-7 (leve) → PHQ-9 (moderadamente grave)
    const s1 = daysAgo(20); const s2 = daysAgo(15); const s3 = daysAgo(2);
    await prisma.mentalHealthScreening.createMany({ data: [
      { patientId: pid, type: 'phq9', total: 8, answers: [1, 1, 1, 1, 1, 1, 1, 1, 0], createdAt: s1 },
      { patientId: pid, type: 'gad7', total: 7, answers: [1, 1, 1, 1, 1, 1, 1], createdAt: s2 },
      { patientId: pid, type: 'phq9', total: 15, answers: [2, 2, 2, 2, 2, 2, 2, 1, 0], createdAt: s3 },
    ] });

    // ── diário (3 dias seguidos, terminando hoje no fuso BR)
    const [d2, d1, d0] = lastBrDays(3);
    await prisma.dailyLog.createMany({ data: [
      { patientId: pid, date: noon(d2), mood: 4, energy: 3, symptoms: ['INSONIA'] },
      { patientId: pid, date: noon(d1), mood: 2, energy: 3, symptoms: ['DOR_CABECA'] },
      { patientId: pid, date: noon(d0), mood: 3, energy: 4, symptoms: ['DOR_CABECA', 'CANSAICO'] },
    ] });

    // ── atividade (Health Connect) pelo endpoint real de sync
    const sync = await api().post('/api/measurements/activity-sync').set(authHeader(u.token))
      .send({ patientId: pid, days: [d2, d1, d0].map((date, i) => ({ date, steps: 5000 + i * 1000, hr: 70 + i, exerciseMin: 30, sleepMin: 420 + i * 10 })) });
    expect(sync.status).toBe(201);

    // ── remédio, compromissos, pergunta, vacinas
    await prisma.medication.create({ data: { patientId: pid, name: 'Losartana', dosage: '50 mg', active: true } });
    const consultAt = daysAhead(1);
    await prisma.reminder.createMany({ data: [
      { patientId: pid, ownerId: user.id, title: 'Refazer hemograma', dueDate: daysAgo(2) }, // atrasado
      { patientId: pid, ownerId: user.id, title: 'Consulta antiga', dueDate: daysAgo(30), done: true, type: 'consulta' },
      { patientId: pid, ownerId: user.id, title: 'Exame de sangue', dueDate: daysAhead(0.5), type: 'exame' }, // tarefa, não consulta
    ] });
    await prisma.patientConsultation.createMany({ data: [
      { patientId: pid, ownerId: user.id, doctorName: 'Dr Beto', specialty: 'Dermatologia', scheduledAt: consultAt, reason: 'Checkup de rotina' },
      { patientId: pid, ownerId: user.id, doctorName: 'Dr Cancelado', scheduledAt: daysAhead(0.25), status: 'cancelled' },
    ] });
    const doctor = await prisma.doctor.create({ data: { name: 'Dra Ana', crm: '99999-SP', email: `pan-${Date.now()}@t.com`, passwordHash: 'x', specialty: 'Cardiologia' } });
    await prisma.doctorQuestion.create({ data: { patientId: pid, doctorId: doctor.id, subject: 'Posso tomar em jejum?', status: 'open' } });
    await prisma.doctorQuestion.create({ data: { patientId: pid, doctorId: doctor.id, subject: 'Já respondida', status: 'answered', answeredAt: new Date() } });
    const nextDose = daysAhead(20);
    await prisma.vaccine.createMany({ data: [
      { patientId: pid, name: 'Influenza', dateApplied: daysAgo(400), nextDoseDate: daysAgo(35) }, // atrasada
      { patientId: pid, name: 'COVID-19', dateApplied: daysAgo(200), nextDoseDate: nextDose },
    ] });

    const r = await getPanorama(u.token, pid);
    expect(r.status).toBe(200);
    const b = r.body;
    expect(Object.keys(b).sort()).toEqual([...AREAS, 'patientId', 'generatedAt', 'changed'].sort());

    // ── exames: CPF divergente NÃO entra (C é o mais recente e teria 1 alterado CRITICAL)
    expect(b.exams).toMatchObject({ key: 'exams', status: 'attention', asOf: examBDate.toISOString() });
    expect(b.exams.data.lastExam).toEqual({ id: examB.id, title: 'Painel de rotina', performedAt: examBDate.toISOString() });
    expect(b.exams.data.examCount).toBe(2);
    expect(b.exams.data.itemCount).toBe(6);
    expect(b.exams.data.abnormalCount).toBe(3);
    expect(b.exams.data.abnormal.map((a: any) => a.name)).toEqual(['GLICEMIA', 'LDL', 'VITAMINA D']);
    expect(b.exams.data.abnormal[0]).toEqual({
      id: expect.any(String), name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueText: '110', valueNumeric: 110, unit: 'mg/dL',
      flag: 'HIGH', ref: { low: 70, high: 100, text: '70-100' }, extractedPage: 1,
    });
    expect(b.exams.data.retest).toMatchObject({ months: 3, status: 'longe' }); // mesmo cálculo do GET /retest
    expect(b.exams.data.abnormalPerExam).toEqual([
      { at: examADate.toISOString(), count: 3 },
      { at: examBDate.toISOString(), count: 3 },
    ]);

    // ── coração: última aferição completa, série da sistólica, MESMO placar do health-summary
    expect(b.heart).toMatchObject({ status: 'attention', asOf: bpAt.toISOString() });
    expect(b.heart.data.bp).toEqual({ systolic: 135, diastolic: 88, at: bpAt.toISOString() });
    expect(b.heart.data.bpSeries.map((p: any) => p.v)).toEqual([120, 135]);
    expect(b.heart.data.cardioRisk).toEqual({ level: 'moderate', label: 'moderado' }); // LDL 170 + PAS 135 + IMC 25,7 = 35
    expect(b.heart.data.bodyAge).toBeNull(); // sem marcadores suficientes → não inventa

    // ── peso e composição
    expect(b.weight).toMatchObject({ status: 'ok', asOf: wAt.toISOString() });
    expect(b.weight.data.latest).toEqual({ v: 81.5, at: wAt.toISOString() });
    expect(b.weight.data.series.map((p: any) => p.v)).toEqual([83, 81.5]);
    expect(b.weight.data.bmi).toBe(25.7);
    expect(b.bodyComp.status).toBe('ok');
    expect(b.bodyComp.data.latest).toEqual({ at: bcAt.toISOString(), bodyFatPct: 22.5, skeletalMusclePct: 42, skeletalMuscleKg: 34.2 });

    // ── hormônios: último valor + série de 12 meses; régua do laudo.
    // O app grava o canônico VITAMINA_D / T4_LIVRE; a resposta usa a chave do contrato (VITAMIN_D / T4_FREE).
    expect(b.hormones).toMatchObject({ status: 'attention', asOf: examBDate.toISOString() });
    expect(b.hormones.data.radarInUse).toBe(false);
    const mk = Object.fromEntries(b.hormones.data.markers.map((m: any) => [m.key, m]));
    expect(b.hormones.data.markers.map((m: any) => m.key)).toEqual(['TSH', 'T4_FREE', 'VITAMIN_D']);
    expect(mk.TSH).toMatchObject({ status: 'in', valueNumeric: 2.1, valueText: '2.1', at: examBDate.toISOString() });
    expect(mk.TSH.series).toEqual([{ at: examADate.toISOString(), v: 6.5 }, { at: examBDate.toISOString(), v: 2.1 }]);
    expect(mk.T4_FREE).toMatchObject({ status: 'in', valueNumeric: 1.1, name: 'T4 livre' });
    expect(mk.VITAMIN_D).toMatchObject({ status: 'low', valueNumeric: 24, name: 'Vitamina D', ref: { low: 30, high: 100 } });

    // ── mente: últimos totais de cada instrumento + anterior + histórico
    expect(b.mind).toMatchObject({ status: 'attention', asOf: s3.toISOString() });
    expect(b.mind.data.latest).toMatchObject({ at: s3.toISOString(), phq9: 15, gad7: 7, phq9Band: 'moderadamente grave', gad7Band: 'leve', suicidalIdeation: false, phq9At: s3.toISOString(), gad7At: s2.toISOString() });
    expect(b.mind.data.previous).toMatchObject({ at: s2.toISOString(), phq9: 8, gad7: 7, phq9Band: 'leve', gad7Band: 'leve' });
    expect(b.mind.data.history.map((h: any) => h.at)).toEqual([s1.toISOString(), s2.toISOString(), s3.toISOString()]);

    // ── diário: streak, médias de 7 dias e o RÓTULO de cada sintoma
    expect(b.diary.status).toBe('ok');
    expect(b.diary.asOf).toBe(noon(d0).toISOString()); // dia civil ao meio-dia UTC (não vira o dia anterior no fuso BR)
    expect(b.diary.data).toMatchObject({ streak: 3, daysLogged90: 3, moodAvg7: 3, energyAvg7: 3.3 });
    expect(b.diary.data.last7).toHaveLength(7);
    expect(b.diary.data.last7[0]).toEqual({ date: lastBrDays(7)[0], mood: null, energy: null, symptoms: [] });
    expect(b.diary.data.last7[6]).toEqual({ date: d0, mood: 3, energy: 4, symptoms: ['Dor de cabeça', 'Cansaço'] });
    expect(b.diary.data.topSymptoms).toEqual([{ name: 'Dor de cabeça', days: 2 }, { name: 'Insônia', days: 1 }, { name: 'Cansaço', days: 1 }]);

    // ── vitalidade: o mesmo resumo de GET /measurements/activity-summary
    expect(b.vitality.status).toBe('ok');
    expect(b.vitality.data.sleepMinutes).toEqual({ latest: 440, avg7: 430, avg30: 430, series7: expect.any(Array) });
    expect(b.vitality.data.steps.series7.map((p: any) => p.v)).toEqual([5000, 6000, 7000]);
    expect(b.vitality.data.steps.series7[2].at).toBe(`${d0}T12:00:00.000Z`);
    expect(b.vitality.data.heartRate.latest).toBe(72);
    expect(b.vitality.data.exerciseMinutes.latest).toBe(30);

    // ── remédios, compromissos, vacinas, emergência
    expect(b.meds.status).toBe('ok');
    expect(b.meds.data.active).toEqual([expect.objectContaining({ name: 'Losartana', dose: '50 mg' })]);
    expect(b.meds.data.criticalInteractions).toBe(0);
    expect(b.care.status).toBe('ok');
    expect(b.care.data.nextAppointment).toEqual({ at: consultAt.toISOString(), doctor: 'Dr Beto', specialty: 'Dermatologia', title: 'Checkup de rotina' });
    expect(b.care.data).toMatchObject({ pendingQuestions: 1, overdueReminders: 1 });
    expect(b.vaccines.status).toBe('attention');
    expect(b.vaccines.data).toEqual({ count: 2, overdue: 1, nextDue: { name: 'COVID-19', date: nextDose.toISOString() } });
    expect(b.emergency).toEqual({ key: 'emergency', status: 'ok', asOf: null, data: { configured: true } });

    // ── o que mudou: do mais recente para o mais antigo; no mesmo exame, o mais importante primeiro
    expect(b.changed).toEqual([
      { area: 'mind', kind: 'screening', subject: 'PHQ-9', before: 8, after: 15, unit: 'pontos', at: s3.toISOString() },
      { area: 'exams', kind: 'left_range', subject: 'Glicemia', before: 95, after: 110, unit: 'mg/dL', at: examBDate.toISOString() },
      { area: 'exams', kind: 'worsened', subject: 'LDL', before: 150, after: 170, unit: 'mg/dL', at: examBDate.toISOString() },
      { area: 'exams', kind: 'worsened', subject: 'Vitamina D', before: 28, after: 24, unit: 'ng/mL', at: examBDate.toISOString() },
      { area: 'exams', kind: 'entered_range', subject: 'TSH', before: 6.5, after: 2.1, unit: 'mUI/L', at: examBDate.toISOString() },
    ]);

    // ── grátis: nenhum crédito mexido, nenhum uso de IA registrado
    expect(await getUserCredits(user.id)).toBe(100);
    expect(await prisma.creditTransaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.aiUsageLog.count({ where: { userId: user.id } })).toBe(0);
  });

  it('cache: 2ª chamada devolve o mesmo corpo; invalidação do health-summary limpa o panorama', async () => {
    const u = await createUser();
    const r1 = await getPanorama(u.token, u.patient.id);
    await prisma.vaccine.create({ data: { patientId: u.patient.id, name: 'Influenza', dateApplied: daysAgo(10) } });
    const r2 = await getPanorama(u.token, u.patient.id); // ainda dentro dos 5 min → cache
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(r2.body.vaccines.status).toBe('missing'); // dado velho, como o cache manda

    invalidateHealthSummary(u.patient.id); // mesmo gatilho que a extração/delete de exame já usa
    const r3 = await getPanorama(u.token, u.patient.id);
    expect(r3.body.vaccines.status).toBe('ok');
    expect(r3.body.vaccines.data.count).toBe(1);
  });

  it('fonte que falha vira `unavailable` sem derrubar as outras (resposta continua 200)', async () => {
    const u = await createUser();
    await createExam(u.patient.id, { performedAt: daysAgo(5) });
    const tableMissing = Object.assign(new Error('The table `public.vaccines` does not exist in the current database.'), { code: 'P2021' });
    const spy = vi.spyOn(panoramaSources, 'vaccines').mockRejectedValue(tableMissing);
    try {
      const r = await getPanorama(u.token, u.patient.id);
      expect(r.status).toBe(200);
      expect(r.body.vaccines).toEqual({ key: 'vaccines', status: 'unavailable', asOf: null, data: null });
      expect(r.body.exams.status).toBe('ok');
      expect(r.body.exams.data.examCount).toBe(1);
      expect(r.body.weight.status).toBe('missing');
      expect(r.body.changed).toEqual([]);
    } finally { spy.mockRestore(); }
    const ok = await getPanorama(u.token, u.patient.id); // falha não fica no cache
    expect(ok.body.vaccines.status).toBe('missing');
  });
});

describe('GET /patients/:id/panorama — regras de status', () => {
  beforeEach(async () => { await resetDb(); });

  it('stale vence attention nas medidas (exame e pressão de 200 dias); diário sem registro há 8 dias; sync há 5 dias', async () => {
    const u = await createUser();
    const pid = u.patient.id;
    const old = daysAgo(200);
    const exam = await createExam(pid, { title: 'Antigo', performedAt: old });
    await createItem(exam.id, { name: 'LDL', nameCanonical: 'LDL', valueNumeric: 190, refLow: 0, refHigh: 130, flag: 'HIGH', isAbnormal: true });
    await prisma.measurement.create({ data: { patientId: pid, type: 'BLOOD_PRESSURE', value: 150, valueSecondary: 95, unit: 'mmHg', measuredAt: old } });
    const [d8] = lastBrDays(9);
    await prisma.dailyLog.create({ data: { patientId: pid, date: noon(d8), mood: 3 } });
    await prisma.measurement.create({ data: { patientId: pid, type: 'STEPS', value: 5000, unit: 'passos', measuredAt: daysAgo(5), note: 'Health Connect', createdAt: daysAgo(5) } });

    const r = await getPanorama(u.token, pid);
    const b = r.body;
    expect(b.exams.status).toBe('stale'); // LDL alto, mas de 200 dias atrás: não é estado atual
    expect(b.exams.data.abnormalCount).toBe(1); // o valor continua lá, com a data (asOf)
    expect(b.exams.asOf).toBe(old.toISOString());
    expect(b.heart).toMatchObject({ status: 'stale', asOf: old.toISOString() });
    expect(b.heart.data.bp).toEqual({ systolic: 150, diastolic: 95, at: old.toISOString() });
    expect(b.diary).toMatchObject({ status: 'stale', asOf: noon(d8).toISOString() });
    expect(b.vitality.status).toBe('stale');
    expect(b.vitality.data.steps.latest).toBe(5000);
  });

  it('mente: ideação suicida (item 9 do PHQ-9) é attention mesmo com o rastreio antigo', async () => {
    const u = await createUser();
    const at = daysAgo(120);
    await prisma.mentalHealthScreening.create({ data: { patientId: u.patient.id, type: 'phq9', total: 1, answers: [0, 0, 0, 0, 0, 0, 0, 0, 1], createdAt: at } });
    const r = await getPanorama(u.token, u.patient.id);
    expect(r.body.mind.status).toBe('attention');
    expect(r.body.mind.data.latest).toMatchObject({ phq9: 1, suicidalIdeation: true, phq9At: at.toISOString() });
  });

  it('mente: banda "leve" é ok; a partir de "moderada" é attention (pela CHAVE da banda, não pelo label)', async () => {
    const leve = await createUser();
    await prisma.mentalHealthScreening.create({ data: { patientId: leve.patient.id, type: 'phq9', total: 8, answers: [1, 1, 1, 1, 1, 1, 1, 1, 0], createdAt: daysAgo(2) } }); // item 9 = 0
    const rLeve = await getPanorama(leve.token, leve.patient.id);
    expect(rLeve.body.mind.status).toBe('ok');
    expect(rLeve.body.mind.data.latest.phq9Band).toBe('leve');

    const moderada = await createUser();
    await prisma.mentalHealthScreening.create({ data: { patientId: moderada.patient.id, type: 'gad7', total: 12, answers: [2, 2, 2, 2, 2, 1, 1], createdAt: daysAgo(2) } });
    const rMod = await getPanorama(moderada.token, moderada.patient.id);
    expect(rMod.body.mind.status).toBe('attention');
    expect(rMod.body.mind.data.latest.gad7Band).toBe('moderada');

    const grave = await createUser();
    await prisma.mentalHealthScreening.create({ data: { patientId: grave.patient.id, type: 'phq9', total: 15, answers: [2, 2, 2, 2, 2, 2, 2, 1, 0], createdAt: daysAgo(2) } });
    const rGrave = await getPanorama(grave.token, grave.patient.id);
    expect(rGrave.body.mind.status).toBe('attention');
    expect(rGrave.body.mind.data.latest.phq9Band).toBe('moderadamente grave');
  });

  it('mente: questionário nunca respondido → total null e banda "não realizado" (nunca 0)', async () => {
    const u = await createUser();
    await prisma.mentalHealthScreening.create({ data: { patientId: u.patient.id, type: 'phq9', total: 3, answers: [0, 0, 0, 0, 0, 1, 1, 1, 0], createdAt: daysAgo(3) } });
    const r = await getPanorama(u.token, u.patient.id);
    expect(r.body.mind.status).toBe('ok');
    expect(r.body.mind.data.latest).toMatchObject({ phq9: 3, phq9Band: 'mínima', gad7: null, gad7Band: 'não realizado', gad7At: null });
    expect(r.body.mind.data.previous).toBeNull();
  });

  it('remédios: interação crítica D/X entre os ativos → attention (mesma conta do /check)', async () => {
    const u = await createUser();
    const pid = u.patient.id;
    await prisma.interactionRule.create({ data: { drugA: 'IBUPROFENO', drugB: 'VARFARINA', severity: 'D', effect: 'sangramento', recommendation: 'converse com o médico' } });
    await prisma.medication.createMany({ data: [
      { patientId: pid, name: 'Varfarina', active: true },
      { patientId: pid, name: 'Ibuprofeno', active: true },
      { patientId: pid, name: 'Losartana', active: false }, // inativo não entra
    ] });
    const r = await getPanorama(u.token, pid);
    expect(r.body.meds.status).toBe('attention');
    expect(r.body.meds.data.criticalInteractions).toBe(1);
    expect(r.body.meds.data.active.map((m: any) => m.name).sort()).toEqual(['Ibuprofeno', 'Varfarina']);
  });

  it('vacina com data só-data (gravada à meia-noite UTC): a próxima dose não aparece como o dia anterior', async () => {
    const u = await createUser();
    await prisma.vaccine.create({ data: { patientId: u.patient.id, name: 'dTpa', dateApplied: new Date('2026-02-10'), nextDoseDate: new Date('2027-01-15') } });
    const r = await getPanorama(u.token, u.patient.id);
    expect(r.body.vaccines.data.nextDue).toEqual({ name: 'dTpa', date: '2027-01-15T12:00:00.000Z' });
    expect(r.body.vaccines.asOf).toBe('2026-02-10T12:00:00.000Z');
    expect(r.body.vaccines.status).toBe('ok');
  });

  it('compromisso criado pelo médico: nome e especialidade vêm do médico', async () => {
    const u = await createUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } });
    const doctor = await prisma.doctor.create({ data: { name: 'Dra Ana', crm: '88888-SP', email: `pan2-${Date.now()}@t.com`, passwordHash: 'x', specialty: 'Cardiologia' } });
    const at = daysAhead(2);
    await prisma.reminder.create({ data: { patientId: u.patient.id, ownerId: user.id, title: 'Teleconsulta', dueDate: at, type: 'teleconsulta', createdByDoctorId: doctor.id } });
    const r = await getPanorama(u.token, u.patient.id);
    expect(r.body.care.data.nextAppointment).toEqual({ at: at.toISOString(), doctor: 'Dra Ana', specialty: 'Cardiologia', title: 'Teleconsulta' });
  });

  it('paciente de dependente do mesmo usuário também abre (posse pelo dono)', async () => {
    const u = await createUser();
    const dep = await createPatient(u.user.id, { fullName: 'Dependente Panorama' });
    const r = await getPanorama(u.token, dep.id);
    expect(r.status).toBe(200);
    expect(r.body.patientId).toBe(dep.id);
  });
});

describe('panorama — funções puras', () => {
  it('computeChanges sem dados não inventa mudança', () => {
    expect(computeChanges(new Date(), { exams: null, mind: null, vitality: null, weight: null })).toEqual([]);
  });

  it('withTimeout: fonte pendurada vira erro no teto; fonte rápida devolve o valor', async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise<never>(() => {}), 100, 'vaccines');
      const assertion = expect(pending).rejects.toThrow(/fonte "vaccines" excedeu 100ms/);
      await vi.advanceTimersByTimeAsync(101);
      await assertion;
      await expect(withTimeout(Promise.resolve(7), 100, 'x')).resolves.toBe(7);
    } finally { vi.useRealTimers(); }
  });

  it('dayIso: data só-data gravada à meia-noite UTC sai ao meio-dia do MESMO dia (não vira o dia anterior no fuso BR)', () => {
    expect(dayIso(new Date('2026-12-16T00:00:00.000Z'))).toBe('2026-12-16T12:00:00.000Z');
    expect(dayIso(new Date('2026-12-16T14:30:00.000Z'))).toBe('2026-12-16T14:30:00.000Z'); // com horário: como veio
  });

  it('downsample: nunca passa do teto e sempre inclui o primeiro e o último ponto', () => {
    const pts = Array.from({ length: 180 }, (_, i) => i);
    const out = downsample(pts, 12);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe(0);
    expect(out[11]).toBe(179);
    expect(downsample([1, 2, 3], 12)).toEqual([1, 2, 3]);
    expect(downsample([], 12)).toEqual([]);
  });
});
