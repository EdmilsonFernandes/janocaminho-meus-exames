// E1.1 — feature flag sportsMode (Saúde Esportiva). Default OFF; ausência da chave
// (banco antigo) NÃO liga; admin liga/desliga live (saveSettings/loadSettings).
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, api, authHeader, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { getSettings, loadSettings, saveSettings, sportsModeEnabled } from '../src/utils/settings';

describe('settings: flag sportsMode (Saúde Esportiva)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings(); // reseta o cache in-memory ao estado do banco (vazio → defaults)
  });

  it('default é DESLIGADO (paciente normal intocável)', () => {
    expect(getSettings().sportsMode.enabled).toBe(false);
    expect(sportsModeEnabled()).toBe(false);
  });

  it('ausência da chave (banco antigo/row parcial) NÃO liga a feature', async () => {
    // simula row salva antes do sportsMode existir: categoria sem a chave 'enabled'
    await prisma.appSetting.create({ data: { key: 'sportsMode', value: {} as any } });
    await loadSettings();
    expect(sportsModeEnabled()).toBe(false);
  });

  it('admin liga live (saveSettings enabled=1) e desliga de volta (enabled=0)', async () => {
    await saveSettings('sportsMode', { enabled: 1 });
    expect(sportsModeEnabled()).toBe(true);
    await saveSettings('sportsMode', { enabled: 0 });
    expect(sportsModeEnabled()).toBe(false);
  });

  it('liga via banco + loadSettings (sobrevive a restart) — aceita boolean true', async () => {
    await prisma.appSetting.create({ data: { key: 'sportsMode', value: { enabled: true } as any } });
    await loadSettings();
    expect(sportsModeEnabled()).toBe(true);
  });

  it('admin liga/desliga LIVE via PATCH /admin/config/costs (sem deploy)', async () => {
    const { user, token } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });

    const on = await api().patch('/api/admin/config/costs').set(authHeader(token)).send({ category: 'sportsMode', enabled: 1 });
    expect(on.status).toBe(200);
    expect(sportsModeEnabled()).toBe(true);

    const off = await api().patch('/api/admin/config/costs').set(authHeader(token)).send({ category: 'sportsMode', enabled: 0 });
    expect(off.status).toBe(200);
    expect(sportsModeEnabled()).toBe(false);
    // persistiu no banco (sobrevive a restart)
    await loadSettings();
    expect(sportsModeEnabled()).toBe(false);
  });
});
