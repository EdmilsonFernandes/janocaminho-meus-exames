// CUPONS DE DESCONTO NO CHECKOUT (T3 insights Conexa, 28/10/26) — E2E:
// admin cria → validate (ok/inválido/expirado/esgotado/já-usado) → checkout com cupom
// gera cobrança com valor FINAL menor (assert no payload do provedor mock) → webhook
// confirma → uses incrementa + CouponRedemption criada (idempotente).
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { api, authHeader, resetDb, createUser, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import { resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';

const fetchMock = () => globalThis.fetch as unknown as Mock;

/** Cria user ADMIN logado (mesmo padrão admin-credits.test.ts). */
async function createAdmin(): Promise<{ id: string; token: string }> {
  const { user, token } = await createUser({ role: 'ADMIN' });
  return { id: user.id, token };
}

const adminPost = (token: string, body: unknown) =>
  api().post('/api/admin/coupons').set(authHeader(token)).send(body as any);

/** POST /billing/buy-credits PIX com fetch do MP mockado (mesmo shape do billing.test). */
const mockPixCreated = (id = 'payC1', qr = 'CUPOMQR') =>
  fetchMock().mockResolvedValueOnce(mpResponse({
    id, status: 'pending',
    point_of_interaction: { transaction_data: { qr_code: qr, qr_code_base64: 'AA==' } },
  }));

describe('coupons: admin CRUD, validate e aplicação no checkout', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro
  });

  // ===== ADMIN CRUD =====
  it('admin cria cupom (normaliza código) · duplicado 409 · não-admin 403', async () => {
    const admin = await createAdmin();
    const { token: plebe } = await createUser();

    const r = await adminPost(admin.token, { code: 'Lancamento 5', kind: 'fixed_cents', value: 500, notes: 'founder' });
    expect(r.status).toBe(201);
    expect(r.body.coupon.code).toBe('LANCAMENTO5');
    expect(r.body.coupon.active).toBe(true);

    const dup = await adminPost(admin.token, { code: 'lancamento5', kind: 'percent', value: 10 });
    expect(dup.status).toBe(409);

    const forbidden = await adminPost(plebe, { code: 'X', kind: 'percent', value: 10 });
    expect(forbidden.status).toBe(403);
  });

  it('admin valida payload: kind inválido, percent >100 e maxUses 0 → 400', async () => {
    const admin = await createAdmin();
    expect((await adminPost(admin.token, { code: 'A1', kind: 'mega', value: 10 })).status).toBe(400);
    expect((await adminPost(admin.token, { code: 'A2', kind: 'percent', value: 150 })).status).toBe(400);
    expect((await adminPost(admin.token, { code: 'A3', kind: 'percent', value: 10, maxUses: 0 })).status).toBe(400);
  });

  it('PATCH desativa cupom (audit) → validate cai em 404', async () => {
    const admin = await createAdmin();
    const created = await adminPost(admin.token, { code: 'PROMO', kind: 'percent', value: 10 });
    const { token } = await createUser();

    const before = await api().post('/api/billing/coupon/validate').set(authHeader(token))
      .send({ code: 'PROMO', kind: 'credits', amountCents: 2490 });
    expect(before.status).toBe(200);

    const off = await api().patch(`/api/admin/coupons/${created.body.coupon.id}`).set(authHeader(admin.token)).send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.coupon.active).toBe(false);

    const after = await api().post('/api/billing/coupon/validate').set(authHeader(token))
      .send({ code: 'PROMO', kind: 'credits', amountCents: 2490 });
    expect(after.status).toBe(404);
    expect(after.body.error).toBe('Cupom inválido ou expirado.');
  });

  // ===== VALIDATE =====
  it('validate: fixed e percent calculam desconto/final corretos', async () => {
    const admin = await createAdmin();
    await adminPost(admin.token, { code: 'MENOS5', kind: 'fixed_cents', value: 500 });
    await adminPost(admin.token, { code: 'VIPCUPOM', kind: 'percent', value: 25 });
    const { token } = await createUser();

    const fixed = await api().post('/api/billing/coupon/validate').set(authHeader(token))
      .send({ code: 'menos 5', kind: 'credits', amountCents: 2490 }); // normaliza acento/espaço
    expect(fixed.status).toBe(200);
    expect(fixed.body.discountCents).toBe(500);
    expect(fixed.body.finalCents).toBe(1990);

    const pct = await api().post('/api/billing/coupon/validate').set(authHeader(token))
      .send({ code: 'VIPCUPOM', kind: 'credits', amountCents: 2000 });
    expect(pct.status).toBe(200);
    expect(pct.body.discountCents).toBe(500); // floor(2000*25/100)
    expect(pct.body.finalCents).toBe(1500);
  });

  it('validate: expirado 404 · esgotado 410 · aplica a outro produto 404 · desconto total 400', async () => {
    const admin = await createAdmin();
    await adminPost(admin.token, { code: 'VELHO', kind: 'percent', value: 10, expiresAt: new Date(Date.now() - 86400000).toISOString() });
    await adminPost(admin.token, { code: 'UNICO', kind: 'percent', value: 10, maxUses: 1 });
    await prisma.coupon.update({ where: { code: 'UNICO' }, data: { uses: 1 } });
    await adminPost(admin.token, { code: 'SOMENTEPLANO', kind: 'percent', value: 10, appliesTo: 'plan_monthly' });
    await adminPost(admin.token, { code: 'GRATIS', kind: 'fixed_cents', value: 999999 });
    const { token } = await createUser();

    const expired = await api().post('/api/billing/coupon/validate').set(authHeader(token)).send({ code: 'VELHO', kind: 'credits', amountCents: 2490 });
    expect(expired.status).toBe(404);

    const soldOut = await api().post('/api/billing/coupon/validate').set(authHeader(token)).send({ code: 'UNICO', kind: 'credits', amountCents: 2490 });
    expect(soldOut.status).toBe(410);
    expect(soldOut.body.error).toBe('Cupom esgotado.');

    const wrongKind = await api().post('/api/billing/coupon/validate').set(authHeader(token)).send({ code: 'SOMENTEPLANO', kind: 'credits', amountCents: 2490 });
    expect(wrongKind.status).toBe(404);

    const full = await api().post('/api/billing/coupon/validate').set(authHeader(token)).send({ code: 'GRATIS', kind: 'credits', amountCents: 2490 });
    expect(full.status).toBe(400);
  });

  // ===== E2E: checkout com cupom → cobrança menor → webhook credita + redime =====
  it('buy-credits (PIX) com cupom: MP recebe valor FINAL · webhook aprova → uses+1 e Redemption', async () => {
    const admin = await createAdmin();
    await adminPost(admin.token, { code: 'LANCAMENTO5', kind: 'fixed_cents', value: 500, notes: 'founder' });
    const { token, user } = await createUser();

    const plansResp = await api().get('/api/billing/plans');
    const pack = plansResp.body.creditPacks.find((p: any) => p.id === 'p140');
    expect(pack).toBeTruthy();
    const baseCents = Math.round(Number(pack.price) * 100);
    const finalCents = baseCents - 500;

    // Pré-visualização ANTES de pagar (o front chama isso no campo "Cupom").
    const preview = await api().post('/api/billing/coupon/validate').set(authHeader(token))
      .send({ code: 'lancamento5', kind: 'credits', amountCents: baseCents });
    expect(preview.status).toBe(200);
    expect(preview.body.finalCents).toBe(finalCents);

    mockPixCreated('payC1', 'CUPOMQR');
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'pix', couponCode: 'LANCAMENTO5' });
    expect(r.status).toBe(200);
    expect(r.body.qrCode).toBe('CUPOMQR');
    expect(r.body.discountCents).toBe(500);
    expect(r.body.price).toBe(finalCents / 100);

    // A cobrança vai pro provedor JÁ com o valor final (assert no payload do MP).
    const payCall = fetchMock().mock.calls.find((c) => String(c[0]).includes('/v1/payments'));
    expect(payCall).toBeTruthy();
    expect(JSON.parse(payCall![1].body).transaction_amount).toBe(finalCents / 100);

    // Cupom gravado na Subscription p/ o webhook redimir na aprovação.
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(sub?.couponCode).toBe('LANCAMENTO5');
    expect(sub?.couponDiscountCents).toBe(500);

    // Webhook aprova → créditos + uses incrementa + Redemption criada.
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub!.id}|140` }));
    const wh = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'payC1' } });
    expect(wh.status).toBe(200);

    const coupon = await prisma.coupon.findUnique({ where: { code: 'LANCAMENTO5' } });
    expect(coupon?.uses).toBe(1);
    const redemption = await prisma.couponRedemption.findUnique({
      where: { couponId_userId_kind: { couponId: coupon!.id, userId: user.id, kind: 'credits' } },
    });
    expect(redemption).toBeTruthy();
    expect(redemption!.discountCents).toBe(500);
    expect(redemption!.amountCentsOriginal).toBe(baseCents);
    expect(await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } })).toEqual({ credits: 100 + 140 });

    // Webhook reenviado = idempotente (não credita nem redime 2x).
    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub!.id}|140` }));
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'payC1' } });
    expect((await prisma.coupon.findUnique({ where: { code: 'LANCAMENTO5' } }))?.uses).toBe(1);
    expect(await prisma.couponRedemption.count()).toBe(1);

    // Depois de redimido: mesmo usuário → 409 no validate e no novo checkout.
    const again = await api().post('/api/billing/coupon/validate').set(authHeader(token))
      .send({ code: 'LANCAMENTO5', kind: 'credits', amountCents: baseCents });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Você já usou este cupom.');
  });

  it('buy-credits (PIX) SEM pagar NÃO consome cupom; cupom ruim aborta o checkout ANTES do provedor', async () => {
    const admin = await createAdmin();
    await adminPost(admin.token, { code: 'BEMVINDO', kind: 'percent', value: 10 });
    const { token } = await createUser();

    // Cupom inexistente → 404 e NENHUMA chamada a provedor (não cria charge).
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
    const bad = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'pix', couponCode: 'NAOEXISTE' });
    expect(bad.status).toBe(404);
    expect(fetchMock().mock.calls).toHaveLength(0);

    // PIX criado com cupom mas NÃO pago → uses segue 0 (redime só na aprovação).
    mockPixCreated('payN', 'QR');
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ pack: 'p140', method: 'pix', couponCode: 'BEMVINDO' });
    expect(r.status).toBe(200);
    const c = await prisma.coupon.findUnique({ where: { code: 'BEMVINDO' } });
    expect(c?.uses).toBe(0);
    expect(await prisma.couponRedemption.count()).toBe(0);
  });

  it('plano mensal (PIX) com cupom percent: valor final no provedor; cupom credits-only recusado', async () => {
    const admin = await createAdmin();
    await adminPost(admin.token, { code: 'FOUNDER20', kind: 'percent', value: 20, appliesTo: 'plan_monthly' });
    await adminPost(admin.token, { code: 'SO_credito', kind: 'percent', value: 20, appliesTo: 'credits' });
    const { token } = await createUser();

    const plansResp = await api().get('/api/billing/plans');
    const base = Math.round(Number(plansResp.body.plans[0].effectivePrice) * 100);
    const finalCents = base - Math.floor((base * 20) / 100);

    // appliesTo credits no plano → 404 (não vaza que o cupom existe).
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
    const wrong = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ plan: 'monthly', method: 'pix', couponCode: 'SO_credito' });
    expect(wrong.status).toBe(404);
    expect(fetchMock().mock.calls).toHaveLength(0);

    mockPixCreated('payPlan', 'PLANQR');
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ plan: 'monthly', method: 'pix', couponCode: 'FOUNDER20' });
    expect(r.status).toBe(200);
    expect(r.body.plan).toBe(true);
    expect(r.body.discountCents).toBe(Math.floor((base * 20) / 100));
    expect(r.body.price).toBe(finalCents / 100);

    const payCall = fetchMock().mock.calls.find((c) => String(c[0]).includes('/v1/payments'));
    expect(JSON.parse(payCall![1].body).transaction_amount).toBe(finalCents / 100);
  });

  it('relatório avulso NÃO aceita cupom (produto único)', async () => {
    const admin = await createAdmin();
    await adminPost(admin.token, { code: 'REL5', kind: 'fixed_cents', value: 500 });
    const { token } = await createUser();

    mockPixCreated('payR', 'RQR');
    const r = await api().post('/api/billing/buy-credits').set(authHeader(token))
      .send({ product: 'report', couponCode: 'REL5' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('não se aplica');
  });
});
