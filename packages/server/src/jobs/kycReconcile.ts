import { prisma } from '../prisma';
import { syncVerification } from '../kyc/sync';
import { NON_FINAL_ATTEMPT } from '../kyc/decide';

const MS_MIN = 60_000;
const MS_DAY = 24 * 60 * MS_MIN;
const OPEN = [...NON_FINAL_ATTEMPT, 'manual_review'];

/**
 * Uma passada (testável). Spec §5: tentativas abertas < 7 dias e sem sync há > 10 min → GET no
 * UaiID (cobre webhook esgotado — o log real tem 5/5 em 500/503); não finais > 7 dias → expired.
 * manual_review não expira: aguarda o painel do UaiID.
 */
export async function runKycReconcile(now: number = Date.now(), limit = 50): Promise<{ candidates: number; synced: number; expired: number }> {
  const at = new Date(now);
  const rows = await prisma.doctorVerification.findMany({
    where: {
      status: { in: OPEN },
      createdAt: { gt: new Date(now - 7 * MS_DAY) },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now - 10 * MS_MIN) } }],
    },
    orderBy: { lastSyncedAt: 'asc' },
    take: limit,
    select: { providerId: true },
  });
  let synced = 0;
  for (const r of rows) if ((await syncVerification(r.providerId, 'poll', { now: at })).ok) synced++;

  const stale = await prisma.doctorVerification.findMany({
    where: { status: { in: [...NON_FINAL_ATTEMPT] }, createdAt: { lte: new Date(now - 7 * MS_DAY) } },
    select: { id: true, doctorId: true, createdAt: true },
  });
  for (const s of stale) {
    await prisma.doctorVerification.update({ where: { id: s.id }, data: { status: 'expired', decision: 'pending', lastSyncedAt: at, syncSource: 'poll' } });
    if (!s.doctorId) continue;
    const newer = await prisma.doctorVerification.count({ where: { doctorId: s.doctorId, createdAt: { gt: s.createdAt } } });
    if (!newer) await prisma.doctor.updateMany({ where: { id: s.doctorId, verificationStatus: 'in_progress' }, data: { verificationStatus: 'pending' } });
  }
  return { candidates: rows.length, synced, expired: stale.length };
}

/** Job (padrão reconciliation.ts:260-277): a cada 10 min + 1ª passada 1 min após o boot. */
export function startKycReconcileJob(): void {
  const tick = async () => {
    try {
      const r = await runKycReconcile(Date.now());
      if (r.synced || r.expired) console.log(`[kyc-reconcile] ${r.synced}/${r.candidates} sincronizada(s), ${r.expired} expirada(s)`);
    } catch (e) {
      console.error('[kyc-reconcile] job error:', (e as Error)?.message);
    }
  };
  setInterval(tick, 10 * MS_MIN);
  setTimeout(tick, MS_MIN);
  console.log('[kyc-reconcile] job iniciado (KYC médico · a cada 10 min)');
}
