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
import consultaRoutes from './routes/consulta';

const app = express();

app.use(cors({
  origin: config.webOrigin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Patient-Id', 'Range'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
}));
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
app.use('/api/consulta', consultaRoutes);

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
  const html = (a.contentMd || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/^### (.+)$/gm, '<h3 style="color:#336886;margin:20px 0 8px;font-size:16px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#336886;margin:24px 0 10px;font-size:18px">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0">$1</li>')
    .replace(/\n/g, '<br>');
  const docHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Resumo de Saúde — ${patientName}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#15233b;background:#f8fafc;padding:24px}
    .doc{max-width:720px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .header{background:linear-gradient(135deg,#336886,#1565c0);color:#fff;padding:28px 32px}
    .header h1{font-size:22px;font-weight:800}.header .sub{font-size:13px;opacity:.85;margin-top:4px}
    .body{padding:24px 32px;line-height:1.7;font-size:15px}
    .info-bar{background:#f0f7ff;border-radius:10px;padding:12px 16px;margin-bottom:20px;border-left:4px solid #336886;font-size:14px}
    .footer{text-align:center;padding:16px;font-size:11px;color:#aaa}
    ul{padding-left:20px;margin:8px 0}</style></head><body>
    <div class="doc"><div class="header"><h1>Resumo de Saúde</h1><div class="sub">Análise educativa — não substitui consulta médica</div></div>
    <div class="body"><div class="info-bar"><b>Paciente:</b> ${patientName}<br><b>Exame:</b> ${a.exam?.title ?? ''} — ${date}${lab ? ' • ' + lab : ''}</div>${html}</div>
    <div class="footer">Meus Exames • Análise educativa • Link expira em 3 dias</div></div></body></html>`;
  res.type('html').send(docHtml);
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
