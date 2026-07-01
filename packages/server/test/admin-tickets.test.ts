import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, resetDb, mintToken } from './helpers';
import { prisma } from '../src/prisma';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

describe('Admin tickets — responder + notificar + status', () => {
  beforeEach(resetDb);

  it('admin responde → status pending, unreadByUser, notifica (ticket), paciente vê na thread', async () => {
    const u = await createUser();
    const admin = await createAdmin();
    const created = await api().post('/api/tickets').set(authHeader(u.token)).send({ subject: 'Não consigo subir exame', message: 'Tela trava.' });
    expect(created.status).toBe(201);
    const ticketId = created.body.id;

    const reply = await api().post(`/api/admin/tickets/${ticketId}/messages`).set(authHeader(admin.token)).send({ message: 'Em qual tela trava? Pode mandar um print?' });
    expect(reply.status).toBe(201);

    const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    expect(t?.status).toBe('pending');
    expect(t?.unreadByUser).toBe(true);
    expect(t?.lastMessageBy).toBe('admin');

    // notificação in-app criada pro usuário (type=ticket, data.ticketId)
    const notif = await prisma.notification.findFirst({ where: { userId: u.user.id, type: 'ticket' } });
    expect(notif).toBeTruthy();
    expect((notif?.data as any)?.ticketId).toBe(ticketId);

    // paciente abre a thread e vê a resposta (e marca lido)
    const thread = await api().get(`/api/tickets/${ticketId}`).set(authHeader(u.token));
    expect(thread.body.messages).toHaveLength(2);
    expect(thread.body.messages[1].authorRole).toBe('admin');
    expect(thread.body.unreadByUser).toBe(false);
  });

  it('não-admin é bloqueado (403)', async () => {
    const u = await createUser();
    const created = await api().post('/api/tickets').set(authHeader(u.token)).send({ subject: 's', message: 'm' });
    const reply = await api().post(`/api/admin/tickets/${created.body.id}/messages`).set(authHeader(u.token)).send({ message: 'x' });
    expect(reply.status).toBe(403);
  });

  it('admin muda status para closed (e reabre ao responder)', async () => {
    const u = await createUser();
    const admin = await createAdmin();
    const created = await api().post('/api/tickets').set(authHeader(u.token)).send({ subject: 's', message: 'm' });

    const closed = await api().patch(`/api/admin/tickets/${created.body.id}`).set(authHeader(admin.token)).send({ status: 'closed' });
    expect(closed.status).toBe(200);
    const t1 = await prisma.supportTicket.findUnique({ where: { id: created.body.id } });
    expect(t1?.status).toBe('closed');
    expect(t1?.closedAt).toBeTruthy();

    // paciente responde → reabre
    const reply = await api().post(`/api/tickets/${created.body.id}/messages`).set(authHeader(u.token)).send({ message: 'ainda preciso de ajuda' });
    expect(reply.status).toBe(201);
    const t2 = await prisma.supportTicket.findUnique({ where: { id: created.body.id } });
    expect(t2?.status).toBe('open');
  });

  it('admin responde um chamado já resolvido (closed) → permanece resolvido (não reabre)', async () => {
    const u = await createUser();
    const admin = await createAdmin();
    const created = await api().post('/api/tickets').set(authHeader(u.token)).send({ subject: 's', message: 'm' });

    // admin resolve
    await api().patch(`/api/admin/tickets/${created.body.id}`).set(authHeader(admin.token)).send({ status: 'closed' });

    // admin manda uma msg depois → NÃO deve reabrir (permanece closed). Antes, "responder" sempre
    // jogava pra 'pending' e desfazia o resolvido silenciosamente.
    const reply = await api().post(`/api/admin/tickets/${created.body.id}/messages`).set(authHeader(admin.token)).send({ message: 'Encerrado. Qualquer coisa, abra outro chamado.' });
    expect(reply.status).toBe(201);
    const t = await prisma.supportTicket.findUnique({ where: { id: created.body.id } });
    expect(t?.status).toBe('closed');
    expect(t?.closedAt).toBeTruthy();
  });
});
