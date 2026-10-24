// §18.3 — LEDGER DE PARTIDAS DUPLAS (Onda 2, fundação financeira).
// Arquitetura A: docs/design/2026-10-24-finance-architecture.md §3-4.
//
// INVARIANTES (testados em test/finance-ledger.test.ts):
//  1. Cada txnId balanceado: ΣdebitCents = ΣcreditCents (validado ANTES de escrever).
//  2. Lançamento IMUTÁVEL: este módulo só faz INSERT — correção = compensatório
//     (postRefundExecuted), NUNCA update/delete de LedgerEntry.
//  3. Idempotência por evento: txnId determinístico `${evento}_${reminderId}`;
//     re-postar o mesmo evento = no-op (checagem prévia por txnId).
//  4. REGRA DE OURO: o total pago pelo paciente NUNCA entra em platform_revenue —
//     no pagamento o crédito vai p/ patient_received com contrapartida held_unrealized;
//     platform_revenue só recebe a fatia da plataforma na conclusão do atendimento.
//  5. Centavos INTEIROS em toda parte (nunca float).
//
// Fluxo de contas (direção da arquitetura decidida):
//  Pagamento confirmado ..... D patient_received / C held_unrealized
//  Atendimento concluído .... D held_unrealized / C doctor_payable + C platform_revenue (+ C provider_fees)
//  No-show/technical pago ... D held_unrealized / C reserve (reserva p/ estorno)
//  Estorno executado ........ D reserve (ou held) / C refund — compensatório, nada é apagado
//  (Repasse onda 4 .......... D doctor_payable / C payout_processing → payout_done)
import { prisma } from '../prisma';
import { coerceSnapshot, resolveCommissionRule, computeReleaseEligibleAt, type CommissionSnapshot } from './rules';

// Contas do ledger — enum-like String (drift-safe, sem Prisma enum p/ evitar enum drift).
export const LEDGER_ACCOUNTS = [
  'patient_received', // total recebido de pacientes (crédito = GMV; NÃO é receita da plataforma)
  'held_unrealized', // pagos, consulta não realizada (retenção por evento — arquitectura A)
  'doctor_payable', // obrigação c/ médico (crédito = a repassar; doctorEarnings = credit − debit)
  'platform_revenue', // receita da plataforma (SÓ a fatia da comissão — regra de ouro)
  'provider_fees', // taxas do provedor de pagamento (estimativa real só na onda 4)
  'payout_processing', // em processamento de repasse (onda 4)
  'payout_done', // repassado (onda 4)
  'refund', // devolvido/devolvendo ao paciente
  'reserve', // valor reservado p/ estorno
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export interface LedgerLine {
  account: LedgerAccount;
  debitCents?: number;
  creditCents?: number;
  refType?: string;
  refId?: string | null;
}

export interface LedgerTxn {
  txnId: string; // determinístico por evento → idempotência
  reminderId?: string | null;
  doctorId?: string | null;
  memo?: string;
  ruleSnapshot?: unknown;
  entries: LedgerLine[];
}

export class LedgerUnbalancedError extends Error {
  constructor(txnId: string, debit: number, credit: number) {
    super(`Ledger desbalanceado (txn ${txnId}): débito ${debit} ≠ crédito ${credit}`);
    this.name = 'LedgerUnbalancedError';
  }
}

/** Cliente de transação Prisma (estrutural — mesmo padrão `db: any` do repo). */
type DbClient = Pick<typeof prisma, 'ledgerEntry'>;

const CENTS_RE = /^(0|[1-9][0-9]*)$/;

/** Validação PURA (antes de qualquer escrita): centavos inteiros ≥ 0 e Σdebit = Σcredit
 *  POR txnId. Throw = nada foi gravado. */
export function assertBalanced(txns: LedgerTxn[]): void {
  for (const t of txns) {
    if (!t.txnId) throw new Error('Ledger: txnId obrigatório.');
    let debit = 0;
    let credit = 0;
    if (!t.entries?.length) throw new Error(`Ledger: txn ${t.txnId} sem partidas.`);
    for (const e of t.entries) {
      if (!LEDGER_ACCOUNTS.includes(e.account)) {
        throw new Error(`Ledger: conta desconhecida "${e.account}" (txn ${t.txnId}).`);
      }
      const d = e.debitCents ?? 0;
      const c = e.creditCents ?? 0;
      if (!CENTS_RE.test(String(d)) || !CENTS_RE.test(String(c))) {
        throw new Error(`Ledger: centavos devem ser inteiros ≥ 0 (txn ${t.txnId}, ${e.account}).`);
      }
      debit += d;
      credit += c;
    }
    if (debit !== credit) throw new LedgerUnbalancedError(t.txnId, debit, credit);
  }
}

export interface PostResult {
  txnId: string;
  posted: boolean; // false = já existia (idempotente)
  entries: number;
}

/** Posta transações (INSERT-only). Valida balanceamento ANTES; pula txnId já existente
 *  (idempotência por evento). `db` injetável p/ transação externa (atomicidade com o
 *  evento de origem). Sem `db` → $transaction própria. */
export async function postEntries(txns: LedgerTxn[], db?: DbClient): Promise<PostResult[]> {
  assertBalanced(txns);
  const run = async (client: DbClient): Promise<PostResult[]> => {
    const out: PostResult[] = [];
    for (const t of txns) {
      const existing = await client.ledgerEntry.findFirst({ where: { txnId: t.txnId }, select: { id: true } });
      if (existing) { out.push({ txnId: t.txnId, posted: false, entries: 0 }); continue; }
      await client.ledgerEntry.createMany({
        data: t.entries.map((e) => ({
          txnId: t.txnId,
          reminderId: t.reminderId ?? null,
          doctorId: t.doctorId ?? null,
          account: e.account,
          debitCents: e.debitCents ?? 0,
          creditCents: e.creditCents ?? 0,
          refType: e.refType ?? null,
          refId: e.refId ?? null,
          ruleSnapshot: (t.ruleSnapshot ?? undefined) as any,
          memo: t.memo ?? null,
        })),
      });
      out.push({ txnId: t.txnId, posted: true, entries: t.entries.length });
    }
    return out;
  };
  return db ? run(db) : prisma.$transaction(run);
}

// ── Saldos derivados (saldo SEMPRE = soma de lançamentos — nunca estado separado) ──

export interface AccountBalance {
  debitCents: number;
  creditCents: number;
  /** Convenção crédito-normal: >0 = obrigação/valor retido; contas "de saída"
   *  (refund, payout_done) acumulam DÉBITO → netCents negativo. */
  netCents: number;
}

export async function accountBalance(
  account: LedgerAccount,
  range: { from?: Date; to?: Date } = {},
): Promise<AccountBalance> {
  const agg = await prisma.ledgerEntry.aggregate({
    where: { account, ...(range.from || range.to ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) },
    _sum: { debitCents: true, creditCents: true },
  });
  const debitCents = agg._sum.debitCents ?? 0;
  const creditCents = agg._sum.creditCents ?? 0;
  return { debitCents, creditCents, netCents: creditCents - debitCents };
}

/** Obrigação acumulada do médico (a repassar): credit − debit em doctor_payable. */
export async function doctorEarnings(
  doctorId: string,
  range: { from?: Date; to?: Date } = {},
): Promise<number> {
  const agg = await prisma.ledgerEntry.aggregate({
    where: { account: 'doctor_payable', doctorId, ...(range.from || range.to ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) },
    _sum: { debitCents: true, creditCents: true },
  });
  return (agg._sum.creditCents ?? 0) - (agg._sum.debitCents ?? 0);
}

// ── Cálculo puro do split na conclusão (unit-testável, sem IO) ─────────────────────

export interface CompletionSplit {
  doctorCents: number; // honorários líquidos do médico
  platformCents: number; // receita LÍQUIDA da plataforma (após taxa se platform-bearer)
  feeCents: number; // taxa do provedor reconhecida em provider_fees
  platformGrossCents: number; // comissão bruta (antes de rateio de taxa)
}

/** Split D pureza: comissão = round(total × bps / 10_000); taxa do provedor rateada
 *  conforme feeBearer da regra congelada. `providerFeeCents` default 0 (estimativa
 *  real chega na onda 4 — Asaas transfer/cobrança). Médico nunca negativo. */
export function computeCompletionSplit(
  totalCents: number,
  snapshot: CommissionSnapshot,
  providerFeeCents = 0,
): CompletionSplit {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('totalCents deve ser inteiro > 0.');
  const platformGrossCents = Math.round((totalCents * snapshot.platformBps) / 10_000);
  const feeCents = Math.max(0, Math.min(Math.trunc(providerFeeCents) || 0, totalCents));
  if (snapshot.feeBearer === 'doctor') {
    const doctorCents = totalCents - platformGrossCents - feeCents;
    if (doctorCents < 0) throw new Error(`Regra inviável: comissão ${platformGrossCents} + taxa ${feeCents} > total ${totalCents}.`);
    return { doctorCents, platformCents: platformGrossCents, feeCents, platformGrossCents };
  }
  // feeBearer = platform: plataforma absorve a taxa na PRÓPRIA receita
  const platformCents = platformGrossCents - feeCents;
  return { doctorCents: totalCents - platformGrossCents, platformCents, feeCents, platformGrossCents };
}

// ── Eventos de negócio (uma função por evento do §18; txnId determinístico) ────────

// txnIds — determinísticos: postar 2× o mesmo evento NUNCA duplica (matriz §18.10).
// occ = chave da OCORRÊNCIA (recorrência rola a mesma row): cada pagamento tem
// paymentRef/paidAt próprios → a 2ª consulta recorrente POSTA no ledger com id
// distinto. Sem occ mantém o id antigo — linhas já postadas nunca mudam de identidade.
export const paymentTxnId = (reminderId: string, occ = '') => `payment_${reminderId}${occ ? '_' + occ : ''}`;
export const completionTxnId = (reminderId: string, occ = '') => `completion_${reminderId}${occ ? '_' + occ : ''}`;
export const refundReserveTxnId = (reminderId: string, occ = '') => `refund_reserve_${reminderId}${occ ? '_' + occ : ''}`;
export const refundTxnId = (reminderId: string, occ = '') => `refund_${reminderId}${occ ? '_' + occ : ''}`;
const occurrenceKey = (r: { paymentRef?: string | null; paidAt?: Date | string | null }): string =>
  r.paymentRef || (r.paidAt ? String(new Date(r.paidAt).getTime()) : '');

/** Colunas de leitura do Reminder p/ o ledger (+ drift: legado sem as colunas novas). */
const REMINDER_FINANCE_SELECT = {
  id: true, consultPriceCents: true, paidAt: true, paymentRef: true,
  createdByDoctorId: true, teleStatus: true, endedAt: true,
} as const;
const REMINDER_FINANCE_SELECT_LEGACY = {
  id: true, consultPriceCents: true, paidAt: true, paymentRef: true, createdByDoctorId: true,
} as const;

type ReminderFinanceRow = {
  id: string; consultPriceCents: number | null; paidAt: Date | null; paymentRef: string | null;
  createdByDoctorId: string | null; teleStatus?: string | null; endedAt?: Date | null;
  commissionSnapshot?: unknown; releaseEligibleAt?: Date | null;
};

async function loadFinanceReminder(reminderId: string): Promise<ReminderFinanceRow | null> {
  return prisma.reminder.findUnique({
    where: { id: reminderId },
    select: { ...REMINDER_FINANCE_SELECT, commissionSnapshot: true, releaseEligibleAt: true },
  }).catch((e: any) =>
    // Drift-safe (padrão do repo): coluna nova ausente → releitura sem ela.
    /column .* does not exist/i.test(String(e?.message))
      ? prisma.reminder.findUnique({ where: { id: reminderId }, select: REMINDER_FINANCE_SELECT_LEGACY as any }) as Promise<ReminderFinanceRow | null>
      : Promise.reject(e),
  );
}

/** Snapshot efetiva do reminder — usa a CONGELADA no agendamento; se faltar (legado),
 *  resolve e persiste a vigente (específica > geral > default §18.2). Também grava
 *  releaseEligibleAt (paidAt + D+N) quando ainda não houver. Best-effort no UPDATE
 *  (drift), mas sempre devolve a snapshot usada. */
async function ensureSnapshot(r: ReminderFinanceRow): Promise<CommissionSnapshot> {
  const hasSnap = r.commissionSnapshot != null;
  const snap = hasSnap ? coerceSnapshot(r.commissionSnapshot) : await resolveCommissionRule(r.createdByDoctorId);
  if (!r.paidAt) return snap; // elegibilidade depende do pagamento — nada a gravar antes
  const needsRelease = r.releaseEligibleAt == null;
  if (hasSnap && !needsRelease) return snap;
  const data: Record<string, unknown> = {};
  if (!hasSnap) data.commissionSnapshot = snap;
  if (needsRelease) data.releaseEligibleAt = computeReleaseEligibleAt(r.paidAt, snap);
  try {
    await prisma.reminder.updateMany({ where: { id: r.id }, data: data as any });
  } catch (e: any) {
    if (!/column .* does not exist/i.test(String(e?.message))) {
      console.error('[finance] congelar snapshot falhou:', r.id, e?.message);
    }
  }
  return snap;
}

/**
 * PAGAMENTO CONFIRMADO (hook do webhook/billingApproval + conciliação):
 *   D patient_received total / C held_unrealized total.
 * Regra de ouro: NADA vai p/ platform_revenue aqui. Também congela
 * commissionSnapshot (se faltar) e calcula releaseEligibleAt (paidAt + D+N).
 * Idempotente (txnId payment_<id>); no-op se não pago/sem preço.
 */
export async function recordTeleconsultaPayment(reminderId: string): Promise<PostResult> {
  const r = await loadFinanceReminder(reminderId);
  if (!r || !r.paidAt || !(r.consultPriceCents! > 0)) return { txnId: paymentTxnId(reminderId), posted: false, entries: 0 };
  const snap = await ensureSnapshot(r);
  return (
    await postEntries(
      [{
        txnId: paymentTxnId(reminderId, occurrenceKey(r)),
        reminderId: r.id,
        doctorId: r.createdByDoctorId,
        memo: 'Pagamento confirmado (consulta particular)',
        ruleSnapshot: snap,
        entries: [
          { account: 'patient_received', debitCents: r.consultPriceCents!, refType: 'payment', refId: r.paymentRef },
          { account: 'held_unrealized', creditCents: r.consultPriceCents!, refType: 'reminder', refId: r.id },
        ],
      }],
    )
  )[0];
}

/**
 * ATENDIMENTO CONCLUÍDO ELEGÍVEL (teleStatus=completed — o /end só completa com
 * paciente presente E jointMs ≥ mínimo, então elegível aqui = teleStatus):
 *   D held_unrealized total / C doctor_payable honorários + C platform_revenue comissão
 *   (+ C provider_fees quando houver taxa estimada — onda 4; feeBearer da snapshot
 *   decide quem absorve: ver computeCompletionSplit).
 * Usa a snapshot CONGELADA — mudança de regra NUNCA recalcula consulta antiga.
 */
export async function recordTeleconsultaCompletion(reminderId: string, opts: { providerFeeCents?: number } = {}): Promise<PostResult> {
  const r = await loadFinanceReminder(reminderId);
  if (!r || !r.paidAt || !(r.consultPriceCents! > 0)) return { txnId: completionTxnId(reminderId), posted: false, entries: 0 };
  if (r.teleStatus !== 'completed') return { txnId: completionTxnId(reminderId), posted: false, entries: 0 };
  const snap = await ensureSnapshot(r);
  const split = computeCompletionSplit(r.consultPriceCents!, snap, opts.providerFeeCents ?? 0);
  return (
    await postEntries(
      [{
        txnId: completionTxnId(reminderId, occurrenceKey(r)),
        reminderId: r.id,
        doctorId: r.createdByDoctorId,
        memo: 'Atendimento concluído — honorários + comissão',
        ruleSnapshot: { ...snap, ...split },
        entries: [
          { account: 'held_unrealized', debitCents: r.consultPriceCents!, refType: 'reminder', refId: r.id },
          { account: 'doctor_payable', creditCents: split.doctorCents, refType: 'reminder', refId: r.id },
          { account: 'platform_revenue', creditCents: split.platformCents, refType: 'reminder', refId: r.id },
          ...(split.feeCents > 0 ? [{ account: 'provider_fees' as LedgerAccount, creditCents: split.feeCents, refType: 'reminder', refId: r.id }] : []),
        ],
      }],
    )
  )[0];
}

/**
 * NO_SHOW/TECHNICAL PAGO: valor sai da retenção e fica RESERVADO p/ estorno
 * (a execução do refund no provedor é onda 4):
 *   D held_unrealized total / C reserve total.
 */
export async function recordTeleconsultaRefundReserve(reminderId: string): Promise<PostResult> {
  const r = await loadFinanceReminder(reminderId);
  if (!r || !r.paidAt || !(r.consultPriceCents! > 0)) return { txnId: refundReserveTxnId(reminderId), posted: false, entries: 0 };
  if (r.teleStatus !== 'no_show' && r.teleStatus !== 'technical') return { txnId: refundReserveTxnId(reminderId), posted: false, entries: 0 };
  const snap = await ensureSnapshot(r);
  return (
    await postEntries(
      [{
        txnId: refundReserveTxnId(reminderId, occurrenceKey(r)),
        reminderId: r.id,
        doctorId: r.createdByDoctorId,
        memo: `Atendimento não realizado (${r.teleStatus}) — valor reservado p/ estorno`,
        ruleSnapshot: snap,
        entries: [
          { account: 'held_unrealized', debitCents: r.consultPriceCents!, refType: 'reminder', refId: r.id },
          { account: 'reserve', creditCents: r.consultPriceCents!, refType: 'reminder', refId: r.id },
        ],
      }],
    )
  )[0];
}

/**
 * ESTORNO REGISTRADO (compensatório — NUNCA apaga lançamento): devolve o valor ao
 * paciente no ledger. Consome a reserva se houver; sem reserva, contrapartida é a
 * própria retenção (estorno direto):
 *   com reserva .... D reserve total / C refund total
 *   sem reserva .... D held_unrealized total / C refund total
 * A execução no provedor (Asaas refund) é onda 4 — aqui só a escrituração.
 */
export async function postRefundExecuted(reminderId: string, refundCents?: number): Promise<PostResult> {
  const r = await loadFinanceReminder(reminderId);
  if (!r || !r.paidAt || !(r.consultPriceCents! > 0)) return { txnId: refundTxnId(reminderId), posted: false, entries: 0 };
  const cents = Math.trunc(refundCents ?? r.consultPriceCents!);
  if (!(cents > 0) || cents > (r.consultPriceCents ?? 0)) throw new Error(`Estorno inválido: ${cents} (total ${r.consultPriceCents}).`);
  // Há reserva p/ este reminder? (no_show/technical já reservado)
  const reserved = await prisma.ledgerEntry.aggregate({
    where: { reminderId: r.id, account: 'reserve' },
    _sum: { creditCents: true, debitCents: true },
  });
  const reserveNet = (reserved._sum.creditCents ?? 0) - (reserved._sum.debitCents ?? 0);
  const contra: LedgerAccount = reserveNet >= cents ? 'reserve' : 'held_unrealized';
  const snap = await ensureSnapshot(r);
  return (
    await postEntries(
      [{
        txnId: refundTxnId(reminderId, occurrenceKey(r)),
        reminderId: r.id,
        doctorId: r.createdByDoctorId,
        memo: 'Estorno registrado (compensatório)',
        ruleSnapshot: snap,
        entries: [
          { account: contra, debitCents: cents, refType: 'reminder', refId: r.id },
          { account: 'refund', creditCents: cents, refType: 'reminder', refId: r.id },
        ],
      }],
    )
  )[0];
}

/** Despacho por outcome do /end (completed → split; no_show/technical pago → reserva). */
export async function recordTeleconsultaEnded(reminderId: string, teleStatus: string | null | undefined): Promise<PostResult | null> {
  if (teleStatus === 'completed') return recordTeleconsultaCompletion(reminderId);
  if (teleStatus === 'no_show' || teleStatus === 'technical') return recordTeleconsultaRefundReserve(reminderId);
  return null;
}
