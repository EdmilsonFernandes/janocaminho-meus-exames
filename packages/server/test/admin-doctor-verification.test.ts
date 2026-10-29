import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, mintToken } from './helpers';
import { getDoctorKycConfig, saveSettings } from '../src/utils/settings';
import { sendEmail } from '../src/utils/mailer';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-kyc-${Date.now().toString(36)}@exemplo.com`, name: 'Admin KYC', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { id: u.id, token: mintToken(u.id) };
}
let seq = 40000;
const crm = () => `${seq++}-SP`;

describe('admin — KYC do médico (spec §3)', () => {
  beforeEach(async () => { await resetDb(); });

  it('fila: needs_admin com nomes lado a lado + tentativas anteriores no CRM (inclusive conta excluída) + legados', async () => {
    const admin = await createAdmin();
    const c = crm();
    const { doctor } = await createDoctor({ crm: c, verificationStatus: 'needs_admin' });
    await prisma.doctorVerification.create({ data: { doctorId: null, crm: c, providerId: 'v-old', status: 'rejected', decision: 'rejected', decidedBy: 'auto' } });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: c, providerId: 'v-new', status: 'approved', decision: 'needs_admin', reasonCode: 'name_mismatch', documentName: 'MARIA SANTOS', cfmName: 'MARIA SOUZA' } });
    const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    const r = await api().get('/api/admin/doctors/verification-queue').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.review).toHaveLength(1);
    expect(r.body.review[0]).toMatchObject({ providerId: 'v-new', documentName: 'MARIA SANTOS', cfmName: 'MARIA SOUZA', priorAttempts: 1, decideIn: 'drexame' });
    expect(r.body.legacy.map((d: any) => d.id)).toEqual([leg.doctor.id]);
  });

  it('aprovar → approved com verifiedBy = admin; a tentativa guarda quem decidiu', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: 'x', providerId: 'v-a', status: 'approved', decision: 'needs_admin' } });
    const r = await api().post(`/api/admin/doctors/${doctor.id}/verification/approve`).set(authHeader(admin.token)).send({ note: 'conferi no painel' });
    expect(r.status).toBe(200);
    expect(await prisma.doctor.findUnique({ where: { id: doctor.id }, select: { verificationStatus: true, verifiedBy: true } })).toEqual({ verificationStatus: 'approved', verifiedBy: admin.id });
    expect((await prisma.doctorVerification.findUnique({ where: { providerId: 'v-a' } }))?.decidedBy).toBe(admin.id);
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('já pode atender') })));
  });

  it('recusar exige motivo', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({})).body.code).toBe('REASON_REQUIRED');
    const r = await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({ reason: 'não é o titular' });
    expect(r.status).toBe(200);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('rejected');
    // dono (28/10): o motivo que ELE digitou vai no e-mail do médico (e não o texto padrão do reasonCode)
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('não é o titular') })));
  });

  it('aprovar legados em lote só mexe em quem é legacy', async () => {
    const admin = await createAdmin();
    const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    const pend = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    const r = await api().post('/api/admin/doctors/verification/approve-legacy').set(authHeader(admin.token)).send({ ids: [leg.doctor.id, pend.doctor.id] });
    expect(r.body).toMatchObject({ ok: true, approved: 1 });
    expect((await prisma.doctor.findUnique({ where: { id: pend.doctor.id } }))?.verificationStatus).toBe('pending');
  });

  it('prazo dos legados editável pelo PATCH de config existente (data futura em ms) + auditado', async () => {
    const admin = await createAdmin();
    const until = Date.now() + 30 * 86_400_000;
    const r = await api().patch('/api/admin/config/costs').set(authHeader(admin.token)).send({ category: 'doctorKyc', legacyGraceUntilMs: until, autoApprove: 1 });
    expect(r.status).toBe(200);
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: until, autoApprove: 1 });
    const log = await prisma.auditLog.findFirst({ where: { action: 'KYC_CONFIG_CHANGED' }, orderBy: { createdAt: 'desc' } });
    expect(log).toMatchObject({ actorId: admin.id, before: { legacyGraceUntilMs: 0, autoApprove: 0 }, after: { legacyGraceUntilMs: until, autoApprove: 1 } });
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
  });

  it('config do KYC recusa prazo em segundos, no passado, autoApprove fora de 0/1 e campo desconhecido — e nada muda', async () => {
    const admin = await createAdmin();
    const logsBefore = await prisma.auditLog.count({ where: { action: 'KYC_CONFIG_CHANGED' } });
    for (const body of [
      { legacyGraceUntilMs: Math.floor(Date.now() / 1000) + 86_400 }, // em segundos → viraria 1970 e trancaria todo legado
      { legacyGraceUntilMs: Date.now() - 1000 }, // no passado
      { autoApprove: 2 },
      { foo: 1 },
    ]) {
      const r = await api().patch('/api/admin/config/costs').set(authHeader(admin.token)).send({ category: 'doctorKyc', ...body });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('KYC_CONFIG_INVALID');
    }
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 0, autoApprove: 0 });
    expect(await prisma.auditLog.count({ where: { action: 'KYC_CONFIG_CHANGED' } })).toBe(logsBefore);
  });
});
