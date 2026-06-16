import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config, hasAnthropicKey } from './config';
import { prisma } from './prisma';
import { errorHandler, notFound } from './middleware/errorHandler';
import { emailTemplate } from './utils/emailTemplate';
import { startReminderEmailJob } from './jobs/reminderEmails';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import examRoutes from './routes/exam.routes';
import itemRoutes from './routes/item.routes';
import analysisRoutes from './routes/analysis.routes';
import chatRoutes from './routes/chat.routes';
import reminderRoutes from './routes/reminder.routes';
import billingRoutes from './routes/billing.routes';
import measurementRoutes from './routes/measurement.routes';
import vaccineRoutes from './routes/vaccine.routes';

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
app.use('/api/vaccines', vaccineRoutes);

// ROTA PÚBLICA: médico vê o resumo compartilhado (sem login, expira em 3 dias)
app.get('/api/public/shared/:token', async (req, res) => {
  const token = String(req.params.token);
  const parts = token.split('.');
  if (parts.length === 2) {
    const expires = Number(parts[1]);
    if (Date.now() > expires) {
      res.status(410).type('html').send(emailTemplate({
        title: 'Link expirado',
        content: '<p style="text-align:center;font-size:16px;color:#64748b;margin-top:20px">⏰ Este link expirou (válido por 3 dias).\nPeça ao paciente para gerar um novo.</p>',
      }));
      return;
    }
  }
  const a = await prisma.aiAnalysis.findFirst({
    where: { shareToken: token, type: 'SUMMARY' },
    include: { exam: { select: { title: true, performedAt: true, sourceLab: true, patient: { select: { fullName: true } } } } },
  });
  if (!a) {
    res.status(404).type('html').send(emailTemplate({
      title: 'Link inválido',
      content: '<p style="text-align:center;font-size:16px;color:#64748b;margin-top:20px">Link inválido ou não encontrado.</p>',
    }));
    return;
  }
  const date = a.exam?.performedAt ? new Date(a.exam.performedAt as Date).toLocaleDateString('pt-BR') : '';
  const patientName = a.exam?.patient?.fullName ?? '';
  const lab = a.exam?.sourceLab ?? '';
  // converte markdown básico para HTML (###, **, -, 1.)
  const html = (a.contentMd || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/^### (.+)$/gm, '<h3 style="color:#336886;margin:20px 0 8px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#336886;margin:24px 0 10px">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.+<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
  res.type('html').send(emailTemplate({
    title: `Resumo de Saúde — ${a.exam?.title ?? 'Exame'}`,
    preheader: `${patientName} • ${date}${lab ? ' • ' + lab : ''}`,
    content: html,
  }));
});

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
  startReminderEmailJob();
  if (!hasAnthropicKey()) {
    console.warn(
      '[server] AVISO: ANTHROPIC_API_KEY não configurada. Extração e análise de IA ficarão indisponíveis até definir a chave em packages/server/.env',
    );
  }
});
