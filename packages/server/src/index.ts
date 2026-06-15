import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config, hasAnthropicKey } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import examRoutes from './routes/exam.routes';
import itemRoutes from './routes/item.routes';
import analysisRoutes from './routes/analysis.routes';
import chatRoutes from './routes/chat.routes';
import reminderRoutes from './routes/reminder.routes';
import billingRoutes from './routes/billing.routes';
import measurementRoutes from './routes/measurement.routes';

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/analyses', analysisRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/measurements', measurementRoutes);

// Em produção: serve o build do front (SPA) no mesmo container (1 domínio só)
if (config.isProd) {
  // dist pode estar em dist/ (rootDir src) ou dist/src/ (rootDir .) — tenta ambos
  const candidates = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(process.cwd(), 'packages/web/dist'),
  ];
  const webDist = candidates.find((p) => fs.existsSync(p));
  if (webDist) {
    app.use(express.static(webDist));
    // SPA fallback (tudo que não for /api serve o index.html) — app.use evita o wildcard do Express 5
    app.use((req, res, next) => (req.path.startsWith('/api') ? next() : res.sendFile(path.join(webDist, 'index.html'))));
  } else {
    app.use(notFound);
  }
} else {
  app.use(notFound);
}
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] rodando em http://localhost:${config.port} (env=${config.nodeEnv})`);
  if (!hasAnthropicKey()) {
    console.warn(
      '[server] AVISO: ANTHROPIC_API_KEY não configurada. Extração e análise de IA ficarão indisponíveis até definir a chave em packages/server/.env',
    );
  }
});
