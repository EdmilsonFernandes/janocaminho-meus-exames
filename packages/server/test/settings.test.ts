import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, api, authHeader, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { getSettings, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/utils/settings';

describe('settings: config de monetização no banco (parametrizada)', () => {
  beforeEach(async () => { await resetDb(); });

  it('getSettings devolve defaults antes de qualquer load', () => {
    expect(getSettings().creditCosts.chat).toBe(DEFAULT_SETTINGS.creditCosts.chat);
    expect(getSettings().shares.exams).toBe(DEFAULT_SETTINGS.shares.exams);
    expect(getSettings().grants.freeSignup).toBe(60);
  });

  it('saveSettings persiste no banco + atualiza o cache', async () => {
    await saveSettings('shares', { exams: 9 });
    expect(getSettings().shares.exams).toBe(9); // cache
    const row = await prisma.appSetting.findUnique({ where: { key: 'shares' } });
    expect((row?.value as any).exams).toBe(9); // banco
    // outros escopos preservados (merge, não replace)
    expect(getSettings().shares.evolution).toBe(DEFAULT_SETTINGS.shares.evolution);
  });

  it('loadSettings lê do banco sobrepondo defaults (e preserva o que não veio)', async () => {
    await prisma.appSetting.create({ data: { key: 'creditCosts', value: { chat: 7 } as any } });
    await loadSettings();
    expect(getSettings().creditCosts.chat).toBe(7); // veio do banco
    expect(getSettings().creditCosts.summary).toBe(DEFAULT_SETTINGS.creditCosts.summary); // default mantido
  });

  it('admin PATCH /config/costs persiste; GET e re-load refletem (sobrevive a restart)', async () => {
    const { user, token } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });

    const r = await api().patch('/api/admin/config/costs').set(authHeader(token)).send({ category: 'grants', monthly: 300 });
    expect(r.status).toBe(200);
    expect(r.body.grants.monthly).toBe(300);

    // simula "restart" (re-carrega do banco) — valor persistiu
    await loadSettings();
    expect(getSettings().grants.monthly).toBe(300);
  });

  it('admin PATCH rejeita category inválida (400)', async () => {
    const { user, token } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    const r = await api().patch('/api/admin/config/costs').set(authHeader(token)).send({ category: 'xx', chat: 1 });
    expect(r.status).toBe(400);
  });
});
