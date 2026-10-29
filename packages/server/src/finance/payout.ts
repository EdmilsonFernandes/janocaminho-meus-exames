// §18.5/§18.6/§18.7 — ONDA 4: REPASSES SUPERVISIONADOS + ESTORNOS REAIS.
// Arquitetura A (docs/design/2026-10-24-finance-architecture.md §3): conta única +
// repasse posterior via transferência PIX. Máquina de estados do Payout:
//
//   requested ──(aprovação admin OU payoutAuto)──▶ processing ──▶ completed | failed
//        │ reserva atômica no ledger                     │ resposta perdida/timeout
//        │ (D doctor_payable / C payout_processing)      ▼
//        └── stuck>48h → alerta                       unknown ──(conciliação por
//                                                                externalReference,
//                                                                JAMAIS reenvia)──▶
//                                                                completed | failed(24h sem registro)
//
// SUPERVISÃO v1: o job SÓ cria `requested` (não envia). O envio acontece na rota
// admin (POST /admin/payouts/:id/approve) — chamada REAL ao Asaas permitida aí.
// Auto (AppSetting teleconsulta.payoutAuto, default FALSE) usa o MESMO caminho.
// Estorno: no_show/technical pago com reserva (onda 2) → refund TOTAL no Asaas.
import { prisma } from '../prisma';
import { postEntries, postRefundExecuted, type LedgerTxn } from './ledger';
import { coerceSnapshot } from './rules';
import { decryptPII } from '../utils/crypto';
import { enqueueException, resolveExceptions } from '../jobs/reconciliation';
import { maskPixKey } from '../routes/doctor.routes';
import { payoutAutoEnabled } from '../utils/settings';
import { doctorCanPractice } from '../utils/doctorAccess';
import {
  AsaasApiError, createAsaasPixTransfer, lookupAsaasTransferByExternalRef,
  getAsaasPaymentStatus, getAsaasFinanceBalance, isAsaasBalanceIssue, isAsaasTokenSmsIssue,
  refundAsaasPayment, type AsaasTransferInput, type AsaasTransferLookup, type AsaasTransferResult,
} from '../payments/asaas-provider';
import { hasAsaas } from '../config';
import { activePixProvider } from '../payments/pix-provider';

const MS_HOUR = 3_600_000;

// txnIds determinísticos (idempotência por evento — matriz §18.10).
export const payoutReserveTxnId = (reminderId: string) => `payout_reserve_${reminderId}`;
export const payoutDoneTxnId = (payoutId: string) => `payout_done_${payoutId}`;
export const payoutUnreserveTxnId = (payoutId: string) => `payout_unreserve_${payoutId}`;

export const payoutExternalRef = (payoutId: string) => `payout_${payoutId}`;

/** Injetáveis p/ teste (mock completo — ZERO chamada real ao Asaas na suíte). */
export interface PayoutDeps {
  transferSender?: (input: AsaasTransferInput) => Promise<AsaasTransferResult>;
  transferLookup?: (externalReference: string) => Promise<AsaasTransferLookup & { error: boolean }>;
}

// ── Payout pass: cria Payouts `requested` com reserva atômica ─────────────────────

export interface PayoutPassReport {
  created: number; // payouts criados (requested + reservado)
  skippedBelowMin: number; // médicos abaixo do piso (acumula p/ próximo tick)
  exceptionsCreated: number;
}

/**
 * Consulta elegível (§18.5): teleStatus=completed + paga + releaseEligibleAt vencido
 * + sem payout + sem estorno. Valor = obrigações do médico NO LEDGER p/ a consulta
 * (credit−debit em doctor_payable) — nunca recalculado da regra viva. Cria Payout
 * status=requested + RESERVA ATÔMICA no ledger (antiduplicação §18.6: unique
 * reminderId no Payout + txnId determinístico + transação). NÃO envia (supervisão).
 */
export async function runPayoutPass(now: number): Promise<PayoutPassReport> {
  const report: PayoutPassReport = { created: 0, skippedBelowMin: 0, exceptionsCreated: 0 };

  const rows = await prisma.reminder.findMany({
    where: {
      type: 'teleconsulta',
      teleStatus: 'completed',
      paidAt: { not: null },
      consultPriceCents: { gt: 0 },
      createdByDoctorId: { not: null },
      releaseEligibleAt: { lte: new Date(now) },
      refundedAt: null,
    },
    select: {
      id: true, createdByDoctorId: true, dueDate: true, title: true,
      commissionSnapshot: true,
    },
    orderBy: { paidAt: 'asc' },
    take: 200,
  }).catch((e: any) => (/column .* does not exist/i.test(String(e?.message)) ? [] : Promise.reject(e)));
  if (!rows.length) return report;

  const existing = await prisma.payout.findMany({
    where: { reminderId: { in: rows.map((r) => r.id) } },
    select: { reminderId: true, status: true },
  }).catch(() => [] as { reminderId: string; status: string }[]);
  const taken = new Set(existing.map((p) => p.reminderId));

  // Obrigação REAL do médico por consulta (ledger) — a autoridade é o lançamento.
  const amounts = new Map<string, number>();
  for (const r of rows) {
    if (taken.has(r.id)) continue;
    const agg = await prisma.ledgerEntry.aggregate({
      where: { reminderId: r.id, account: 'doctor_payable' },
      _sum: { creditCents: true, debitCents: true },
    }).catch(() => ({ _sum: { creditCents: 0, debitCents: 0 } }));
    const net = (agg._sum.creditCents ?? 0) - (agg._sum.debitCents ?? 0);
    if (net > 0) amounts.set(r.id, net); // 0/estornado → completion ainda não postado; próximo tick repara
  }
  const eligible = rows.filter((r) => amounts.has(r.id));
  if (!eligible.length) return report;

  // Agrupa por médico: PIX válido + piso mínimo (acumula se abaixo — §18.5 D7).
  const byDoctor = new Map<string, typeof eligible>();
  for (const r of eligible) {
    const list = byDoctor.get(r.createdByDoctorId!) ?? [];
    list.push(r);
    byDoctor.set(r.createdByDoctorId!, list);
  }

  for (const [doctorId, rems] of byDoctor) {
    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { payoutPixKeyEnc: true, payoutPixKeyIv: true, payoutPixKeyType: true, blocked: true, verificationStatus: true },
    }).catch(() => null);
    // KYC (spec §7): repasse só p/ quem pode atender (approved ou legacy no prazo) e não bloqueado.
    if (doctor && (doctor.blocked || !doctorCanPractice(doctor.verificationStatus))) {
      if (await enqueueException('payout_doctor_unverified', `payout:doctor:${doctorId}`, { doctorId })) report.exceptionsCreated++;
      continue;
    }
    if (!doctor?.payoutPixKeyEnc || !doctor.payoutPixKeyType || !doctor.payoutPixKeyIv) {
      if (await enqueueException('payout_pending_pix_key', `payout:doctor:${doctorId}`, { doctorId })) report.exceptionsCreated++;
      continue;
    }
    const total = rems.reduce((a, r) => a + (amounts.get(r.id) ?? 0), 0);
    const minPayoutCents = coerceSnapshot(rems[0].commissionSnapshot).minPayoutCents;
    if (total < minPayoutCents) {
      // Abaixo do piso: acumula (o valor PERMANECE em doctor_payable). Exceção ÚNICA
      // por médico com o total acumulado — não spam a cada tick (dedup open).
      if (await enqueueException('payout_below_min', `payout:belowmin:${doctorId}`, {
        doctorId, totalCents: total, minPayoutCents,
      })) report.exceptionsCreated++;
      report.skippedBelowMin++;
      continue;
    }
    // Resolve as pendências de acumulação/pix quando finalmente paga.
    await resolveExceptions('payout_below_min', `payout:belowmin:${doctorId}`);
    await resolveExceptions('payout_pending_pix_key', `payout:doctor:${doctorId}`);

    for (const r of rems) {
      const amountCents = amounts.get(r.id)!;
      try {
        await prisma.$transaction(async (tx: any) => {
          const payout = await tx.payout.create({
            data: {
              reminderId: r.id, doctorId, amountCents, status: 'requested',
              reserveTxnId: payoutReserveTxnId(r.id),
            },
          });
          // Reserva no MESMO transaction do Payout (atomicidade §18.6). Idempotente
          // por txnId — concorrência cai no unique do Payout (P2002) antes de chegar aqui.
          await postEntries(
            [{
              txnId: payoutReserveTxnId(r.id),
              reminderId: r.id,
              doctorId,
              memo: 'Repasse reservado (aguardando aprovação)',
              entries: [
                { account: 'doctor_payable', debitCents: amountCents, refType: 'payout', refId: payout.id },
                { account: 'payout_processing', creditCents: amountCents, refType: 'payout', refId: payout.id },
              ],
            }] as LedgerTxn[],
            tx,
          );
        });
        report.created++;
      } catch (e: any) {
        // P2002 = outro job/tick criou antes (corrida) — 1 payout é o correto.
        if (String(e?.code) !== 'P2002') {
          console.error('[payout] criação falhou:', r.id, e?.message);
        }
      }
    }
  }
  return report;
}

// ── Aprovação (admin) e auto (job) — o MESMO caminho ──────────────────────────────

export interface ApproveOutcome {
  payoutId: string;
  status: 'completed' | 'failed' | 'unknown';
  transferId: string | null;
  error?: string;
}

/** Posta a conclusão (libera a reserva → repasse concluído). Idempotente por txnId. */
async function postPayoutDone(payout: { id: string; reminderId: string; doctorId: string; amountCents: number }): Promise<void> {
  await postEntries([{
    txnId: payoutDoneTxnId(payout.id),
    reminderId: payout.reminderId,
    doctorId: payout.doctorId,
    memo: 'Repasse concluído (transferência confirmada)',
    entries: [
      { account: 'payout_processing', debitCents: payout.amountCents, refType: 'payout', refId: payout.id },
      { account: 'payout_done', creditCents: payout.amountCents, refType: 'payout', refId: payout.id },
    ],
  } as LedgerTxn]);
}

/** Desfaz a reserva (compensatório — NUNCA apaga): devolve a obrigação ao médico. */
async function postPayoutUnreserve(payout: { id: string; reminderId: string; doctorId: string; amountCents: number }, memo: string): Promise<void> {
  await postEntries([{
    txnId: payoutUnreserveTxnId(payout.id),
    reminderId: payout.reminderId,
    doctorId: payout.doctorId,
    memo,
    entries: [
      { account: 'payout_processing', debitCents: payout.amountCents, refType: 'payout', refId: payout.id },
      { account: 'doctor_payable', creditCents: payout.amountCents, refType: 'payout', refId: payout.id },
    ],
  } as LedgerTxn]);
}

/** Resolve um payout a partir de um lookup no provedor (conciliação §18.6). */
async function settlePayoutFromLookup(
  payout: { id: string; reminderId: string; doctorId: string; amountCents: number; status: string },
  lookup: { status: string | null; transferId: string | null; failReason: string | null },
): Promise<'completed' | 'failed' | 'processing' | 'noop'> {
  const st = lookup.status;
  if (st === 'DONE') {
    const n = await prisma.payout.updateMany({
      where: { id: payout.id, status: { in: ['processing', 'unknown'] } },
      data: { status: 'completed', completedAt: new Date(), providerTransferId: lookup.transferId ?? undefined },
    });
    if (n.count || payout.status === 'completed') {
      await postPayoutDone(payout); // idempotente por txnId
      await resolveExceptions('payout_unknown', payout.reminderId);
      return 'completed';
    }
    return 'noop';
  }
  if (st === 'FAILED' || st === 'CANCELLED' || st === 'BLOCKED') {
    const n = await prisma.payout.updateMany({
      where: { id: payout.id, status: { in: ['processing', 'unknown'] } },
      data: { status: 'failed', lastError: lookup.failReason ?? st, providerTransferId: lookup.transferId ?? undefined },
    });
    if (n.count || payout.status === 'failed') {
      await postPayoutUnreserve(payout, 'Repasse falhou — reserva desfeita (compensatório)');
      await resolveExceptions('payout_unknown', payout.reminderId);
      return 'failed';
    }
    return 'noop';
  }
  return 'processing'; // PENDING/BANK_PROCESSING — ainda em trânsito
}

/**
 * APROVAÇÃO (admin OU auto): valida requested + reserva → envia transferência PIX
 * real (`externalReference=payout_<id>` = idempotência oficial Asaas).
 *  - DONE síncrono → completed + ledger payout_done (libera reserva).
 *  - FAILED/SMS-token → failed + desreserva (compensatório) + exceção específica.
 *  - timeout/sem resposta → unknown + exceção payout_unknown (NUNCA reenvia; a
 *    conciliação resolve por externalReference).
 * Retentativa após crash (attempts>0 sem status final): consulta o provedor ANTES
 * de enviar (§18.6 — resposta perdida não autoriza 2ª transferência cega).
 */
export async function approvePayout(
  payoutId: string,
  opts: { executor?: string; deps?: PayoutDeps } = {},
): Promise<ApproveOutcome> {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } }).catch(() => null);
  if (!payout) throw new Error('Payout não encontrado.');
  if (payout.status !== 'requested') {
    throw new Error(`Payout ${payoutId} não está aguardando aprovação (status=${payout.status}).`);
  }
  // Reserva é pré-condição (nunca enviar sem valor comprometido — §18.6).
  const reserve = await prisma.ledgerEntry.findFirst({
    where: { txnId: payout.reserveTxnId, account: 'payout_processing' },
    select: { id: true },
  }).catch(() => null);
  if (!reserve) {
    throw new Error(`Payout ${payoutId} sem reserva no ledger — recusado (investigar).`);
  }

  // Crash-recovery: tentativa anterior sem resultado → CONSULTA antes de reenviar.
  if (payout.attempts > 0) {
    const lookup = await (opts.deps?.transferLookup ?? lookupAsaasTransferByExternalRef)(payoutExternalRef(payout.id));
    if (!lookup.error && lookup.found) {
      await prisma.payout.updateMany({ where: { id: payout.id, status: 'requested' }, data: { status: 'processing' } });
      const settled = await settlePayoutFromLookup({ ...payout, status: 'processing' }, lookup);
      if (settled !== 'processing' && settled !== 'noop') {
        return { payoutId, status: settled, transferId: lookup.transferId, error: lookup.failReason ?? undefined };
      }
      // Provider ainda processando → volta a requested (não envia de novo).
      await prisma.payout.updateMany({ where: { id: payout.id, status: 'processing' }, data: { status: 'unknown' } });
      if (await enqueueException('payout_unknown', payout.reminderId, { payoutId, externalRef: payoutExternalRef(payout.id), reason: 'still_processing_at_provider' })) {
        // dedup — exceção já aberta ok
      }
      return { payoutId, status: 'unknown', transferId: lookup.transferId };
    }
    if (!lookup.error && !lookup.found) {
      // Nenhuma transferência existe → a tentativa anterior morreu ANTES de chegar
      // ao Asaas (rede local) → seguro prosseguir com o envio (idempotência oficial).
    }
  }

  // Claim otimista: requested→processing. 2 aprovações concorrentes → 1 envio.
  const claimed = await prisma.payout.updateMany({
    where: { id: payout.id, status: 'requested' },
    data: { status: 'processing', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    throw new Error(`Payout ${payoutId} foi aprovado concorrentemente (status mudou).`);
  }

  const base = { id: payout.id, reminderId: payout.reminderId, doctorId: payout.doctorId, amountCents: payout.amountCents };

  // PIX do médico (decifrado SÓ em memória; log/exceção carrega MASCARADA).
  const doctor = await prisma.doctor.findUnique({
    where: { id: payout.doctorId },
    select: { name: true, payoutPixKeyEnc: true, payoutPixKeyIv: true, payoutPixKeyType: true },
  }).catch(() => null);
  const pixKey = doctor?.payoutPixKeyEnc ? decryptPII(doctor.payoutPixKeyEnc, doctor.payoutPixKeyIv) : null;
  if (!pixKey || !doctor?.payoutPixKeyType) {
    await prisma.payout.updateMany({ where: { id: payout.id, status: 'processing' }, data: { status: 'failed', lastError: 'Médico sem chave PIX válida' } });
    await postPayoutUnreserve(base, 'Repasse falhou (sem chave PIX) — reserva desfeita');
    await enqueueException('payout_pending_pix_key', `payout:doctor:${payout.doctorId}`, { doctorId: payout.doctorId, payoutId: payout.id });
    return { payoutId, status: 'failed', transferId: null, error: 'sem chave PIX' };
  }

  const send = opts.deps?.transferSender ?? createAsaasPixTransfer;
  try {
    const t = await send({
      pixKey, pixKeyType: doctor.payoutPixKeyType, valueBrlCents: payout.amountCents,
      externalReference: payoutExternalRef(payout.id),
      description: `Repasse consulta — ${doctor.name ?? 'médico'}`,
    });
    if (isAsaasTokenSmsIssue(null, t)) {
      // authorized:false = ação crítica aguardando TOKEN SMS. Transferência PODE
      // existir pendente no Asaas → guarda transferId p/ triagem manual; NUNCA reenvia.
      await prisma.payout.updateMany({
        where: { id: payout.id, status: 'processing' },
        data: { status: 'failed', lastError: 'Transferência exige token SMS (ação crítica Asaas)', ...(t.transferId ? { providerTransferId: t.transferId } : {}) },
      });
      await postPayoutUnreserve(base, 'Repasse exige token SMS — reserva desfeita (triagem manual)');
      await enqueueException('payout_needs_sms_token', payout.reminderId, {
        payoutId, transferId: t.transferId ?? null, doctorId: payout.doctorId,
        pixKeyMasked: maskPixKey(pixKey, doctor.payoutPixKeyType),
        amountCents: payout.amountCents,
        instruction: 'A conta Asaas exige token SMS p/ transferências (ação crítica). Verificar no dashboard Asaas se existe transferência PENDENTE (usar payoutId/transferId) antes de qualquer reenvio manual; a dispensa do token é configuração a resolver com o suporte Asaas (D6b).',
      });
      return { payoutId, status: 'failed', transferId: t.transferId, error: 'token SMS' };
    }
    if (t.status === 'DONE') {
      await prisma.payout.updateMany({
        where: { id: payout.id, status: 'processing' },
        data: { status: 'completed', completedAt: new Date(), providerTransferId: t.transferId },
      });
      await postPayoutDone(base);
      return { payoutId, status: 'completed', transferId: t.transferId };
    }
    if (t.status === 'FAILED' || t.status === 'CANCELLED' || t.status === 'BLOCKED') {
      await prisma.payout.updateMany({
        where: { id: payout.id, status: 'processing' },
        data: { status: 'failed', lastError: t.failReason ?? t.status, providerTransferId: t.transferId },
      });
      await postPayoutUnreserve(base, 'Repasse rejeitado — reserva desfeita (compensatório)');
      await enqueueException('payout_failed', payout.reminderId, { payoutId, transferId: t.transferId, failReason: t.failReason ?? t.status });
      return { payoutId, status: 'failed', transferId: t.transferId, error: t.failReason ?? t.status };
    }
    // PENDING/BANK_PROCESSING — criada, ainda não concluída → unknown até conciliar.
    await prisma.payout.updateMany({
      where: { id: payout.id, status: 'processing' },
      data: { status: 'unknown', providerTransferId: t.transferId },
    });
    await enqueueException('payout_unknown', payout.reminderId, { payoutId, externalRef: payoutExternalRef(payout.id), transferId: t.transferId });
    return { payoutId, status: 'unknown', transferId: t.transferId };
  } catch (e) {
    const err = e as Error;
    if (err instanceof AsaasApiError) {
      // 4xx do Asaas = resposta DEFINITIVA (chave inválida, saldo etc.) → failed.
      await prisma.payout.updateMany({
        where: { id: payout.id, status: 'processing' },
        data: { status: 'failed', lastError: err.message.slice(0, 300) },
      });
      await postPayoutUnreserve(base, 'Repasse falhou no provedor — reserva desfeita (compensatório)');
      const sms = isAsaasTokenSmsIssue(err);
      await enqueueException(sms ? 'payout_needs_sms_token' : 'payout_failed', payout.reminderId, {
        payoutId, doctorId: payout.doctorId, amountCents: payout.amountCents, asaasErrors: err.errors,
        ...(sms ? { instruction: 'Conta Asaas exige token SMS p/ transferência — ver dashboard antes de reenvio manual (D6b).' } : {}),
      });
      return { payoutId, status: 'failed', transferId: null, error: err.message };
    }
    // Timeout/rede SEM resposta → unknown: o dinheiro PODE ter saído. Nunca reenvia;
    // a conciliação consulta por externalReference (§18.6).
    await prisma.payout.updateMany({
      where: { id: payout.id, status: 'processing' },
      data: { status: 'unknown', lastError: `sem resposta do provedor: ${err.message.slice(0, 200)}` },
    });
    await enqueueException('payout_unknown', payout.reminderId, { payoutId, externalRef: payoutExternalRef(payout.id), reason: 'no_response' });
    return { payoutId, status: 'unknown', transferId: null, error: err.message };
  }
}

/** AUTO (§18.5): aprova todos os requested pelo MESMO caminho do admin. Só roda se
 *  o dono ligou teleconsulta.payoutAuto no admin (default OFF). */
export async function runPayoutAutoApprove(deps?: PayoutDeps): Promise<number> {
  if (!payoutAutoEnabled()) return 0;
  const pending = await prisma.payout.findMany({
    where: { status: 'requested' },
    select: { id: true },
    take: 20,
  }).catch(() => [] as { id: string }[]);
  let approved = 0;
  for (const p of pending) {
    try {
      await approvePayout(p.id, { executor: 'auto-job', deps });
      approved++;
    } catch (e) {
      console.error('[payout] auto approve falhou:', p.id, (e as Error)?.message);
    }
  }
  return approved;
}

// ── Estorno real (§18.7) ──────────────────────────────────────────────────────────

export interface RefundPassReport {
  refunded: number; // estornos executados no provedor + escriturados
  waiting: number; // REFUND_REQUESTED/IN_PROGRESS no provedor — resolve em tick futuro
  exceptionsCreated: number;
}

export interface RefundDeps {
  refundSender?: (paymentId: string) => Promise<{ status: string }>;
  statusLookup?: (paymentId: string) => Promise<string | null>;
}

/**
 * no_show/technical PAGO com reserva (onda 2): executa ESTORNO TOTAL no Asaas
 * (POST /v3/payments/{id}/refund). Idempotente: refundedAt null (condicional) +
 * status REFUNDED no provedor → só marca. Falha por SALDO → fila manual
 * (refund_needs_balance); outros erros → refund_failed com o erro.
 * Provedores sem refund (mp/openpix — D9 = teleconsulta Asaas-only) → fila manual.
 */
export async function runRefundPass(now: number, deps: RefundDeps = {}): Promise<RefundPassReport> {
  const report: RefundPassReport = { refunded: 0, waiting: 0, exceptionsCreated: 0 };
  const rows = await prisma.reminder.findMany({
    where: {
      type: 'teleconsulta',
      teleStatus: { in: ['no_show', 'technical'] },
      paidAt: { not: null },
      paymentRef: { not: null },
      consultPriceCents: { gt: 0 },
      refundedAt: null,
    },
    select: { id: true, paymentRef: true, consultPriceCents: true },
    orderBy: { paidAt: 'asc' },
    take: 50,
  }).catch((e: any) => (/column .* does not exist/i.test(String(e?.message)) ? [] : Promise.reject(e)));

  const canUseAsaas = !!deps.statusLookup || (hasAsaas() && activePixProvider() === 'asaas');

  for (const r of rows) {
    const paymentRef = r.paymentRef!;
    const finalize = async () => {
      // Condicionado em refundedAt=null → corrida job×job/job×manual não duplica.
      const n = await prisma.reminder.updateMany({
        where: { id: r.id, refundedAt: null },
        data: { refundedAt: new Date(now) },
      }).catch(() => ({ count: 0 }));
      if (n.count) {
        await postRefundExecuted(r.id).catch((e) => console.error('[payout] ledger refund falhou:', r.id, (e as Error)?.message));
        await resolveExceptions('refund_needs_balance', r.id);
        await resolveExceptions('refund_failed', r.id);
        report.refunded++;
      }
    };

    if (!canUseAsaas) {
      if (await enqueueException('refund_manual_provider', r.id, { paymentRef, provider: activePixProvider(), reason: 'teleconsulta é Asaas-only (D9); cobrança em outro provedor exige estorno manual' })) report.exceptionsCreated++;
      continue;
    }

    const status = deps.statusLookup ? await deps.statusLookup(paymentRef) : await getAsaasPaymentStatus(paymentRef);
    if (status === 'REFUNDED') { await finalize(); continue; } // já estornado no provedor — só marca
    if (status === 'REFUND_REQUESTED' || status === 'REFUND_IN_PROGRESS') { report.waiting++; continue; }

    try {
      const res = deps.refundSender ? await deps.refundSender(paymentRef) : await refundAsaasPayment(paymentRef);
      if (res.status === 'REFUNDED') { await finalize(); continue; }
      if (res.status === 'REFUND_REQUESTED' || res.status === 'REFUND_IN_PROGRESS') { report.waiting++; continue; }
      // Status inesperado (cobrança recusada etc.) → triagem.
      if (await enqueueException('refund_failed', r.id, { paymentRef, status: res.status })) report.exceptionsCreated++;
    } catch (e) {
      const err = e as Error;
      if (isAsaasBalanceIssue(err)) {
        // Sem saldo na conta: reserva operacional é do admin (§18.7) — fila manual.
        if (await enqueueException('refund_needs_balance', r.id, { paymentRef, amountCents: r.consultPriceCents, error: err.message.slice(0, 200) })) report.exceptionsCreated++;
      } else if (await enqueueException('refund_failed', r.id, { paymentRef, error: err.message.slice(0, 200) })) {
        report.exceptionsCreated++;
      }
    }
  }
  return report;
}

// ── Conciliação de payouts (§18.6/§18.8) ──────────────────────────────────────────

export interface PayoutReconReport {
  unknownChecked: number;
  resolved: number; // unknown → completed | failed
  notFoundFailed: number; // 24h sem registro no provedor → failed
  stuckAlerts: number; // requested >48h (aprovação esquecida)
  ledgerRepaired: number; // completed sem payout_done (crash entre update e postEntries)
}

export async function runPayoutReconciliation(now: number, deps: PayoutDeps = {}): Promise<PayoutReconReport> {
  const report: PayoutReconReport = { unknownChecked: 0, resolved: 0, notFoundFailed: 0, stuckAlerts: 0, ledgerRepaired: 0 };

  // 1) unknown >30min → CONSULTA por externalReference (nunca reenvia).
  const unknowns = await prisma.payout.findMany({
    where: { status: 'unknown', updatedAt: { lt: new Date(now - 30 * 60_000) } },
    take: 30,
  }).catch(() => []);
  for (const p of unknowns) {
    report.unknownChecked++;
    const lookup = await (deps.transferLookup ?? lookupAsaasTransferByExternalRef)(payoutExternalRef(p.id));
    if (lookup.error) continue; // query falhou — decide no próximo tick (fail-closed)
    if (lookup.found) {
      const settled = await settlePayoutFromLookup(p, lookup);
      if (settled === 'completed' || settled === 'failed') { report.resolved++; continue; }
      continue; // ainda PENDING/BANK_PROCESSING no provedor
    }
    // Sem registro no provedor: se >24h desde que ficou unknown → a transferência
    // NUNCA chegou ao Asaas → failed + desreserva (fecha o ciclo, sem reenvio auto).
    if (now - p.updatedAt.getTime() > 24 * MS_HOUR) {
      await prisma.payout.updateMany({
        where: { id: p.id, status: 'unknown' },
        data: { status: 'failed', lastError: 'sem registro no provedor após 24h' },
      });
      await postPayoutUnreserve(p, 'Repasse desconhecido sem registro no provedor (24h) — reserva desfeita');
      await resolveExceptions('payout_unknown', p.reminderId);
      await enqueueException('payout_failed', p.reminderId, { payoutId: p.id, reason: 'unknown_sem_registro_24h' });
      report.notFoundFailed++;
    }
  }

  // 2) requested >48h = aprovação esquecida → alerta (não é erro do fluxo).
  const stuck = await prisma.payout.findMany({
    where: { status: 'requested', requestedAt: { lt: new Date(now - 48 * MS_HOUR) } },
    select: { reminderId: true },
    take: 20,
  }).catch(() => []);
  for (const p of stuck) {
    if (await enqueueException('payout_stuck_requested', p.reminderId, { reason: 'aguardando aprovação >48h' })) report.stuckAlerts++;
  }

  // 3) completed sem payout_done no ledger (crash entre update e postEntries) →
  //    repõe (postEntries idempotente por txnId). Também failed sem desreserva.
  const finals = await prisma.payout.findMany({
    where: { status: { in: ['completed', 'failed'] } },
    select: { id: true, reminderId: true, doctorId: true, amountCents: true, status: true },
    take: 200,
  }).catch(() => []);
  for (const p of finals) {
    const hasTxn = (txnId: string) =>
      prisma.ledgerEntry.findFirst({ where: { txnId }, select: { id: true } }).catch(() => null);
    if (p.status === 'completed' && !(await hasTxn(payoutDoneTxnId(p.id)))) {
      await postPayoutDone(p); report.ledgerRepaired++;
    }
    if (p.status === 'failed' && !(await hasTxn(payoutUnreserveTxnId(p.id)))) {
      await postPayoutUnreserve(p, 'Reparo de conciliação — desreserva de repasse falho'); report.ledgerRepaired++;
    }
  }
  return report;
}

// ── Caixa Asaas (§18.8) — cache 5min ──────────────────────────────────────────────

let balanceCache: { cents: number; at: number } | null = null;
const BALANCE_TTL_MS = 5 * 60_000;

/** Saldo disponível Asaas com cache de 5 min (overview admin — endpoint oficial
 *  GET /v3/finance/balance). Nunca apresenta como receita: caption fica na UI. */
export async function getAsaasBalanceCached(now: number): Promise<number | null> {
  if (!hasAsaas()) return null;
  if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) return balanceCache.cents;
  try {
    const b = await getAsaasFinanceBalance();
    balanceCache = { cents: b.balanceCents, at: now };
    return b.balanceCents;
  } catch {
    return null; // falha → UI mostra "—" (nunca R$ 0,00 falso)
  }
}
