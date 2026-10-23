// E2E (supertest) — GET /api/admin/teleconsultas/feedbacks.
// Regressão 23/10: os selects usavam colunas INEXISTENTES (Patient.name — só há
// fullName; Doctor.avatarUrl — só há photoUrl) → PrismaClientValidationError →
// 500 SEMPRE, até sem dados (o painel de feedbacks do admin nunca abriu).
// O caso vazio já pega o bug de validação; o caso com dados cobre o shape do mapa.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

async function createAdmin() {
  const { user, token } = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  return token;
}

/** Semeia 1 feedback de teleconsulta (paciente avalia via rota pública). */
async function seedFeedback(rating: number) {
  const { user, patient, token } = await createUser();
  const { doctor } = await createDoctor({ crm: `${70000 + rating}-SP`, email: `fbdoc${rating}@t.com` });
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Teleconsulta QA',
      dueDate: new Date(Date.now() + 3600_000), type: 'teleconsulta',
      notifyOffsetsMin: [60], createdByDoctorId: doctor.id,
    } as any,
    select: { id: true },
  });
  const res = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating, note: 'QA' });
  expect(res.status).toBe(201);
  return r;
}

describe('GET /api/admin/teleconsultas/feedbacks', () => {
  beforeEach(async () => { await resetDb(); });

  it('200 com zero feedbacks (regressão: 500 por select de coluna inexistente)', async () => {
    const admin = await createAdmin();
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, avgRating: 5.0, positivePct: 100, items: [] });
  });

  it('com feedback: 200 + agregados + nomes de paciente (fullName) e médico', async () => {
    const admin = await createAdmin();
    const r = await seedFeedback(5);
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.avgRating).toBe(5);
    expect(res.body.ratingCounts).toMatchObject({ 5: 1 });
    expect(res.body.items[0]).toMatchObject({ rating: 5, teleId: r.id, role: 'patient' });
    expect(res.body.items[0].patient?.name).toBeTruthy();
    expect(res.body.items[0].doctor?.name).toBeTruthy();
    expect(res.body.items[0].reminder?.title).toBe('Teleconsulta QA');
  });

  it('não-admin → 403', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(token));
    expect(res.status).toBe(403);
  });
});
