// §18 + §15.2 — CONCILIAÇÃO DE ESTADO FINANCEIRO (Onda 2).
// Verifica, para cada teleconsulta PAGA (janela 30d), a coerência teleStatus × ledger:
//   pago ................. → partidas payment_<id> existem?
//   pago + completed ..... → partidas completion_<id> existem?
//   pago + no_show/tech .. → partidas refund_reserve_<id> existem?
// O que faltar é POSTADO (idempotente por txnId determinístico — reparar 2× = no-op).
// Divergência estrutural (ledger de conclusão sem consulta concluída) → ExceptionQueue
// p/ triagem humana (nunca "corrige" sozinho). Roda dentro do job reconciliation (10min).
import { prisma } from '../prisma';
import {
  recordTeleconsultaPayment,
  recordTeleconsultaCompletion,
  recordTeleconsultaRefundReserve,
  completionTxnId,
} from './ledger';
import { enqueueException } from '../jobs/reconciliation';

const MS_DAY = 86_400_000;

export interface FinanceReconciliationReport {
  checked: number; // teleconsultas pagas avaliadas
  repaired: number; // eventos de ledger repostos (1ª vez; re-run idempotente)
  exceptionsCreated: number; // divergências enfileiradas
}

/** Pass financeiro (exportado p/ teste). Drift-safe: tabela ledger_entries ausente em
 *  banco legado → catch no chamador (job nunca cai por causa da onda 2). */
export async function runFinanceReconciliation(now: number): Promise<FinanceReconciliationReport> {
  const report: FinanceReconciliationReport = { checked: 0, repaired: 0, exceptionsCreated: 0 };
  const since = new Date(now - 30 * MS_DAY);

  // Pagas (janela 30d): price>0 + paidAt set. Colunas novas via select drift-tolerante.
  const rows = await prisma.reminder.findMany({
    where: {
      type: 'teleconsulta',
      consultPriceCents: { gt: 0 },
      paidAt: { not: null, gte: since },
    },
    select: { id: true, teleStatus: true },
    take: 200,
    orderBy: { paidAt: 'asc' },
  }).catch((e: any) => (/column .* does not exist/i.test(String(e?.message)) ? [] : Promise.reject(e)));

  for (const r of rows) {
    report.checked++;
    // 1) Partidas do pagamento — base de tudo (também congela snapshot/releaseEligibleAt).
    const pay = await recordTeleconsultaPayment(r.id);
    if (pay.posted) report.repaired++;

    if (r.teleStatus === 'completed') {
      const done = await recordTeleconsultaCompletion(r.id);
      if (done.posted) report.repaired++;
    } else if (r.teleStatus === 'no_show' || r.teleStatus === 'technical') {
      const res = await recordTeleconsultaRefundReserve(r.id);
      if (res.posted) report.repaired++;
    }
    // teleStatus null/scheduled/in_progress/cancelled: pago aguardando consulta —
    // apenas o lançamento de pagamento (held) é o estado correto. Nada a fazer.
  }

  // Divergência estrutural: conclusão escrita mas consulta NÃO concluída (ex. teleStatus
  // reescrito por bug/rollback manual). Nunca apagar — sinalizar p/ humano.
  const completionEntries = await prisma.ledgerEntry.findMany({
    where: { txnId: { startsWith: 'completion_' }, createdAt: { gte: since } },
    select: { reminderId: true },
    distinct: ['reminderId'],
  }).catch(() => [] as { reminderId: string | null }[]);
  for (const c of completionEntries) {
    if (!c.reminderId) continue;
    const r = await prisma.reminder.findUnique({ where: { id: c.reminderId }, select: { teleStatus: true } }).catch(() => null);
    if (r && r.teleStatus !== 'completed') {
      if (await enqueueException('teleconsulta_finance_divergence', c.reminderId, {
        reason: 'completion_ledger_without_completed_status', txnId: completionTxnId(c.reminderId),
      })) report.exceptionsCreated++;
    }
  }

  return report;
}
