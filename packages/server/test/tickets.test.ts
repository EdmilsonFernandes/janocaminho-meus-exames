import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';

describe('Tickets — suporte do paciente (/api/tickets)', () => {
  beforeEach(resetDb);

  it('cria chamado com nº, lista e abre a thread', async () => {
    const u = await createUser();
    const h = authHeader(u.token);
    const r = await api().post('/api/tickets').set(h).send({ category: 'Erro no app', subject: 'Não consigo subir exame', message: 'Tela trava ao anexar.' });
    expect(r.status).toBe(201);
    expect(r.body.number).toBe(1);
    expect(r.body.subject).toBe('Não consigo subir exame');

    const list = await api().get('/api/tickets').set(h);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].number).toBe(1);
    expect(list.body[0].unreadByUser).toBe(false); // admin ainda não respondeu

    const thread = await api().get(`/api/tickets/${r.body.id}`).set(h);
    expect(thread.status).toBe(200);
    expect(thread.body.messages).toHaveLength(1);
    expect(thread.body.messages[0].body).toBe('Tela trava ao anexar.');
    expect(thread.body.messages[0].authorRole).toBe('user');
  });

  it('responde na thread e bloqueia acesso de outro usuário', async () => {
    const a = await createUser();
    const b = await createUser();
    const ha = authHeader(a.token);
    const created = await api().post('/api/tickets').set(ha).send({ subject: 'Dúvida', message: 'oi' });
    expect(created.status).toBe(201);

    // outro usuário não enxerga o chamado alheio
    const other = await api().get(`/api/tickets/${created.body.id}`).set(authHeader(b.token));
    expect(other.status).toBe(404);
    const otherReply = await api().post(`/api/tickets/${created.body.id}/messages`).set(authHeader(b.token)).send({ message: 'x' });
    expect(otherReply.status).toBe(404);

    // dono responde
    const reply = await api().post(`/api/tickets/${created.body.id}/messages`).set(ha).send({ message: 'mais detalhes' });
    expect(reply.status).toBe(201);
    const thread = await api().get(`/api/tickets/${created.body.id}`).set(ha);
    expect(thread.body.messages).toHaveLength(2);
    expect(thread.body.messages[1].authorRole).toBe('user');
  });

  it('usuário responde um chamado "aguardando" (pending) → volta a "Em andamento" (open)', async () => {
    const u = await createUser();
    const h = authHeader(u.token);
    const created = await api().post('/api/tickets').set(h).send({ subject: 'Dúvida', message: 'oi' });
    // simula o admin já ter respondido → status "Aguardando você" (pending)
    await prisma.supportTicket.update({ where: { id: created.body.id }, data: { status: 'pending' } });
    // usuário responde → deve voltar a "Em andamento" (open). Antes ficava preso em pending e o
    // admin nem via o retorno na fila.
    const reply = await api().post(`/api/tickets/${created.body.id}/messages`).set(h).send({ message: 'obrigado, resolveu!' });
    expect(reply.status).toBe(201);
    const t = await prisma.supportTicket.findUnique({ where: { id: created.body.id } });
    expect(t?.status).toBe('open');
  });

  it('impede mais de 3 chamados abertos', async () => {
    const u = await createUser();
    const h = authHeader(u.token);
    for (let i = 0; i < 3; i++) {
      const r = await api().post('/api/tickets').set(h).send({ subject: `s${i}`, message: 'm' });
      expect(r.status).toBe(201);
    }
    const blocked = await api().post('/api/tickets').set(h).send({ subject: 's4', message: 'm' });
    expect(blocked.status).toBe(429);
  });

  it('exige assunto e descrição', async () => {
    const u = await createUser();
    const r = await api().post('/api/tickets').set(authHeader(u.token)).send({ subject: 'só assunto' });
    expect(r.status).toBe(400);
  });

  it('lista categorias', async () => {
    const u = await createUser();
    const r = await api().get('/api/tickets/categories').set(authHeader(u.token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
  });
});
