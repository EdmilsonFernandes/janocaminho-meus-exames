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

  // --- Revisão final (I3 / M2) ---
  const done = (over: object = {}) => ({ id: 'x', status: 'approved', reasonCode: null, score: 900, nameRatio: null, cpfSituacao: 'REGULAR', externalReference: null, completedAt: new Date(NOW - 30 * MIN), ...over });

  it('tentativa SEGURADA (status final do UaiID, sem decisão nossa — hold do nome) é re-sincronizada pelo job e vai ao dono', async () => {
    const { doctor, providerId } = await seed({ status: 'approved', syncedAgoMs: 20 * MIN }); // decision = null
    vi.mocked(getUaiidVerification).mockResolvedValue(done()); // concluída há 30 min, ainda sem nome → hold expirou
    expect(await runKycReconcile(NOW)).toMatchObject({ candidates: 1, synced: 1 });
    expect(await prisma.doctorVerification.findUnique({ where: { providerId } })).toMatchObject({ decision: 'needs_admin', reasonCode: 'document_name_unavailable' });
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('needs_admin');
  });

  it('já decidida (final com decisão) não é re-selecionada', async () => {
    const { providerId } = await seed({ status: 'approved', syncedAgoMs: 20 * MIN });
    await prisma.doctorVerification.update({ where: { providerId }, data: { decision: 'needs_admin' } });
    expect((await runKycReconcile(NOW)).candidates).toBe(0);
  });

  it('um sync que LANÇA não derruba a passada: os demais sincronizam e a expiração de 7 dias ainda roda', async () => {
    const a = await seed({ syncedAgoMs: 40 * MIN });
    await seed({ syncedAgoMs: 20 * MIN });
    const velha = await seed({ createdAgoMs: 8 * DAY });
    vi.mocked(getUaiidVerification).mockImplementation(async (id: string) => {
      if (id === a.providerId) throw new Error('boom');
      return { id, status: 'processing', reasonCode: null, score: null, nameRatio: null, cpfSituacao: null, externalReference: null, completedAt: null };
    });
    const r = await runKycReconcile(NOW);
    expect(r).toMatchObject({ candidates: 2, synced: 1, expired: 1 });
    expect((await prisma.doctorVerification.findUnique({ where: { providerId: velha.providerId } }))?.status).toBe('expired');
  });

  it('nunca sincronizadas vêm PRIMEIRO (uma linha antiga que sempre falha não trava o job)', async () => {
    await seed({ syncedAgoMs: 60 * MIN });
    const nunca = await seed({ syncedAgoMs: null });
    await runKycReconcile(NOW, 1);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledWith(nunca.providerId);
  });

  it('a expiração é condicional: tentativa que um sync concorrente já levou a status final não é rebaixada', async () => {
    const { providerId } = await seed({ createdAgoMs: 8 * DAY });
    await prisma.doctorVerification.update({ where: { providerId }, data: { status: 'approved' } }); // saiu de NON_FINAL antes da expiração
    expect((await runKycReconcile(NOW)).expired).toBe(0);
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.status).toBe('approved');
  });
});
