import { prisma } from '../prisma';
import { syncVerification } from '../kyc/sync';
import { NON_FINAL_ATTEMPT } from '../kyc/decide';

const MS_MIN = 60_000;
const MS_DAY = 24 * 60 * MS_MIN;
const OPEN = [...NON_FINAL_ATTEMPT, 'manual_review'];
/** Status finais do UaiID — com `decision` nula significa SEGURADA (identidade OK à espera do nome do documento). */
const FINAL_UNDECIDED = ['approved', 'rejected'];

/**
 * Uma passada (testável). Spec §5: tentativas abertas < 7 dias e sem sync há > 10 min → GET no
 * UaiID (cobre webhook esgotado — o log real tem 5/5 em 500/503); não finais > 7 dias → expired.
 * manual_review não expira: aguarda o painel do UaiID.
 *
 * Revisão final: (I3) também re-sincroniza a tentativa SEGURADA — status final do UaiID mas sem decisão nossa (o hold
 * do nome do documento): antes ela saía do filtro `OPEN` e o médico ficava em `in_progress` para sempre; (M2) um
 * syncVerification que lança não derruba a passada (nem a expiração), a fila é ordenada com os NUNCA sincronizados
 * primeiro (antes uma linha que falhava sempre voltava à frente e travava o job) e a expiração é condicional.
 */
export async function runKycReconcile(now: number = Date.now(), limit = 50): Promise<{ candidates: number; synced: number; expired: number }> {
  const at = new Date(now);
  const rows = await prisma.doctorVerification.findMany({
    where: {
      createdAt: { gt: new Date(now - 7 * MS_DAY) },
      AND: [
        { OR: [{ status: { in: OPEN } }, { decision: null, status: { in: FINAL_UNDECIDED } }] },
        { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now - 10 * MS_MIN) } }] },
      ],
    },
    orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { providerId: true },
  });
  let synced = 0;
  for (const r of rows) {
    try {
      if ((await syncVerification(r.providerId, 'poll', { now: at })).ok) synced++;
    } catch (e) {
      console.error('[kyc-reconcile] sync falhou (segue com as demais):', r.providerId, (e as Error)?.message);
    }
  }

  const stale = await prisma.doctorVerification.findMany({
    where: { status: { in: [...NON_FINAL_ATTEMPT] }, createdAt: { lte: new Date(now - 7 * MS_DAY) } },
    select: { id: true, doctorId: true, createdAt: true },
  });
  let expired = 0;
  for (const s of stale) {
    try {
      // condicional: se um sync concorrente já levou a tentativa a um status final, não a rebaixa para expired
      const upd = await prisma.doctorVerification.updateMany({
        where: { id: s.id, status: { in: [...NON_FINAL_ATTEMPT] } },
        data: { status: 'expired', decision: 'pending', lastSyncedAt: at, syncSource: 'poll' },
      });
      if (!upd.count) continue;
      expired++;
      if (!s.doctorId) continue;
      const newer = await prisma.doctorVerification.count({ where: { doctorId: s.doctorId, createdAt: { gt: s.createdAt } } });
      if (!newer) await prisma.doctor.updateMany({ where: { id: s.doctorId, verificationStatus: 'in_progress' }, data: { verificationStatus: 'pending' } });
    } catch (e) {
      console.error('[kyc-reconcile] expiração falhou (segue com as demais):', s.id, (e as Error)?.message);
    }
  }
  return { candidates: rows.length, synced, expired };
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
