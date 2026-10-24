// §15.2 — CONCILIAÇÃO entre etapas (spec docs/design/2026-10-24-teleconsulta-gaps-spec.md):
// "evento ocorreu numa etapa, não chegou na outra" → jobs IDEMPOTENTES que fecham o
// gap dentro da arquitetura existente (mesmo padrão reminderEmails/pix-expiry:
// setInterval + estado no BANCO, sem fila em memória — restart não perde tarefa nem
// duplica efeito).
//
// Cenários do spec §15.2:
//  1. PAGO × CONSULTA NÃO ATUALIZADA (webhook falhou/perdido): Subscription com tag
//     'teleconsulta_<id>' PENDING/CANCELLED (pix-expiry cancela o PIX vencido — o
//     pagamento pode ter CAÍDO depois, corrida real) → REVALIDA no provedor
//     (Asaas GET /v3/payments/{id}); RECEIVED → approvePendingSubscription (a MESMA
//     função dos webhooks — idempotente pelo status, sem efeito financeiro duplicado).
//     Sem query possível (mp/openpix não têm helper de status) → fila de exceção.
//  2. REAGENDADA × LEMBRETE ANTIGO: JÁ COBERTO pelo §13 — o claim do e-mail "começa
//     em X" revalida done/endedAt/dueDate no banco (updateMany condicional) e o
//     PUT /reminders/:id zera sentOffsets. CONFIRMADO, não re-implementado aqui.
//  3. EXAME PROCESSADO × BRIEF NÃO ATUALIZADO: ON-DEMAND por design (§12 — brief/
//     prioridade recalculam na abertura do médico + poll 30s na chamada). Documentado.
//  4. ENCERRADA × RESUMO NÃO GERADO: resumo é DECISÃO MÉDICA (§14.1) → NUNCA gerar
//     automático; só enfileira p/ triagem humana (central de exceções §14.5).
//
// Fila de exceção = tabela ExceptionQueue (migration 20261024140000, aditiva): dedup
// por (kind, reminderId, status open) — 2 ticks/restarts não duplicam. SEM UI (a
// central do ADMIN vem na fase §14.5).
import { prisma } from '../prisma';
import { hasAsaas } from '../config';
import { activePixProvider } from '../payments/pix-provider';
import { ASAAS_RECEIVED_STATUSES, getAsaasPaymentStatus } from '../payments/asaas-provider';
import { approvePendingSubscription } from '../utils/billingApproval';
import { runFinanceReconciliation } from '../finance/reconcile';

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const TELE_TAG = 'teleconsulta_';

/**
 * Enfileira uma exceção p/ revisão humana (central §14.5). Idempotente: no máx. 1
 * exceção OPEN por (kind, reminderId) — re-tick/restart não duplica. Retorna true
 * se CRIOU (false = já existia ou tabela ausente em banco legado → no-op).
 */
export async function enqueueException(
  kind: string,
  reminderId: string | null,
  payload?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const existing = await prisma.exceptionQueue.findFirst({
      where: { kind, reminderId, status: 'open' },
      select: { id: true },
    });
    if (existing) return false;
    await prisma.exceptionQueue.create({
      data: { kind, reminderId: reminderId ?? null, payload: (payload ?? undefined) as any },
    });
    return true;
  } catch (e) {
    // Drift-safe: tabela ainda não migrada em prod → log e segue (job não derruba).
    console.error('[reconciliation] enqueue falhou:', kind, reminderId ?? '-', (e as Error)?.message);
    return false;
  }
}

/** Cache NEGATIVO (em memória): payment verificado NÃO-pago no provedor não é
 *  re-consultado a cada tick (PIX expirado não volta a ser pagável — 24h de folga
 *  cobre qualquer virada tardia de status). Perde-se no restart → 1 re-query, ok. */
const notPaidCache = new Map<string, number>();
const NOT_PAID_TTL_MS = 24 * MS_HOUR;

export interface ReconciliationReport {
  paymentsReconciled: number; // pagamentos confirmados no provedor e aplicados no banco
  exceptionsCreated: number;  // novas exceções enfileiradas (as dedup não contam)
  candidates: number;         // subscriptions de teleconsulta avaliadas no tick
  financeRepaired?: number;   // onda 2 (§18): partidas de ledger repostas (idempotente)
}

/** Lookup de status no Asaas — injetável p/ teste (stub sem rede); default = provider. */
type AsaasLookup = (paymentId: string) => Promise<string | null>;

/**
 * PASS principal (exportado p/ testes — sem setInterval): concilia cenários 1 e 4.
 * Idempotente por construção: approvePendingSubscription recusa sub já APPROVED;
 * exceções têm dedup open; cache negativo evita re-query em loop.
 */
export async function runReconciliation(
  now: number,
  opts: { asaasPaymentLookup?: AsaasLookup } = {},
): Promise<ReconciliationReport> {
  const report: ReconciliationReport = { paymentsReconciled: 0, exceptionsCreated: 0, candidates: 0 };

  // ── Cenário 1: pago × consulta não atualizada ─────────────────────────────────
  // Janela de 30d: consultas são de curto prazo; legado antigo é papel do script
  // de diagnóstico (§15.1), não do job periódico.
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: ['PENDING', 'CANCELLED'] }, // CANCELLED: pix-expiry pode ter cancelado ANTES do webhook chegar
      mpPreferenceId: { startsWith: TELE_TAG },
      mpPaymentId: { not: null },
      createdAt: { gt: new Date(now - 30 * 24 * MS_HOUR) },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, mpPaymentId: true, mpPreferenceId: true, status: true },
    take: 200,
  }).catch(() => [] as { id: string; mpPaymentId: string | null; mpPreferenceId: string | null; status: string }[]);
  report.candidates = subs.length;

  for (const sub of subs) {
    const reminderId = (sub.mpPreferenceId ?? '').slice(TELE_TAG.length);
    const paymentId = sub.mpPaymentId as string;
    if (!reminderId || !paymentId) continue;
    const r = await prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { id: true, paidAt: true, dueDate: true },
    }).catch(() => null);
    if (!r) continue; // lembrete deletado — sem consulta, nada a conciliar

    // Divergência: consulta JÁ paga mas Subscription ficou PENDING/CANCELLED
    // (webhook marcou o reminder e morreu antes do sub, ou pix-expiry cancelou na
    // corrida). Completa o lado da Subscription com a MESMA aprovação dos webhooks
    // (o lado do reminder é no-op: updateMany condicional paidAt=null).
    if (r.paidAt) {
      if (sub.status !== 'APPROVED') {
        const ok = await approvePendingSubscription(sub.id, { type: 'teleconsulta', reminderId }, paymentId).catch(() => false);
        if (ok) {
          report.paymentsReconciled++;
          console.log(`[reconciliation] sub ${sub.id} sincronizada com consulta já paga (reminder ${reminderId})`);
        }
      }
      continue;
    }

    // Consulta não paga no banco → revalida no provedor antes de qualquer decisão.
    const canQuery = !!opts.asaasPaymentLookup || (activePixProvider() === 'asaas' && hasAsaas());
    if (canQuery) {
      const cachedUntil = notPaidCache.get(paymentId);
      if (cachedUntil != null && cachedUntil > now) continue;
      const status = opts.asaasPaymentLookup
        ? await opts.asaasPaymentLookup(paymentId)
        : await getAsaasPaymentStatus(paymentId);
      if (status && ASAAS_RECEIVED_STATUSES.has(status)) {
        const ok = await approvePendingSubscription(sub.id, { type: 'teleconsulta', reminderId }, paymentId).catch(() => false);
        if (ok) {
          report.paymentsReconciled++;
          notPaidCache.delete(paymentId);
          console.log(`[reconciliation] PIX pago com webhook perdido — conciliado: reminder ${reminderId} (${paymentId})`);
        }
        continue;
      }
      if (status) {
        // Verificado NÃO-pago (EXPIRED etc.) — estado limpo, paciente só não pagou.
        notPaidCache.set(paymentId, now + NOT_PAID_TTL_MS);
        continue;
      }
      // Query falhou (rede/key) → fila de exceção: dinheiro pode ter saído.
      if (await enqueueException('teleconsulta_payment_unconfirmed', reminderId, {
        subscriptionId: sub.id, paymentId, reason: 'asaas_query_failed',
      })) report.exceptionsCreated++;
      continue;
    }

    // Provedor sem query de status implementada (mp/openpix) → revisão humana.
    // Janela de relevância 48h p/ não virar cemitério de checkouts abandonados;
    // legado antigo = relatório do script §15.1.
    if (new Date(r.dueDate).getTime() > now - 48 * MS_HOUR) {
      if (await enqueueException('teleconsulta_payment_unconfirmed', reminderId, {
        subscriptionId: sub.id, paymentId, provider: activePixProvider(), reason: 'no_status_query',
      })) report.exceptionsCreated++;
    }
  }

  // ── Cenário 4: encerrada (completed) × resumo não gerado ──────────────────────
  // NUNCA corrigir automático (§14.1: resumo é revisão/aprovação do MÉDICO) — só
  // sinalizar p/ triagem. 48h de folga antes de considerar "esquecido".
  // Heurística v1: sem doctorNote (QuickNote). QUANDO o model ConsultSummary (§14.1)
  // entrar em produção, estender o where p/ "sem resumo aprovado" também.
  const endedNoSummary = await prisma.reminder.findMany({
    where: {
      type: 'teleconsulta',
      teleStatus: 'completed',
      endedAt: { lt: new Date(now - 48 * MS_HOUR) },
      OR: [{ doctorNote: null }, { doctorNote: '' }],
    },
    select: { id: true, endedAt: true },
    take: 100,
  }).catch(() => [] as { id: string; endedAt: Date | null }[]);
  for (const r of endedNoSummary) {
    if (await enqueueException('teleconsulta_ended_no_summary', r.id, { endedAt: r.endedAt })) {
      report.exceptionsCreated++;
    }
  }

  // ── Onda 2 (§18): conciliação financeira — teleStatus × ledger ────────────────
  // Reposta o que faltar (idempotente por txnId) + divergências na fila de exceção.
  // Drift-safe: tabela ledger_entries ausente em banco legado → ignora e segue.
  try {
    const fin = await runFinanceReconciliation(now);
    report.financeRepaired = fin.repaired;
    report.exceptionsCreated += fin.exceptionsCreated;
  } catch (e) {
    console.error('[reconciliation] finance pass falhou:', (e as Error)?.message);
  }

  return report;
}

/** Job periódico (§15.2): a cada 10 min + 1ª passada 1min após o boot (deixa
 *  migrations/health se acomodarem antes). Falha não derruba o processo. */
export function startReconciliationJob(): void {
  const tick = async () => {
    try {
      const report = await runReconciliation(Date.now());
      if (report.paymentsReconciled || report.exceptionsCreated) {
        console.log(`[reconciliation] tick: ${report.candidates} candidata(s), ${report.paymentsReconciled} conciliado(s), ${report.exceptionsCreated} exceção(ões)`);
      }
    } catch (e) {
      console.error('[reconciliation] job error:', (e as Error)?.message);
    }
  };
  setInterval(tick, 10 * MS_MIN);
  setTimeout(tick, MS_MIN);
  console.log('[reconciliation] job iniciado (§15.2 · conciliação teleconsulta · a cada 10 min)');
}
