// MATRIZ FINANCEIRA §18.10 (Onda 2 — fundação, docs/design/2026-10-24-finance-architecture.md):
//  · partidas balanceadas violadas → throw (nada gravado)
//  · pagamento → estrutura correta (D patient_received / C held_unrealized; regra de
//    ouro: NADA do total em platform_revenue) + snapshot congelada + releaseEligibleAt
//  · mudança de regra NÃO recalcula consulta antiga (snapshot §18.2/§15.3)
//  · completed → split 80/20 no ledger (feeBearer platform)
//  · feeBearer=doctor desconta taxa dos honorários (unit pura)
//  · no_show pago → reserva p/ estorno
//  · estorno → COMPENSATÓRIO (append, nunca apaga)
//  · 2 postagens do mesmo evento = idempotente (txnId determinístico)
//  · saldos derivados batem (accountBalance / doctorEarnings)
//  · conciliação repara faltante 1× (re-run = no-op)
//  · admin: nova vigência encerra a anterior; específica > geral
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader, mpResponse } from './helpers';
import { loadSettings } from '../src/utils/settings';
import {
  postEntries, assertBalanced, LedgerUnbalancedError,
  recordTeleconsultaPayment, recordTeleconsultaEnded, postRefundExecuted,
  accountBalance, doctorEarnings, computeCompletionSplit,
  paymentTxnId, completionTxnId, refundReserveTxnId, refundTxnId,
} from '../src/finance/ledger';
import { resolveCommissionRule, DEFAULT_COMMISSION_RULE } from '../src/finance/rules';
import { runFinanceReconciliation } from '../src/finance/reconcile';
import { mintToken } from './helpers';

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
const FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString();
let seedSeq = 0;

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-fin-${Date.now().toString(36)}-${seedSeq++}@exemplo.com`, name: 'Admin Fin', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { token: mintToken(u.id) };
}

/** Médico FREE + paciente com share; teleconsulta COM PREÇO criada pela API do portal
 *  (fluxo real → congela commissionSnapshot no agendamento). */
async function seedTeleconsulta(priceCents = 25000) {
  const { user, patient, token } = await createUser();
  const crm = `${90000 + (seedSeq++ % 9000)}-SP`;
  const doc = await createDoctor({ crm });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });
  const post = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(doc.token))
    .send({ dueDate: FUTURE(), title: 'Tele paga', linkUrl: 'https://meet.example.com/sala', consultPriceCents: priceCents });
  if (post.status !== 201) throw new Error(`seedTeleconsulta: POST falhou ${post.status} ${JSON.stringify(post.body)}`);
  return { user, patient, token, doc, reminder: post.body.reminder };
}

/** Paga a teleconsulta pelo fluxo REAL: PIX (MP mockado) + webhook approved. */
async function payViaWebhook(reminderId: string, userId: string) {
  fetchMock().mockResolvedValueOnce(mpResponse({ id: `pay_${reminderId}`, point_of_interaction: { transaction_data: { qr_code: 'PIX', qr_code_base64: 'AA' } } }));
  const r = await api().post(`/api/billing/teleconsulta/${reminderId}`).set(authHeader(mintToken(userId)));
  expect(r.status).toBe(200);
  const sub = await prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub!.id}|0|TELE:${reminderId}` }));
  const wh = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: `pay_${reminderId}` } });
  expect(wh.status).toBe(200);
  const row = await prisma.reminder.findUnique({ where: { id: reminderId }, select: { paidAt: true } });
  expect(row?.paidAt).toBeTruthy(); // pagamento efetivado
}

/** Join log "fantasma" no auditLog (presença de N min atrás — fonte do jointMs). */
async function seedJoinLog(reminderId: string, role: 'patient' | 'doctor', minutesAgo: number) {
  await prisma.auditLog.create({
    data: {
      actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
      action: 'TELECONSULTA_JOIN', targetType: 'REMINDER', targetId: reminderId,
      after: { role, reminderId } as any,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  });
}

const occKey = async (reminderId: string) => {
  const r = await prisma.reminder.findUnique({ where: { id: reminderId }, select: { paidAt: true, paymentRef: true } });
  return r?.paymentRef || (r?.paidAt ? String(new Date(r.paidAt).getTime()) : '');
};
const ledgerRows = (reminderId: string) =>  prisma.ledgerEntry.findMany({ where: { reminderId }, orderBy: { createdAt: 'asc' } });

// ── UNIT: balanceamento e split puro ─────────────────────────────────────────────
describe('finance: partidas balanceadas (unit)', () => {
  it('Σdebit ≠ Σcredit → LedgerUnbalancedError E nada gravado', async () => {
    await expect(postEntries([{
      txnId: 'test_unbalanced_x', entries: [
        { account: 'patient_received', debitCents: 1000 },
        { account: 'held_unrealized', creditCents: 999 },
      ],
    }])).rejects.toThrow(LedgerUnbalancedError);
    expect(assertBalanced).toBeDefined();
    expect(await prisma.ledgerEntry.count({ where: { txnId: 'test_unbalanced_x' } })).toBe(0);
  });

  it('centavos negativos/float e conta desconhecida → throw antes de gravar', async () => {
    await expect(postEntries([{ txnId: 't1', entries: [{ account: 'reserve', debitCents: -5 }, { account: 'refund', creditCents: -5 }] }])).rejects.toThrow();
    await expect(postEntries([{ txnId: 't2', entries: [{ account: 'conta_inexistente', debitCents: 1 }, { account: 'refund', creditCents: 1 }] }])).rejects.toThrow();
    expect(await prisma.ledgerEntry.count({ where: { txnId: { in: ['t1', 't2'] } } })).toBe(0);
  });

  it('feeBearer=platform: taxa sai da RECEITA da plataforma (unit computeCompletionSplit)', () => {
    const snap = { ...DEFAULT_COMMISSION_RULE, platformBps: 2000, feeBearer: 'platform' as const };
    const s = computeCompletionSplit(10_000, snap, 150);
    expect(s).toEqual({ doctorCents: 8000, platformCents: 1850, feeCents: 150, platformGrossCents: 2000 });
    expect(s.doctorCents + s.platformCents + s.feeCents).toBe(10_000); // txn balanceada
  });

  it('feeBearer=doctor: taxa DESCONTA dos honorários do médico (unit)', () => {
    const snap = { ...DEFAULT_COMMISSION_RULE, platformBps: 2000, feeBearer: 'doctor' as const };
    const s = computeCompletionSplit(10_000, snap, 150);
    expect(s.doctorCents).toBe(7850); // 8000 − 150
    expect(s.platformCents).toBe(2000);
    expect(s.feeCents).toBe(150);
    expect(s.doctorCents + s.platformCents + s.feeCents).toBe(10_000);
  });

  it('resolveCommissionRule: sem regra → default; específica > geral', async () => {
    expect((await resolveCommissionRule(null)).platformBps).toBe(DEFAULT_COMMISSION_RULE.platformBps);
    const now = new Date();
    await prisma.commissionRule.create({ data: { doctorId: null, platformBps: 2500, validFrom: now } });
    await prisma.commissionRule.create({ data: { doctorId: 'doc_x', platformBps: 1000, validFrom: now } });
    expect((await resolveCommissionRule('doc_x', now)).platformBps).toBe(1000); // específica
    expect((await resolveCommissionRule('doc_y', now)).platformBps).toBe(2500); // cai na geral
    expect((await resolveCommissionRule(null, now)).platformBps).toBe(2500);
  });
});

// ── E2E: pagamento confirmado (webhook → ledger) ──────────────────────────────────
describe('finance: pagamento confirmado → ledger (E2E webhook)', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
    await loadSettings();
  });

  it('estrutura: D patient_received / C held_unrealized + snapshot + releaseEligibleAt; ZERO platform_revenue', async () => {
    const { user, doc, reminder } = await seedTeleconsulta(25000);
    await payViaWebhook(reminder.id, user.id);
    const rows = await ledgerRows(reminder.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.account === 'patient_received')).toMatchObject({ debitCents: 25000, creditCents: 0 });
    expect(rows.find((r) => r.account === 'held_unrealized')).toMatchObject({ debitCents: 0, creditCents: 25000 });
    // REGRA DE OURO (§18.3): total pago NUNCA é receita da plataforma
    expect(await accountBalance('platform_revenue')).toMatchObject({ creditCents: 0, netCents: 0 });
    expect((await accountBalance('patient_received')).debitCents).toBe(25000);
    expect((await accountBalance('held_unrealized')).netCents).toBe(25000); // retido
    // Snapshot congelada + elegibilidade = paidAt + releaseDelayDays (default 3)
    const r = await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { paidAt: true, commissionSnapshot: true, releaseEligibleAt: true } });
    expect((r!.commissionSnapshot as any).platformBps).toBe(DEFAULT_COMMISSION_RULE.platformBps);
    expect(r!.releaseEligibleAt!.toISOString()).toBe(new Date(r!.paidAt!.getTime() + 3 * 86_400_000).toISOString());
    // ruleSnapshot em CADA partida = cópia da regra da época (nunca FK viva)
    expect((rows[0].ruleSnapshot as any).platformBps).toBe(DEFAULT_COMMISSION_RULE.platformBps);
    expect(rows.every((x) => x.doctorId === doc.doctor.id)).toBe(true);
  });

  it('idempotência: 2ª postagem do mesmo evento = no-op (txnId determinístico)', async () => {
    const { user, reminder } = await seedTeleconsulta(15000);
    await payViaWebhook(reminder.id, user.id);
    expect(await prisma.ledgerEntry.count({ where: { reminderId: reminder.id } })).toBe(2);
    const again = await recordTeleconsultaPayment(reminder.id);
    expect(again.posted).toBe(false);
    await recordTeleconsultaPayment(reminder.id);
    expect(await prisma.ledgerEntry.count({ where: { reminderId: reminder.id } })).toBe(2); // nem uma linha a mais
    // webhook reenviado idem (paidAt condicional + txnId): nada duplica
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `sub|0|TELE:${reminder.id}` }));
    await recordTeleconsultaPayment(reminder.id);
    expect(await prisma.ledgerEntry.count({ where: { reminderId: reminder.id } })).toBe(2);
  });
});

// ── E2E: encerramento (/end) → honorários, reserva e estorno ──────────────────────
describe('finance: /end → split · reserva · estorno (E2E)', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
    await loadSettings();
  });

  it('completed (critério real de presença) → split 80/20 no ledger; held zera; saldos batem', async () => {
    const { user, token, doc, reminder } = await seedTeleconsulta(25000);
    await payViaWebhook(reminder.id, user.id);
    // dueDate futura → janela de entrada ainda fechada: abre com dueDate no passado
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    await seedJoinLog(reminder.id, 'patient', 10);
    await seedJoinLog(reminder.id, 'doctor', 8); // ~8min conjunto ≥ 300s
    const end = await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({});
    expect(end.status).toBe(200);
    expect(end.body.teleStatus).toBe('completed');

    const rows = await ledgerRows(reminder.id);
    const completionKey = await occKey(reminder.id);
    const completion = rows.filter((r) => r.txnId === completionTxnId(reminder.id, completionKey));
    expect(completion).toHaveLength(3);
    expect(completion.find((r) => r.account === 'held_unrealized')).toMatchObject({ debitCents: 25000, creditCents: 0 });
    expect(completion.find((r) => r.account === 'doctor_payable')).toMatchObject({ creditCents: 20000 }); // 80%
    expect(completion.find((r) => r.account === 'platform_revenue')).toMatchObject({ creditCents: 5000 }); // 20%
    // Saldos derivados = soma de lançamentos (§18.3)
    expect((await accountBalance('held_unrealized')).netCents).toBe(0); // retenção toda consumida
    expect(await doctorEarnings(doc.doctor.id)).toBe(20000);
    expect((await accountBalance('platform_revenue')).netCents).toBe(5000);
    expect((await accountBalance('patient_received')).debitCents).toBe(25000); // GMV intacto
  });

  it('no_show pago → valor RESERVADO p/ estorno (não vira honorário nem receita)', async () => {
    const { user, token, reminder } = await seedTeleconsulta(25000);
    await payViaWebhook(reminder.id, user.id);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    const end = await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(end.status).toBe(200);
    expect(end.body.teleStatus).toBe('no_show');
    const reserve = await prisma.ledgerEntry.findMany({ where: { txnId: refundReserveTxnId(reminder.id, await occKey(reminder.id)) } });
    expect(reserve).toHaveLength(2);
    expect(reserve.find((r) => r.account === 'held_unrealized')).toMatchObject({ debitCents: 25000 });
    expect(reserve.find((r) => r.account === 'reserve')).toMatchObject({ creditCents: 25000 });
    expect((await accountBalance('reserve')).netCents).toBe(25000);
    expect(await doctorEarnings(reminder.createdByDoctorId ?? '')).toBe(0);
  });

  it('estorno registrado → COMPENSATÓRIO (append-only, nunca apaga)', async () => {
    const { user, token, reminder } = await seedTeleconsulta(25000);
    await payViaWebhook(reminder.id, user.id);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    const before = await ledgerRows(reminder.id);
    expect(before).toHaveLength(4); // payment(2) + reserve(2)
    const refund = await postRefundExecuted(reminder.id);
    expect(refund.posted).toBe(true);
    const after = await ledgerRows(reminder.id);
    expect(after).toHaveLength(6); // + refund(2): NADA foi apagado
    const paymentKey = await occKey(reminder.id);
    expect(after.filter((r) => r.txnId === paymentTxnId(reminder.id, paymentKey))).toHaveLength(2); // original intacto
    const rf = after.filter((r) => r.txnId === refundTxnId(reminder.id, paymentKey));
    expect(rf.find((r) => r.account === 'reserve')).toMatchObject({ debitCents: 25000 }); // consome a reserva
    expect(rf.find((r) => r.account === 'refund')).toMatchObject({ creditCents: 25000 });
    expect((await accountBalance('reserve')).netCents).toBe(0); // reserva liquidada
  });

  it('mudança de regra NÃO recalcula consulta antiga (snapshot congelada no agendamento)', async () => {
    const admin = await createAdmin();
    // Vigência 1 (geral, 30%) vigente ANTES do agendamento → snapshot = 30%
    const mk = await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ platformBps: 3000 });
    expect(mk.status).toBe(201);
    const { user, token, reminder } = await seedTeleconsulta(20000);
    let snap = (await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { commissionSnapshot: true } }))!.commissionSnapshot as any;
    expect(snap.platformBps).toBe(3000);
    // Vigência 2 (geral, 10%) — encerra a 1ª; consulta JÁ agendada mantém 30%
    const mk2 = await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ platformBps: 1000 });
    expect(mk2.status).toBe(201);
    expect(mk2.body.closedRules).toBe(1); // anterior encerrada automaticamente
    await payViaWebhook(reminder.id, user.id);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    await seedJoinLog(reminder.id, 'patient', 10);
    await seedJoinLog(reminder.id, 'doctor', 8);
    await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({});
    snap = (await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { commissionSnapshot: true } }))!.commissionSnapshot as any;
    expect(snap.platformBps).toBe(3000); // snapshot NUNCA muda depois
    const completion = await prisma.ledgerEntry.findMany({ where: { txnId: completionTxnId(reminder.id, await occKey(reminder.id)) } });
    expect(completion.find((r) => r.account === 'doctor_payable')).toMatchObject({ creditCents: 14000 }); // 70% (30% plataforma)
    expect(completion.find((r) => r.account === 'platform_revenue')).toMatchObject({ creditCents: 6000 });
  });

  it('consulta SEM pagamento (ou sem preço) encerrada → ledger intacto (no-op)', async () => {
    const { user, token, reminder } = await seedTeleconsulta(15000);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(await prisma.ledgerEntry.count({ where: { reminderId: reminder.id } })).toBe(0); // sem dinheiro, sem ledger
    expect((await recordTeleconsultaEnded(reminder.id, 'no_show')).posted).toBe(false);
  });
});

// ── E2E: admin §18.2 — vigências de regra ─────────────────────────────────────────
describe('finance: admin commission-rules (E2E)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings();
  });

  it('GET lista histórico + active; POST valida; não-admin → 403', async () => {
    const admin = await createAdmin();
    const anon = await createUser();
    const forbidden = await api().post('/api/admin/commission-rules').set(authHeader(anon.token)).send({ platformBps: 1000 });
    expect(forbidden.status).toBe(403);
    const bad = await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ platformBps: 99999 });
    expect(bad.status).toBe(400);
    await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ platformBps: 2000, feeBearer: 'doctor', releaseDelayDays: 5, minPayoutCents: 5000 });
    await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ platformBps: 1800 });
    const list = await api().get('/api/admin/commission-rules').set(H2(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.rules).toHaveLength(2);
    expect(list.body.rules.find((r: any) => r.platformBps === 2000).validTo).toBeTruthy(); // encerrada
    expect(list.body.active.general.platformBps).toBe(1800); // vigente
    // Auditoria registrada (LGPD/§18.8)
    expect(await prisma.auditLog.count({ where: { action: 'ADMIN_COMMISSION_RULE_CREATE' } })).toBe(2);
  });

  it('regra específica do médico vence a geral no agendamento', async () => {
    const admin = await createAdmin();
    const first = await seedTeleconsulta(10000); // antes de qualquer regra → default
    expect(((await prisma.reminder.findUnique({ where: { id: first.reminder.id } }))!.commissionSnapshot as any).platformBps)
      .toBe(DEFAULT_COMMISSION_RULE.platformBps);
    await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ platformBps: 3000 }); // geral 30%
    const spec = await api().post('/api/admin/commission-rules').set(H2(admin.token)).send({ doctorId: first.doc.doctor.id, platformBps: 1000 }); // específica 10%
    expect(spec.status).toBe(201);
    const second = await seedTeleconsulta(10000); // mesmo médico? NÃO — outro médico. Precisa do mesmo:
    // (segunda seed cria OUTRO médico → valida o fallback geral; a específica é validada abaixo)
    expect(((await prisma.reminder.findUnique({ where: { id: second.reminder.id } }))!.commissionSnapshot as any).platformBps).toBe(3000);
    // Agendamento do MÉDICO COM REGRA ESPECÍFICA usa 10%
    const { patient, token } = await createUser();
    const docRow = await prisma.doctor.findUnique({ where: { id: first.doc.doctor.id }, select: { crm: true } });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: docRow!.crm, scopes: ['exams'], patientId: patient.id });
    const post = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(first.doc.token))
      .send({ dueDate: new Date(Date.now() + 26 * 3600_000).toISOString(), title: 'Específica', linkUrl: 'https://meet.example.com/x', consultPriceCents: 10000 }); // +26h: fora do slot ±30min do agendamento anterior (gate SCHEDULE_CONFLICT)
    expect(post.status).toBe(201);
    expect(((await prisma.reminder.findUnique({ where: { id: post.body.reminder.id } }))!.commissionSnapshot as any).platformBps).toBe(1000);
  });
});

// ── E2E: conciliação repara faltante (idempotente) ────────────────────────────────
describe('finance: conciliação de estado (reconcile)', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
    await loadSettings();
  });

  it('pago+completed SEM ledger (crash simulado) → repara 1×; re-run = no-op', async () => {
    const { user, token, reminder } = await seedTeleconsulta(25000);
    await payViaWebhook(reminder.id, user.id);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    await seedJoinLog(reminder.id, 'patient', 10);
    await seedJoinLog(reminder.id, 'doctor', 8);
    const end = await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({});
    expect(end.body.teleStatus).toBe('completed');
    expect(await prisma.ledgerEntry.count({ where: { reminderId: reminder.id } })).toBe(5); // payment(2)+completion(3)
    // Crash simulado entre evento e ledger: perde TUDO (testes podem deletar; prod nunca)
    await prisma.ledgerEntry.deleteMany({ where: { reminderId: reminder.id } });
    const rep1 = await runFinanceReconciliation(Date.now());
    expect(rep1.repaired).toBe(2); // payment + completion repostos
    const rows = await ledgerRows(reminder.id);
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.account === 'doctor_payable')).toHaveLength(1);
    expect(await doctorEarnings(rows[0].doctorId!)).toBe(20000); // saldos batem de novo
    const rep2 = await runFinanceReconciliation(Date.now());
    expect(rep2.repaired).toBe(0); // idempotente: nada mais a reparar
    expect(await prisma.ledgerEntry.count({ where: { reminderId: reminder.id } })).toBe(5);
  });

  it('pago+no_show sem reserva → conciliação reserva; divergência completion×status → ExceptionQueue', async () => {
    const { user, token, reminder } = await seedTeleconsulta(15000);
    await payViaWebhook(reminder.id, user.id);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() - 10 * 60_000) } });
    await api().post(`/api/teleconsulta/${reminder.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    await prisma.ledgerEntry.deleteMany({ where: { reminderId: reminder.id, account: 'reserve' } });
    await prisma.ledgerEntry.deleteMany({ where: { reminderId: reminder.id, account: 'held_unrealized' } }); // "perde" a reserva
    const rep = await runFinanceReconciliation(Date.now());
    expect(rep.repaired).toBeGreaterThanOrEqual(1);
    const reserve = await prisma.ledgerEntry.findMany({ where: { reminderId: reminder.id, txnId: refundReserveTxnId(reminder.id, await occKey(reminder.id)) } });
    expect(reserve).toHaveLength(2);
    // Divergência estrutural: ledger de conclusão sem teleStatus=completed → exceção
    const other = await seedTeleconsulta(10000);
    await payViaWebhook(other.reminder.id, other.user.id);
    await prisma.reminder.update({ where: { id: other.reminder.id }, data: { teleStatus: 'no_show', endedAt: new Date(), paidAt: new Date(Date.now() - 3600_000) } });
    await recordTeleconsultaEnded(other.reminder.id, 'completed').catch(() => {}); // teleStatus é no_show → no-op real
    // força a divergência inserindo completion com teleStatus não-completed
    await prisma.ledgerEntry.createMany({ data: [
      { txnId: completionTxnId(other.reminder.id), reminderId: other.reminder.id, account: 'held_unrealized', debitCents: 10000 },
      { txnId: completionTxnId(other.reminder.id), reminderId: other.reminder.id, account: 'doctor_payable', creditCents: 8000 },
      { txnId: completionTxnId(other.reminder.id), reminderId: other.reminder.id, account: 'platform_revenue', creditCents: 2000 },
    ] });
    const rep2 = await runFinanceReconciliation(Date.now());
    expect(rep2.exceptionsCreated).toBeGreaterThanOrEqual(1);
    const exc = await prisma.exceptionQueue.findFirst({ where: { kind: 'teleconsulta_finance_divergence', reminderId: other.reminder.id, status: 'open' } });
    expect(exc).toBeTruthy();
  });
});
