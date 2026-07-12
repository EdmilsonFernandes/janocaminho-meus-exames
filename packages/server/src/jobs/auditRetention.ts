import { prisma } from '../prisma';
import { createLogger } from '../utils/logger';

const log = createLogger('audit-retention');
const RETENTION_DAYS = 90;

/** Scheduler de RETENÇÃO do audit_logs: remove ACCESS antigos (>90d) pra não lotar o banco.
 *  Mantém LOGIN/REGISTER/ações admin por mais tempo (LGPD — trilha de quem entrou). Roda 1x/dia. */
export function startAuditRetentionJob(): void {
  const run = async () => {
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const r = await prisma.auditLog.deleteMany({ where: { action: 'ACCESS', createdAt: { lt: cutoff } } });
      if (r.count > 0) log.info('ACCESS antigos removidos', { count: r.count });
    } catch (e: any) {
      log.warn('falha ao limpar ACCESS antigos', { msg: e?.message });
    }
  };
  setInterval(run, 24 * 60 * 60 * 1000); // a cada 24h
  setTimeout(run, 5 * 60_000);            // 5min após o boot (fora do pico de startup)
  console.log('[audit-retention] job de retenção iniciado (limpa ACCESS >90d, 1x/dia)');
}
