import { prisma } from '../prisma';
import type { AuthedRequest } from '../middleware/auth';

/** Auditoria universal (LGPD) — append-only, best-effort (nunca bloqueia a ação).
 *  Registra QUEM (actor) fez O QUÊ (action) em QUE (target), com before/after e IP. */
export async function audit(action: string, req: AuthedRequest, opts: { targetType?: string; targetId?: string; before?: any; after?: any; actorType?: string } = {}): Promise<void> {
  try {
    const actorType = opts.actorType ?? (String(req.userId ?? '').startsWith('doc') ? 'DOCTOR' : 'ADMIN');
    await prisma.auditLog.create({
      data: {
        actorType,
        actorId: req.userId ?? null,
        action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        before: opts.before ?? undefined,
        after: opts.after ?? undefined,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString().slice(0, 255) ?? null,
      },
    });
  } catch (e: any) { console.error('[audit] falhou ao registrar:', action, e?.message); }
}
