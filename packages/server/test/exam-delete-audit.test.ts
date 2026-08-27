import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';

/**
 * E2E do tombstone de auditoria no delete de exame (EXAM_DELETED).
 * Caso real que motivou (27/08/2026): usuário extrai o 1º exame, ganha o bônus,
 * gera o resumo e DELETA o exame — admin não via exame nenhum e não entendia o
 * crédito. Agora toda exclusão deixa metadados (sem dado de saúde) no audit_logs.
 */

describe('Delete de exame grava tombstone EXAM_DELETED no audit', () => {
  beforeEach(async () => { await resetDb(); });

  it('DELETE /api/exams/:id → 200 + audit_log com metadados do exame', async () => {
    const { user, token } = await createUser({});
    const pat = await prisma.patient.create({ data: { ownerId: user.id, fullName: 'Titular Teste', relationship: 'Titular' } });
    const exam = await prisma.exam.create({
      data: {
        patientId: pat.id, title: 'Hemograma Completo', kind: 'LAB_PANEL', status: 'EXTRACTED',
        filePath: 'inexistente-teste.pdf', fileSha256: 'deadbeef', extractedAt: new Date(),
      },
    });

    const r = await api().delete(`/api/exams/${exam.id}`).set(authHeader(token));
    expect(r.status).toBe(200);

    const log = await prisma.auditLog.findFirst({ where: { action: 'EXAM_DELETED', targetId: exam.id } });
    expect(log).toBeTruthy();
    expect(log?.actorType).toBe('USER');
    expect(log?.actorId).toBe(user.id);
    const before: any = log?.before;
    expect(before?.title).toBe('Hemograma Completo');
    expect(before?.status).toBe('EXTRACTED');
    // LGPD: nenhum dado de saúde no tombstone (rawExtraction nunca aparece)
    expect(JSON.stringify(before)).not.toContain('rawExtraction');
    // exame realmente sumiu (delete continua hard)
    expect(await prisma.exam.count({ where: { id: exam.id } })).toBe(0);
  });

  it('exame de OUTRO usuário → 404 e NÃO gera tombstone', async () => {
    const dono = await createUser({});
    const intruso = await createUser({});
    const pat = await prisma.patient.create({ data: { ownerId: dono.user.id, fullName: 'Dono', relationship: 'Titular' } });
    const exam = await prisma.exam.create({
      data: { patientId: pat.id, title: 'Colesterol', kind: 'LAB_PANEL', status: 'EXTRACTED', filePath: 'x.pdf', fileSha256: 'aa' },
    });
    const r = await api().delete(`/api/exams/${exam.id}`).set(authHeader(intruso.token));
    expect(r.status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'EXAM_DELETED' } })).toBe(0);
  });
});
