// E2E (supertest) — CICLO DE VIDA END (22/10/26): a teleconsulta ENCERRA de verdade.
// POST /end (auth dual) + join 403 TELECONSULTA_ENDED + summary {endedAt, durationSec}
// + idempotência + auto-end do job (solo 30min). utils/livekit MOCKADO (sem rede).
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import { prisma } from '../src/prisma';
import { hasLiveKitConfig, buildJoinToken } from '../src/utils/livekit';
import { autoEndStaleTeleconsultas } from '../src/jobs/reminderEmails';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

vi.mocked(hasLiveKitConfig).mockReturnValue(true);

/** Reminder type=teleconsulta ABERTA (endedAt=null). dueDate default = VENCIDA:
 *  lifecycle 24/10 libera o /join a partir de dueDate − 5min (TOO_EARLY antes). */
async function createTeleconsultaReminder(ownerId: string, patientId: string, opts: {
  consentAt?: Date | null;
  provider?: string | null;
  roomName?: string | null;
  dueDate?: Date;
} = {}) {
  return prisma.reminder.create({
    data: {
      ownerId,
      patientId,
      title: 'Teleconsulta',
      dueDate: opts.dueDate ?? new Date(Date.now() - 5 * 60_000),
      type: 'teleconsulta',
      consentAt: opts.consentAt ?? null,
      notifyOffsetsMin: [1440, 60, 0],
      provider: opts.provider ?? null,
      roomName: opts.roomName ?? null,
    } as any,
    select: { id: true, patientId: true },
  });
}

/** Join log "fantasma" (o auto-end lê o auditLog — simula entrada de N min atrás). */
async function seedJoinLog(reminderId: string, role: 'patient' | 'doctor', minutesAgo: number) {
  await prisma.auditLog.create({
    data: {
      actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
      action: 'TELECONSULTA_JOIN',
      targetType: 'REMINDER',
      targetId: reminderId,
      after: { role, reminderId } as any,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  });
}

describe('POST /api/teleconsulta/:id/end — ciclo de vida', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(hasLiveKitConfig).mockClear();
    vi.mocked(buildJoinToken).mockClear();
    vi.mocked(hasLiveKitConfig).mockReturnValue(true);
    vi.mocked(buildJoinToken).mockResolvedValue('mock-join-token');
    process.env.LIVEKIT_URL = 'wss://test.example.org';
  });
  afterAll(() => { delete process.env.LIVEKIT_URL; });

  it('paciente encerra → {ok, endedAt, alreadyEnded:false} + done=true no DB', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit', roomName: 't-end-1' });

    // Lifecycle 24/10: sem join e sem critério, /end exige outcome honesto ('no_show').
    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyEnded).toBe(false);
    expect(res.body.endedAt).toBeTruthy();
    expect(res.body.teleStatus).toBe('no_show');

    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { done: true, endedAt: true } });
    expect(row?.done).toBe(true);
    expect(row?.endedAt).toBeTruthy();
    expect(new Date(row!.endedAt!).toISOString()).toBe(res.body.endedAt);

    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_END', targetId: r.id } });
    expect(log?.actorType).toBe('USER');
  });

  it('encerrada → join devolve 403 {code:TELECONSULTA_ENDED, endedAt} (sem re-entrada)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date(), provider: 'livekit', roomName: 't-end-2' });

    const end = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(end.status).toBe(200);

    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(403);
    expect(join.body.code).toBe('TELECONSULTA_ENDED');
    expect(join.body.error).toBe('Esta consulta já foi encerrada.');
    expect(join.body.endedAt).toBe(end.body.endedAt);
    expect(buildJoinToken).not.toHaveBeenCalled(); // nem token de sala é emitido
  });

  it('join ABERTA segue 200 com endedAt:null no payload', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date(), provider: 'livekit', roomName: 't-open' });

    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(200);
    expect(join.body.endedAt).toBeNull();
  });

  it('idempotente: 2º end (pelo MÉDICO) não muda o timestamp', async () => {
    const { user, patient, token } = await createUser();
    const doc = await createDoctor({ email: 'doc-end1@test.com', crm: '12345-SP' });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'] } });
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });

    const first = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(first.status).toBe(200);
    const second = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(doc.token));
    expect(second.status).toBe(200);
    expect(second.body.endedAt).toBe(first.body.endedAt); // MESMO timestamp
    expect(second.body.alreadyEnded).toBe(true);

    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_END', targetId: r.id }, orderBy: { createdAt: 'desc' } });
    expect(log?.after).toMatchObject({ alreadyEnded: true, role: 'doctor' });
  });

  it('médico COM share encerra (role doctor); médico SEM share → 403', async () => {
    const { user, patient } = await createUser();
    const doc = await createDoctor({ email: 'doc-end2@test.com', crm: '67890-SP' });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'] } });
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });

    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(doc.token)).send({ outcome: 'no_show' });
    expect(res.status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_END', targetId: r.id } });
    expect(log?.actorType).toBe('DOCTOR');

    const other = await createDoctor({ email: 'doc-end3@test.com', crm: '13579-SP' }); // sem share
    const r2 = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });
    const denied = await api().post(`/api/teleconsulta/${r2.id}/end`).set(authHeader(other.token));
    expect(denied.status).toBe(403);
  });

  it('summary inclui endedAt + durationSec (1º join → end)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date(), provider: 'livekit', roomName: 't-sum' });

    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token)); // gera TELECONSULTA_JOIN
    expect(join.status).toBe(200);
    // Paciente entrou mas sem médico (tempo conjunto ~0 < 300s) → outcome honesto 'technical'.
    const end = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'technical' });
    expect(end.status).toBe(200);

    const res = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.endedAt).toBe(end.body.endedAt);
    expect(typeof res.body.durationSec).toBe('number');
    expect(res.body.durationSec).toBeGreaterThanOrEqual(0);
    expect(res.body.durationHint).toMatch(/aprox\. \d+ min/);
  });

  it('summary de consulta ABERTA (sem join) → endedAt:null + durationSec:null', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });
    const res = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.endedAt).toBeNull();
    expect(res.body.durationSec).toBeNull();
  });

  it('feedback (1-toque) TAMBÉM encerra — endedAt gravado', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });
    const res = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating: 5 });
    expect(res.status).toBe(201);
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { endedAt: true, done: true } });
    expect(row?.endedAt).toBeTruthy();
    expect(row?.done).toBe(true);
    // e o join pós-feedback também bloqueia (consulta realizada = encerrada)
    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(403);
    expect(join.body.code).toBe('TELECONSULTA_ENDED');
  });

  it('guardas: reminder inexistente → 404; sem token → 401; não-teleconsulta → 404', async () => {
    const { user, patient, token } = await createUser();
    expect((await api().post('/api/teleconsulta/inexistente/end').set(authHeader(token))).status).toBe(404);
    expect((await api().post('/api/teleconsulta/qualquer/end')).status).toBe(401);
    const plain = await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Exame', dueDate: new Date() } as any,
      select: { id: true },
    });
    expect((await api().post(`/api/teleconsulta/${plain.id}/end`).set(authHeader(token))).status).toBe(404);
  });
});

describe('autoEndStaleTeleconsultas (job, nice-to-have)', () => {
  beforeEach(async () => { await resetDb(); });

  it('só 1 papel entrou há >30min → encerra com endedAt = último join + 30min', async () => {
    const { user, patient } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });
    await seedJoinLog(r.id, 'patient', 40);

    await autoEndStaleTeleconsultas(Date.now());
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { endedAt: true, done: true } });
    expect(row?.endedAt).toBeTruthy();
    expect(row?.done).toBe(true);
  });

  it('AMBOS os papéis entraram → job NÃO encerra (fim é humano: /end ou feedback)', async () => {
    const { user, patient } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });
    await seedJoinLog(r.id, 'patient', 60);
    await seedJoinLog(r.id, 'doctor', 50);

    await autoEndStaleTeleconsultas(Date.now());
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { endedAt: true } });
    expect(row?.endedAt).toBeNull();
  });

  it('join recente (<30min) e sem join NENHUM → não encerra', async () => {
    const { user, patient } = await createUser();
    const a = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });
    await seedJoinLog(a.id, 'patient', 10);
    const b = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit' });

    await autoEndStaleTeleconsultas(Date.now());
    expect((await prisma.reminder.findUnique({ where: { id: a.id }, select: { endedAt: true } }))?.endedAt).toBeNull();
    expect((await prisma.reminder.findUnique({ where: { id: b.id }, select: { endedAt: true } }))?.endedAt).toBeNull();
  });

  it('NINGUÉM entrou + vencida há >30min (done=false) → encerra com endedAt = dueDate + 30min', async () => {
    const { user, patient } = await createUser();
    const due = new Date(Date.now() - 40 * 60_000);
    const r = await createTeleconsultaReminder(user.id, patient.id, { provider: 'livekit', dueDate: due });

    await autoEndStaleTeleconsultas(Date.now());
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { endedAt: true, done: true } });
    expect(row?.done).toBe(true);
    expect(row?.endedAt).toBeTruthy();
    expect(new Date(row!.endedAt!).getTime()).toBe(due.getTime() + 30 * 60_000);
  });

  it('NINGUÉM entrou mas vencida há <30min, OU já done=true → segue aberta', async () => {
    const { user, patient } = await createUser();
    const recent = await createTeleconsultaReminder(user.id, patient.id, { dueDate: new Date(Date.now() - 10 * 60_000) });
    const markedDone = await createTeleconsultaReminder(user.id, patient.id, { dueDate: new Date(Date.now() - 40 * 60_000) });
    await prisma.reminder.update({ where: { id: markedDone.id }, data: { done: true } });

    await autoEndStaleTeleconsultas(Date.now());
    expect((await prisma.reminder.findUnique({ where: { id: recent.id }, select: { endedAt: true } }))?.endedAt).toBeNull();
    expect((await prisma.reminder.findUnique({ where: { id: markedDone.id }, select: { endedAt: true } }))?.endedAt).toBeNull();
  });
});
