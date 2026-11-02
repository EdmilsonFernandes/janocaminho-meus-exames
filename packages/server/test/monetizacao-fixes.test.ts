// Correções da investigação de funil/receita 31/10 (relatório "Funil e Receita Dr. Exame"):
// B1 — FAILED não consome o 1º exame grátis + estorno do upload + PaywallHit no 402 de upload.
// B2 — /checkout sem PENDING órfão + varredura cobre PENDING sem pixExpiresAt.
// B3/E1 — /plans expõe pixEnabled/signupBonus; /status expõe firstExamBonusGranted.
import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, getUserCredits, mpResponse } from './helpers';
import { prisma } from '../src/prisma';
import { refundUploadOnFailure } from '../src/utils/credits';
import { cancelStalePendingPixes } from '../src/jobs/pix-expiry';
import { createSubscriptionCompat, resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';

const fetchMock = () => globalThis.fetch as unknown as Mock;
const PDF = Buffer.from('%PDF-1.4 mock exam content');

describe('B1 — exame FAILED não consome o "1º exame grátis" + estorno de upload', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
  });

  it('upload após 1º exame FAILED continua grátis (antes: 402 com saldo 0)', async () => {
    const { patient, token } = await createUser({ credits: 0 });
    await createExam(patient.id, { status: 'FAILED' });
    const up = await api().post('/api/exams').set(authHeader(token)).attach('file', PDF, 'exame2.pdf');
    expect(up.status).toBe(201);
  });

  it('402 de upload grava PaywallHit (feature UPLOAD) — era invisível no admin', async () => {
    const { user, patient, token } = await createUser({ credits: 0 });
    await createExam(patient.id, { status: 'EXTRACTED' }); // 1º grátis já consumido de verdade
    const up = await api().post('/api/exams').set(authHeader(token)).attach('file', PDF, 'exame2.pdf');
    expect(up.status).toBe(402);
    expect(up.body.error).toBe('no_credits_upload');
    await new Promise((r) => setTimeout(r, 200)); // logPaywallHit é fire-and-forget
    const hit = await prisma.paywallHit.findFirst({ where: { userId: user.id, feature: 'UPLOAD' } });
    expect(hit).toBeTruthy();
    expect(hit?.balance).toBe(0);
  });

  it('refundUploadOnFailure devolve o débito do upload 1x só (idempotente)', async () => {
    const { user, patient } = await createUser({ credits: 4 });
    const exam = await createExam(patient.id, { status: 'FAILED' });
    await prisma.creditTransaction.create({ data: { userId: user.id, delta: -1, kind: 'upload', label: 'Envio de exame', refId: exam.id } });
    await refundUploadOnFailure(exam.id);
    expect(await getUserCredits(user.id)).toBe(5);
    const refunds1 = await prisma.creditTransaction.findMany({ where: { refId: exam.id, kind: 'upload_refund' } });
    expect(refunds1).toHaveLength(1);

    await refundUploadOnFailure(exam.id); // re-run (retry do pipeline) não dobra o estorno
    expect(await getUserCredits(user.id)).toBe(5);
    const refunds2 = await prisma.creditTransaction.findMany({ where: { refId: exam.id, kind: 'upload_refund' } });
    expect(refunds2).toHaveLength(1);
  });

  it('upload que foi grátis (sem débito no ledger) não gera estorno', async () => {
    const { user, patient } = await createUser({ credits: 7 });
    const exam = await createExam(patient.id, { status: 'FAILED' });
    await refundUploadOnFailure(exam.id);
    expect(await getUserCredits(user.id)).toBe(7);
    expect(await prisma.creditTransaction.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('B2 — checkout sem PENDING órfão + varredura de pendências sem pixExpiresAt', () => {
  beforeEach(async () => {
    await resetDb();
    resetSubscriptionColumnsCacheForTests();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
  });

  it('/billing/checkout marca a sub FAILED quando a preferência MP falha (não deixa PENDING)', async () => {
    const { user, token } = await createUser();
    fetchMock().mockResolvedValueOnce(mpResponse({ error: 'mp down' }, { ok: false, status: 500 }));
    const r = await api().post('/api/billing/checkout').set(authHeader(token));
    expect(r.status).toBe(502);
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, select: { status: true } });
    expect(sub?.status).toBe('FAILED');
  });

  it('sweep cancela PENDING >24h SEM pixExpiresAt (checkout premium/cartão abandonado)', async () => {
    const { user } = await createUser();
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 29.9, periodDays: 30, status: 'PENDING' });
    await prisma.subscription.update({ where: { id: sub.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    const n = await cancelStalePendingPixes();
    expect(n).toBeGreaterThanOrEqual(1);
    const after = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(after?.status).toBe('CANCELLED');
  });

  it('sweep NÃO toca em PENDING recente (<24h) sem pixExpiresAt', async () => {
    const { user } = await createUser();
    const sub = await createSubscriptionCompat({ userId: user.id, amount: 29.9, periodDays: 30, status: 'PENDING' });
    await cancelStalePendingPixes();
    const after = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(after?.status).toBe('PENDING');
  });
});

describe('B3/E1 — gates e bônus expostos pro front', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
  });

  it('/billing/plans expõe pixEnabled (gate do pack sem MP) e signupBonus', async () => {
    const r = await api().get('/api/billing/plans');
    expect(r.status).toBe(200);
    expect(typeof r.body.pixEnabled).toBe('boolean');
    expect(r.body.signupBonus).toBeGreaterThan(0);
  });

  it('/billing/status expõe firstExamBonusGranted (promessa do 🎁 só enquanto é real)', async () => {
    const { token } = await createUser();
    const r = await api().get('/api/billing/status').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.firstExamBonusGranted).toBe(false);
  });
});
