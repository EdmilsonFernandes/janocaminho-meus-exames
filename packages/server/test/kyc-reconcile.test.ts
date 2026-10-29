import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  getUaiidVerification: vi.fn(),
}));

import { prisma } from '../src/prisma';
import { resetDb, createDoctor } from './helpers';
import { getUaiidVerification } from '../src/utils/uaiid';
import { runKycReconcile } from '../src/jobs/kycReconcile';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = Date.now();
let seq = 50000;

async function seed(opts: { status?: string; createdAgoMs?: number; syncedAgoMs?: number | null; doctorStatus?: string } = {}) {
  const crm = `${seq++}-SP`;
  const { doctor } = await createDoctor({ crm, verificationStatus: opts.doctorStatus ?? 'in_progress' });
  const providerId = `v-${doctor.id}`;
  await prisma.doctorVerification.create({
    data: {
      doctorId: doctor.id, crm, providerId, status: opts.status ?? 'collecting', cfmName: 'DR TESTE', cfmSituation: 'Ativo',
      createdAt: new Date(NOW - (opts.createdAgoMs ?? 30 * MIN)),
      lastSyncedAt: opts.syncedAgoMs === null ? null : new Date(NOW - (opts.syncedAgoMs ?? 20 * MIN)),
    },
  });
  return { doctor, providerId };
}

describe('runKycReconcile (spec §5)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(getUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockResolvedValue({ id: 'x', status: 'processing', reasonCode: null, score: null, nameRatio: null, cpfSituacao: null, externalReference: null, completedAt: null });
  });

  it('aberta sem sync há >10min → consulta o UaiID', async () => {
    const { providerId } = await seed({ syncedAgoMs: 20 * MIN });
    const r = await runKycReconcile(NOW);
    expect(r).toMatchObject({ candidates: 1, synced: 1 });
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledWith(providerId);
  });

  it('sincronizada há 2 min → não consulta', async () => {
    await seed({ syncedAgoMs: 2 * MIN });
    expect((await runKycReconcile(NOW)).candidates).toBe(0);
    expect(vi.mocked(getUaiidVerification)).not.toHaveBeenCalled();
  });

  it('aberta há >7 dias → expired e o médico volta a pending', async () => {
    const { doctor, providerId } = await seed({ createdAgoMs: 8 * DAY });
    expect((await runKycReconcile(NOW)).expired).toBe(1);
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.status).toBe('expired');
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('pending');
  });

  it('manual_review há >7 dias não expira (aguarda o painel do UaiID)', async () => {
    const { providerId } = await seed({ status: 'manual_review', createdAgoMs: 8 * DAY, doctorStatus: 'uaiid_review' });
    expect((await runKycReconcile(NOW)).expired).toBe(0);
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.status).toBe('manual_review');
  });
});
