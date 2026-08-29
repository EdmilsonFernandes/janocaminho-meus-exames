import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createPatient } from './helpers';
import { prisma } from '../src/prisma';

/**
 * Health Connect sync — POST /api/measurements/activity-sync
 * Contrato: upsert idempotente por dia (STEPS/CALORIES/DISTANCE), validação
 * fail-fast (nada gravado se qualquer dia for inválido), teto de 31 dias.
 */
const H = (t: string) => ({ Authorization: `Bearer ${t}` });

const day = (date: string, steps: number, kcal: number, km: number, hr = 0) => ({ date, steps, kcal, km, hr });

describe('POST /api/measurements/activity-sync', () => {
  beforeEach(async () => { await resetDb(); });

  it('grava 3 medições por dia com unidades certas e note Health Connect', async () => {
    const { token, patient } = await createUser();
    const patientId = patient.id;
    const r = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-19', 8432, 2100, 5.42)],
    });
    expect(r.status).toBe(201);
    expect(r.body.synced).toBe(3);
    expect(r.body.days).toBe(1);

    const rows = await prisma.measurement.findMany({ where: { patientId }, orderBy: { type: 'asc' } });
    expect(rows).toHaveLength(3);
    const byType = Object.fromEntries(rows.map((m) => [m.type, m]));
    expect(byType.STEPS).toMatchObject({ value: 8432, unit: 'passos', note: 'Health Connect' });
    expect(byType.CALORIES).toMatchObject({ value: 2100, unit: 'kcal' });
    expect(byType.DISTANCE).toMatchObject({ value: 5.42, unit: 'km' });
    // Data do dia preservada (meio-dia local → imune a bordas de TZ)
    expect(byType.STEPS.measuredAt.toISOString().slice(0, 10)).toBe('2026-08-19');
  });

  it('é IDEMPOTENTE: re-sincronizar o mesmo dia substitui, não duplica', async () => {
    const { token, patient } = await createUser();
    const patientId = patient.id;
    const body = { patientId, days: [day('2026-08-19', 8000, 2000, 5)] };
    await api().post('/api/measurements/activity-sync').set(H(token)).send(body);
    const again = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      ...body, days: [day('2026-08-19', 9500, 2200, 6.1)], // aparelho corrigiu o valor do dia
    });
    expect(again.status).toBe(201);

    const rows = await prisma.measurement.findMany({ where: { patientId, type: 'STEPS' } });
    expect(rows).toHaveLength(1); // substituiu, não somou
    expect(rows[0].value).toBe(9500);
  });

  it('dias zerados não geram ruído no histórico', async () => {
    const { token, patient } = await createUser();
    const patientId = patient.id;
    const r = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-19', 0, 0, 0), day('2026-08-18', 1000, 500, 0.8)],
    });
    expect(r.status).toBe(201);
    expect(r.body.days).toBe(1); // dia zerado descartado
    const count = await prisma.measurement.count({ where: { patientId } });
    expect(count).toBe(3); // só o dia com dados
  });

  it('FAIL-FAST: dia inválido NÃO grava NADA (sem meio-sync)', async () => {
    const { token, patient } = await createUser();
    const patientId = patient.id;
    const r = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-19', 1000, 500, 1), { date: '19/08/2026', steps: 1, kcal: 1, km: 1 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('Data inválida');
    expect(await prisma.measurement.count({ where: { patientId } })).toBe(0);
  });

  it('rejeita > 31 dias e exige autenticação', async () => {
    const { token, patient } = await createUser();
    const patientId = patient.id;
    const tooMany = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: Array.from({ length: 32 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, '0')}`, 1, 1, 0.1)),
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toContain('31');

    const anon = await api().post('/api/measurements/activity-sync').send({ days: [day('2026-08-19', 1, 1, 1)] });
    expect(anon.status).toBe(401);
  });

  it('não vaza entre pacientes: patientId de outro usuário é ignorado', async () => {
    const a = await createUser();
    const b = await createUser();
    // A tenta gravar em nome do paciente de B → deve cair no próprio paciente de A
    const r = await api().post('/api/measurements/activity-sync').set(H(a.token)).send({
      patientId: b.patient.id, days: [day('2026-08-19', 100, 100, 1)],
    });
    expect(r.status).toBe(201);
    expect(await prisma.measurement.count({ where: { patientId: b.patient.id } })).toBe(0);
    expect(await prisma.measurement.count({ where: { patientId: a.patient.id } })).toBe(3);
  });

  it('sincroniza FC média do dia e PRESERVA medição manual de FC no re-sync', async () => {
    const { token, patient } = await createUser();
    const patientId = patient.id;
    // FC manual registrada pelo USUÁRIO no mesmo dia (não pode ser apagada pelo sync)
    await prisma.measurement.create({
      data: { patientId, type: 'HEART_RATE', value: 88, unit: 'bpm', measuredAt: new Date('2026-08-19T09:00:00'), note: null },
    });

    const r = await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-19', 4000, 1000, 2, 72)],
    });
    expect(r.status).toBe(201);
    expect(r.body.synced).toBe(4); // STEPS + CALORIES + DISTANCE + HEART_RATE

    const hrs = await prisma.measurement.findMany({ where: { patientId, type: 'HEART_RATE' }, orderBy: { value: 'asc' } });
    expect(hrs.map((h) => h.value)).toEqual([72, 88]); // HC (72) + manual (88)
    expect(hrs.find((h) => h.value === 72)?.note).toBe('Health Connect');

    // Re-sync com FC nova do HC: substitui SÓ a linha do Health Connect
    await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-19', 4100, 1000, 2, 70)],
    });
    const hrs2 = await prisma.measurement.findMany({ where: { patientId, type: 'HEART_RATE' }, orderBy: { value: 'asc' } });
    expect(hrs2.map((h) => h.value)).toEqual([70, 88]); // manual intacta, HC atualizada
  });

  it('payload PARCIAL não apaga métrica ausente (anti-wipe de build bugado)', async () => {
    // Regressão real (403/404): bridge com bug de paginação mandava steps=0, km>0 —
    // o sync antigo apagava o DIA INTEIRO e regravava só a distância, ERUDINDO os
    // passos válidos do servidor a cada sync. Agora só substitui o que o payload traz.
    const { token, patient } = await createUser();
    const patientId = patient.id;
    // Dia com passos válidos já no servidor
    await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-25', 9000, 500, 6)],
    });
    // Build bugado re-sincroniza o MESMO dia com steps=0, kcal=0, km=6.2
    await api().post('/api/measurements/activity-sync').set(H(token)).send({
      patientId, days: [day('2026-08-25', 0, 0, 6.2)],
    });
    const steps = await prisma.measurement.findMany({ where: { patientId, type: 'STEPS' } });
    expect(steps).toHaveLength(1);
    expect(steps[0].value).toBe(9000); // passos PRESERVADOS
    const km = await prisma.measurement.findMany({ where: { patientId, type: 'DISTANCE' } });
    expect(km).toHaveLength(1);
    expect(km[0].value).toBe(6.2); // distância atualizada
  });

  it('atividade do APARELHO vai pro TITULAR da conta, mesmo com dependente selecionado', async () => {
    // Regressão da divergência titular×dependente: o celular é do titular → passos são
    // dele. Antes o sync caía em pids[0] (ordem de criação): se o 1º paciente era um
    // dependente, TODA atividade do Health Connect aterrissava no perfil errado e o
    // titular ficava sem atividades/medições nas telas compartilhadas.
    const { token, user, patient } = await createUser();
    const dep = await createPatient(user.id, { fullName: 'Filho Teste', relationship: 'Filho' });

    // Sem patientId no body (é o caso real do app) e com o DEPENDENTE selecionado (header
    // X-Patient-Id): ainda assim grava no TITULAR.
    const r = await api().post('/api/measurements/activity-sync').set(H(token)).set('X-Patient-Id', dep.id).send({
      days: [day('2026-08-19', 5000, 1500, 3)],
    });
    expect(r.status).toBe(201);
    expect(await prisma.measurement.count({ where: { patientId: patient.id } })).toBe(3); // titular
    expect(await prisma.measurement.count({ where: { patientId: dep.id } })).toBe(0);     // dependente intacto

    // Header de paciente de OUTRO usuário também não vaza: B sincroniza → grava no
    // TITULAR de B, e o titular de A continua com exatamente as 3 medições de antes.
    const b = await createUser();
    const r2 = await api().post('/api/measurements/activity-sync').set(H(b.token)).set('X-Patient-Id', patient.id).send({
      days: [day('2026-08-19', 10, 10, 0.1)],
    });
    expect(r2.status).toBe(201);
    expect(await prisma.measurement.count({ where: { patientId: patient.id } })).toBe(3); // intacto (não ganhou nem perdeu)
    expect(await prisma.measurement.count({ where: { patientId: b.patient.id } })).toBe(3); // foi pro titular de B
  });
});
