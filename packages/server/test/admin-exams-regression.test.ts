// E2E (supertest) — regressão do HOTFIX 26/10: GET /api/admin/exams dava 500 em
// PROD (PrismaClientValidationError: Unknown field `phone` on model User — select
// pedia owner.phone, que não existe no schema; tipagem fraca passou no CI).
// Este teste garante que o select da rota valida contra o client REAL.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '../src/prisma';
import { resolveExamFile } from '../src/utils/storage';
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
    // Dono 26/10: photoUrl do paciente vem no select (foto na lista do admin).
    expect('photoUrl' in res.body.exams[0].patient).toBe(true);
    expect(Array.isArray(res.body.byStatus)).toBe(true);
    expect(Array.isArray(res.body.recentFailed)).toBe(true);
  });

  it('paciente comum → 403 (não é admin)', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/admin/exams').set(authHeader(token));
    expect([401, 403]).toContain(res.status);
  });
});

// Dono 24/11 ("não sei como ver o preview do exame rejeitado no admin"): sem VER o arquivo não se
// diagnostica uma falha de extração. A lista diz só se é FOTO ou PDF (caminho nunca sai) e a rota de
// arquivo serve o conteúdo com o tipo certo — só para admin, e com auditoria (laudo é dado sensível).
describe('Arquivo do exame no admin (GET /api/admin/exams/:id/file)', () => {
  const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const mkExam = (patientId: string, filePath: string) =>
    prisma.exam.create({ data: { patientId, title: 'Exame', filePath, fileSha256: `sha:${filePath}`, status: 'FAILED' }, select: { id: true } });
  const promote = async (userId: string) => prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });

  beforeEach(async () => {
    await resetDb();
  });

  it('a lista diz se o arquivo é foto ou PDF e nunca manda o caminho/chave do arquivo', async () => {
    const { user, patient, token } = await createUser();
    await promote(user.id);
    const foto = await mkExam(patient.id, '/tmp/qa/foto-enviada.jpg');
    const pdf = await mkExam(patient.id, 's3://bucket/laudo.pdf');

    const res = await api().get('/api/admin/exams').set(authHeader(token));
    expect(res.status).toBe(200);
    const byId: Record<string, any> = Object.fromEntries(res.body.exams.map((e: any) => [e.id, e]));
    expect(byId[foto.id].fileKind).toBe('image');
    expect(byId[pdf.id].fileKind).toBe('pdf');
    expect(res.body.exams.every((e: any) => !('filePath' in e))).toBe(true);
  });

  it('admin baixa a foto enviada com o Content-Type de imagem e o acesso fica auditado', async () => {
    const { user, patient, token } = await createUser();
    await promote(user.id);
    const foto = await mkExam(patient.id, '/tmp/qa/foto-enviada.jpg');
    // O setup global mocka resolveExamFile com um "test.pdf" que não existe: aponta 1x para um arquivo real.
    const file = path.join(os.tmpdir(), `admin-exam-${process.pid}-${Date.now()}.jpg`);
    fs.writeFileSync(file, jpgBytes);
    try {
      vi.mocked(resolveExamFile).mockResolvedValueOnce({ kind: 'file', file });
      const res = await api().get(`/api/admin/exams/${foto.id}/file`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(Buffer.from(res.body)).toEqual(jpgBytes);
      const log = await prisma.auditLog.findFirst({ where: { action: 'VIEW_EXAM_FILE', targetId: foto.id } });
      expect(log).not.toBeNull();
      expect(log?.actorId).toBe(user.id);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('paciente comum não baixa arquivo de exame pelo admin, e id inexistente dá 404', async () => {
    const paciente = await createUser(); // role padrão: paciente
    const foto = await mkExam(paciente.patient.id, '/tmp/qa/foto-enviada.jpg');
    const res = await api().get(`/api/admin/exams/${foto.id}/file`).set(authHeader(paciente.token));
    expect([401, 403]).toContain(res.status);

    const admin = await createUser();
    await promote(admin.user.id);
    const res404 = await api().get('/api/admin/exams/id-inexistente/file').set(authHeader(admin.token));
    expect(res404.status).toBe(404);
  });
});
