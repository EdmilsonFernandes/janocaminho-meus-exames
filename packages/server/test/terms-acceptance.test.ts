import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, resetDb, mintToken, testCpf } from './helpers';
import { prisma } from '../src/prisma';

/** Auditoria LGPD (01/10): aceite dos termos deixa trilha — QUANDO + QUAL versão/URL.
 *  Registro via form e via Google carimbam; admin enxerga; antigas = null honesto. */
describe('Termos de uso — trilha de auditoria', () => {
  beforeEach(resetDb);

  it('register via form carimba quando + versão + URL do documento', async () => {
    const email = `termos-${Date.now().toString(36)}@exemplo.com`;
    const r = await api().post('/api/auth/register').send({ name: 'Termos Teste', email, password: 'senha123', cpf: testCpf() });
    expect(r.status).toBe(201);
    const u = await prisma.user.findUnique({ where: { email }, select: { termsAcceptedAt: true, termsVersion: true, termsUrl: true } });
    expect(u?.termsAcceptedAt).toBeTruthy();
    expect(u?.termsVersion).toBe('v1-2026-10');
    expect(u?.termsUrl).toContain('/termos');
  });

  it('admin /users expõe a trilha (auditoria)', async () => {
    const email = `adm-termos-${Date.now().toString(36)}@exemplo.com`;
    await api().post('/api/auth/register').send({ name: 'Auditoria', email, password: 'senha123', cpf: testCpf() });
    const passwordHash = await bcrypt.hash('x', 10);
    const admin = await prisma.user.create({ data: { email: `a-${Date.now().toString(36)}@exemplo.com`, name: 'A', passwordHash, role: 'ADMIN' } });
    const r = await api().get('/api/admin/users').set({ Authorization: `Bearer ${mintToken(admin.id)}` });
    expect(r.status).toBe(200);
    const found = (r.body.users as any[]).find((x: any) => x.email === email);
    expect(found?.termsAcceptedAt).toBeTruthy();
    expect(found?.termsVersion).toBe('v1-2026-10');
    expect(found?.termsUrl).toContain('/termos');
  });
});
