// Entry point de produção/desenvolvimento. O app Express vive em ./app (isolado p/ testes).
import { app } from './app';
import { config, hasAnthropicKey } from './config';
import { startReminderEmailJob } from './jobs/reminderEmails';

app.listen(config.port, () => {
  console.log(`[server] rodando em http://localhost:${config.port} (env=${config.nodeEnv})`);
  startReminderEmailJob();
  if (!hasAnthropicKey()) {
    console.warn(
      '[server] AVISO: ANTHROPIC_API_KEY não configurada. Extração e análise de IA ficarão indisponíveis até definir a chave em packages/server/.env',
    );
  }
});
