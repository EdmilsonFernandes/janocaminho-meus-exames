import { prisma } from '../prisma';
import type { Request } from 'express';

/** Log de auditoria LGPD — registra quem acessou dados de saúde de qual paciente.
 *  Não bloqueia a requisição (fire-and-forget no DB). */
export async function auditLog(req: Request & { userId?: string }, action: string, patientId?: string): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: req.userId || 'unknown',
        type: 'audit',
        title: action,
        body: `Paciente: ${patientId || '—'} | IP: ${req.ip || '—'} | ${new Date().toISOString()}`,
      },
    });
  } catch { /* audit log não pode quebrar a requisição */ }
}
