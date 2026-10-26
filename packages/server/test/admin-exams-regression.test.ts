// E2E (supertest) — regressão do HOTFIX 26/10: GET /api/admin/exams dava 500 em
// PROD (PrismaClientValidationError: Unknown field `phone` on model User — select
// pedia owner.phone, que não existe no schema; tipagem fraca passou no CI).
// Este teste garante que o select da rota valida contra o client REAL.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, resetDb, authHeader } from './helpers';

describe('GET /api/admin/exams (regressão select)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('admin → 200 com exams/byStatus/recentFailed (select sem campo inexistente)', async () => {
    const { user, patient, token } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await prisma.exam.create({
      data: {
        patientId: patient.id, title: 'Hemograma', filePath: '/tmp/x.pdf', fileSha256: 'abc',
        status: 'EXTRACTED',
      },
      select: { id: true },
    });

    const res = await api().get('/api/admin/exams').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.exams)).toBe(true);
    expect(res.body.exams.length).toBe(1);
    expect(res.body.exams[0]).toMatchObject({ title: 'Hemograma' });
    // owner SEM phone (campo não existe) e COM e-mail — o que a UI usa.
    expect(res.body.exams[0].patient.owner).toMatchObject({ email: expect.any(String) });
    expect(res.body.exams[0].patient.owner.phone).toBeUndefined();
    expect(Array.isArray(res.body.byStatus)).toBe(true);
    expect(Array.isArray(res.body.recentFailed)).toBe(true);
  });

  it('paciente comum → 403 (não é admin)', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/admin/exams').set(authHeader(token));
    expect([401, 403]).toContain(res.status);
  });
});
