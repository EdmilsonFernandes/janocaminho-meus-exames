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
  // AUD-030: capturar o path AGORA — no evento 'finish' os routers já reescreveram
  // req.url/req.path para o RELATIVO do mount (ex.: GET /api/patients chegava ao listener
  // como '/'), a allowlist nunca casava e NENHUMA linha ACCESS era gravada (trilha LGPD
  // de acesso a dado de saúde muda desde a reorganização dos routers). originalUrl é
  // estável; split('?') descarta querystring (PIN/token não vão pra auditoria).
  const fullPath = (req.originalUrl || req.url || '/').split('?')[0];
  res.on('finish', () => {
    if (!AREAS.test(fullPath)) return;      // allowlist de áreas
    const ar = req as AuthedRequest & { doctorId?: string };
    const meta = { method: req.method, path: fullPath, status: res.statusCode, ms: Date.now() - start };
    if (ar.userId) {
      void audit('ACCESS', ar, { actorType: 'USER', actorId: ar.userId, targetType: 'ROUTE', after: meta });
    } else if (ar.doctorId) {
      void audit('ACCESS', ar, { actorType: 'DOCTOR', actorId: ar.doctorId, targetType: 'ROUTE', after: meta });
    }
  });
  next();
}
