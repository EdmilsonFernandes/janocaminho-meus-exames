import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';

/**
 * GET /api/measurements/activity-summary — consolidação da atividade sincronizada
 * pelo Health Connect (fonte da WEB no ActivityCard duas-fontes). Contrato:
 * shape estável por métrica (latest/avg7/avg30/prevAvg30/deltaPct30/séries),
 * goal+goalPct só em STEPS, lastSyncAt = max(createdAt), SEM migration.
 */
const H = (t: string) => ({ Authorization: `Bearer ${t}` });
const day = (date: string, steps: number, kcal: number, km: number, hr = 0) => ({ date, steps, kcal, km, hr });
/** Data relativa a hoje (o endpoint filtra por janela temporal — datas fixas apodrecem). */
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

async function seed(token: string, patientId: string, days: ReturnType<typeof day>[]) {
  const r = await api().post('/api/measurements/activity-sync').set(H(token)).send({ patientId, days });
  expect(r.status).toBe(201);
}

describe('GET /api/measurements/activity-summary', () => {
  beforeEach(async () => { await resetDb(); });

  it('consolida por métrica: latest, goal/goalPct em STEPS, médias, séries e lastSyncAt', async () => {
    const { token, patient } = await createUser();
    await seed(token, patient.id, [
      day(iso(-1), 5214, 628, 3.46, 62),
      day(iso(-2), 4800, 600, 3.1, 64),
      day(iso(-3), 6100, 700, 4.0, 61),
    ]);
    const r = await api().get('/api/measurements/activity-summary').set(H(token)).query({ patientId: patient.id, days: 30 });
    expect(r.status).toBe(200);
    expect(r.body.lastSyncAt).toBeTruthy();

    const steps = r.body.metrics.STEPS;
    expect(steps.latest).toBe(5214);
    expect(steps.latestDate).toBe(iso(-1));
    expect(steps.goal).toBe(8000);
    expect(steps.goalPct).toBe(65); // 5214/8000
    expect(steps.avg7).toBe(Math.round((5214 + 4800 + 6100) / 3));
    expect(steps.series7).toHaveLength(3);
    expect(steps.series7[0].date).toBe(iso(-3)); // série ASC

    const hr = r.body.metrics.HEART_RATE;
    expect(hr.latest).toBe(62);
    expect(hr.goal).toBeUndefined(); // meta é só de passos

    // DISTANCE preserva 2 decimais (round() genérico amassava 3,46 → 3)
    expect(r.body.metrics.DISTANCE.latest).toBe(3.46);
    expect(r.body.metrics.CALORIES.latest).toBe(628);
  });

  it('shape estável sem dados: lastSyncAt null + métricas com latest null e séries vazias', async () => {
    const { token, patient } = await createUser();
    const r = await api().get('/api/measurements/activity-summary').set(H(token)).query({ patientId: patient.id });
    expect(r.status).toBe(200);
    expect(r.body.lastSyncAt).toBeNull();
    for (const t of ['STEPS', 'CALORIES', 'DISTANCE', 'HEART_RATE']) {
      expect(r.body.metrics[t]).toMatchObject({ latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] });
    }
    expect(r.body.metrics.STEPS.goal).toBe(8000);
  });

  it('deltaPct30 compara com o período anterior da MESMA métrica', async () => {
    const { token, patient } = await createUser();
    await seed(token, patient.id, [
      day(iso(-1), 10000, 100, 1), day(iso(-2), 10000, 100, 1), day(iso(-3), 10000, 100, 1), // janela atual (days=7)
      day(iso(-8), 5000, 100, 1), day(iso(-9), 5000, 100, 1),                                // janela anterior
    ]);
    const r = await api().get('/api/measurements/activity-summary').set(H(token)).query({ days: 7 });
    expect(r.status).toBe(200);
    expect(r.body.metrics.STEPS.avg7).toBe(10000);
    expect(r.body.metrics.STEPS.prevAvg30).toBe(5000);
    expect(r.body.metrics.STEPS.deltaPct30).toBe(100); // +100% vs período anterior
  });

  it('ignora medições MANUAIS (só note=Health Connect) — FC manual não vira latest', async () => {
    const { token, patient } = await createUser();
    await prisma.measurement.create({
      data: { patientId: patient.id, type: 'HEART_RATE', value: 110, unit: 'bpm', measuredAt: new Date(`${iso(-1)}T09:00:00`), note: null },
    });
    await seed(token, patient.id, [day(iso(-1), 3000, 100, 1, 62)]);
    const r = await api().get('/api/measurements/activity-summary').set(H(token));
    expect(r.status).toBe(200);
    expect(r.body.metrics.HEART_RATE.latest).toBe(62); // HC, não a manual de 110
    expect(r.body.metrics.HEART_RATE.latest).not.toBe(110);
  });

  it('exige autenticação e não vaza paciente de outro usuário (cai no próprio pids[0])', async () => {
    const anon = await api().get('/api/measurements/activity-summary');
    expect(anon.status).toBe(401);

    const a = await createUser();
    const b = await createUser();
    await seed(a.token, a.patient.id, [day(iso(-1), 4000, 100, 1)]);
    await seed(b.token, b.patient.id, [day(iso(-1), 9000, 100, 1)]);
    // A pede com patientId de B → inválido p/ A → usa o paciente de A (nada de B vaza)
    const r = await api().get('/api/measurements/activity-summary').set(H(a.token)).query({ patientId: b.patient.id });
    expect(r.status).toBe(200);
    expect(r.body.metrics.STEPS.latest).toBe(4000); // dados de A, não os 9000 de B
  });

  it('clamp da janela: days fora de 7–90 não estoura a query', async () => {
    const { token } = await createUser();
    const r = await api().get('/api/measurements/activity-summary').set(H(token)).query({ days: '9999' });
    expect(r.status).toBe(200); // clampado p/ 90, não 500
    const r2 = await api().get('/api/measurements/activity-summary').set(H(token)).query({ days: '1' });
    expect(r2.status).toBe(200); // clampado p/ 7
  });

  it('EXERCISE_MINUTES entra no sync e no consolidado (tile Exercício)', async () => {
    const { token, patient } = await createUser();
    const r = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId: patient.id,
      days: [{ date: iso(-1), steps: 3000, kcal: 100, km: 1, hr: 60, exerciseMin: 45 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.synced).toBe(5); // STEPS+CALORIES+DISTANCE+HEART_RATE+EXERCISE_MINUTES
    const s = await api().get('/api/measurements/activity-summary').set(H(token));
    expect(s.body.metrics.EXERCISE_MINUTES).toMatchObject({ latest: 45, latestDate: iso(-1) });
  });
});
