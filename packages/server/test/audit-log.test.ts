import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { auditLog } from '../src/middleware/auditLog';

/**
 * auditLog — trilha LGPD de acesso a dados de saúde.
 * Regressão da travada de 04/09: rotas de MÉDICO não têm `userId` (autenticam por
 * doctorId) e o audit gravava `userId:'unknown'` → FK violation no Postgres a cada
 * view do portal (spam de prisma:error + INSERT morto). Agora: sem userId → só log
 * de console; com userId → notificação de auditoria normal.
 */
const fakeReq = (extra: Record<string, unknown> = {}) => ({ ip: '127.0.0.1', ...extra }) as any;

describe('auditLog', () => {
  beforeEach(async () => { await resetDb(); });

  it('COM userId: grava notificação de auditoria', async () => {
    const { user } = await createUser();
    await auditLog(fakeReq({ userId: user.id }), 'doctor_viewed_exams', 'pat-1');
    const rows = await prisma.notification.findMany({ where: { userId: user.id, type: 'audit' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('doctor_viewed_exams');
    expect(rows[0].body).toContain('pat-1');
  });

  it('SEM userId (rota de médico): NÃO grava nem lança (fim do prisma:error unknown)', async () => {
    await expect(auditLog(fakeReq({ doctorId: 'doc-1' }), 'doctor_viewed_exams', 'pat-1')).resolves.toBeUndefined();
    expect(await prisma.notification.count({ where: {} })).toBe(0); // nada gravado, nenhum erro
  });
});
