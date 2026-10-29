import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined), // async: o tick faz createLiveKitRoom(...).catch(...)
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, createUser } from './helpers';
import { saveSettings } from '../src/utils/settings';
import { runTeleconsultaQueueTick } from '../src/jobs/teleconsultaQueue';
import { doctorAccessDenial, practiceStatuses } from '../src/utils/doctorAccess';

const FAKE = 'cl0000000000000000000fake';
let crmSeq = 70000;
const nextCrm = () => `${crmSeq++}-SP`;

// Os 8 pontos que aceitam token de médico (spec §Base real). [nome, método, url, body]
const GATED: Array<[string, 'get' | 'post' | 'put', string, Record<string, unknown>?]> = [
  ['1 doctor.routes requireDoctor', 'get', '/api/doctor/patients'],
  ['2 PDF do exame (token inline)', 'get', `/api/doctor/patients/${FAKE}/exams/${FAKE}/file`],
  ['3 collection requireDoctor', 'get', `/api/doctor/patients/${FAKE}/checklist`],
  ['4 fila requireQueueDoctor', 'put', '/api/doctor/online-presence', { online: true }],
  ['5 examRequest requireDoctorIdentity', 'post', '/api/exam-requests', { patientId: FAKE }],
  ['6 examRequest requireAnyIdentity', 'get', '/api/exam-requests'],
  ['7 consult-summary requireDoctorIdentity', 'post', `/api/teleconsulta/${FAKE}/summary/generate`],
  ['8 teleconsulta requireJoinIdentity', 'get', `/api/teleconsulta/${FAKE}/join`],
];

const call = (method: 'get' | 'post' | 'put', url: string, token: string, body?: Record<string, unknown>) =>
  (api() as any)[method](url).set(authHeader(token)).send(body ?? {});

describe('gate do médico — deny-by-default nos 8 pontos (spec §7)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
  });

  it.each(GATED)('%s: pending → 403 VERIFICATION_REQUIRED', async (_n, method, url, body) => {
    const { token } = await createDoctor({ crm: nextCrm(), verificationStatus: 'pending' });
    const r = await call(method, url, token, body);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'pending' });
  });

  it.each(GATED)('%s: bloqueado → 403 DOCTOR_BLOCKED (5 desses nem olhavam bloqueio)', async (_n, method, url, body) => {
    const { doctor, token } = await createDoctor({ crm: nextCrm() });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true, blockedReason: 'teste' } });
    const r = await call(method, url, token, body);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('DOCTOR_BLOCKED');
  });

  it.each(GATED)('%s: approved passa do gate', async (_n, method, url, body) => {
    const { token } = await createDoctor({ crm: nextCrm() });
    const r = await call(method, url, token, body);
    expect(['VERIFICATION_REQUIRED', 'DOCTOR_BLOCKED']).not.toContain(r.body?.code);
  });

  it('legacy: atende sem prazo; depois do prazo → 403', async () => {
    const { token } = await createDoctor({ crm: nextCrm(), verificationStatus: 'legacy' });
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(200);
    await saveSettings('doctorKyc', { legacyGraceUntilMs: Date.now() - 1000 });
    const r = await api().get('/api/doctor/patients').set(authHeader(token));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'legacy' });
  });

  // Fronteira do prazo do legado (review da Task 2, m1): vale enquanto now < prazo — no instante
  // exato já não vale. É o relógio (`now`) que a fila injeta em practiceStatuses no tick.
  it('prazo do legado: vale até 1ms antes; no instante do prazo não vale mais (now injetado)', async () => {
    const prazo = Date.now() + 60_000;
    await saveSettings('doctorKyc', { legacyGraceUntilMs: prazo });
    const legado = { blocked: false, verificationStatus: 'legacy' };
    expect(doctorAccessDenial(legado, { now: new Date(prazo - 1) })).toBeNull();
    expect(doctorAccessDenial(legado, { now: new Date(prazo) })).toMatchObject({ status: 403, body: { code: 'VERIFICATION_REQUIRED', status: 'legacy' } });
    expect(practiceStatuses(new Date(prazo - 1))).toEqual(['approved', 'legacy']);
    expect(practiceStatuses(new Date(prazo))).toEqual(['approved']);
  });

  it('onboarding liberado p/ pending (perfil, MFA, plano)', async () => {
    const { token } = await createDoctor({ crm: nextCrm(), verificationStatus: 'pending' });
    expect((await api().get('/api/doctor/me').set(authHeader(token))).status).toBe(200);
    expect((await api().put('/api/doctor/profile').set(authHeader(token)).send({ bio: 'oi' })).status).toBe(200);
    expect((await api().get('/api/doctor/mfa/status').set(authHeader(token))).status).toBe(200);
    expect((await api().get('/api/doctor/me/plan').set(authHeader(token))).status).toBe(200);
  });
});

// Filtros da fila (spec §7): a presença que o paciente vê e os candidatos do match só incluem
// quem pode atender agora (practiceStatuses). O gate do ponto 4 só barra o toggle — médico que
// já estava online (ou legado cujo prazo venceu) precisa sair da fila por estes filtros.
describe('fila imediata — só médico que pode atender aparece e recebe offer (spec §7)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
  });

  const goOnline = (doctorId: string) =>
    prisma.doctorOnlinePresence.create({ data: { doctorId, online: true, lastHeartbeatAt: new Date(), lastOnlineAt: new Date() } });

  it('GET /api/teleconsulta-queue/status: lista approved e legacy no prazo; pending e legado vencido ficam de fora', async () => {
    const { token } = await createUser();
    const ok = await createDoctor({ crm: nextCrm() });
    const legacy = await createDoctor({ crm: nextCrm(), verificationStatus: 'legacy' });
    const pending = await createDoctor({ crm: nextCrm(), verificationStatus: 'pending' });
    for (const d of [ok, legacy, pending]) await goOnline(d.doctor.id);

    const idsOf = async () => (await api().get('/api/teleconsulta-queue/status').set(authHeader(token))).body.doctors.map((d: any) => d.id) as string[];
    const before = await idsOf();
    expect(before).toHaveLength(2);
    expect(before).toEqual(expect.arrayContaining([ok.doctor.id, legacy.doctor.id]));
    expect(before).not.toContain(pending.doctor.id);

    await saveSettings('doctorKyc', { legacyGraceUntilMs: Date.now() - 1000 }); // prazo do legado venceu
    expect(await idsOf()).toEqual([ok.doctor.id]);
  });

  it('tick: pending e legado vencido não recebem offer; legado no prazo recebe', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: nextCrm(), verificationStatus: 'pending' });
    await goOnline(doctor.id);
    const entry = await prisma.teleconsultaQueue.create({
      data: { ownerId: user.id, patientId: patient.id, consentAt: new Date(Date.now() - 600_000), enteredAt: new Date(Date.now() - 60_000), status: 'waiting', maxPriceCents: null, attempts: 0 },
      select: { id: true },
    });
    const entryNow = () => prisma.teleconsultaQueue.findUnique({ where: { id: entry.id }, select: { status: true, matchedDoctorId: true } });

    expect((await runTeleconsultaQueueTick(new Date())).matched).toBe(0); // pending
    expect(await entryNow()).toMatchObject({ status: 'waiting', matchedDoctorId: null });

    await prisma.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: 'legacy' } });
    await saveSettings('doctorKyc', { legacyGraceUntilMs: Date.now() - 1000 });
    expect((await runTeleconsultaQueueTick(new Date())).matched).toBe(0); // legado fora do prazo
    expect(await entryNow()).toMatchObject({ status: 'waiting', matchedDoctorId: null });

    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0 });
    expect((await runTeleconsultaQueueTick(new Date())).matched).toBe(1); // legado sem prazo atende
    expect(await entryNow()).toMatchObject({ status: 'matched', matchedDoctorId: doctor.id });
  });
});
