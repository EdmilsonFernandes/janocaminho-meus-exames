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
    const payload: any = verifyToken(header.slice(7));
    // GARANTIA DE ISOLAMENTO: token de MÉDICO (type:'doctor') nunca acessa a área do paciente.
    if (payload?.type === 'doctor') {
      res.status(401).json({ error: 'Use o login de paciente. Conta de médico não acessa esta área.' });
      return;
    }
    const userId: string | undefined = payload?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, blocked: true } });
    if (!user) {
      res.status(401).json({ error: 'Usuário inválido' });
      return;
    }
    // Conta bloqueada pelo admin → derruba a sessão ativa (401). O app faz logout e, no
    // próximo login, o usuário recebe a mensagem amigável de contato com o suporte.
    if (user.blocked) {
      res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' });
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

/** Devolve o paciente TITULAR do usuário (ou o 1º disponível como fallback). */
export async function firstPatientId(userId: string): Promise<string | null> {
  const titular = await prisma.patient.findFirst({ where: { ownerId: userId, relationship: 'Titular' }, select: { id: true } });
  if (titular) return titular.id;
  const any = await prisma.patient.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return any?.id ?? null;
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
