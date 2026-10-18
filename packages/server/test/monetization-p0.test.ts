import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser, createExam, createItem, api, authHeader, mpResponse, testCpf } from './helpers';
import { loadSettings } from '../src/utils/settings';

const fetchMock = () => globalThis.fetch as unknown as Mock;

/**
 * Monetização P0 (auditoria 18/10/2026) — docs/research/2026-10-18-monetizacao-funil-auditoria.md
 * Cobertura nova:
 *  - PAYWALL HIT: 402 registra quem tentou usar IA sem saldo (antes invisível pro admin).
 *  - VOUCHER do relatório avulso: consome antes dos créditos, aparece no extrato.
 *  - TRIAL de resgate: 7d premium p/ quem já usou IA 3+ vezes, 1x na vida.
 *  - CAP dos desafios mensais: créditos do mês não formam poupança infinita.
 *  - ORIGEM do cadastro (acquisitionSource) e AUDIT da deleção de conta (reason).
 */
describe('monetização P0: paywall hit, voucher, trial, cap mensal, origem, deleção', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro p/ fetch (MP/IA)
    await loadSettings(); // repõe defaults (resetDb truncou app_settings)
  });

  it('paywall: 402 no consolidado registra hit com feature e saldo', async () => {
    const { user, patient, token } = await createUser({ credits: 0 });
    const e = await createExam(patient.id, { sha: 'pw1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });

    const r = await api().post('/api/analyses/consolidated').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(402);
    // logPaywallHit é fire-and-forget (não atrasa o 402 por design) — o hit pode gravar
    // milissegundos APÓS a resposta. Poll de até 3s em vez de assumir gravação síncrona.
    let hit = await prisma.paywallHit.findFirst({ where: { userId: user.id } });
    for (let i = 0; i < 30 && !hit; i++) {
      await new Promise((res) => setTimeout(res, 100));
      hit = await prisma.paywallHit.findFirst({ where: { userId: user.id } });
    }
    expect(hit?.feature).toBe('CONSOLIDATED');
    expect(hit?.balance).toBe(0);
  });

  it('voucher: relatório avulso consome voucher ANTES dos créditos (saldo intacto)', async () => {
    const { user, patient, token } = await createUser({ credits: 50 });
    await prisma.user.update({ where: { id: user.id }, data: { reportVouchers: 1 } });
    const e = await createExam(patient.id, { sha: 'rp1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });

    const r = await api().post('/api/analyses/consolidated').set(authHeader(token)).send({ patientId: patient.id });
    expect([200, 201]).toContain(r.status);
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true, reportVouchers: true } });
    expect(u?.credits).toBe(50); // créditos intactos — o voucher pagou
    expect(u?.reportVouchers).toBe(0); // voucher consumido
    expect(await prisma.creditTransaction.count({ where: { userId: user.id, kind: 'report_voucher' } })).toBe(1); // extrato registra
  });

  it('trial: elegível com 3+ usos de IA → 7d premium + créditos; 2ª tentativa 409', async () => {
    const { user, token } = await createUser({ credits: 0 });
    for (let i = 0; i < 3; i++) {
      await prisma.creditTransaction.create({ data: { userId: user.id, delta: -2, kind: 'ai_chat', label: 'chat' } });
    }
    const s = await api().get('/api/billing/status').set(authHeader(token));
    expect(s.body.trialAvailable).toBe(true);

    const r = await api().post('/api/billing/trial').set(authHeader(token));
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { planExpiresAt: true, credits: true, trialUsedAt: true } });
    expect(!!u?.planExpiresAt && u.planExpiresAt.getTime() > Date.now()).toBe(true);
    expect(u?.credits).toBe(100); // grants.trialCredits default
    expect(u?.trialUsedAt).toBeTruthy();

    const again = await api().post('/api/billing/trial').set(authHeader(token));
    expect(again.status).toBe(409);
  });

  it('trial: menos de 3 usos de IA → 403 (só quem provou o valor ganha)', async () => {
    const { token } = await createUser({ credits: 10 });
    const r = await api().post('/api/billing/trial').set(authHeader(token));
    expect(r.status).toBe(403);
  });

  it('cap mensal: saldo >= cap não paga o desafio mensal; badge volta a pagar quando o saldo baixa', async () => {
    const { user, patient, token } = await createUser({ credits: 150 }); // cap default 150
    const e = await createExam(patient.id, { sha: 'cap1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });

    // Saldo cheio: mensal NÃO paga (badge segue claimable — não é consumido).
    const full = await api().post('/api/achievements/claim').set(authHeader(token)).send({ badgeId: 'm_upload1' });
    expect(full.status).toBe(200);
    expect(full.body.granted).not.toContain('m_upload1');
    expect(full.body.monthlyCapReached).toBe(true);
    expect((await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }))?.credits).toBe(150);

    // Saldo baixou: o mesmo badge paga (o grant não foi consumido no bloqueio).
    await prisma.user.update({ where: { id: user.id }, data: { credits: 0 } });
    const pays = await api().post('/api/achievements/claim').set(authHeader(token)).send({ badgeId: 'm_upload1' });
    expect(pays.status).toBe(200);
    expect(pays.body.granted).toContain('m_upload1');
    expect(pays.body.newBalance).toBe(2); // reward integral (0 + 2 <= cap)
  });

  it('origem: register persiste acquisitionSource sanitizado', async () => {
    const email = `origem-${Date.now()}@exemplo.com`;
    const r = await api().post('/api/auth/register').send({ name: 'Maria Origem', cpf: testCpf(), email, password: 'senha123', source: 'instagram/promo??outubro' });
    expect([200, 201]).toContain(r.status);
    const u = await prisma.user.findUnique({ where: { email } });
    expect(u?.acquisitionSource).toBe('instagram/promo??outubro'); // '?': permitido na whitelist p/ query strings
  });

  it('deleção: DELETE /account grava audit ACCOUNT_DELETED com o motivo', async () => {
    const { user, token } = await createUser({});
    const r = await api().delete('/api/auth/account').set(authHeader(token)).send({ reason: 'achei-caro' });
    expect(r.status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_DELETED' } });
    expect(log).toBeTruthy();
    expect((log?.after as any)?.reason).toBe('achei-caro');
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull(); // conta foi apagada
  });
});
