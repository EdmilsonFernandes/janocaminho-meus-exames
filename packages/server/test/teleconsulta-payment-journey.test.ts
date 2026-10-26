// E2E (supertest) — A JORNADA DO PIX DE CONSULTA PARTICULAR, costurada de ponta a
// ponta (dono 26/10, TDD): "pagou → consulta foi aberta" — o fio que faltava provado
// NUM fluxo só, com o LEDGER validando cada degrau:
//   1. consulta com preço, paciente tenta entrar SEM pagar → 402 PAYMENT_REQUIRED
//   2. gera PIX (MP mockado) → paymentId + QR + Subscription PENDING
//   3. webhook aprova → paidAt + ledger: D patient_received / C held_unrealized
//   4. MESMO paciente entra de novo → 200 com token (A CONSULTA ABRIU)
//   5. consulta acontece (presença dos dois) → /end completed
//   6. ledger completion: 80% doctor_payable + 20% platform_revenue (regra vigente)
// Desfechos negativos (reserva/estorno) ficam no teleconsulta-refund.test.ts.
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => ({ name: 'mock-room' })),
}));

import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader, mpResponse } from './helpers';

const fetchMock = () => globalThis.fetch as unknown as Mock;
const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
let seedSeq = 0;

/** Consulta particular VENCIDA (janela de entrada aberta) criada pelo médico, com consent. */
async function seedJourney(priceCents = 20000) {
  const { user, patient, token } = await createUser();
  const crm = `${71000 + (seedSeq++ % 900)}-SP`;
  const { token: docToken, doctor } = await createDoctor({ crm });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Jornada PIX',
      dueDate: new Date(Date.now() - 5 * 60_000), type: 'teleconsulta',
      consentAt: new Date(), notifyOffsetsMin: [0],
      provider: 'livekit', roomName: 't-journey-pix',
      consultPriceCents: priceCents, teleStatus: 'scheduled',
      createdByDoctorId: doctor.id,
    } as any,
    select: { id: true },
  });
  return { user, patient, token, docToken, doctor, r, priceCents };
}

/** Presença auditada dos DOIS papéis (fonte do jointMs do /end). */
async function seedBothJoins(reminderId: string) {
  for (const role of ['patient', 'doctor'] as const) {
    await prisma.auditLog.create({
      data: {
        actorType: role === 'doctor' ? 'DOCTOR' : 'USER', action: 'TELECONSULTA_JOIN',
        targetType: 'REMINDER', targetId: reminderId,
        after: { role, reminderId } as any,
        createdAt: new Date(Date.now() - 6 * 60_000),
      },
    });
  }
}

const legs = (reminderId: string, prefix: string) =>
  prisma.ledgerEntry.findMany({ where: { reminderId, txnId: { startsWith: prefix } }, select: { account: true, debitCents: true, creditCents: true } });

describe('JORNADA: PIX pago → consulta aberta → honorários (fio completo)', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro
  });

  it('402 sem pagar → PIX → webhook aprova → join LIBERA → consulta completa → ledger 80/20', async () => {
    const { user, token, docToken, r, priceCents } = await seedJourney(20000);

    // 1) Sem pagar: a porta está TRANCADA (regra §2 do lifecycle).
    const blocked = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('PAYMENT_REQUIRED');

    // 2) Gera a cobrança PIX (provider MP mockado — mesma regra do app).
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 'pay_journey_1', point_of_interaction: { transaction_data: { qr_code: 'PIX-JOURNEY', qr_code_base64: 'BB' } } }));
    const charge = await api().post(`/api/billing/teleconsulta/${r.id}`).set(authHeader(token));
    expect(charge.status).toBe(200);
    expect(charge.body.paymentId).toBe('pay_journey_1');
    expect(charge.body.priceCents).toBe(priceCents);

    // 3) Webhook aprova o pagamento → paidAt + partidas duplas de RECEBIDO/RETIDO.
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(sub?.mpPreferenceId).toBe(`teleconsulta_${r.id}`);
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub!.id}|0|TELE:${r.id}` }));
    const wh = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay_journey_1' } });
    expect(wh.status).toBe(200);

    const paid = await prisma.reminder.findUnique({ where: { id: r.id }, select: { paidAt: true, paymentRef: true } });
    expect(paid?.paidAt).toBeTruthy();
    expect(paid?.paymentRef).toBe('pay_journey_1');
    const payLegs = await legs(r.id, 'payment_');
    expect(payLegs.some((e) => e.account === 'patient_received' && e.debitCents === priceCents)).toBe(true);
    expect(payLegs.some((e) => e.account === 'held_unrealized' && e.creditCents === priceCents)).toBe(true);

    // 4) A PORTA ABRIU: mesmo join que deu 402 agora entra (a promessa da jornada).
    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(200);
    expect(join.body.token || join.body.joinUrl || join.body.roomName).toBeTruthy();

    // 5) Consulta acontece: presença conjunta + encerramento como completed.
    await seedBothJoins(r.id);
    const end = await api().post(`/api/teleconsulta/${r.id}/end`).set(H2(docToken)).send({});
    expect(end.status).toBe(200);
    expect(end.body.teleStatus).toBe('completed');

    // 6) Ledger da conclusão: 80% honorários + 20% plataforma (regra vigente 20/80).
    const done = await legs(r.id, 'completion_');
    expect(done.some((e) => e.account === 'doctor_payable' && e.creditCents === Math.round(priceCents * 0.8))).toBe(true);
    expect(done.some((e) => e.account === 'platform_revenue' && e.creditCents === Math.round(priceCents * 0.2))).toBe(true);
    expect(done.some((e) => e.account === 'held_unrealized' && e.debitCents === priceCents)).toBe(true);
  });

  it('PIX pendente NÃO abre a porta (402 persiste até o webhook bater)', async () => {
    const { token, r } = await seedJourney(5000);
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 'pay_journey_2', point_of_interaction: { transaction_data: { qr_code: 'PIX-2', qr_code_base64: 'BB' } } }));
    const charge = await api().post(`/api/billing/teleconsulta/${r.id}`).set(authHeader(token));
    expect(charge.status).toBe(200);
    // Gerou o QR mas NINGUÉM pagou: join segue 402 (charge ≠ pagamento).
    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(402);
    expect(join.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('consulta SEM preço nunca trancou: join direto (regra de quem não cobra)', async () => {
    const { token, r } = await seedJourney(null as any);
    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(200);
  });
});
