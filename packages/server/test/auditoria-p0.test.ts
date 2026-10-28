// E2E (supertest) — REGRESSÃO dos fixes P0 da auditoria 2026-10-28 (docs/auditoria).
//  AUD-001: stream de arquivo órfão não derruba o processo (404 limpo).
//  AUD-002: join de teleconsulta rejeita DoctorShare EXPIRADO.
//  AUD-003: doctor-invite register valida CRM/UF/e-mail/senha (CRM fake → 400; válido → 201).
//  AUD-004: médico blocked não entra na teleconsulta (403 DOCTOR_BLOCKED).
//  AUD-030: accessAudit grava AuditLog ACCESS em rota autenticada da allowlist.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import { prisma } from '../src/prisma';
import request from 'supertest';
import express from 'express';
import { accessAudit } from '../src/middleware/accessAudit';
import { api, createUser, createDoctor, createExam, resetDb, authHeader, testCpf } from './helpers';

/** Reminder type=teleconsulta ABERTA com consent dado (padrão do teleconsulta-lifecycle.test.ts). */
async function createTeleconsultaReminder(ownerId: string, patientId: string) {
  return prisma.reminder.create({
    data: {
      ownerId,
      patientId,
      title: 'Teleconsulta AUD',
      dueDate: new Date(Date.now() - 5 * 60_000), // vencida = janela de entrada aberta
      type: 'teleconsulta',
      consentAt: new Date(), // consent Art.15 dado — isola o teste nos gates de share/blocked
      notifyOffsetsMin: [0],
      provider: 'livekit',
      roomName: 'aud-p0',
    } as any,
    select: { id: true, patientId: true },
  });
}

async function createShare(doctorId: string, patientId: string, opts: { expiresAt?: Date | null } = {}) {
  return prisma.doctorShare.create({
    data: {
      doctorId,
      patientId,
      scopes: ['exams'],
      examIds: [],
      active: true,
      expiresAt: opts.expiresAt ?? null,
    } as any,
    select: { id: true },
  });
}

/** Invite de médico pendente em AppSetting (mesmo formato do app.ts). */
async function createInvite(token: string, patientId: string) {
  await prisma.appSetting.create({
    data: {
      key: `doc_invite:${token}`,
      value: { status: 'pending', expiresAt: new Date(Date.now() + 3600_000).toISOString(), patientId, scopes: ['exams'], examIds: [] } as any,
    },
  });
}

describe('Fix P0 auditoria 2026-10-28 — diagnóstico do middleware', () => {
  beforeEach(async () => { await resetDb(); });

  it('UNIT: accessAudit grava ACCESS num app express mínimo (isola regex × integração)', async () => {
    const app2 = express();
    app2.use(accessAudit);
    app2.get('/api/patients', (req: any, res) => { req.userId = 'diag-user'; res.json({ ok: true }); });

    const res = await request(app2).get('/api/patients');
    expect(res.status).toBe(200);

    await vi.waitFor(async () => {
      const row = await prisma.auditLog.findFirst({ where: { action: 'ACCESS', targetType: 'ROUTE' }, orderBy: { createdAt: 'desc' } });
      expect(row).toBeTruthy();
      expect(String((row!.after as any)?.path)).toContain('/api/patients');
    }, { timeout: 5000 });
  });
});

describe('Fix P0 auditoria 2026-10-28', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('AUD-001: exame com arquivo órfão → GET /file responde 404 e o processo segue de pé', async () => {
    const { user, patient, token } = await createUser();
    const exam = await createExam(patient.id, { status: 'EXTRACTED' });
    await prisma.exam.update({ where: { id: exam.id }, data: { filePath: 'data/exams/audit-orfao-inexistente.pdf' } });
    void user;

    const res = await api().get(`/api/exams/${exam.id}/file`).set(authHeader(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Arquivo não encontrado');

    // O processo sobreviveu: requisição seguinte responde normalmente.
    const alive = await api().get('/api/health');
    expect(alive.status).toBe(200);
  });

  it('AUD-002: join com DoctorShare EXPIRADO → 403; share válido segue 200', async () => {
    const { user, patient } = await createUser();
    const { doctor, token: doctorToken } = await createDoctor({ crm: '111111-SP', email: 'aud002@exemplo.com' });
    const r = await createTeleconsultaReminder(user.id, patient.id);

    // Share expirado há 1h — antes do fix o join devolvia 200 + token de sala.
    await createShare(doctor.id, patient.id, { expiresAt: new Date(Date.now() - 3600_000) });
    const denied = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doctorToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('Sem permissão.');

    // Fluxo legítimo preservado: share ativo sem expiração → 200.
    await prisma.doctorShare.updateMany({ where: { doctorId: doctor.id }, data: { expiresAt: null } });
    const okJoin = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doctorToken));
    expect(okJoin.status).toBe(200);
  });

  it('AUD-004: médico blocked → join 403 DOCTOR_BLOCKED', async () => {
    const { user, patient } = await createUser();
    const { doctor, token: doctorToken } = await createDoctor({ crm: '222222-SP', email: 'aud004@exemplo.com' });
    await createShare(doctor.id, patient.id);
    const r = await createTeleconsultaReminder(user.id, patient.id);
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true } });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doctorToken));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOCTOR_BLOCKED');
  });

  it('AUD-003: convite médico — CRM fake rejeitado (400) e cadastro válido segue criando conta+share', async () => {
    const { patient } = await createUser();
    await createInvite('aud003token', patient.id);

    // CRM fake (UF inexistente) e senha curta — antes criavam conta + JWT 7d.
    const fake = await api().post('/api/public/doctor-invite/aud003token/register')
      .send({ name: 'Fake', crm: '000000', crmUf: 'ZZ', email: 'fake@x.com', password: '123' });
    expect(fake.status).toBe(400);

    const fakeUf = await api().post('/api/public/doctor-invite/aud003token/register')
      .send({ name: 'Fake 2', crm: '000000', crmUf: 'ZZ', email: 'fake2@x.com', password: 'senhaok123' });
    expect(fakeUf.status).toBe(400);
    expect(String(fakeUf.body.error)).toContain('CRM');

    const badEmail = await api().post('/api/public/doctor-invite/aud003token/register')
      .send({ name: 'Fake 3', crm: '333333', crmUf: 'SP', email: 'sem-arroba', password: 'senhaok123' });
    expect(badEmail.status).toBe(400);

    // Fluxo legítimo: CRM real + UF real + senha ok → 201 com token e share ativo.
    const good = await api().post('/api/public/doctor-invite/aud003token/register')
      .send({ name: 'Dra Válida', crm: '333333', crmUf: 'SP', email: 'valida@exemplo.com', password: 'senhaok123', specialty: 'Clínica' });
    expect(good.status).toBe(201);
    expect(good.body.token).toBeTruthy();
    const share = await prisma.doctorShare.findFirst({ where: { doctorId: good.body.doctor.id, patientId: patient.id, active: true } });
    expect(share).toBeTruthy();
  });

  it('AUD-030: accessAudit grava AuditLog ACCESS após GET autenticado em /api/patients', async () => {
    // Diagnóstico em 2 camadas: (1) audit() chamado DENTRO de um handler (LOGIN_SUCCESS no
    // login HTTP) grava? (2) audit() chamado pelo middleware global (ACCESS) grava?
    const { user, token } = await createUser();
    const login = await api().post('/api/auth/login').send({ email: user.email, password: 'senha123' });
    expect(login.status).toBe(200);
    await vi.waitFor(async () => {
      const l = await prisma.auditLog.findFirst({ where: { action: { startsWith: 'LOGIN' } } });
      expect(l).toBeTruthy();
    }, { timeout: 5000 });

    const res = await api().get('/api/patients').set(authHeader(token));
    expect(res.status).toBe(200);

    // audit() é fire-and-forget (void) — espera o efeito com vi.waitFor (padrão d3925cdd).
    await vi.waitFor(async () => {
      const row = await prisma.auditLog.findFirst({ where: { action: 'ACCESS', targetType: 'ROUTE' }, orderBy: { createdAt: 'desc' } });
      expect(row).toBeTruthy();
      expect(String((row!.after as any)?.path)).toContain('/api/patients');
    }, { timeout: 5000 });
  });
});
