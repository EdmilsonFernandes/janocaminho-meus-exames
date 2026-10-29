import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createDoctor } from './helpers';
import { getDoctorKycConfig, saveSettings } from '../src/utils/settings';

describe('KYC médico — fundação (schema, config, helper)', () => {
  beforeEach(async () => { await resetDb(); });
  afterEach(async () => { await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); });

  it('createDoctor nasce approved por padrão e aceita override', async () => {
    const a = await createDoctor({ crm: '11111-SP' });
    const b = await createDoctor({ crm: '22222-SP', verificationStatus: 'pending' });
    const rows = await prisma.doctor.findMany({ where: { id: { in: [a.doctor.id, b.doctor.id] } }, select: { id: true, verificationStatus: true } });
    const byId = new Map(rows.map((r) => [r.id, r.verificationStatus]));
    expect(byId.get(a.doctor.id)).toBe('approved');
    expect(byId.get(b.doctor.id)).toBe('pending');
  });

  it('médico criado direto no banco nasce pending (default do schema)', async () => {
    const d = await prisma.doctor.create({ data: { name: 'Dr X', crm: '33333-SP', email: 'kyc-x@exemplo.com', passwordHash: 'x' } });
    expect(d.verificationStatus).toBe('pending');
  });

  it('tentativa sobrevive à exclusão da conta (SetNull + snapshot do CRM)', async () => {
    const { doctor } = await createDoctor({ crm: '44444-SP' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: '44444-SP', providerId: 'v-foundation-1', status: 'rejected' } });
    await prisma.doctor.delete({ where: { id: doctor.id } });
    const v = await prisma.doctorVerification.findUnique({ where: { providerId: 'v-foundation-1' } });
    expect(v?.doctorId).toBeNull();
    expect(v?.crm).toBe('44444-SP');
  });

  it('getDoctorKycConfig: defaults (sem prazo, sempre humano) e lê o valor salvo', async () => {
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 0, autoApprove: 0 });
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 1767225600000, autoApprove: 1 });
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 1767225600000, autoApprove: 1 });
  });
});
