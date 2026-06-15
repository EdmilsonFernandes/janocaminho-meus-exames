import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/jwt';
import { prisma } from '../prisma';

export interface AuthedRequest extends Request {
  userId?: string;
}

/** Middleware que exige JWT válido e injeta req.userId. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  try {
    const { userId } = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      res.status(401).json({ error: 'Usuário inválido' });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/** Devolve os IDs de pacientes pertencentes ao usuário (escopo de dados). */
export async function userPatientIds(userId: string): Promise<string[]> {
  const rows = await prisma.patient.findMany({ where: { ownerId: userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Devolve o 1º paciente do usuário (caso de uso single-patient do MVP). */
export async function firstPatientId(userId: string): Promise<string | null> {
  const p = await prisma.patient.findFirst({ where: { ownerId: userId }, select: { id: true } });
  return p?.id ?? null;
}

/** Middleware que exige plano PREMIUM ativo (para recursos pagos: resumo IA, chat, etc). */
export async function requirePlan(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { planExpiresAt: true } });
  const active = !!user?.planExpiresAt && user.planExpiresAt > new Date();
  if (!active) {
    res.status(402).json({ error: 'plan_required', message: 'Este recurso é Premium. Assine para usar.' });
    return;
  }
  next();
}
