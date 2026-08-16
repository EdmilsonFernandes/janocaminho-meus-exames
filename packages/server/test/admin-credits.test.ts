import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, resetDb, mintToken } from './helpers';
import { prisma } from '../src/prisma';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

/** Ajuste de créditos pelo admin: precisa deixar RASTRO (ledger + auditoria).
 *  Regressão da auditoria 2026-08-16: o PATCH setava o saldo sem gravar NADA — meses de
 *  ajustes invisíveis quebravam a reconciliação saldo × extrato. */
describe('Admin ajusta créditos — grava ledger + auditoria', () => {
  beforeEach(resetDb);

  it('PATCH registra o DELTA no extrato, audita e o saldo volta a bater com as transações', async () => {
    const u = await createUser({ credits: 100 }); // saldo inicial 100 (sem extrato)
    const admin = await createAdmin();

    const r = await api().patch(`/api/admin/users/${u.user.id}/credits`).set(authHeader(admin.token)).send({ credits: 150 });
    expect(r.status).toBe(200);
    expect(r.body.credits).toBe(150);

    // ledger: UMA linha com o delta do ajuste (100 → 150 = +50)
    const tx = await prisma.creditTransaction.findMany({ where: { userId: u.user.id, kind: 'admin_adjust' } });
    expect(tx).toHaveLength(1);
    expect(tx[0].delta).toBe(50);

    // auditoria: antes/depois registrados
    const log = await prisma.auditLog.findFirst({ where: { action: 'ADMIN_CREDITS', targetId: u.user.id } });
    expect(log).toBeTruthy();
    expect((log?.after as any)?.credits).toBe(150);
    expect((log?.before as any)?.credits).toBe(100);

    // reconciliação pós-ajuste regular: saldo - inicial_sem_extrato == soma do extrato
    const sum = await prisma.creditTransaction.aggregate({ where: { userId: u.user.id }, _sum: { delta: true } });
    expect(150 - 100).toBe(sum._sum.delta); // 50 == 50
  });

  it('ajuste sem mudança de saldo NÃO gera linhas (idempotente não polui extrato)', async () => {
    const u = await createUser({ credits: 100 });
    const admin = await createAdmin();
    const r = await api().patch(`/api/admin/users/${u.user.id}/credits`).set(authHeader(admin.token)).send({ credits: 100 });
    expect(r.status).toBe(200);
    expect(await prisma.creditTransaction.count({ where: { userId: u.user.id, kind: 'admin_adjust' } })).toBe(0);
  });

  it('rejeita valor negativo', async () => {
    const u = await createUser();
    const admin = await createAdmin();
    const r = await api().patch(`/api/admin/users/${u.user.id}/credits`).set(authHeader(admin.token)).send({ credits: -10 });
    expect(r.status).toBe(400);
  });

  it('não-admin é bloqueado (403)', async () => {
    const u = await createUser();
    const other = await createUser();
    const r = await api().patch(`/api/admin/users/${u.user.id}/credits`).set(authHeader(other.token)).send({ credits: 200 });
    expect(r.status).toBe(403);
  });
});
