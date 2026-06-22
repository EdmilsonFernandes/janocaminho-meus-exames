// Entry point de produção/desenvolvimento. O app Express vive em ./app (isolado p/ testes).
import { app } from './app';
import { config, hasAnthropicKey } from './config';
import { prisma } from './prisma';
import { startReminderEmailJob } from './jobs/reminderEmails';
import { startHealthNudgeJob } from './jobs/healthNudges';
import { startPlanExpiryJob } from './jobs/planExpiry';
import { loadSettings } from './utils/settings';

// Carrega config de monetização do banco (custos/grants/shares) e sincroniza os objetos vivos
// (CREDIT_COSTS/UPLOAD_RULES). Antes disso, os defaults do código já estão ativos.
void loadSettings();

const server = app.listen(config.port, () => {
  console.log(`[server] rodando em http://localhost:${config.port} (env=${config.nodeEnv})`);
  startReminderEmailJob();
  startHealthNudgeJob();
  startPlanExpiryJob();
  if (!hasAnthropicKey()) {
    console.warn(
      '[server] AVISO: ANTHROPIC_API_KEY não configurada. Extração e análise de IA ficarão indisponíveis até definir a chave em packages/server/.env',
    );
  }
});

// GRACEFUL SHUTDOWN: Docker manda SIGTERM → fecha conexões, espera reqs pendentes, desconecta DB.
// Sem isso, deploy reinicia brusco → requisições/exames/e-mails no ar são perdidos.
let shuttingDown = false;
const shutdown = (sig: string) => {
  if (shuttingDown) { console.log(`[server] ${sig} de novo — force exit`); process.exit(1); }
  shuttingDown = true;
  console.log(`[server] ${sig} recebido — encerrando graciosamente...`);
  server.close(() => {
    prisma.$disconnect().then(() => { console.log('[server] conexões fechadas. Tchau! 👋'); process.exit(0); });
  });
  setTimeout(() => { console.log('[server] timeout no shutdown — force exit'); process.exit(1); }, 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
