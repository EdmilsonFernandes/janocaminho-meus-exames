// Sessões & Logins (Fase 1) — agregações de LOGIN_* do audit_log para o admin.
// Datas geradas a partir de Date.now() e conferidas com toISOString/getHours do
// MESMO objeto → imune a fuso/flake de meia-noite (server roda em UTC).
import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, mintToken } from './helpers';

let seq = 0;
async function mkUser(role: 'ADMIN' | null = null) {
  const u = await prisma.user.create({
    data: { email: `logins-${Date.now().toString(36)}-${seq++}@exemplo.com`, name: `Usuário Logins ${seq}`, passwordHash: await bcrypt.hash('x', 4), ...(role ? { role } : {}), credits: 0, emailVerified: true },
    select: { id: true, email: true, name: true },
  });
  return u;
}
const audit = (data: any) => prisma.auditLog.create({ data });

describe('admin — Sessões & Logins (Fase 1, leitura do audit_log)', () => {
  beforeEach(async () => { await resetDb(); });

  it('overview agrega por dia/hora/semana + motivos de falha (7 dias)', async () => {
    const admin = await mkUser('ADMIN');
    const u = await mkUser();
    const at = new Date(Date.now() - 60_000);
    await audit({ action: 'LOGIN_SUCCESS', actorType: 'USER', actorId: u.id, targetType: 'USER', targetId: u.id, after: { email: u.email, via: 'google' }, ip: '1.2.3.4', userAgent: 'Android Chrome', createdAt: at });
    await audit({ action: 'LOGIN_SUCCESS', actorType: 'USER', actorId: u.id, targetType: 'USER', targetId: u.id, after: { email: u.email }, ip: '1.2.3.4', createdAt: at });
    await audit({ action: 'LOGIN_FAILED', actorType: 'USER', actorId: null, targetType: 'USER', after: { email: u.email, reason: 'senha_errada' }, ip: '1.2.3.4', createdAt: at });
    // fora da janela (8 dias) — não pode contar
    await audit({ action: 'LOGIN_SUCCESS', actorType: 'USER', actorId: u.id, targetType: 'USER', createdAt: new Date(Date.now() - 8 * 86_400_000) });

    const r = await api().get('/api/admin/logins/overview?days=7').set(authHeader(mintToken(admin.id)));
    expect(r.status).toBe(200);
    expect(r.body.totals).toMatchObject({ success: 2, failed: 1, users: 1, doctors: 0 });
    expect(r.body.perDay).toHaveLength(7);
    const last = r.body.perDay[6];
    expect(last.day).toBe(at.toISOString().slice(0, 10));
    expect(last).toMatchObject({ success: 2, failed: 1 });
    // dia vazio preenchido com zeros
    expect(r.body.perDay[0]).toMatchObject({ success: 0, failed: 0 });
    expect(r.body.byHour[at.getHours()].count).toBe(2);
    expect(r.body.byWeekday[at.getDay()].count).toBe(2);
    expect(r.body.failReasons[0]).toMatchObject({ reason: 'senha_errada', count: 1 });
  });

  it('user-search por e-mail (insensível a caixa) + timeline do usuário', async () => {
    const admin = await mkUser('ADMIN');
    const u = await mkUser();
    const s = await api().get(`/api/admin/logins/user-search?q=${u.email.slice(0, 14).toUpperCase()}`).set(authTokenHeader(admin.id));
    expect(s.status).toBe(200);
    expect(s.body.users).toHaveLength(1);
    expect(s.body.users[0]).toMatchObject({ id: u.id, email: u.email });

    const at = new Date(Date.now() - 30_000);
    await audit({ action: 'LOGIN_SUCCESS', actorType: 'USER', actorId: u.id, targetType: 'USER', targetId: u.id, after: { email: u.email, via: 'mfa' }, ip: '9.9.9.9', userAgent: 'iPhone Safari', createdAt: at });
    await audit({ action: 'LOGIN_BLOCKED', actorType: 'USER', actorId: u.id, targetType: 'USER', after: { email: u.email, reason: 'account_blocked' }, createdAt: new Date(Date.now() - 90_000) });

    const t = await api().get(`/api/admin/logins/user/${u.id}`).set(authTokenHeader(admin.id));
    expect(t.status).toBe(200);
    expect(t.body.user).toMatchObject({ id: u.id, email: u.email });
    expect(t.body.events).toHaveLength(2);
    expect(t.body.events[0]).toMatchObject({ action: 'LOGIN_SUCCESS', via: 'mfa', ip: '9.9.9.9', ua: 'iPhone Safari' }); // mais recente primeiro
    expect(t.body.events[1].action).toBe('LOGIN_BLOCKED');
  });

  it('exige admin (403 pra usuário comum)', async () => {
    const u = await mkUser();
    const r = await api().get('/api/admin/logins/overview').set(authTokenHeader(u.id));
    expect(r.status).toBe(403);
  });
});

function authTokenHeader(id: string) { return authHeader(mintToken(id)); }
