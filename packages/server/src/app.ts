// App Express isolado do listen — permite importar `app` nos testes (supertest)
// sem subir o servidor. Efeitos de boot (cron de e-mails, listen) ficam em index.ts.
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { APP_BUILD_INFO } from './generated/buildInfo';
import { prisma } from './prisma';
import { errorHandler, notFound } from './middleware/errorHandler';
import { emailTemplate } from './utils/emailTemplate';
import { verifyUnsubToken } from './utils/unsubscribeToken';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import examRoutes from './routes/exam.routes';
import itemRoutes from './routes/item.routes';
import analysisRoutes from './routes/analysis.routes';
import chatRoutes from './routes/chat.routes';
import reminderRoutes from './routes/reminder.routes';
import billingRoutes from './routes/billing.routes';
import measurementRoutes from './routes/measurement.routes';
import riskRoutes from './routes/risk.routes';
import vaccineRoutes from './routes/vaccine.routes';
import expenseRoutes from './routes/expense.routes';
import deviceRoutes from './routes/device.routes';
import notificationRoutes from './routes/notification.routes';
import consultaRoutes from './routes/consulta';
import dataRoutes from './routes/data.routes';
import adminRoutes from './routes/admin.routes';
import doctorRoutes from './routes/doctor.routes';
import doctorShareRoutes from './routes/doctor-share.routes';
import doctorQuestionRoutes from './routes/doctor-question.routes';
import achievementRoutes from './routes/achievement.routes';
import ticketRoutes from './routes/ticket.routes';

export const app = express();
// trust proxy: o container corre atrás de nginx/docker — sem isso o rate-limit
// não identifica IPs corretamente (todos aparecem como 127.0.0.1).
app.set('trust proxy', 1);

const normalizeOrigin = (value?: string) => {
  if (!value) return '';
  try { return new URL(value).origin; } catch { return value.replace(/\/$/, ''); }
};
const allowedOrigins = new Set([
  normalizeOrigin(config.webOrigin),
  'https://janocaminho.com.br',
  'http://localhost:5173',
  'http://localhost:4011',
  'https://localhost',
  'capacitor://localhost',
  ...((process.env.CORS_ORIGINS ?? '').split(',').map((v) => normalizeOrigin(v.trim())).filter(Boolean)),
].filter(Boolean));
const isAllowedCorsOrigin = (origin?: string) => {
  if (!origin) return true; // curl, health checks, native clients.
  if (!config.isProd) return true;
  return allowedOrigins.has(origin);
};

app.use(cors({
  // API usa Authorization Bearer, sem sessão por cookie. Em prod, ainda assim
  // limitamos browsers às origens conhecidas e mantemos APK/health checks funcionando.
  origin: (origin, cb) => cb(null, isAllowedCorsOrigin(origin) ? origin || true : false),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Patient-Id', 'Range'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — protege contra brute force, DoS e dreno de créditos. Skip em dev/test.
const skipDev = () => process.env.NODE_ENV !== 'production';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, skip: skipDev, message: { error: 'Muitas tentativas. Aguarde 15 minutos.' } });
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, skip: skipDev, message: { error: 'Limite de IA por hora atingido.' } });
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, skip: skipDev, message: { error: 'Muitas requisições. Aguarde 1 minuto.' } });
// Cadastro tem limite próprio e bem mais apertado (8/hora/IP) — trava farm de contas pra
// roubar o bônus de créditos. Aplicado ANTES do authLimiter genérico (mais específico primeiro).
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, skip: skipDev, message: { error: 'Muitos cadastros deste local. Tente novamente mais tarde.' } });
app.use('/api/auth/register', signupLimiter);
app.use('/api/doctor/crm', signupLimiter); // busca pública de CRM (consultaCRM) no cadastro do médico — limita consumo da cota
app.use('/api/auth', authLimiter);
app.use('/api/analyses', aiLimiter);
app.use('/api/chat', aiLimiter);
app.use('/api/', generalLimiter);

app.get('/api/health', async (_req, res) => {
  const checks: Record<string, string> = {};
  try { await prisma.$queryRaw`SELECT 1`; checks.db = 'ok'; } catch { checks.db = 'down'; }
  const ok = Object.values(checks).every((v) => v === 'ok');
  res.status(ok ? 200 : 503).json({
    ok, ts: new Date().toISOString(), checks,
    // build carimbado na imagem → identifica exatamente qual versão está no ar no EC2
    build: {
      version: APP_BUILD_INFO.version,
      versionCode: APP_BUILD_INFO.versionCode,
      commit: APP_BUILD_INFO.shortHash,
      branch: APP_BUILD_INFO.branch,
      builtAt: APP_BUILD_INFO.builtAt,
      versionLabel: APP_BUILD_INFO.versionLabel,
      source: APP_BUILD_INFO.source,
    },
  });
});

// Build info completo (público) — qual versão/commit está rodando. Útil p/ rastrear deploys.
app.get('/api/build-info', (_req, res) => res.json(APP_BUILD_INFO));
// Força-atualização (público, sem auth): app compara a versão instalada com a mínima exigida.
app.get('/api/app/version', (_req, res) => res.json({ latest: config.appLatestVersion, minRequired: config.appMinVersion }));

app.use('/api/auth', authRoutes);
// ROTA PÚBLICA: foto do paciente (sem auth — precisa funcionar em <img src>)
app.get('/api/patients/:id/photo', async (req, res) => {
  try {
    const id = String(req.params.id);
    const p = await prisma.patient.findUnique({ where: { id }, select: { photoUrl: true } });
    // Cache HTTP: revalida por ETag (muda quando troca a foto) — 5min de cache + 304 barato.
    const etag = `"${id}:${p?.photoUrl ?? 'none'}"`;
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
    const { resolvePatientPhoto } = await import('./utils/storage');
    // 1) se photoUrl é um ref de storage (chave S3 ou caminho de disco), resolve
    if (p?.photoUrl && !p.photoUrl.startsWith('/api/')) {
      const r = await resolvePatientPhoto(p.photoUrl);
      if (r.kind === 'url') { res.redirect(r.url); return; }       // S3: redireciona p/ pré-assinada
      if (fs.existsSync(r.file)) { res.sendFile(path.resolve(r.file)); return; }
    }
    // 2) fallback: procura patient-<id>.* no disco (convenção antiga + dev)
    const dir = path.resolve(config.photosDir);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.startsWith(`patient-${id}.`));
      if (files.length) { res.sendFile(path.join(dir, files[0])); return; }
    }
    res.status(404).type('html').send('sem foto');
  } catch { res.status(404).type('html').send('sem foto'); }
});

app.use('/api/patients', patientRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/analyses', analysisRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/vaccines', vaccineRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/devices', deviceRoutes);
// ROTA PÚBLICA: unsubscribe/reativação de nudges por e-mail (1 clique, sem login — link no rodapé do e-mail).
// Tem que vir ANTES do mount auth-gado de /api/notifications pra funcionar sem token JWT.
app.get('/api/notifications/unsubscribe', async (req, res) => {
  const token = String(req.query.token ?? '');
  const userId = verifyUnsubToken(token);
  if (!userId) {
    res.status(404).type('html').send(emailTemplate({ title: 'Link inválido', content: '<p style="text-align:center;font-size:16px;color:#64748b;margin-top:20px">Link inválido ou expirado.</p>' }));
    return;
  }
  const enable = req.query.enable === '1' || req.query.enable === 'true';
  await prisma.user.update({ where: { id: userId }, data: { nudgeEmails: enable } }).catch(() => { /* usuário sumiu — idempotente */ });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, nudgeEmails: true } });
  const on = !!u?.nudgeEmails;
  const first = (u?.name || '').split(' ')[0] || 'olá';
  const appUrl = `${config.webOrigin}${config.webBasePath}`;
  const toggle = `${appUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}&enable=${on ? '0' : '1'}`;
  const btn = (label: string) => `<a href="${appUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:15px;font-weight:700;padding:12px 32px;border-radius:99px;text-decoration:none">${label}</a>`;
  res.type('html').send(emailTemplate({
    title: on ? 'Avisos por e-mail reativados' : 'Avisos por e-mail desligados',
    content: on
      ? `<div style="text-align:center"><div style="font-size:48px">✅</div><h2 style="font-size:20px;color:#0f3d3a;margin:12px 0 8px">Pronto, ${first}!</h2><p style="font-size:15px;color:#51607a;line-height:1.6;margin:0 0 20px">Você voltará a receber avisos de saúde por e-mail.</p>${btn('Abrir o app')}<p style="font-size:13px;margin:18px 0 0"><a href="${toggle}" style="color:#8b9bb4;text-decoration:underline">Desligar de novo</a></p></div>`
      : `<div style="text-align:center"><div style="font-size:48px">🔕</div><h2 style="font-size:20px;color:#0f3d3a;margin:12px 0 8px">Avisos por e-mail desligados</h2><p style="font-size:15px;color:#51607a;line-height:1.6;margin:0 0 20px">Pronto, ${first}. Você não vai mais receber estes avisos por e-mail. As notificações dentro do app continuam normais.</p>${btn('Abrir o app')}<p style="font-size:13px;margin:18px 0 0"><a href="${toggle}" style="color:#8b9bb4;text-decoration:underline">Reativar avisos por e-mail</a></p></div>`,
  }));
});

app.use('/api/notifications', notificationRoutes);
app.use('/api/consulta', consultaRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/doctor-shares', doctorShareRoutes);
app.use('/api/doctor-questions', doctorQuestionRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/tickets', ticketRoutes); // chamados de suporte do paciente (admin gerencia em /api/admin/tickets)

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
    // shareToken é único — NÃO filtra por type (antes exigia SUMMMARY e o relatório
    // CONSOLIDADO, que é o principal compartilhado, caía em "Link inválido").
    where: { shareToken: token },
    include: { exam: { select: { title: true, performedAt: true, sourceLab: true, patient: { select: { fullName: true } } } } },
  });
  if (!a) {
    res.status(404).type('html').send(emailTemplate({
      title: 'Link inválido',
      content: '<p style="text-align:center;font-size:16px;color:#64748b;margin-top:20px">Link inválido ou não encontrado.</p>',
    }));
    return;
  }
  // Gate por PIN (senha de 6 dígitos) — o paciente envia ao médico separadamente
  const enteredPin = String(req.query.pin ?? '');
  const pinHash = crypto.createHash('sha256').update(`${enteredPin}:${token}`).digest('hex');
  if (!a.sharePin || pinHash !== a.sharePin) {
    res.type('html').send(pinGateHtml(req.originalUrl.replace(/\?.*$/, ''), !enteredPin));
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

// Página de entrada da senha (PIN) para o link compartilhado com o médico
function pinGateHtml(actionUrl: string, empty: boolean): string {
  return emailTemplate({
    title: 'Acesso ao resumo',
    content:
      '<div style="max-width:380px;margin:30px auto;text-align:center">' +
      '<div style="font-size:42px">🔒</div>' +
      '<p style="font-size:17px;color:#334155;margin:14px 0 4px"><b>Digite a senha de 6 dígitos</b></p>' +
      '<p style="font-size:13px;color:#94a3b8;margin:0 0 18px">O paciente envia essa senha junto com o link.</p>' +
      (empty ? '' : '<p style="color:#dc2626;font-size:13px;margin-bottom:10px">❌ Senha incorreta. Tente novamente.</p>') +
      `<form method="GET" action="${actionUrl}" style="display:flex;gap:8px;justify-content:center;align-items:center">` +
      '<input name="pin" inputmode="numeric" maxlength="6" placeholder="••••••" autofocus required ' +
      'style="font-size:24px;letter-spacing:10px;text-align:center;width:170px;padding:14px;border:2px solid #2a93b8;border-radius:12px;outline:none" />' +
      '<button type="submit" style="background:#2a93b8;color:#fff;border:none;border-radius:12px;padding:14px 22px;font-weight:700;font-size:15px;cursor:pointer">Entrar</button>' +
      '</form></div>',
  });
}

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
    // Cache headers (padrão SPA): assets hasheados (/assets/*) são imutáveis por content-hash → 1 ano;
    // index.html NUNCA cacheia (no-store) → após cada deploy o browser pega o index fresco com os hashes novos.
    // ANTES era max-age=0 (default) → browser/CDN podiam servir index stale → entry velho → asset que sumiu → MIME error.
    app.use(express.static(webDist, {
      setHeaders: (res, filepath) => {
        if (filepath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-store');
      },
    }));
    // SPA fallback (tudo que não for /api serve o index.html) — app.use evita o wildcard do Express 5
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-store'); // index.html nunca cacheado
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.use(notFound);
  }
} else {
  app.use(notFound);
}
// Sentry error handler (deve vir ANTES do errorHandler customizado) — captura exceptions no Express
// @ts-ignore — Handlers existe em runtime no @sentry/node
if (process.env.SENTRY_DSN) app.use(Sentry.Handlers.errorHandler());
app.use(errorHandler);
