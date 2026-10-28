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
async function seedFeedback(rating: number, audioQuality?: string) {
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
  const res = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating, note: 'QA', ...(audioQuality ? { audioQuality } : {}) });
  expect(res.status).toBe(201);
  return { r, token };
}

describe('GET /api/admin/teleconsultas/feedbacks', () => {
  beforeEach(async () => { await resetDb(); });

  it('200 com zero feedbacks (regressão: 500 por select de coluna inexistente)', async () => {
    const admin = await createAdmin();
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, avgRating: 5.0, positivePct: 100, items: [] });
    expect(res.body.audioQualityCounts).toMatchObject({ otimo: 0, ok: 0, ruim: 0 });
    expect(res.body.audioRated).toBe(0);
  });

  it('com feedback: 200 + agregados + nomes de paciente (fullName) e médico', async () => {
    const admin = await createAdmin();
    const { r } = await seedFeedback(5);
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.avgRating).toBe(5);
    expect(res.body.ratingCounts).toMatchObject({ 5: 1 });
    expect(res.body.items[0]).toMatchObject({ rating: 5, teleId: r.id, role: 'patient', audioQuality: null });
    expect(res.body.items[0].patient?.name).toBeTruthy();
    expect(res.body.items[0].doctor?.name).toBeTruthy();
    expect(res.body.items[0].reminder?.title).toBe('Teleconsulta QA');
  });

  it('T1: POST com audioQuality válido persiste e agrega', async () => {
    const admin = await createAdmin();
    await seedFeedback(4, 'otimo');
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].audioQuality).toBe('otimo');
    expect(res.body.audioQualityCounts).toMatchObject({ otimo: 1, ok: 0, ruim: 0 });
    expect(res.body.audioRated).toBe(1);
  });

  it('T1: audioQuality inválido é IGNORADO (nunca 400) e não agrega', async () => {
    const admin = await createAdmin();
    const { r, token } = await seedFeedback(3, 'excelente-demais');
    expect(r.id).toBeTruthy();
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.items[0].audioQuality).toBeNull();
    expect(res.body.audioQualityCounts).toMatchObject({ otimo: 0, ok: 0, ruim: 0 });
    expect(res.body.audioRated).toBe(0);
    // mesmo paciente reenvia com valor válido → upsert atualiza o MESMO log
    const again = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating: 3, audioQuality: 'ruim' });
    expect(again.status).toBe(201);
    const res2 = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res2.body.total).toBe(1); // upsert: não duplica
    expect(res2.body.items[0].audioQuality).toBe('ruim');
  });

  it('T1: áudio num 2º POST (após o rating 1-toque) faz MERGE sem duplicar', async () => {
    const admin = await createAdmin();
    const { r, token } = await seedFeedback(5); // 1º POST: só rating
    const second = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ audioQuality: 'ok' });
    expect(second.status).toBe(201);
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.body.total).toBe(1); // antes do upsert isto seria 2
    expect(res.body.ratingCounts).toMatchObject({ 5: 1 });
    expect(res.body.items[0]).toMatchObject({ rating: 5, audioQuality: 'ok', note: 'QA' }); // rating + nota preservados
    expect(res.body.audioQualityCounts).toMatchObject({ otimo: 0, ok: 1, ruim: 0 });
  });

  it('T1: áudio SEM rating e SEM feedback prévio → 400 (regra do rating intacta)', async () => {
    const { user, patient, token } = await createUser();
    const { doctor } = await createDoctor({ crm: '70099-SP', email: 'fbdocaudio@t.com' });
    const r = await prisma.reminder.create({
      data: {
        ownerId: user.id, patientId: patient.id, title: 'Teleconsulta QA áudio',
        dueDate: new Date(Date.now() + 3600_000), type: 'teleconsulta',
        notifyOffsetsMin: [60], createdByDoctorId: doctor.id,
      } as any,
      select: { id: true },
    });
    const res = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ audioQuality: 'otimo' });
    expect(res.status).toBe(400);
  });

  it('T1: agregação conta os 3 valores', async () => {
    const admin = await createAdmin();
    await seedFeedback(5, 'otimo');
    await seedFeedback(4, 'otimo');
    await seedFeedback(3, 'ok');
    await seedFeedback(2, 'ruim');
    await seedFeedback(1); // sem áudio
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.audioQualityCounts).toEqual({ otimo: 2, ok: 1, ruim: 1 });
    expect(res.body.audioRated).toBe(4);
  });

  it('não-admin → 403', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/admin/teleconsultas/feedbacks').set(authHeader(token));
    expect(res.status).toBe(403);
  });
});
