// E2E + unit — §19/§5 do dono (26/10/26): CONFLITO DE AGENDA (médico não pode ter 2
// teleconsultas SOBREPOSTAS, janela dueDate ± slotMin) e ESTRATÉGIA DE AUSÊNCIA
// diferenciada (tolerância dueDate + noShowToleranceMin → no_show com noShowBy).
// Unit: resolveNoShow/resolveNoShowBy PURAS (relógio injetado). E2E: POST /teleconsulta
// 409 SCHEDULE_CONFLICT + auto-end do job por cenário de presença.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => false), // sem livekit → rota exige linkUrl manual (determinístico)
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import { prisma } from '../src/prisma';
import { autoEndStaleTeleconsultas } from '../src/jobs/reminderEmails';
import { resolveNoShow, resolveNoShowBy } from '../src/utils/teleconsultaLifecycle';
import { getTeleconsultaConfig, loadSettings } from '../src/utils/settings';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

const LINK = 'https://meet.example.com/sala';
const share = (doctorId: string, patientId: string) =>
  prisma.doctorShare.create({ data: { patientId, doctorId, scopes: ['exams'] } });
/** POST /api/doctor/patients/:id/teleconsulta (provider manual — sem livekit). */
const postTele = (token: string, patientId: string, dueDate: Date, extra: Record<string, unknown> = {}) =>
  api().post(`/api/doctor/patients/${patientId}/teleconsulta`)
    .set(authHeader(token))
    .send({ dueDate: dueDate.toISOString(), linkUrl: LINK, title: 'Teleconsulta', ...extra });

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

// ── UNIT: resolveNoShow (§5 — pura, relógio controlado) ────────────────────────
describe('resolveNoShow / resolveNoShowBy (§5 — ausência diferenciada)', () => {
  const due = 1_000_000; // epoch arbitrário
  it('tolerância NÃO venceu → ainda espera (outcome null, deadline exposta p/ countdown)', () => {
    const d = resolveNoShow({ dueMs: due, now: due + 5 * 60_000, toleranceMin: 10, patientJoined: false, doctorJoined: false });
    expect(d.expired).toBe(false);
    expect(d.outcome).toBeNull();
    expect(d.noShowBy).toBeNull();
    expect(d.deadlineMs).toBe(due + 10 * 60_000);
  });
  it('NINGUÉM compareceu + venceu → no_show / none', () => {
    const d = resolveNoShow({ dueMs: due, now: due + 10 * 60_000, toleranceMin: 10, patientJoined: false, doctorJoined: false });
    expect(d.outcome).toBe('no_show');
    expect(d.noShowBy).toBe('none');
  });
  it('SÓ o MÉDICO compareceu → no_show / patient (paciente faltou)', () => {
    const d = resolveNoShow({ dueMs: due, now: due + 11 * 60_000, toleranceMin: 10, patientJoined: false, doctorJoined: true });
    expect(d.outcome).toBe('no_show');
    expect(d.noShowBy).toBe('patient');
  });
  it('SÓ o PACIENTE compareceu → no_show / doctor (médico faltou)', () => {
    const d = resolveNoShow({ dueMs: due, now: due + 15 * 60_000, toleranceMin: 10, patientJoined: true, doctorJoined: false });
    expect(d.outcome).toBe('no_show');
    expect(d.noShowBy).toBe('doctor');
  });
  it('AMBOS compareceram → outcome null (queda de conexão = grace do client; fim é humano)', () => {
    const d = resolveNoShow({ dueMs: due, now: due + 30 * 60_000, toleranceMin: 10, patientJoined: true, doctorJoined: true });
    expect(d.outcome).toBeNull();
    expect(d.noShowBy).toBeNull();
  });
  it('resolveNoShowBy (encerramento humano no /end): nenhum=none · só médico=patient · só paciente=doctor · ambos=null', () => {
    expect(resolveNoShowBy(false, false)).toBe('none');
    expect(resolveNoShowBy(false, true)).toBe('patient');
    expect(resolveNoShowBy(true, false)).toBe('doctor');
    expect(resolveNoShowBy(true, true)).toBeNull();
  });
});

// ── E2E: §19 conflito de agenda no POST /teleconsulta ──────────────────────────
describe('POST /api/doctor/patients/:id/teleconsulta — conflito de agenda (§19)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  it('pacientes DIFERENTES sobrepostos (dentro de ±slotMin) → 409 SCHEDULE_CONFLICT com dados da existente', async () => {
    const doc = await createDoctor({ crm: '90001-SP' });
    const a = await createUser();
    const b = await createUser();
    await share(doc.doctor.id, a.patient.id);
    await share(doc.doctor.id, b.patient.id);
    const t0 = new Date(Date.now() + 2 * 3_600_000);

    expect((await postTele(doc.token, a.patient.id, t0)).status).toBe(201);
    // +15min ainda está na janela [t0-30, t0+30] → conflito
    const res = await postTele(doc.token, b.patient.id, new Date(t0.getTime() + 15 * 60_000));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SCHEDULE_CONFLICT');
    expect(res.body.existing?.patientName).toBeTruthy();
    expect(new Date(res.body.existing.dueDate).getTime()).toBe(t0.getTime());
  });

  it('fora da janela (Δ > slotMin) → 201 (agenda livre)', async () => {
    const doc = await createDoctor({ crm: '90002-SP' });
    const a = await createUser();
    const b = await createUser();
    await share(doc.doctor.id, a.patient.id);
    await share(doc.doctor.id, b.patient.id);
    const t0 = new Date(Date.now() + 2 * 3_600_000);
    expect((await postTele(doc.token, a.patient.id, t0)).status).toBe(201);
    // slotMin default 30 → 31min de distância é livre
    expect((await postTele(doc.token, b.patient.id, new Date(t0.getTime() + 31 * 60_000))).status).toBe(201);
  });

  it('ENCERRADA (endedAt) no meio da janela → livre (201); conflito é só p/ consulta OCUPANDO', async () => {
    const doc = await createDoctor({ crm: '90003-SP' });
    const a = await createUser();
    const b = await createUser();
    await share(doc.doctor.id, a.patient.id);
    await share(doc.doctor.id, b.patient.id);
    const t0 = new Date(Date.now() + 2 * 3_600_000);
    // consulta encerrada ocupando exatamente o horário alvo
    await prisma.reminder.create({
      data: {
        ownerId: a.user.id, patientId: a.patient.id, createdByDoctorId: doc.doctor.id,
        title: 'Já foi', dueDate: t0, type: 'teleconsulta', linkUrl: LINK,
        done: true, endedAt: new Date(), teleStatus: 'no_show',
      } as any,
    });
    expect((await postTele(doc.token, b.patient.id, t0)).status).toBe(201);
  });

  it('CANCELADA (linha deletada) → livre (201)', async () => {
    const doc = await createDoctor({ crm: '90004-SP' });
    const a = await createUser();
    const b = await createUser();
    await share(doc.doctor.id, a.patient.id);
    await share(doc.doctor.id, b.patient.id);
    const t0 = new Date(Date.now() + 2 * 3_600_000);
    const r = await postTele(doc.token, a.patient.id, t0);
    expect(r.status).toBe(201);
    await prisma.reminder.delete({ where: { id: r.body.reminder.id } });
    expect((await postTele(doc.token, b.patient.id, t0)).status).toBe(201);
  });

  it('2 requests SIMULTÂNEOS na mesma janela → só 1 cria (re-check pós-insert rola a tx do perdedor)', async () => {
    const doc = await createDoctor({ crm: '90005-SP' });
    const a = await createUser();
    const b = await createUser();
    await share(doc.doctor.id, a.patient.id);
    await share(doc.doctor.id, b.patient.id);
    const t0 = new Date(Date.now() + 2 * 3_600_000);

    const [r1, r2] = await Promise.all([
      postTele(doc.token, a.patient.id, t0),
      postTele(doc.token, b.patient.id, new Date(t0.getTime() + 5 * 60_000)),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    const count = await prisma.reminder.count({ where: { createdByDoctorId: doc.doctor.id, type: 'teleconsulta' } });
    expect(count).toBe(1);
  });

  it('fluxo TELECONSULTA_DUP (mesmo paciente/dia) preservado — conflito não engole o dup', async () => {
    const doc = await createDoctor({ crm: '90006-SP' });
    const a = await createUser();
    await share(doc.doctor.id, a.patient.id);
    const t0 = new Date(Date.now() + 2 * 3_600_000);
    expect((await postTele(doc.token, a.patient.id, t0)).status).toBe(201);
    const res = await postTele(doc.token, a.patient.id, new Date(t0.getTime() + 10 * 60_000));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TELECONSULTA_DUP');
  });
});

// ── E2E: auto-end com tolerância configurável + noShowBy (§5) ───────────────────
describe('autoEndStaleTeleconsultas — estratégia de ausência (§5, tolerância default 10min)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  /** Reminder type=teleconsulta ABERTA do médico (createdByDoctorId = ocupa a agenda). */
  const seedTele = (ownerId: string, patientId: string, doctorId: string, dueDate: Date) =>
    prisma.reminder.create({
      data: {
        ownerId, patientId, createdByDoctorId: doctorId, title: 'Teleconsulta',
        dueDate, type: 'teleconsulta', linkUrl: LINK, teleStatus: 'scheduled',
      } as any,
      select: { id: true },
    });
  const row = (id: string) => prisma.reminder.findUnique({ where: { id }, select: { endedAt: true, done: true, teleStatus: true, noShowBy: true } });

  it('tolerância correndo (due há 5min) → segue aberta', async () => {
    expect(getTeleconsultaConfig().noShowToleranceMin).toBe(10);
    const { user, patient } = await createUser();
    const doc = await createDoctor({ crm: '90007-SP' });
    const r = await seedTele(user.id, patient.id, doc.doctor.id, new Date(Date.now() - 5 * 60_000));
    await seedJoinLog(r.id, 'doctor', 3);
    await autoEndStaleTeleconsultas(Date.now());
    expect((await row(r.id))?.endedAt).toBeNull();
  });

  it('NINGUÉM compareceu + venceu → no_show / none, endedAt = dueDate + tolerância', async () => {
    const { user, patient } = await createUser();
    const doc = await createDoctor({ crm: '90008-SP' });
    const due = new Date(Date.now() - 15 * 60_000);
    const r = await seedTele(user.id, patient.id, doc.doctor.id, due);
    await autoEndStaleTeleconsultas(Date.now());
    const db = await row(r.id);
    expect(db?.done).toBe(true);
    expect(db?.teleStatus).toBe('no_show');
    expect(db?.noShowBy).toBe('none');
    expect(new Date(db!.endedAt!).getTime()).toBe(due.getTime() + 10 * 60_000);
  });

  it('SÓ o MÉDICO compareceu → no_show / patient (paciente faltou)', async () => {
    const { user, patient } = await createUser();
    const doc = await createDoctor({ crm: '90009-SP' });
    const r = await seedTele(user.id, patient.id, doc.doctor.id, new Date(Date.now() - 15 * 60_000));
    await seedJoinLog(r.id, 'doctor', 12);
    await autoEndStaleTeleconsultas(Date.now());
    const db = await row(r.id);
    expect(db?.teleStatus).toBe('no_show');
    expect(db?.noShowBy).toBe('patient');
  });

  it('SÓ o PACIENTE compareceu → no_show / doctor + ExceptionQueue doctor_no_show (registro p/ triagem)', async () => {
    const { user, patient } = await createUser();
    const doc = await createDoctor({ crm: '90010-SP' });
    const r = await seedTele(user.id, patient.id, doc.doctor.id, new Date(Date.now() - 15 * 60_000));
    await seedJoinLog(r.id, 'patient', 12);
    await autoEndStaleTeleconsultas(Date.now());
    const db = await row(r.id);
    expect(db?.teleStatus).toBe('no_show');
    expect(db?.noShowBy).toBe('doctor');
    const q = await prisma.exceptionQueue.findFirst({ where: { kind: 'doctor_no_show', reminderId: r.id } });
    expect(q).toBeTruthy();
  });

  it('AMBOS entraram → job NÃO encerra (desconexão = grace; fim é humano)', async () => {
    const { user, patient } = await createUser();
    const doc = await createDoctor({ crm: '90011-SP' });
    const r = await seedTele(user.id, patient.id, doc.doctor.id, new Date(Date.now() - 15 * 60_000));
    await seedJoinLog(r.id, 'patient', 12);
    await seedJoinLog(r.id, 'doctor', 10);
    await autoEndStaleTeleconsultas(Date.now());
    expect((await row(r.id))?.endedAt).toBeNull();
  });
});

afterAll(async () => { await prisma.$disconnect(); });
