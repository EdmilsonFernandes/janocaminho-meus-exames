import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';

/**
 * Teste E2E do reset-MFA admin (lockout recovery).
 * Admin desativa o 2FA de um usuário sem exigir código TOTP — pra quando o usuário perde o celular.
 */
describe('admin reset-mfa (lockout recovery)', () => {
  beforeEach(async () => { await resetDb(); });

  it('admin desativa MFA sem código TOTP e limpa todos os campos', async () => {
    // Cria admin + promove
    const { user: admin, token: adminToken } = await createUser({});
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    // Cria alvo com MFA ativado
    const { user: target } = await createUser({});
    await prisma.user.update({
      where: { id: target.id },
      data: { mfaEnabled: true, mfaSecretEncrypted: 'enc', mfaSecretIv: 'iv', mfaSecretAuthTag: 'tag', mfaConfirmedAt: new Date() },
    });

    const r = await api().post(`/api/admin/users/${target.id}/reset-mfa`).set(authHeader(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.mfaEnabled).toBe(false);

    const after = await prisma.user.findUnique({
      where: { id: target.id },
      select: { mfaEnabled: true, mfaSecretEncrypted: true, mfaSecretIv: true, mfaSecretAuthTag: true, mfaConfirmedAt: true },
    });
    expect(after?.mfaEnabled).toBe(false);
    expect(after?.mfaSecretEncrypted).toBeNull();
    expect(after?.mfaSecretIv).toBeNull();
    expect(after?.mfaSecretAuthTag).toBeNull();
    expect(after?.mfaConfirmedAt).toBeNull();
  });

  it('não-admin recebe 403', async () => {
    const { user: target, token: userToken } = await createUser({});
    await prisma.user.update({ where: { id: target.id }, data: { mfaEnabled: true, mfaSecretEncrypted: 'enc' } });

    const r = await api().post(`/api/admin/users/${target.id}/reset-mfa`).set(authHeader(userToken));
    expect(r.status).toBe(403);
  });

  it('audit log registra o reset (RESET_MFA)', async () => {
    const { user: admin, token: adminToken } = await createUser({});
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const { user: target } = await createUser({});
    await prisma.user.update({ where: { id: target.id }, data: { mfaEnabled: true, mfaSecretEncrypted: 'enc' } });

    await api().post(`/api/admin/users/${target.id}/reset-mfa`).set(authHeader(adminToken));
    const logs = await prisma.auditLog.findMany({ where: { action: 'RESET_MFA', targetId: target.id } });
    expect(logs.length).toBe(1);
  });

  it('funciona mesmo se MFA já estava desativado (idempotente)', async () => {
    const { user: admin, token: adminToken } = await createUser({});
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const { user: target } = await createUser({});

    const r = await api().post(`/api/admin/users/${target.id}/reset-mfa`).set(authHeader(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.mfaEnabled).toBe(false);
  });
});
