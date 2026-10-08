// E2E do CARTÃO INLINE (Asaas direto, sem redirect): POST /billing/pay-card.
// ZERO charge real — fetch global 100% mockado (mesmo padrão do billing.test.ts).
// Cobre: aprovação imediata (CONFIRMED → créditos na hora via approvePendingSubscription),
// 3DS/PENDING (+ webhook Asaas aprovando depois), validação server-side (Luhn/validade/
// CPF/CVV), rate limit 3/min por user, DEBIT_CARD, lock de PIX pendente e a regra
// de segurança central: PAN/CVV nunca persistidos nem ecoados.
import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api, authHeader, resetDb, createUser, getUserCredits, testCpf } from './helpers';
import { prisma } from '../src/prisma';
import { resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';

const fetchMock = () => globalThis.fetch as unknown as Mock;

const resp = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});

const VISA_OK = '4111111111111111'; // Luhn-válido (clássico de teste)
const validCard = (over: Record<string, string> = {}) => ({
  number: VISA_OK, holderName: 'ANA SOUZA', expiryMonth: '12', expiryYear: '2030', ccv: '123', ...over,
});
const validHolder = () => ({ name: 'Ana Souza', cpf: testCpf(), postalCode: '01310-100', addressNumber: '100' });

/** Asaas happy-path: customer criado + payment devolvido. */
const asaasOk = (payment: Record<string, unknown>) => [resp({ id: 'cus_abc' }), resp(payment)];

describe('billing/pay-card: cartão inline via Asaas', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(resp({})); // default seguro
  });

  it('cartão válido CONFIRMED → 200 + créditos adicionados na hora (sem webhook)', async () => {
    const { user, token } = await createUser({ credits: 100 });
    asaasOk({ id: 'pay_cc1', status: 'CONFIRMED' }).forEach((r) => fetchMock().mockResolvedValueOnce(r));

    const holder = validHolder();
    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard(), holder });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ paymentId: 'pay_cc1', status: 'CONFIRMED', approved: true, credits: 140 });
    expect(await getUserCredits(user.id)).toBe(240); // 100 + 140

    // Corpo enviado ao Asaas: À VISTA (installmentCount AUSENTE — a API exige
    // installmentValue sempre que o campo vem, mesmo 1x), PAN
    // dígitos, CPF/CEP sem máscara, holder email do próprio usuário autenticado.
    const payBody = JSON.parse(fetchMock().mock.calls[1][1].body);
    expect(payBody.billingType).toBe('CREDIT_CARD');
    expect(payBody.installmentCount).toBeUndefined();
    expect(payBody.creditCard.number).toBe(VISA_OK);
    expect(payBody.creditCard.expiryYear).toBe('2030');
    expect(payBody.creditCardHolder.cpfCnpj).toBe(holder.cpf.replace(/\D/g, ''));
    expect(payBody.creditCardHolder.postalCode).toBe('01310100');

    const sub = await prisma.subscription.findFirst({ where: { userId: user.id } });
    expect(sub?.status).toBe('APPROVED');
    expect(sub?.mpPaymentId).toBe('pay_cc1');
  });

  it('Luhn fail → 400 ANTES de qualquer fetch (validação server-side manda)', async () => {
    const { token } = await createUser();
    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard({ number: '4111111111111112' }), holder: validHolder() });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('cartão');
    expect(fetchMock().mock.calls).toHaveLength(0);
  });

  it('validade vencida e CPF inválido → 400 sem fetch', async () => {
    const { token } = await createUser();
    const r1 = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard({ expiryYear: '2020' }), holder: validHolder() });
    expect(r1.status).toBe(400);
    const r2 = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard(), holder: { ...validHolder(), cpf: '11111111111' } });
    expect(r2.status).toBe(400);
    expect(fetchMock().mock.calls).toHaveLength(0);
  });

  it('Asaas recusa (CVV errado → 400 com errors[]) → mapeado p/ 400 + ordem FAILED', async () => {
    const { user, token } = await createUser();
    fetchMock()
      .mockResolvedValueOnce(resp({ id: 'cus_abc' }))
      .mockResolvedValueOnce(resp({ errors: [{ code: 'invalidCvv', description: 'CVV inválido' }] }, false, 400));

    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard({ ccv: '999' }), holder: validHolder() });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('CVV inválido');
    expect(await getUserCredits(user.id)).toBe(100); // nada creditado
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id } });
    expect(sub?.status).toBe('FAILED');
  });

  it('rate limit: 3 tentativas/min por usuário — a 4ª → 429', async () => {
    const { token } = await createUser();
    const bad = { pack: 'p140', method: 'card', card: validCard({ number: '4111111111111112' }), holder: validHolder() };
    for (let i = 0; i < 3; i++) {
      const r = await api().post('/api/billing/pay-card').set(authHeader(token)).send(bad);
      expect(r.status).toBe(400); // conta como tentativa (cartão ruim também martela o gateway)
    }
    const fourth = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard(), holder: validHolder() });
    expect(fourth.status).toBe(429);
    expect(fourth.body.error).toContain('Aguarde');
  });

  it('PENDING (3DS) → 200 com threeDSUrl, SEM creditar; webhook Asaas aprova depois', async () => {
    const { user, token } = await createUser({ credits: 0 });
    asaasOk({ id: 'pay_3ds', status: 'PENDING', threeDSecureUrl: 'https://asaas.com/3ds/pay_3ds' })
      .forEach((r) => fetchMock().mockResolvedValueOnce(r));

    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard(), holder: validHolder() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'PENDING', approved: false, credits: 140 });
    expect(r.body.threeDSUrl).toContain('3ds');
    expect(await getUserCredits(user.id)).toBe(0); // ainda nada
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id } });
    expect(sub?.status).toBe('PENDING');
    expect(sub?.mpPaymentId).toBe('pay_3ds'); // webhook casa por aqui

    // Webhook PAYMENT_RECEIVED do Asaas fecha o ciclo (pixCredits persistido na compra).
    // Verificação server-side do webhook: GET /v3/payments/pay_3ds → RECEIVED no provider.
    fetchMock().mockResolvedValueOnce(resp({ id: 'pay_3ds', value: 24.9, status: 'RECEIVED' }));
    await api().post('/api/webhooks/asaas').send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_3ds', value: 24.9, status: 'RECEIVED' } });
    expect(await getUserCredits(user.id)).toBe(140);
    const after = await prisma.subscription.findFirst({ where: { userId: user.id } });
    expect(after?.status).toBe('APPROVED');
  });

  it('method=debit → billingType DEBIT_CARD (mesma estrutura de campos)', async () => {
    const { token } = await createUser();
    asaasOk({ id: 'pay_db1', status: 'CONFIRMED' }).forEach((r) => fetchMock().mockResolvedValueOnce(r));
    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p50', method: 'debit', card: validCard(), holder: validHolder() });
    expect(r.status).toBe(200);
    expect(JSON.parse(fetchMock().mock.calls[1][1].body).billingType).toBe('DEBIT_CARD');
  });

  it('PIX pendente vivo → 409 com o QR (lock 1-por-vez vale p/ cartão), zero fetch', async () => {
    const { user, token } = await createUser();
    const sub = await prisma.subscription.create({ data: { userId: user.id, amount: 24.9, periodDays: 0, status: 'PENDING' } });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { mpPaymentId: 'pay-vivo', pixQrCode: 'PIXVIVO', pixQrBase64: 'data:image/png;base64,AA==', pixExpiresAt: new Date(Date.now() + 5 * 60_000), pixCredits: 140 },
    });
    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard(), holder: validHolder() });
    expect(r.status).toBe(409);
    expect(r.body.pendingPix.qrCode).toBe('PIXVIVO');
    expect(fetchMock().mock.calls).toHaveLength(0);
  });

  it('SEGURANÇA: PAN/CVV nunca persistidos nem ecoados (só ****últimos4 em log)', async () => {
    const { user, token } = await createUser();
    asaasOk({ id: 'pay_cc9', status: 'CONFIRMED' }).forEach((r) => fetchMock().mockResolvedValueOnce(r));
    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ pack: 'p140', method: 'card', card: validCard({ ccv: '733' }), holder: validHolder() });
    expect(r.status).toBe(200);
    // resposta não ecoa PAN/CVV
    expect(JSON.stringify(r.body)).not.toContain(VISA_OK);
    expect(JSON.stringify(r.body)).not.toContain('733');
    // banco não persiste PAN/CVV em nenhuma coluna da ordem
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id } });
    expect(JSON.stringify(sub)).not.toContain(VISA_OK);
    expect(JSON.stringify(sub)).not.toContain('"ccv"');
  });

  // 05/10 (urgente, dono): assinatura PREMIUM pelo cartão inline — {plan:'monthly'} em
  // vez de pack. Aprova como PLANO (periodDays 30 + créditos mensais), não como créditos.
  it('plan monthly CONFIRMED → aprova PLANO 30d com créditos mensais', async () => {
    const { user, token } = await createUser({ credits: 0 });
    asaasOk({ id: 'pay_plan1', status: 'CONFIRMED' }).forEach((r) => fetchMock().mockResolvedValueOnce(r));

    const r = await api().post('/api/billing/pay-card').set(authHeader(token))
      .send({ plan: 'monthly', method: 'card', card: validCard(), holder: validHolder() });
    expect(r.status).toBe(200);
    expect(r.body.approved).toBe(true);
    expect(r.body.plan).toBe(true);

    // Ordem: periodDays 30 (marca de PLANO pros webhooks) + SEM externalReference de pack.
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(sub?.status).toBe('APPROVED');
    expect(sub?.periodDays).toBe(30);
    expect(sub?.mpPaymentId).toBe('pay_plan1');
    // usuário virou PREMIUM (planExpiresAt no futuro) + créditos mensais creditados
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { planExpiresAt: true, credits: true } });
    expect(u?.planExpiresAt && u.planExpiresAt > new Date()).toBe(true);
    expect(u?.credits).toBeGreaterThan(0);
    // cobrança no preço do plano (settings), não de pack
    const payBody = JSON.parse(fetchMock().mock.calls[1][1].body);
    expect(payBody.value).toBeCloseTo(Number(payBody.value), 2);
    expect(payBody.description).toContain('Premium');
    expect(payBody.externalReference).not.toContain('|');
  });
});
