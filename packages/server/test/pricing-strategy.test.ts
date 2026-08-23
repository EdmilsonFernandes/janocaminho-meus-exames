import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser, createExam, createItem, api, authHeader, mpResponse, testCpf } from './helpers';
import { createSubscriptionCompat, resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';
import { loadSettings, getEffectivePlanPrice } from '../src/utils/settings';

const fetchMock = () => globalThis.fetch as unknown as Mock;

/**
 * Estratégia de pricing configurável (2026-08-23) — docs/PRICING_AUDITORIA_E_CENARIOS.md
 * Cobre: preço/packs vindos do settings, perk consolidado grátis p/ premium, limite familiar
 * premium, promo fundador (preço, contador de vagas, esgotamento) e validações do admin.
 */
describe('pricing strategy: plano configurável + perks + fundador', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro p/ fetch (MP/IA)
    await loadSettings(); // repõe defaults (resetDb truncou app_settings; cache sincroniza)
  });

  const adminPatch = async (body: any) => {
    const { mintToken } = await import('./helpers');
    const u = await prisma.user.create({ data: { email: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.com`, name: 'Admin', passwordHash: 'x', role: 'ADMIN', credits: 0 } });
    return api().patch('/api/admin/config/costs').set(authHeader(mintToken(u.id))).send(body);
  };

  it('A/S8) admin muda o preço do plano → /billing/plans reflete na hora', async () => {
    const before = await api().get('/api/billing/plans');
    expect(before.body.plans[0].price).toBe(19.9); // default

    const r = await adminPatch({ category: 'plans', value: { monthly: { price: 29.9, periodDays: 30, label: 'Mensal' } } });
    expect(r.status).toBe(200);

    const after = await api().get('/api/billing/plans');
    expect(after.body.plans[0].price).toBe(29.9);
    expect(after.body.plans[0].effectivePrice).toBe(29.9);
    expect(after.body.founder).toBeNull(); // promo desligada por default
  });

  it('F6) admin NÃO aceita preço inválido (0/negativo) nem pack sem créditos', async () => {
    expect((await adminPatch({ category: 'plans', value: { monthly: { price: 0, periodDays: 30, label: 'Mensal' } } })).status).toBe(400);
    expect((await adminPatch({ category: 'creditPacks', value: [{ id: 'x', credits: 0, price: 10, label: 'X', popular: false }] })).status).toBe(400);
    expect((await adminPatch({ category: 'nadaaver', value: {} })).status).toBe(400);
  });

  it('S2) webhook mensal concede os créditos do SETTINGS (não hardcode)', async () => {
    await adminPatch({ category: 'plans', value: { monthly: { price: 29.9, periodDays: 30, label: 'Mensal' } } });
    await adminPatch({ category: 'grants', monthly: 300 });

    const { user } = await createUser({ credits: 0 });
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 29.9, periodDays: 30, status: 'PENDING' });
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: sub.id }));

    const r = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay1' } });
    expect(r.status).toBe(200);
    expect(await getUserCreditsSafe(user.id)).toBe(300); // settings, não 250 fixo
  });

  it('S5) premium gera relatório consolidado SEM débito (perk consolidatedFree)', async () => {
    const { user, patient, token } = await createUser({ credits: 77, premium: true });
    const e = await createExam(patient.id, { sha: 'pc1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });

    const r = await api().post(`/api/analyses/consolidated`).set(authHeader(token)).send({ patientId: patient.id });
    expect([200, 201]).toContain(r.status);
    expect(await getUserCreditsSafe(user.id)).toBe(77); // nada debitado
  });

  it('S5-off) perk desligado no admin → premium volta a pagar créditos', async () => {
    await adminPatch({ category: 'premium', value: { consolidatedFree: 0, familyLimit: 10 } });
    const { user, patient, token } = await createUser({ credits: 77, premium: true });
    const e = await createExam(patient.id, { sha: 'pc2' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });

    const r = await api().post(`/api/analyses/consolidated`).set(authHeader(token)).send({ patientId: patient.id });
    expect([200, 201]).toContain(r.status);
    expect(await getUserCreditsSafe(user.id)).toBe(57); // 77 - 20
  });

  it('S7) premium cria dependentes até o limite do plano; free para no 4º com 402', async () => {
    await adminPatch({ category: 'premium', value: { consolidatedFree: 1, familyLimit: 6 } });
    const { user, patient, token } = await createUser({ credits: 0 }); // free sem saldo; patient = titular (1)
    // free: titular(1) + 3 = 4 → 5º perfil exige créditos (sem saldo → 402). CPFs ÚNICOS (hash global).
    for (let i = 0; i < 3; i++) {
      const r = await api().post('/api/patients').set(authHeader(token)).send({ fullName: `Filho ${i}`, cpf: testCpf(100 + i) });
      expect(r.status).toBe(201);
    }
    const blocked = await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Quinto', cpf: testCpf(200) });
    expect(blocked.status).toBe(402);

    // premium: limite 6 → mais 2 perfis entram (total 6), o 7º bloqueia com 402
    await prisma.user.update({ where: { id: user.id }, data: { planExpiresAt: new Date(Date.now() + 30 * 86400000) } });
    expect((await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Quinto', cpf: testCpf(200) })).status).toBe(201);
    expect((await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Sexto', cpf: testCpf(201) })).status).toBe(201);
    expect((await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Sétimo', cpf: testCpf(202) })).status).toBe(402);
    void patient;
  });

  it('S11) fundador ligado → preço efetivo é o promocional e /plans expõe as vagas', async () => {
    await adminPatch({ category: 'plans', value: { monthly: { price: 29.9, periodDays: 30, label: 'Mensal' } } });
    await adminPatch({ category: 'founder', value: { enabled: 1, price: 19.9, limit: 2, used: 0 } });

    const plans = await api().get('/api/billing/plans');
    expect(plans.body.plans[0].effectivePrice).toBe(19.9);
    expect(plans.body.plans[0].founder).toBe(true);
    expect(plans.body.founder).toMatchObject({ price: 19.9, remaining: 2 });
  });

  it('S12/B3) aprovação no preço fundador consome vaga; esgotado, volta ao preço cheio', async () => {
    await adminPatch({ category: 'plans', value: { monthly: { price: 29.9, periodDays: 30, label: 'Mensal' } } });
    await adminPatch({ category: 'founder', value: { enabled: 1, price: 19.9, limit: 1, used: 0 } });

    // 1ª aprovação no preço fundador → vaga consumida
    const u1 = await createUser({ credits: 0 });
    const s1 = await createSubscriptionCompat({ userId: u1.user.id, amount: 19.9, periodDays: 30, status: 'PENDING' });
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: s1.id }));
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pf1' } });

    await loadSettings();
    expect(getEffectivePlanPrice()).toMatchObject({ price: 29.9, founder: false }); // esgotou

    const plans = await api().get('/api/billing/plans');
    expect(plans.body.founder).toBeNull();
    expect(plans.body.plans[0].effectivePrice).toBe(29.9);
  });

  it('F2/B4) aprovação no preço CHEIO não consome vaga de fundador', async () => {
    await adminPatch({ category: 'plans', value: { monthly: { price: 29.9, periodDays: 30, label: 'Mensal' } } });
    await adminPatch({ category: 'founder', value: { enabled: 1, price: 19.9, limit: 5, used: 0 } });

    const u = await createUser({ credits: 0 });
    const s = await createSubscriptionCompat({ userId: u.user.id, amount: 29.9, periodDays: 30, status: 'PENDING' }); // preço cheio
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: s.id }));
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pf2' } });

    const plans = await api().get('/api/billing/plans');
    expect(plans.body.founder.remaining).toBe(5); // intacta
  });
});

async function getUserCreditsSafe(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u?.credits ?? 0;
}
