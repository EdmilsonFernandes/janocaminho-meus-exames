import { prisma } from '../prisma';
import type { Request } from 'express';

/** Log de auditoria LGPD — registra quem acessou dados de saúde de qual paciente.
 *  Não bloqueia a requisição (fire-and-forget no DB).
 *
 *  Rotas de MÉDICO autenticam por `doctorId` (não há `userId` de user no request):
 *  antes gravava `userId: 'unknown'` → FK violation no Postgres a CADA view do
 *  portal (spam de prisma:error em prod — achado na investigação da travada de
 *  04/09). Nesses casos o rastro fica no log do container (a tabela notifications
 *  exige um user real). */
export async function auditLog(req: Request & { userId?: string }, action: string, patientId?: string): Promise<void> {
  if (!req.userId) {
    const actor = (req as any).doctorId ? `doctor:${(req as any).doctorId}` : 'anon';
    console.info(`[audit] ${actor} ${action} patient=${patientId ?? '—'} ip=${req.ip ?? '—'}`);
    return;
  }
  try {
    await prisma.notification.create({
      data: {
        userId: req.userId,
        type: 'audit',
        title: action,
        body: `Paciente: ${patientId || '—'} | IP: ${req.ip || '—'} | ${new Date().toISOString()}`,
      },
    });
  } catch { /* audit log não pode quebrar a requisição */ }
}
