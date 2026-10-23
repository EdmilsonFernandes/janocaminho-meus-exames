// E2E (supertest) — Sinais vitais do paciente no brief do médico (23/10).
// Fluxo REAL: o APK sincroniza o Health Connect via POST /api/measurements/activity-sync
// (mesma rota que o app usa — ActivityCard mount + backfill + página Sinais); o médico lê
// o consolidado em GET /api/doctor/patients/:id/vitals (scope 'exams', igual aos exames).
// Reuso da tabela measurements: mesma fonte da verdade, sem tabela/migration nova.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';
import { prisma } from '../src/prisma';

const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });

const today = () => new Date().toISOString().slice(0, 10);
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Sincroniza dias de atividade como o APK faria (token do paciente). */
const syncDays = (token: string, patientId: string, days: Array<Record<string, number | string>>) =>
  api().post('/api/measurements/activity-sync').set(authHeader(token)).send({ patientId, days });

describe('GET /api/doctor/patients/:patientId/vitals — sinais vitais no brief', () => {
  beforeEach(async () => { await resetDb(); });

  it('sync idempotente (2× mesmo dia não duplica) + médico com share lê dias e summary', async () => {
    const { patient, token } = await createUser();
    const crm = '77777-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'vitalsdoc@t.com' });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });

    // 2 sincronizações do MESMO dia (aparelho corrigiu o valor) — upsert, não duplica
    const day = { date: today(), steps: 8200, kcal: 450, km: 5.5, hr: 62, sleepMin: 402, exerciseMin: 30 };
    expect((await syncDays(token, patient.id, [day])).status).toBe(201);
    expect((await syncDays(token, patient.id, [{ ...day, steps: 9100 }])).status).toBe(201);
    // 1 linha por métrica (não 2): STEPS + CALORIES + DISTANCE + HEART_RATE + SLEEP_MINUTES + EXERCISE_MINUTES
    expect(await prisma.measurement.count({ where: { patientId: patient.id } })).toBe(6);

    // Peso manual (o bridge do HC não expõe peso — vem das medições do paciente)
    await prisma.measurement.create({ data: { patientId: patient.id, type: 'WEIGHT', value: 82, unit: 'kg', measuredAt: new Date(Date.now() - 3 * 86400000) } });

    const r = await api().get(`/api/doctor/patients/${patient.id}/vitals`).set(H2(docToken));
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(1);
    expect(r.body.days[0]).toMatchObject({ date: today(), restingHr: 62, sleepMinutes: 402, steps: 9100, activeKcal: 450, exerciseMin: 30 }); // steps ATUALIZADOS pelo re-sync
    expect(r.body.summary).toMatchObject({ restingHrAvg30d: 62, sleepAvg30dMin: 402, stepsAvg30d: 9100, lastWeightKg: 82, lastDay: today() });
    expect(r.body.lastSyncAt).toBeTruthy();
  });

  it('médico SEM share → 403; share com outro scope → 403; paciente (token user) → 403', async () => {
    const { patient, token } = await createUser();
    await syncDays(token, patient.id, [{ date: today(), steps: 1000, kcal: 100, km: 1, hr: 60, sleepMin: 400 }]);

    const crm = '77778-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'vitalsnoc@t.com' });
    const noShare = await api().get(`/api/doctor/patients/${patient.id}/vitals`).set(H2(docToken));
    expect(noShare.status).toBe(403);

    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['evolution'], patientId: patient.id });
    const wrongScope = await api().get(`/api/doctor/patients/${patient.id}/vitals`).set(H2(docToken));
    expect(wrongScope.status).toBe(403);

    const asPatient = await api().get(`/api/doctor/patients/${patient.id}/vitals`).set(authHeader(token));
    expect(asPatient.status).toBe(401); // requireDoctor: token de paciente não é token de médico
  });

  it('paciente sem smartwatch (sem sync) → 200 com days vazio e summary nulo (brief sem seção)', async () => {
    const { patient, token } = await createUser();
    const crm = '77779-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'vitalsvazio@t.com' });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });

    const r = await api().get(`/api/doctor/patients/${patient.id}/vitals`).set(H2(docToken));
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(0);
    expect(r.body.summary).toMatchObject({ restingHrAvg30d: null, stepsAvg30d: null, lastWeightKg: null, lastDay: null });
  });

  it('média 30d conta só dias com dado e ignora medição MANUAL de FC (só Health Connect)', async () => {
    const { patient, token } = await createUser();
    const crm = '77780-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'vitalsavg@t.com' });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });

    // FC manual (sem note) NÃO entra no consolidado do brief — só o que o smartwatch sincronizou
    await prisma.measurement.create({ data: { patientId: patient.id, type: 'HEART_RATE', value: 99, unit: 'bpm', measuredAt: new Date(`${today()}T09:00:00`) } });
    // Dia FORA da janela de 30d (não contabiliza na média) + 2 dias dentro
    await syncDays(token, patient.id, [
      { date: ago(40), steps: 5000, kcal: 100, km: 3, hr: 80, sleepMin: 300 },
      { date: ago(2), steps: 8000, kcal: 400, km: 5, hr: 60, sleepMin: 420 },
      { date: ago(1), steps: 9000, kcal: 500, km: 6, hr: 64, sleepMin: 460 },
    ]);

    const r = await api().get(`/api/doctor/patients/${patient.id}/vitals`).set(H2(docToken));
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(3); // 90d traz tudo — a janela de 30d é só no summary
    expect(r.body.summary.stepsAvg30d).toBe(8500); // (8000+9000)/2 — dia de 40d fora da média
    expect(r.body.summary.restingHrAvg30d).toBe(62); // (60+64)/2 — manual 99 ignorada
    expect(r.body.summary.sleepAvg30dMin).toBe(440); // (420+460)/2
  });
});
