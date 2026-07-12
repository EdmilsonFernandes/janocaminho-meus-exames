import type { Request, Response, NextFunction } from 'express';
import { audit } from '../utils/audit';
import type { AuthedRequest } from './auth';

// Allowlist de áreas com valor de auditoria (LGPD). Casa /api/<area>(/...) — tolerante a
// prefixo de path (ex.: /minhasaude/api/...). Evita ruído (health, files, build-info,
// version, poll de notifications, assets). Áreas cobertas: exames, IA, chat, admin,
// pacientes, dados, médico, cobrança, risco.
const AREAS = /\/api\/(exams|analyses|chat|admin|patients|data|doctor|billing|risk)(\/|$)/i;

/** Auditoria de ACESSO a áreas — middleware global. Grava um AuditLog('ACCESS') quando a
 *  resposta termina, só pra rotas autenticadas (req.userId do paciente ou req.doctorId do
 *  médico, setados pelos middlewares requireAuth/requireDoctor durante o handling) que casam
 *  com a allowlist. Best-effort (o helper audit() já engole erros); não responde por LOG_LEVEL
 *  (sempre grava — é LGPD, não log técnico). */
export function accessAudit(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const path = req.path || '/';
    if (!AREAS.test(path)) return;          // allowlist de áreas
    const ar = req as AuthedRequest & { doctorId?: string };
    const meta = { method: req.method, path, status: res.statusCode, ms: Date.now() - start };
    if (ar.userId) {
      void audit('ACCESS', ar, { actorType: 'USER', actorId: ar.userId, targetType: 'ROUTE', after: meta });
    } else if (ar.doctorId) {
      void audit('ACCESS', ar, { actorType: 'DOCTOR', actorId: ar.doctorId, targetType: 'ROUTE', after: meta });
    }
  });
  next();
}
