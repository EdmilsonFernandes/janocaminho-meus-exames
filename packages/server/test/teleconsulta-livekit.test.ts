// E2E (supertest) — GET /api/teleconsulta/:id/join (F2 LiveKit, backend2).
// utils/livekit é MOCKADO: join nunca sai da rede (sem RoomService/token real).
// Contrato: docs/research/2026-10-19-livekit-fase2-arquitetura.md §1a/§5.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  // P1-reviewer: o join agora RE-CRIA a sala (maxParticipants) — mockar também
  // (a real sairia pra rede do LiveKit).
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import { prisma } from '../src/prisma';
import { hasLiveKitConfig, buildJoinToken, createLiveKitRoom } from '../src/utils/livekit';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

vi.mocked(hasLiveKitConfig).mockReturnValue(true);

/** Cria Reminder type=teleconsulta. provider/roomName são colunas NOVAS (migration do
 *  backend1) — `as any` tolera o client Prisma ainda não regenerado (drift-safe). */
async function createTeleconsultaReminder(ownerId: string, patientId: string, opts: {
  consentAt?: Date | null;
  provider?: string | null;
  roomName?: string | null;
  linkUrl?: string | null;
} = {}) {
  return prisma.reminder.create({
    data: {
      ownerId,
      patientId,
      title: 'Teleconsulta',
      dueDate: new Date(Date.now() + 24 * 3600_000),
      type: 'teleconsulta',
      linkUrl: opts.linkUrl ?? null,
      consentAt: opts.consentAt ?? null,
      notifyOffsetsMin: [1440, 60, 0],
      provider: opts.provider ?? null,
      roomName: opts.roomName ?? null,
    } as any,
    select: { id: true, patientId: true },
  });
}

describe('GET /api/teleconsulta/:id/join', () => {
  beforeEach(async () => {
    await resetDb();
    // mockClear: sem isto, o histórico de chamadas do teste anterior vaza para as
    // asserções `not.toHaveBeenCalled()` do próximo (mock é singleton no módulo).
    vi.mocked(hasLiveKitConfig).mockClear();
    vi.mocked(buildJoinToken).mockClear();
    vi.mocked(hasLiveKitConfig).mockReturnValue(true);
    vi.mocked(buildJoinToken).mockResolvedValue('mock-join-token');
    process.env.LIVEKIT_URL = 'wss://test.example.org';
  });
  // env NÃO vaza p/ arquivos seguintes (worker único do vitest compartilha process.env —
  // sugestão do backend-1 no squad 19/10: sem LIVEKIT_API_KEY/SECRET o hasLiveKitConfig
  // real segue false, mas o cleanup blinda o gate do CI de fugas futuras).
  afterAll(() => { delete process.env.LIVEKIT_URL; });

  it('paciente owner com consent → 200 {serverUrl, token, room}', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, {
      consentAt: new Date(),
      provider: 'livekit',
      roomName: 'teleconsulta-abc',
    });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ serverUrl: 'wss://test.example.org', token: 'mock-join-token', room: 'teleconsulta-abc' });
    expect(typeof res.body.stt).toBe('boolean'); // reviewer-L: capability no join

    const call = vi.mocked(buildJoinToken).mock.calls[0][0];
    expect(call.identity).toBe(`patient:${user.id}`);
    expect(call.name).toBe(user.name);
    expect(call.room).toBe('teleconsulta-abc');
    expect(call.metadata).toMatchObject({ reminderId: r.id, role: 'patient' });

    // Audit AWAIT (família void-audit extinta): o registro precisa existir ao fim do request.
    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_JOIN', targetId: r.id } });
    expect(log?.actorType).toBe('USER');
  });

  it('LEGADO (P3-reviewer): reminder provider=null + link Meet não quebra listagem/PUT/join', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, {
      consentAt: new Date(),
      linkUrl: 'https://meet.google.com/legado-xyz',
    });
    // Listagem normal do paciente segue íntegra (campos novos opcionais)
    const list = await api().get('/api/reminders').set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    // PUT (marcar feito) no legado funciona (guard do reminder.routes relaxado)
    const put = await api().put(`/api/reminders/${r.id}`).set(authHeader(token)).send({ done: true });
    expect(put.status).toBe(200);
    // Join de legado → 501 com o link externo (degradação)
    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(501);
    expect(join.body).toMatchObject({ code: 'LIVEKIT_UNAVAILABLE', linkUrl: 'https://meet.google.com/legado-xyz' });
  });

  it('paciente owner SEM consent → 403 CONSENT_REQUIRED', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: null, provider: 'livekit', roomName: 'teleconsulta-x' });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(buildJoinToken).not.toHaveBeenCalled();
  });

  it('paciente NÃO-owner do reminder → 403', async () => {
    const owner = await createUser();
    const other = await createUser();
    const r = await createTeleconsultaReminder(owner.user.id, owner.patient.id, { consentAt: new Date(), provider: 'livekit' });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(other.token));
    expect(res.status).toBe(403);
  });

  it('médico COM share ativo → 200 role doctor (consent do paciente não exigido)', async () => {
    const { user, patient, token } = await createUser();
    // Email EXPLÍCITO válido: o default do helpers (uniq('doc@exemplo.com') → sufixo no
    // domínio) é rejeitado pelo zod `.email()` do validate — todos os suites passam email.
    const doc = await createDoctor({ email: 'doc-join1@test.com', crm: '31415-SP' });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'] } });
    // consentAt null de propósito: ônus é do paciente, não do médico (edge case 4-①).
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: null, provider: 'livekit', roomName: 'teleconsulta-doc' });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token));
    expect(res.status).toBe(200);
    expect(res.body.room).toBe('teleconsulta-doc');

    const call = vi.mocked(buildJoinToken).mock.calls[0][0];
    expect(call.identity).toBe(`doctor:${doc.doctor.id}`);
    expect(call.name).toContain(doc.doctor.name);
    expect(call.metadata).toMatchObject({ reminderId: r.id, role: 'doctor' });

    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_JOIN', targetId: r.id } });
    expect(log?.actorType).toBe('DOCTOR');
  });

  it('médico SEM share → 403', async () => {
    const { user, patient } = await createUser();
    const doc = await createDoctor({ email: 'doc-join2@test.com', crm: '27182-SP' }); // sem DoctorShare
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date(), provider: 'livekit' });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token));
    expect(res.status).toBe(403);
    expect(buildJoinToken).not.toHaveBeenCalled();
  });

  it('env LIVEKIT ausente → 501 {configured:false}', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date(), provider: 'livekit' });
    vi.mocked(hasLiveKitConfig).mockReturnValue(false);

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ code: 'LIVEKIT_UNAVAILABLE', configured: false });
    expect(buildJoinToken).not.toHaveBeenCalled();
  });

  it('reminder meet/manual (provider null) → 501 {configured:true, linkUrl} (client abre externo)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, {
      consentAt: new Date(),
      provider: null,
      linkUrl: 'https://meet.google.com/abc-defg-hij',
    });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ code: 'LIVEKIT_UNAVAILABLE', configured: true, linkUrl: 'https://meet.google.com/abc-defg-hij' });
  });

  it('reminder inexistente → 404', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/teleconsulta/inexistente/join').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('sem token → 401', async () => {
    const res = await api().get('/api/teleconsulta/qualquer/join');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/teleconsulta/:id/feedback (F2.1)', () => {
  beforeEach(async () => { await resetDb(); });

  it('paciente avalia 1-5 → 201 + audit TELECONSULTA_FEEDBACK', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date(), provider: 'livekit', roomName: 'teleconsulta-fb1' });
    const res = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating: 5, note: 'Áudio perfeito' });
    expect(res.status).toBe(201);
    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_FEEDBACK', targetId: r.id } });
    expect(log?.after).toMatchObject({ rating: 5, note: 'Áudio perfeito', role: 'patient' });
  });

  it('rating inválido → 400; sem auth → 401', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { consentAt: new Date() });
    const bad = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating: 9 });
    expect(bad.status).toBe(400);
    const noAuth = await api().post(`/api/teleconsulta/${r.id}/feedback`).send({ rating: 3 });
    expect(noAuth.status).toBe(401);
  });
});

const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('guarda anti-duplicata do médico (409/force)', () => {
  beforeEach(async () => { await resetDb(); });

  it('2ª teleconsulta NO MESMO DIA → 409 com existing; force:true → 201', async () => {
    const { token, patient } = await createUser();
    const crm = '66778-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'dup1@t.com' });
    await api().post('/api/doctor-shares').set(H2(token)).send({ doctorCrm: crm, scopes: ['exams'] });
    // CI = UTC: datas a ~meia-noite atravessam o dia. Fixamos MEIO-DIA pra garantir
    // que todas as variações (+1h, +2h) caem NO MESMO dia independente de timezone.
    const dayBase = new Date(Date.now() + 3 * 86400000);
    dayBase.setHours(12, 0, 0, 0);
    const first = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: dayBase.toISOString(), linkUrl: 'https://meet.google.com/dup' });
    expect(first.status).toBe(201);
    const dup = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: new Date(dayBase.getTime() + 3600000).toISOString(), linkUrl: 'https://meet.google.com/dup2' });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: 'TELECONSULTA_DUP' });
    expect(dup.body.existing.roomCode).toBe(String(first.body.reminder.id).slice(-5).toUpperCase());
    const forced = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: new Date(dayBase.getTime() + 7200000).toISOString(), linkUrl: 'https://meet.google.com/dup3', force: true });
    expect(forced.status).toBe(201);
  });

  it('dia DIFERENTE não bloqueia', async () => {
    const { token, patient } = await createUser();
    const crm = '66779-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'dup2@t.com' });
    await api().post('/api/doctor-shares').set(H2(token)).send({ doctorCrm: crm, scopes: ['exams'] });
    const dayBase = new Date(Date.now() + 3 * 86400000); dayBase.setHours(12, 0, 0, 0);
    const dayOther = new Date(Date.now() + 4 * 86400000); dayOther.setHours(12, 0, 0, 0);
    await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: dayBase.toISOString(), linkUrl: 'https://x.com/1' });
    const other = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: dayOther.toISOString(), linkUrl: 'https://x.com/2' });
    expect(other.status).toBe(201);
  });
});
