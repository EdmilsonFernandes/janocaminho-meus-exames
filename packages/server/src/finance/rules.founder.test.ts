// §Coorte Fundador — ensureFounderRule: promessa da landing /para-medicos
// ("primeiros 50 médicos pagam 5% para sempre") precisa ser à prova de esquecimento:
// idempotente, não sobrescreve regra específica (ex.: Pro 10%) e respeita o cap.
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '../prisma';
import { ensureFounderRule, resolveCommissionRule, FOUNDER_BPS, FOUNDER_LIMIT, DEFAULT_COMMISSION_RULE } from './rules';

const PREFIX = 'test-founder-';

afterEach(async () => {
  await prisma.commissionRule.deleteMany({ where: { doctorId: { startsWith: PREFIX } } });
});

describe('ensureFounderRule (coorte Fundador)', () => {
  it('cria regra individual de 5% na 1ª chamada e é idempotente na 2ª', async () => {
    const d = PREFIX + 'a';
    const r1 = await ensureFounderRule(d);
    expect(r1.created).toBe(true);
    if (r1.created) expect(r1.founderCount).toBeGreaterThanOrEqual(1);

    // A regra realmente vale para o médico (resolve > default 20%)
    const snap = await resolveCommissionRule(d);
    expect(snap.platformBps).toBe(FOUNDER_BPS);
    expect(snap.feeBearer).toBe(DEFAULT_COMMISSION_RULE.feeBearer);
    expect(snap.releaseDelayDays).toBe(DEFAULT_COMMISSION_RULE.releaseDelayDays);

    const r2 = await ensureFounderRule(d);
    expect(r2.created).toBe(false);
    expect(r2.reason).toBe('already');
  });

  it('NÃO sobrescreve regra específica existente (ex.: Pro 10%)', async () => {
    const d = PREFIX + 'pro';
    await prisma.commissionRule.create({
      data: { doctorId: d, platformBps: 1000, feeBearer: 'platform', releaseDelayDays: 3, minPayoutCents: 2000, validFrom: new Date() },
    });
    const r = await ensureFounderRule(d);
    expect(r.created).toBe(false);
    expect(r.reason).toBe('already');
    expect((await resolveCommissionRule(d)).platformBps).toBe(1000);
  });

  it('respeita o cap: coorte lotada → não cria regra para o médico novo', async () => {
    const now = new Date();
    for (let i = 0; i < FOUNDER_LIMIT; i++) {
      await prisma.commissionRule.create({
        data: { doctorId: `${PREFIX}seed-${i}`, platformBps: FOUNDER_BPS, validFrom: now },
      });
    }
    const late = PREFIX + 'late';
    const r = await ensureFounderRule(late);
    expect(r.created).toBe(false);
    expect(r.reason).toBe('full');
    expect(await prisma.commissionRule.count({ where: { doctorId: late } })).toBe(0);
  });

  it('regra encerrada (validTo no passado) não bloqueia nova criação', async () => {
    const d = PREFIX + 'expired';
    await prisma.commissionRule.create({
      data: { doctorId: d, platformBps: 1000, validFrom: new Date(Date.now() - 90 * 86_400_000), validTo: new Date(Date.now() - 30 * 86_400_000) },
    });
    const r = await ensureFounderRule(d);
    expect(r.created).toBe(true);
    expect((await resolveCommissionRule(d)).platformBps).toBe(FOUNDER_BPS);
  });
});
