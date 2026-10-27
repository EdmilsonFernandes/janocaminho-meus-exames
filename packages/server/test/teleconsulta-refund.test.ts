// E2E (supertest) — ONDA 4 (dono 26/10): estorno EXECUTADO de teleconsulta paga.
// "Amarrar a jornada": esta suíte cobre o fio financeiro inteiro que faltava —
// pagamento registrado (ledger held) → ESTORNO via admin (Asaas mockado) → ledger
// refund consumindo held/reserva → refundedAt → notificações → idempotência →
// guard (sem pagamento / provider recusa = NÃO marca nada) → webhook REFUND_RECEIVED
// (estorno manual no painel) → conciliação do reconcile-style.
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../src/utils/mailer', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock('../src/utils/push', () => ({ sendPushToUser: vi.fn(async () => ({ sent: 1 })) }));
// ASAAS_API_KEY do setup de teste = 'asaas-test-key' (mesma do asaas-webhook.test.ts)
// → hasAsaas()=true; o fetch global é mockado por teste (provider nunca é chamado).

import { prisma } from '../src/prisma';
import { sendEmail } from '../src/utils/mailer';
import { sendPushToUser } from '../src/utils/push';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';
import { recordTeleconsultaPayment, recordTeleconsultaRefundReserve } from '../src/finance/ledger';

const fetchMock = () => globalThis.fetch as unknown as Mock;

/** Consulta paga (scheduled — o caso da Heloisa 26/10) com ledger de pagamento real. */
async function seedPaidTeleconsulta(opts: { teleStatus?: string; endedAt?: Date } = {}) {
  const { user, patient } = await createUser();
  const doc = await createDoctor({ email: `refund-doc-${Date.now().toString(36)}@test.com`, crm: `55220-SP` });
  await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'] } });
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Consulta paga (teste estorno)',
      dueDate: new Date(Date.now() + 3600_000), type: 'teleconsulta', consentAt: new Date(),
      createdByDoctorId: doc.doctor.id, consultPriceCents: 500,
      paidAt: new Date(), paymentRef: 'pay_refundtest_001',
      teleStatus: opts.teleStatus ?? null, endedAt: opts.endedAt ?? null,
      notifyOffsetsMin: [0],
    },
    select: { id: true },
  });
  await recordTeleconsultaPayment(r.id); // held_unrealized 500 (o estado real pós-webhook)
  return { user, patient, doc, r, H: { Authorization: `Bearer ${doc.token}` } };
}

async function adminToken() {
  const { user, token } = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  return authHeader(token);
}

/** Mocka o Asaas refund (POST /v3/payments/:id/refund) com o status HTTP dado. */
const mockAsaasRefund = (status: number) => {
  fetchMock().mockImplementation(async (url: any, init?: any) => {
    if (String(url).includes('/v3/payments/') && String(url).endsWith('/refund')) {
      return new Response(JSON.stringify({ object: 'refund', status: 'DONE' }), { status, headers: { 'Content-Type': 'application/json' } });
    }
    // provider-check do webhook (GET /v3/payments/:id) e afins
    if (String(url).includes('/v3/payments/')) {
      return new Response(JSON.stringify({ id: 'pay_refundtest_001', status: 'RECEIVED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 200 });
  });
};

const refundMails = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]).filter((m) => /estorn/i.test(m.subject));
/** Partidas APENAS do estorno executado (exclui o txn da reserva 'refund_reserve_'). */
const refundLegs = (reminderId: string) =>
  prisma.ledgerEntry.findMany({ where: { reminderId, txnId: { startsWith: 'refund_' } }, select: { txnId: true, account: true, debitCents: true, creditCents: true } })
    .then((rows) => rows.filter((e) => !e.txnId.includes('reserve') && !e.txnId.includes('fee')));

/** Mocka o Asaas: refund recusado por SALDO na 1ª chamada, aprovado na 2ª (parcial),
 *  e o GET do pagamento devolve o netValue (líquido = pago − tarifa). */
const mockAsaasSaldoThenNet = (netValue: number) => {
  let refundCalls = 0;
  fetchMock().mockImplementation(async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes('/v3/payments/') && u.endsWith('/refund')) {
      refundCalls += 1;
      if (refundCalls === 1) {
        return new Response(JSON.stringify({ errors: [{ code: 'invalid_value', description: 'Não é possível efetuar o estorno pois não há saldo suficiente.' }] }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ object: 'refund', status: 'DONE', value: netValue }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.includes('/v3/payments/')) {
      return new Response(JSON.stringify({ id: 'pay_refundtest_001', status: 'RECEIVED', value: 5, netValue }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 200 });
  });
};

describe('POST /api/admin/teleconsulta/:id/refund (onda 4)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendPushToUser).mockClear();
    fetchMock().mockReset();
  });

  it('jornada completa: consulta paga scheduled → estorno → refundedAt + cancelled + ledger consome held + notifica AMBOS', async () => {
    const { user, doc, r } = await seedPaidTeleconsulta();
    mockAsaasRefund(200);

    const H = await adminToken();
    const res = await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ledger.posted).toBe(true);

    // Reminder: estornada e encerrada como cancelled (era aberta/scheduled).
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { refundedAt: true, endedAt: true, done: true, teleStatus: true } });
    expect(row?.refundedAt).toBeTruthy();
    expect(row?.endedAt).toBeTruthy();
    expect(row?.done).toBe(true);
    expect(row?.teleStatus).toBe('cancelled');

    // Ledger: refund D held_unrealized 500 / C refund 500 (sem reserva prévia).
    const legs = await refundLegs(r.id);
    expect(legs.some((e) => e.account === 'held_unrealized' && e.debitCents === 500)).toBe(true);
    expect(legs.filter((e) => e.account === 'refund').length).toBe(1);

    // Notificações: push paciente + e-mail paciente e médico.
    await new Promise((r2) => setTimeout(r2, 300)); // notify é fire-and-forget
    expect(vi.mocked(sendPushToUser).mock.calls.length).toBe(1);
    const mails = refundMails();
    expect(mails.some((m) => m.to === user.email)).toBe(true);
    expect(mails.some((m) => m.to === doc.doctor.email)).toBe(true);
  });

  it('com RESERVA prévia (no_show): estorno consome a RESERVA, não a retenção', async () => {
    const ended = new Date();
    const { r } = await seedPaidTeleconsulta({ teleStatus: 'no_show', endedAt: ended });
    await recordTeleconsultaRefundReserve(r.id); // held → reserve 500
    mockAsaasRefund(200);

    const H = await adminToken();
    const res = await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send();
    expect(res.status).toBe(200);

    const legs = await refundLegs(r.id);
    expect(legs.some((e) => e.account === 'reserve' && e.debitCents === 500)).toBe(true);
    expect(legs.some((e) => e.account === 'held_unrealized')).toBe(false);
  });

  it('idempotente: 2º estorno → 409, nada duplicado no ledger', async () => {
    const { r } = await seedPaidTeleconsulta();
    mockAsaasRefund(200);
    const H = await adminToken();
    expect((await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send()).status).toBe(200);
    const again = await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send();
    expect(again.status).toBe(409);
    const refunds = await prisma.ledgerEntry.count({ where: { reminderId: r.id, txnId: { startsWith: 'refund_' } } });
    expect(refunds).toBe(2); // 2 pernas (D+C) de UM único estorno
  });

  it('Asaas RECUSA (500) → 502 e NÃO marca NADA (refundedAt null, sem ledger refund)', async () => {
    const { r } = await seedPaidTeleconsulta();
    mockAsaasRefund(500);
    const H = await adminToken();
    const res = await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send();
    expect(res.status).toBe(502);
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { refundedAt: true, endedAt: true, teleStatus: true } });
    expect(row?.refundedAt).toBeNull();
    expect(row?.endedAt).toBeNull();
    expect(await prisma.ledgerEntry.count({ where: { reminderId: r.id, txnId: { startsWith: 'refund_' } } })).toBe(0);
  });

  it('sem pagamento → 400 (não existe o que estornar)', async () => {
    const { user, patient } = await createUser();
    const r = await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Sem pagar', dueDate: new Date(Date.now() + 3600_000), type: 'teleconsulta', consentAt: new Date(), consultPriceCents: 500, notifyOffsetsMin: [0] },
      select: { id: true },
    });
    const H = await adminToken();
    const res = await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send();
    expect(res.status).toBe(400);
  });

  it('DEGRAU (dono 26/10, caso real R$5): integral recusado por SALDO → estorna o LÍQUIDO automático com taxa transparente', async () => {
    const { user, doc, r } = await seedPaidTeleconsulta(); // 500 cents pagos
    mockAsaasSaldoThenNet(1.51); // tarifa comeu 3,49 → líquido 1,51

    const H = await adminToken();
    const res = await api().post(`/api/admin/teleconsulta/${r.id}/refund`).set(H).send();
    expect(res.status).toBe(200);
    expect(res.body.partial).toBe(true);
    expect(res.body.refundedValueCents).toBe(151);
    expect(res.body.feeCents).toBe(349);

    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { refundedAt: true, teleStatus: true } });
    expect(row?.refundedAt).toBeTruthy();

    // Ledger fecha: estorno PARCIAL (D held 151 / C refund 151) + taxa explícita
    // (D held 349 / C provider_fees 349) — held zera no ponto morto.
    const legs = await refundLegs(r.id);
    expect(legs.some((e) => e.account === 'held_unrealized' && e.debitCents === 151)).toBe(true);
    expect(legs.some((e) => e.account === 'refund' && e.creditCents === 151)).toBe(true);
    const feeLegs = await prisma.ledgerEntry.findMany({ where: { reminderId: r.id, txnId: `refund_fee_${r.id}` }, select: { account: true, debitCents: true, creditCents: true } });
    expect(feeLegs.some((e) => e.account === 'held_unrealized' && e.debitCents === 349)).toBe(true);
    expect(feeLegs.some((e) => e.account === 'provider_fees' && e.creditCents === 349)).toBe(true);
    const held = await prisma.ledgerEntry.aggregate({ where: { reminderId: r.id, account: 'held_unrealized' }, _sum: { creditCents: true, debitCents: true } });
    expect((held._sum.creditCents ?? 0) - (held._sum.debitCents ?? 0)).toBe(0); // ponto morto

    // Notificações com o valor DEVOLVIDO real + tarifa explícita.
    await new Promise((r2) => setTimeout(r2, 300));
    const push = vi.mocked(sendPushToUser).mock.calls[0];
    expect(String(push?.[2])).toContain('1,51');
    expect(String(push?.[2])).toContain('3,49');
    const mails = refundMails();
    expect(mails.some((m) => m.to === user.email)).toBe(true);
    expect(mails.some((m) => m.to === doc.doctor.email)).toBe(true);
  });
});

describe('webhook REFUND_RECEIVED (estorno manual no painel Asaas)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendPushToUser).mockClear();
    fetchMock().mockReset();
  });

  it('estorno no painel → concilia: refundedAt + ledger + aviso; reenvio é no-op', async () => {
    const { r } = await seedPaidTeleconsulta();
    mockAsaasRefund(200);

    const hook = (event: string) => api().post('/api/webhooks/asaas')
      .set('asaas-access-token', 'asaas-test-key')
      .send({ event, payment: { id: 'pay_refundtest_001', value: 5, status: 'REFUNDED' } });

    const r1 = await hook('REFUND_RECEIVED');
    expect(r1.status).toBe(200);
    expect(r1.body.refund).toBe(true);
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { refundedAt: true, teleStatus: true } });
    expect(row?.refundedAt).toBeTruthy();
    expect(row?.teleStatus).toBe('cancelled');
    expect(await prisma.ledgerEntry.count({ where: { reminderId: r.id, txnId: { startsWith: 'refund_' } } })).toBe(2);

    // Reenvio (Asaas repete) → no-op, sem duplicar escrituração.
    const r2 = await hook('REFUND_RECEIVED');
    expect(r2.status).toBe(200);
    expect(await prisma.ledgerEntry.count({ where: { reminderId: r.id, txnId: { startsWith: 'refund_' } } })).toBe(2);
  });

  it('payment desconhecido → 200 ack sem efeito', async () => {
    mockAsaasRefund(200);
    const res = await api().post('/api/webhooks/asaas')
      .set('asaas-access-token', 'asaas-test-key')
      .send({ event: 'REFUND_RECEIVED', payment: { id: 'pay_nao_existe', value: 5, status: 'REFUNDED' } });
    expect(res.status).toBe(200);
    expect(res.body.refund).toBeFalsy();
  });
});
