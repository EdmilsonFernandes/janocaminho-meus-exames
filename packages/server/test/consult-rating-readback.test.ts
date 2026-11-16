// Regressão: a estrela do atendimento era gravada, mas a tela nunca lia de volta —
// ao reabrir o histórico parecia que não tinha salvado.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

async function consult(type: 'teleconsulta' | 'consulta') {
  const u = await createUser();
  const { doctor } = await createDoctor({ crm: `7${Math.floor(Math.random() * 9000 + 1000)}-SP`, email: `rb${Date.now()}${Math.random()}@t.com` });
  const r = await prisma.reminder.create({
    data: { ownerId: u.user.id, patientId: u.patient.id, title: 'Consulta QA', dueDate: new Date(Date.now() - 3600_000), type, notifyOffsetsMin: [60], createdByDoctorId: doctor.id } as any,
    select: { id: true },
  });
  return { ...u, reminderId: r.id };
}

describe('GET /api/teleconsulta/:id/feedback — lê de volta a avaliação', () => {
  beforeEach(async () => { await resetDb(); });

  it.each(['teleconsulta', 'consulta'] as const)('%s: sem avaliação devolve null; depois de avaliar devolve a nota', async (type) => {
    const c = await consult(type);
    const before = await api().get(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token));
    expect(before.status).toBe(200);
    expect(before.body.rating).toBeNull();

    expect((await api().post(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token)).send({ rating: 4 })).status).toBe(201);
    const after = await api().get(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token));
    expect(after.body.rating).toBe(4);
  });

  it('trocar a nota: vale a última, sem duplicar o registro', async () => {
    const c = await consult('teleconsulta');
    await api().post(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token)).send({ rating: 2 });
    await api().post(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token)).send({ rating: 5 });
    expect((await api().get(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token))).body.rating).toBe(5);
    expect(await prisma.auditLog.count({ where: { action: 'TELECONSULTA_FEEDBACK', targetId: c.reminderId } })).toBe(1);
  });

  it('outra pessoa não lê a avaliação de uma consulta que não é dela', async () => {
    const c = await consult('teleconsulta');
    await api().post(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(c.token)).send({ rating: 5 });
    const other = await createUser();
    const r = await api().get(`/api/teleconsulta/${c.reminderId}/feedback`).set(authHeader(other.token));
    expect(r.status).toBeGreaterThanOrEqual(403);
    expect(r.body.rating).toBeUndefined();
  });

  it('exige login', async () => {
    const c = await consult('teleconsulta');
    expect((await api().get(`/api/teleconsulta/${c.reminderId}/feedback`)).status).toBe(401);
  });
});
