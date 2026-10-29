// MATRIZ §18.10 — ONDA 4: repasses supervisionados + estornos (docs/design/
// 2026-10-24-finance-architecture.md §6 onda 4 + spec §18.5-18.7). MOCK COMPLETO do
// Asaas (deps injetáveis / fetch stubado) — ZERO chamada real, zero dinheiro real:
//  · reserva atômica: 2 jobs concorrentes → 1 payout, 1 reserva no ledger
//  · approve → transfer DONE → completed + ledger balanceado (payout_done)
//  · FAILED → desreserva (compensatório) + exceção
//  · timeout → unknown → conciliação resolve p/ completed SEM reenviar
//  · provider sem registro >24h → failed + desreserva
//  · estorno: REFUNDED no provedor → marca + ledger; já-estornado → só marca;
//    sem saldo → fila manual; job idempotente (refundedAt condicional)
//  · below-min acumula (exceção ÚNICA com total; resolve ao atingir piso)
//  · médico sem PIX → payout_pending_pix_key; approve sem reserva → recusa
//  · médico não verificado/bloqueado (KYC) → payout_doctor_unverified, sem payout; a exceção
//    fecha sozinha quando ele volta a poder atender (prazo legacy vale no relógio do pass)
//  · KYC também na APROVAÇÃO: payout já requested de médico bloqueado/sem verificação →
//    approve recusa (DOCTOR_CANNOT_PRACTICE; rota 409) e o auto pula — segue requested p/ humano
//  · SMS-token → failed + payout_needs_sms_token (nunca reenvia)
//  · auto: default OFF; ligado → job aprova pelo MESMO caminho
//  · caixa Asaas: cache 5min (1 fetch em 2 leituras; expira → refetch)
//  · admin: GET /payouts mascara PIX; POST approve (fetch stubado) + audit
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(() => undefined),
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader, mintToken } from './helpers';
import { loadSettings, saveSettings } from '../src/utils/settings';
import { encryptPII } from '../src/utils/crypto';
import { recordTeleconsultaPayment, recordTeleconsultaCompletion, recordTeleconsultaRefundReserve } from '../src/finance/ledger';
import {
  runPayoutPass, approvePayout, runRefundPass, runPayoutReconciliation, getAsaasBalanceCached,
  payoutReserveTxnId, payoutDoneTxnId, payoutUnreserveTxnId,
} from '../src/finance/payout';
import { AsaasApiError } from '../src/payments/asaas-provider';

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
const MIN = 60_000;
const HOUR = 3_600_000;

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-pay-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Pay', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { token: mintToken(u.id) };
}

/** Médico com chave PIX válida (criptografada igual ao fluxo real de /finance/payout-details). */
async function seedDoctor(withPix = true) {
  const crm = `${90000 + Math.floor(Math.random() * 9000)}-SP`;
  const { doctor } = await createDoctor({ crm });
  if (!withPix) return doctor;
  const enc = encryptPII('12345678901')!;
  return prisma.doctor.update({
    where: { id: doctor.id },
    data: { payoutPixKeyEnc: enc.enc, payoutPixKeyIv: enc.iv, payoutPixKeyType: 'cpf' },
  });
}

interface SeedOpts {
  priceCents?: number;
  teleStatus?: string;
  minPayoutCents?: number;
  releaseHoursAgo?: number;
}

/** Teleconsulta paga+concluída COM ledger postado (payment + completion) e
 *  releaseEligibleAt vencido — a entrada do funil de repasse. */
async function seedEligible(doctorId: string, opts: SeedOpts = {}) {
  const price = opts.priceCents ?? 25000;
  const { user, patient } = await createUser();
  const paidAt = new Date(Date.now() - 5 * 24 * HOUR);
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Tele elegível', type: 'teleconsulta',
      dueDate: new Date(Date.now() - 4 * 24 * HOUR), teleStatus: opts.teleStatus ?? 'completed',
      done: true, endedAt: new Date(Date.now() - 4 * 24 * HOUR),
      paidAt, paymentRef: 'pay_seed1', consultPriceCents: price, createdByDoctorId: doctorId,
      commissionSnapshot: { ruleId: null, platformBps: 2000, feeBearer: 'platform', releaseDelayDays: 3, minPayoutCents: opts.minPayoutCents ?? 2000 },
      releaseEligibleAt: new Date(Date.now() - (opts.releaseHoursAgo ?? 3) * HOUR),
    } as any,
    select: { id: true },
  });
  await recordTeleconsultaPayment(r.id);
  await recordTeleconsultaCompletion(r.id);
  return r;
}

/** no_show/technical pago com reserva de estorno postada (estado que a onda 2 deixa). */
async function seedRefundable(doctorId: string, status: 'no_show' | 'technical' = 'no_show') {
  const { user, patient } = await createUser();
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Tele falhou', type: 'teleconsulta',
      dueDate: new Date(Date.now() - 2 * HOUR), teleStatus: status,
      done: true, endedAt: new Date(Date.now() - 1 * HOUR),
      paidAt: new Date(Date.now() - 3 * HOUR), paymentRef: 'pay_refund1', consultPriceCents: 15000,
      createdByDoctorId: doctorId,
    } as any,
    select: { id: true },
  });
  await recordTeleconsultaPayment(r.id);
  await recordTeleconsultaRefundReserve(r.id);
  return r;
}

/** Invariante global do ledger: Σdebit = Σcredit em TODAS as partidas. */
async function ledgerGloballyBalanced() {
  const agg = await prisma.ledgerEntry.aggregate({ _sum: { debitCents: true, creditCents: true } });
  return (agg._sum.debitCents ?? 0) === (agg._sum.creditCents ?? 0);
}

const netOf = async (account: string, reminderId?: string) => {
  const agg = await prisma.ledgerEntry.aggregate({
    where: { account, ...(reminderId ? { reminderId } : {}) },
    _sum: { debitCents: true, creditCents: true },
  });
  return (agg._sum.creditCents ?? 0) - (agg._sum.debitCents ?? 0);
};

const txnCount = (txnId: string) => prisma.ledgerEntry.count({ where: { txnId } });
const openExceptions = (kind: string, key: string | null) =>
  prisma.exceptionQueue.count({ where: { kind, ...(key ? { reminderId: key } : {}), status: 'open' } });

const doneSender = (transferId = 'trf_ok'): any => async () =>
  ({ transferId, status: 'DONE', authorized: true, failReason: null });

// ───────────────────── Payout pass: criação + reserva atômica ─────────────────────

describe('runPayoutPass — reserva atômica (§18.6)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); }, 30_000);

  it('elegível + PIX + piso OK → cria requested com reserva no ledger (idempotente em 2 passes)', async () => {
    const doc = await seedDoctor();
    const r = await seedEligible(doc.id); // 25k → 20k honorários ≥ piso 20
    const now = Date.now();

    const p1 = await runPayoutPass(now);
    const p2 = await runPayoutPass(now + 5 * MIN);
    expect(p1.created).toBe(1);
    expect(p2.created).toBe(0); // já existe — unique reminderId
    const payouts = await prisma.payout.findMany();
    expect(payouts).toHaveLength(1);
    expect(payouts[0].status).toBe('requested');
    expect(payouts[0].amountCents).toBe(20000); // 80% de 25k (snapshot congelada)
    expect(payouts[0].doctorId).toBe(doc.id);
    expect(await txnCount(payoutReserveTxnId(r.id))).toBe(2); // D+C — uma única vez
    // Reserva tirou a obrigação do saldo disponível do médico:
    expect(await netOf('doctor_payable', r.id)).toBe(0);
    expect(await netOf('payout_processing', r.id)).toBe(20000);
    expect(await ledgerGloballyBalanced()).toBe(true);
  });

  it('2 passes CONCORRENTES → exatamente 1 payout (unique + P2002 engolido)', async () => {
    const doc = await seedDoctor();
    await seedEligible(doc.id);
    await Promise.all([runPayoutPass(Date.now()), runPayoutPass(Date.now())]);
    expect(await prisma.payout.count()).toBe(1);
    expect(await ledgerGloballyBalanced()).toBe(true);
  });

  it('abaixo do piso ACUMULA: exceção ÚNICA com total; ao atingir o piso cria e resolve', async () => {
    const doc = await seedDoctor();
    const a = await seedEligible(doc.id, { priceCents: 10000, minPayoutCents: 15000 }); // 8k < 15k
    const now = Date.now();

    const p1 = await runPayoutPass(now);
    expect(p1.created).toBe(0);
    expect(p1.skippedBelowMin).toBe(1);
    expect(await openExceptions('payout_below_min', `payout:belowmin:${doc.id}`)).toBe(1);
    const exc = await prisma.exceptionQueue.findFirstOrThrow({ where: { kind: 'payout_below_min' } });
    expect((exc.payload as any).totalCents).toBe(8000);

    await runPayoutPass(now + 5 * MIN); // re-tick: NÃO duplica a exceção
    expect(await openExceptions('payout_below_min', `payout:belowmin:${doc.id}`)).toBe(1);

    const b = await seedEligible(doc.id, { priceCents: 10000, minPayoutCents: 15000 }); // +8k = 16k ≥ 15k
    const p3 = await runPayoutPass(now + 10 * MIN);
    expect(p3.created).toBe(2); // ambos saem no mesmo lote
    expect(await openExceptions('payout_below_min', `payout:belowmin:${doc.id}`)).toBe(0); // resolvida
    expect(await txnCount(payoutReserveTxnId(b.id))).toBe(2);
    expect(await ledgerGloballyBalanced()).toBe(true);
    void a;
  });

  it('médico sem PIX → NÃO cria payout; exceção payout_pending_pix_key (1 por médico)', async () => {
    const doc = await seedDoctor(false);
    await seedEligible(doc.id);
    const p = await runPayoutPass(Date.now());
    expect(p.created).toBe(0);
    expect(p.exceptionsCreated).toBe(1);
    expect(await openExceptions('payout_pending_pix_key', `payout:doctor:${doc.id}`)).toBe(1);
    expect(await prisma.payout.count()).toBe(0);
  });

  it('médico não verificado (KYC) → NÃO cria payout; exceção payout_doctor_unverified', async () => {
    const doc = await seedDoctor();
    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'pending' } });
    await seedEligible(doc.id);
    const p = await runPayoutPass(Date.now());
    expect(p.created).toBe(0);
    expect(p.exceptionsCreated).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${doc.id}`)).toBe(1);
    expect(await prisma.payout.count()).toBe(0);
  });

  it('médico BLOQUEADO (mesmo approved) → NÃO cria payout; exceção payout_doctor_unverified', async () => {
    const doc = await seedDoctor();
    await prisma.doctor.update({ where: { id: doc.id }, data: { blocked: true } });
    await seedEligible(doc.id);
    const p = await runPayoutPass(Date.now());
    expect(p.created).toBe(0);
    expect(p.exceptionsCreated).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${doc.id}`)).toBe(1);
    expect(await prisma.payout.count()).toBe(0);
  });

  it('voltou a poder atender → o próximo pass FECHA payout_doctor_unverified e paga normalmente', async () => {
    const doc = await seedDoctor();
    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'pending' } });
    const r = await seedEligible(doc.id);
    const key = `payout:doctor:${doc.id}`;
    const now = Date.now();

    expect((await runPayoutPass(now)).created).toBe(0);
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(1);
    await runPayoutPass(now + 5 * MIN); // re-tick ainda pendente: NÃO duplica
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(1);

    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'approved' } });
    const p3 = await runPayoutPass(now + 10 * MIN);
    expect(p3.created).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(0); // resolvida
    expect(await txnCount(payoutReserveTxnId(r.id))).toBe(2);
    expect(await ledgerGloballyBalanced()).toBe(true);
  });

  it('verificado mas SEM PIX → a retenção KYC fecha e resta só payout_pending_pix_key (KYC vem antes do PIX)', async () => {
    const doc = await seedDoctor(false);
    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'pending' } });
    await seedEligible(doc.id);
    const key = `payout:doctor:${doc.id}`;
    const now = Date.now();

    await runPayoutPass(now);
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(1);
    expect(await openExceptions('payout_pending_pix_key', key)).toBe(0); // o gate KYC corta antes da checagem de PIX

    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'approved' } });
    await runPayoutPass(now + 5 * MIN);
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(0); // já pode atender → KYC fechado
    expect(await openExceptions('payout_pending_pix_key', key)).toBe(1); // resta a pendência de PIX
    expect(await prisma.payout.count()).toBe(0);
  });

  it('legacy: o prazo vale no relógio DO PASS (now), não no da máquina', async () => {
    const doc = await seedDoctor();
    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'legacy' } });
    await seedEligible(doc.id);
    const key = `payout:doctor:${doc.id}`;
    const deadline = Date.now() + 60 * MIN; // p/ o relógio real o prazo ainda NÃO venceu
    await saveSettings('doctorKyc', { legacyGraceUntilMs: deadline });

    const late = await runPayoutPass(deadline + MIN); // relógio do pass: prazo vencido → retido
    expect(late.created).toBe(0);
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(1);

    const early = await runPayoutPass(deadline - 30 * MIN); // dentro do prazo → paga e fecha a retenção
    expect(early.created).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', key)).toBe(0);
  });

  it('releaseEligibleAt futuro → ainda NÃO elegível (retenção D+N da snapshot)', async () => {
    const doc = await seedDoctor();
    await seedEligible(doc.id, { releaseHoursAgo: -48 }); // vence em 48h
    expect((await runPayoutPass(Date.now())).created).toBe(0);
  });
});

// ───────────────────── Approve: máquina de estados (§18.5/§18.6) ─────────────────

describe('approvePayout — envio supervisionado', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); }, 30_000);

  async function seedRequested() {
    const doc = await seedDoctor();
    const r = await seedEligible(doc.id);
    await runPayoutPass(Date.now());
    const payout = await prisma.payout.findFirstOrThrow();
    return { doc, r, payout };
  }

  it('transfer DONE → completed + payout_done no ledger (saldo balanceado)', async () => {
    const { r, payout } = await seedRequested();
    const out = await approvePayout(payout.id, { deps: { transferSender: doneSender('trf_1') } });
    expect(out.status).toBe('completed');
    const after = await prisma.payout.findFirstOrThrow();
    expect(after.status).toBe('completed');
    expect(after.providerTransferId).toBe('trf_1');
    expect(after.completedAt).not.toBeNull();
    expect(await txnCount(payoutDoneTxnId(payout.id))).toBe(2);
    expect(await netOf('payout_processing', r.id)).toBe(0); // reserva liberada
    expect(await netOf('payout_done', r.id)).toBe(20000);
    expect(await ledgerGloballyBalanced()).toBe(true);
  });

  it('transfer FAILED → failed + desreserva COMPENSATÓRIA (obrigação volta ao médico) + exceção', async () => {
    const { r, payout } = await seedRequested();
    const out = await approvePayout(payout.id, {
      deps: { transferSender: async () => ({ transferId: 'trf_bad', status: 'FAILED', authorized: true, failReason: 'insufficient_balance' }) },
    });
    expect(out.status).toBe('failed');
    expect(await txnCount(payoutUnreserveTxnId(payout.id))).toBe(2);
    expect(await netOf('doctor_payable', r.id)).toBe(20000); // obrigação restaurada
    expect(await netOf('payout_processing', r.id)).toBe(0);
    expect(await openExceptions('payout_failed', r.id)).toBe(1);
    expect(await ledgerGloballyBalanced()).toBe(true);
    // failed não re-aprova:
    await expect(approvePayout(payout.id)).rejects.toThrow(/não está aguardando aprovação/);
  });

  it('timeout (sem resposta) → unknown + exceção; conciliação resolve p/ completed SEM reenviar', async () => {
    const { r, payout } = await seedRequested();
    let sends = 0;
    const out = await approvePayout(payout.id, {
      deps: { transferSender: async () => { sends++; throw new Error('ETIMEDOUT'); } },
    });
    expect(out.status).toBe('unknown');
    expect(await openExceptions('payout_unknown', r.id)).toBe(1);

    // 30min depois: conciliação consulta por externalReference → DONE lá fora.
    await prisma.payout.update({ where: { id: payout.id }, data: { updatedAt: new Date(Date.now() - 40 * MIN) } });
    const recon = await runPayoutReconciliation(Date.now(), {
      transferLookup: async () => ({ found: true, transferId: 'trf_late', status: 'DONE', failReason: null, error: false }),
    });
    expect(recon.resolved).toBe(1);
    const after = await prisma.payout.findFirstOrThrow();
    expect(after.status).toBe('completed');
    expect(await txnCount(payoutDoneTxnId(payout.id))).toBe(2);
    expect(await openExceptions('payout_unknown', r.id)).toBe(0); // exceção fechada
    expect(sends).toBe(1); // JAMAIS reenviou (§18.6 — resposta perdida ≠ autorização)
    expect(await ledgerGloballyBalanced()).toBe(true);
  });

  it('unknown >24h SEM registro no provedor → failed + desreserva (fecha o ciclo)', async () => {
    const { r, payout } = await seedRequested();
    await approvePayout(payout.id, { deps: { transferSender: async () => { throw new Error('network'); } } });
    await prisma.payout.update({ where: { id: payout.id }, data: { updatedAt: new Date(Date.now() - 25 * HOUR) } });
    const recon = await runPayoutReconciliation(Date.now(), {
      transferLookup: async () => ({ found: false, transferId: null, status: null, failReason: null, error: false }),
    });
    expect(recon.notFoundFailed).toBe(1);
    expect((await prisma.payout.findFirstOrThrow()).status).toBe('failed');
    expect(await netOf('doctor_payable', r.id)).toBe(20000);
    expect(await openExceptions('payout_unknown', r.id)).toBe(0);
    expect(await openExceptions('payout_failed', r.id)).toBe(1);
    expect(await ledgerGloballyBalanced()).toBe(true);
  });

  it('Token SMS (authorized:false) → failed + exceção payout_needs_sms_token com instrução', async () => {
    const { r, payout } = await seedRequested();
    const out = await approvePayout(payout.id, {
      deps: { transferSender: async () => ({ transferId: 'trf_sms', status: 'PENDING', authorized: false, failReason: null }) },
    });
    expect(out.status).toBe('failed');
    expect(await openExceptions('payout_needs_sms_token', r.id)).toBe(1);
    const exc = await prisma.exceptionQueue.findFirstOrThrow({ where: { kind: 'payout_needs_sms_token' } });
    expect((exc.payload as any).instruction).toMatch(/dashboard/i);
    expect((exc.payload as any).pixKeyMasked).toMatch(/\*{4}8901/); // mascarada, nunca a chave
    expect(await netOf('doctor_payable', r.id)).toBe(20000); // desreservado
  });

  it('sem reserva no ledger → recusa ANTES de qualquer envio (nunca transferir sem compromisso)', async () => {
    const doc = await seedDoctor();
    const payout = await prisma.payout.create({
      data: { reminderId: 'fake-rem', doctorId: doc.id, amountCents: 5000, reserveTxnId: payoutReserveTxnId('fake-rem') },
    });
    let sends = 0;
    await expect(approvePayout(payout.id, { deps: { transferSender: async () => { sends++; return doneSender()(); } } }))
      .rejects.toThrow(/sem reserva/);
    expect(sends).toBe(0);
  });

  it('requested >48h sem aprovação → alerta (payout_stuck_requested)', async () => {
    const { r } = await seedRequested();
    await prisma.payout.updateMany({ data: { requestedAt: new Date(Date.now() - 49 * HOUR) } });
    const recon = await runPayoutReconciliation(Date.now());
    expect(recon.stuckAlerts).toBe(1);
    expect(await openExceptions('payout_stuck_requested', r.id)).toBe(1);
  });

  it('KYC: médico bloqueado DEPOIS da reserva → approve RECUSA (DOCTOR_CANNOT_PRACTICE) sem enviar; liberado → aprova e fecha a exceção', async () => {
    const { doc, r, payout } = await seedRequested();
    await prisma.doctor.update({ where: { id: doc.id }, data: { blocked: true } });
    let sends = 0;
    const deps = { transferSender: async () => { sends++; return doneSender('trf_kyc')(); } };

    const refusal = await approvePayout(payout.id, { deps }).catch((e: any) => e);
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.code).toBe('DOCTOR_CANNOT_PRACTICE');
    expect(refusal.message).toMatch(/DOCTOR_CANNOT_PRACTICE/); // a rota (409) devolve só a mensagem
    expect(sends).toBe(0);
    const held = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
    expect(held.status).toBe('requested'); // segue p/ um humano
    expect(held.attempts).toBe(0); // nem o claim aconteceu
    expect(await netOf('payout_processing', r.id)).toBe(20000); // reserva intacta
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${doc.id}`)).toBe(1);

    // liberado → o MESMO payout é aprovado normalmente e a exceção se fecha
    await prisma.doctor.update({ where: { id: doc.id }, data: { blocked: false } });
    const out = await approvePayout(payout.id, { deps });
    expect(out.status).toBe('completed');
    expect(sends).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${doc.id}`)).toBe(0);
    expect(await ledgerGloballyBalanced()).toBe(true);
  });
});

// ───────────────────── Estornos reais (§18.7) ─────────────────────────────────────

describe('runRefundPass — estorno no provedor', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); }, 30_000);

  it('no_show pago → refund total OK → refundedAt + ledger refund + sem exceção; 2º pass é no-op', async () => {
    const doc = await seedDoctor();
    const r = await seedRefundable(doc.id);
    const refund = vi.fn(async () => ({ status: 'REFUNDED' }));
    const status = vi.fn(async () => 'RECEIVED');
    const p1 = await runRefundPass(Date.now(), { refundSender: refund, statusLookup: status });
    expect(p1.refunded).toBe(1);
    expect(refund).toHaveBeenCalledWith('pay_refund1');
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id }, select: { refundedAt: true } });
    expect(after.refundedAt).not.toBeNull();
    const refundNet = await netOf('refund', r.id);
    expect(refundNet).toBe(15000); // compensatório postado (D reserve / C refund)
    expect(await ledgerGloballyBalanced()).toBe(true);

    const p2 = await runRefundPass(Date.now() + MIN, { refundSender: refund, statusLookup: status });
    expect(p2.refunded).toBe(0); // idempotente: refundedAt setado
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('já REFUNDED no provedor → só marca (não re-estorna)', async () => {
    const doc = await seedDoctor();
    const r = await seedRefundable(doc.id, 'technical');
    const refund = vi.fn(async () => ({ status: 'REFUNDED' }));
    const p = await runRefundPass(Date.now(), { refundSender: refund, statusLookup: async () => 'REFUNDED' });
    expect(p.refunded).toBe(1);
    expect(refund).not.toHaveBeenCalled(); // status já REFUNDED → nem chama o refund
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).refundedAt).not.toBeNull();
  });

  it('REFUND_REQUESTED (em andamento) → espera tick futuro (não marca, não duplica)', async () => {
    const doc = await seedDoctor();
    const r = await seedRefundable(doc.id);
    const p = await runRefundPass(Date.now(), {
      refundSender: async () => ({ status: 'REFUND_REQUESTED' }),
      statusLookup: async () => 'RECEIVED',
    });
    expect(p.waiting).toBe(1);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).refundedAt).toBeNull();
  });

  it('SEM SALDO no Asaas (400 saldo) → fila manual refund_needs_balance; valor intacto', async () => {
    const doc = await seedDoctor();
    const r = await seedRefundable(doc.id);
    const p = await runRefundPass(Date.now(), {
      refundSender: async () => { throw new AsaasApiError('É necessário disponibilizar saldo suficiente...', 400, []); },
      statusLookup: async () => 'RECEIVED',
    });
    expect(p.exceptionsCreated).toBe(1);
    expect(await openExceptions('refund_needs_balance', r.id)).toBe(1);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).refundedAt).toBeNull();
    // dedup: 2º tick não duplica
    await runRefundPass(Date.now() + MIN, {
      refundSender: async () => { throw new AsaasApiError('É necessário disponibilizar saldo suficiente...', 400, []); },
      statusLookup: async () => 'RECEIVED',
    });
    expect(await openExceptions('refund_needs_balance', r.id)).toBe(1);
  });

  it('outro erro do provedor → refund_failed com o erro', async () => {
    const doc = await seedDoctor();
    const r = await seedRefundable(doc.id);
    const p = await runRefundPass(Date.now(), {
      refundSender: async () => { throw new AsaasApiError('Cobrança não pode ser estornada', 400, [{ code: 'x', description: 'Cobrança não pode ser estornada' }]); },
      statusLookup: async () => 'RECEIVED',
    });
    expect(p.exceptionsCreated).toBe(1);
    expect(await openExceptions('refund_failed', r.id)).toBe(1);
  });
});

// ───────────────────── Auto-mode GATED (§18.5 — "supervisionado primeiro") ────────

describe('runPayoutAutoApprove — gated por teleconsulta.payoutAuto', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); }, 30_000);

  it('default OFF: job cria requested mas NÃO envia; ligado → envia pelo MESMO caminho', async () => {
    const doc = await seedDoctor();
    const r = await seedEligible(doc.id);
    let sends = 0;
    const deps = { transferSender: async (..._a: any[]) => { sends++; return { transferId: 'trf_auto', status: 'DONE', authorized: true, failReason: null }; } };

    // DEFAULT: off → nenhum envio
    const { runPayoutAutoApprove } = await import('../src/finance/payout');
    expect(await runPayoutAutoApprove(deps as any)).toBe(0);
    await runPayoutPass(Date.now());
    expect(await runPayoutAutoApprove(deps as any)).toBe(0); // auto segue OFF
    expect(sends).toBe(0);
    expect((await prisma.payout.findFirstOrThrow()).status).toBe('requested');

    // DONO LIGOU (admin) → auto aprova pelo mesmo approvePayout
    await saveSettings('teleconsulta', { payoutAuto: 1 });
    expect(await runPayoutAutoApprove(deps as any)).toBe(1);
    expect(sends).toBe(1);
    const after = await prisma.payout.findFirstOrThrow();
    expect(after.status).toBe('completed');
    expect(await txnCount(payoutDoneTxnId(after.id))).toBe(2);
    void r;
  });

  it('KYC: médico recusado DEPOIS da reserva fica requested p/ humano (+ exceção); quem pode atender segue sendo aprovado', async () => {
    const held = await seedDoctor();
    const ok = await seedDoctor();
    const rHeld = await seedEligible(held.id);
    const rOk = await seedEligible(ok.id);
    await runPayoutPass(Date.now()); // ambos ainda podem atender → 2 requested + reservas
    expect(await prisma.payout.count()).toBe(2);
    await prisma.doctor.update({ where: { id: held.id }, data: { verificationStatus: 'rejected' } }); // ex.: fraude confirmada depois do pedido
    await saveSettings('teleconsulta', { payoutAuto: 1 });
    const sent: string[] = [];
    const deps = { transferSender: async (i: any) => { sent.push(i.externalReference); return { transferId: 'trf_kyc', status: 'DONE', authorized: true, failReason: null }; } };

    const { runPayoutAutoApprove } = await import('../src/finance/payout');
    expect(await runPayoutAutoApprove(deps as any)).toBe(1); // só quem pode atender
    const pHeld = await prisma.payout.findFirstOrThrow({ where: { reminderId: rHeld.id } });
    const pOk = await prisma.payout.findFirstOrThrow({ where: { reminderId: rOk.id } });
    expect(sent).toEqual([`payout_${pOk.id}`]); // NADA foi enviado p/ o médico retido
    expect(pOk.status).toBe('completed');
    expect(pHeld.status).toBe('requested'); // segue p/ um humano decidir
    expect(pHeld.attempts).toBe(0); // nem o claim aconteceu
    expect(await netOf('payout_processing', rHeld.id)).toBe(20000); // reserva intacta
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${held.id}`)).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${ok.id}`)).toBe(0);

    expect(await runPayoutAutoApprove(deps as any)).toBe(0); // 2º tick: nada novo
    expect(sent).toHaveLength(1);
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${held.id}`)).toBe(1); // sem duplicar
    expect(await ledgerGloballyBalanced()).toBe(true);
  });
});

// ───────────────────── Caixa Asaas — cache 5min (§18.8) ───────────────────────────

describe('getAsaasBalanceCached — cache de 5 minutos', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); }, 30_000);

  it('1 fetch em 2 leituras dentro do TTL; expirado → refetch; falha → null (nunca 0 falso)', async () => {
    fetchMock().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ balance: 1234.56 }),
      text: async () => JSON.stringify({ balance: 1234.56 }),
    }) as any);
    const t0 = Date.now();
    expect(await getAsaasBalanceCached(t0)).toBe(123456);
    expect(await getAsaasBalanceCached(t0 + 4 * MIN)).toBe(123456); // cache hit
    const calls = fetchMock().mock.calls.filter((c: any[]) => String(c[0]).includes('/v3/finance/balance'));
    expect(calls).toHaveLength(1);
    expect(await getAsaasBalanceCached(t0 + 6 * MIN)).toBe(123456); // expirou → refetch
    expect(fetchMock().mock.calls.filter((c: any[]) => String(c[0]).includes('/v3/finance/balance'))).toHaveLength(2);

    fetchMock().mockImplementation(async () => { throw new Error('asaas down'); });
    expect(await getAsaasBalanceCached(t0 + 30 * MIN)).toBe(null); // falha → null (UI mostra "—")
  });
});

// ───────────────────── Admin: rotas de aprovação (fetch stubado — sem rede) ───────

describe('admin /payouts — listagem mascarada + aprovação auditada', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); }, 30_000);

  it('GET lista com PIX MASCARADO + auto default false', async () => {
    const { token } = await createAdmin();
    const doc = await seedDoctor();
    await seedEligible(doc.id);
    await runPayoutPass(Date.now());

    const r = await api().get('/api/admin/payouts').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.auto).toBe(false);
    expect(r.body.payouts).toHaveLength(1);
    const p = r.body.payouts[0];
    expect(p.status).toBe('requested');
    expect(p.pixKeyMasked).toMatch(/\*{4}8901$/); // últimos 4, nunca a chave completa
    expect(JSON.stringify(p)).not.toContain('12345678901');
    expect(p.doctor.name).toBeTruthy();
    expect(p.reminder.title).toBe('Tele elegível');
  });

  it('POST approve → transfer DONE (fetch stubado) → completed + 2 audit rows', async () => {
    const { token } = await createAdmin();
    const doc = await seedDoctor();
    await seedEligible(doc.id);
    await runPayoutPass(Date.now());
    const payout = await prisma.payout.findFirstOrThrow();

    fetchMock().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ id: 'trf_route', status: 'DONE', authorized: true }),
      text: async () => '',
    } as any);
    const r = await api().post(`/api/admin/payouts/${payout.id}/approve`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.payout.status).toBe('completed');
    expect(r.body.payout.transferId).toBe('trf_route');
    expect((await prisma.payout.findFirstOrThrow()).status).toBe('completed');

    const audits = await prisma.auditLog.count({ where: { action: { startsWith: 'ADMIN_PAYOUT_APPROVE' } } });
    expect(audits).toBe(2); // request + result
    // chamada REAL ao Asaas ocorreu exatamente 1× com idempotência oficial:
    const tcall = fetchMock().mock.calls.find((c: any[]) => String(c[0]).includes('/v3/transfers'));
    expect(tcall).toBeTruthy();
    const body = JSON.parse(String((tcall![1] as any).body));
    expect(body.externalReference).toBe(`payout_${payout.id}`);
    expect(body.pixAddressKey).toBe('12345678901'); // vai ao Asaas (necessário) — mas NUNCA em resposta/audit
    expect(body.pixAddressKeyType).toBe('CPF');
  });

  it('POST approve de médico bloqueado DEPOIS da reserva → 409 com DOCTOR_CANNOT_PRACTICE; nada vai ao Asaas; segue requested', async () => {
    const { token } = await createAdmin();
    const doc = await seedDoctor();
    await seedEligible(doc.id);
    await runPayoutPass(Date.now());
    const payout = await prisma.payout.findFirstOrThrow();
    await prisma.doctor.update({ where: { id: doc.id }, data: { blocked: true } });
    fetchMock().mockClear();

    const r = await api().post(`/api/admin/payouts/${payout.id}/approve`).set(authHeader(token));
    expect(r.status).toBe(409); // a recusa (throw) já vira 409 + mensagem na rota atual
    expect(String(r.body.error)).toMatch(/DOCTOR_CANNOT_PRACTICE/);
    expect(fetchMock().mock.calls.some((c: any[]) => String(c[0]).includes('/v3/transfers'))).toBe(false);
    expect((await prisma.payout.findFirstOrThrow()).status).toBe('requested');
  });

  it('POST approve de payout inexistente → 404; toggle auto grava audit', async () => {
    const { token } = await createAdmin();
    expect((await api().post('/api/admin/payouts/nao-existe/approve').set(authHeader(token))).status).toBe(404);
    const r = await api().post('/api/admin/payouts/auto').set(authHeader(token)).send({ enabled: true });
    expect(r.status).toBe(200);
    expect(r.body.auto).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'TELECONSULTA_PAYOUT_AUTO_TOGGLE' } })).toBe(1);
    await saveSettings('teleconsulta', { payoutAuto: 0 }); // devolve OFF
  });
});
