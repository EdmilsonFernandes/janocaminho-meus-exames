import 'dotenv/config';
import fs from 'fs';
import path from 'path';

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') {
    // algumas chaves são opcionais em dev (ex.: ANTHROPIC_API_KEY); só falham onde usadas.
    if (fallback === undefined) return '';
  }
  return v ?? '';
}

// Auto-detecta o serviceAccountKey.json do Firebase (Admin) se FIREBASE_SERVICE_ACCOUNT_PATH não estiver setado.
function resolveFirebaseKey(): string {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (env) return env;
  const dirs = [process.cwd(), __dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')];
  for (const d of dirs) {
    try {
      const hit = fs.readdirSync(d).find((f) => /firebase-adminsdk.*\.json$/.test(f));
      if (hit) return path.join(d, hit);
    } catch { /* dir inexistente */ }
  }
  return '';
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',

  databaseUrl: required('DATABASE_URL', 'postgresql://meus_exames:meus_exames_dev@localhost:5433/meus_exames?schema=public'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Relay Z.ai aceita modelos GLM (ANTHROPIC_MODEL); NÃO use "claude-opus-4-8" (o relay rejeita).
  extractionModel: process.env.ANTHROPIC_MODEL || process.env.EXTRACTION_MODEL || 'glm-4.6',
  extractionDryRun: process.env.EXTRACTION_DRY_RUN === 'true',

  uploadDir: process.env.UPLOAD_DIR ?? './data/exams',
  photosDir: process.env.PHOTOS_DIR ?? './data/photos',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  webBasePath: (process.env.WEB_BASE_PATH ?? '').replace(/\/$/, ''), // ex.: /meus-exames

  appEncryptionKey: process.env.APP_ENCRYPTION_KEY ?? '',

  // Armazenamento de arquivos (S3 se configurado; senão disco local — dev)
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3Region: process.env.S3_REGION ?? process.env.AWS_REGION ?? '',
  s3Prefix: (process.env.S3_PREFIX ?? 'meus-exames/').replace(/^\/+|\/+$/g, '') + '/',

  // Mercado Pago (gateway de pagamento — assinaturas)
  mpAccessToken: process.env.MP_ACCESS_TOKEN ?? '',
  mpApiBaseUrl: process.env.MP_API_BASE_URL ?? 'https://api.mercadopago.com',
  mpPublicKey: process.env.MP_PUBLIC_KEY ?? '',
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
  // URL pública do webhook (em prod: https://janocaminho.com.br/meus-exames/api/billing/webhook)
  mpWebhookUrl: process.env.MP_WEBHOOK_URL ?? '',
  mpNotificationUrl: process.env.MP_NOTIFICATION_URL ?? '',

  // Paywall: nº de exames gratuitos antes de exigir assinatura
  freeExamLimit: Number(process.env.FREE_EXAM_LIMIT ?? 2),

  // Cobrança de UPLOAD de exame (por dependente, cota mensal).
  //   Free: freeCost créditos por envio (sempre).
  //   Premium ativo: primeiros premiumFreeQuota envios do mês = grátis; depois premiumCost cada.
  //   O contador (monthlyUploadCount) é mensal e NÃO devolve ao deletar exame (anti-gambiarra).
  uploadRules: {
    freeCost: Number(process.env.UPLOAD_FREE_COST ?? 1),
    premiumFreeQuota: Number(process.env.UPLOAD_PREMIUM_FREE ?? 6),
    premiumCost: Number(process.env.UPLOAD_PREMIUM_COST ?? 5),
  },

  // Force-update: latest AUTO-DERIVADO do build.gradle (bumpa versionName + pusha + deploya).
  // min: pra forçar update crítico, seta APP_MIN_VERSION no .env do server.
  appLatestVersion: (() => {
    const env = process.env.APP_LATEST_VERSION;
    if (env) return env;
    try { const g = fs.readFileSync(path.join(process.cwd(), 'packages/mobile/android/app/build.gradle'), 'utf8'); const m = g.match(/versionName\s+"([^"]+)"/); if (m) return m[1]; } catch {}
    return '1.4.15';
  })(),
  appMinVersion: process.env.APP_MIN_VERSION ?? '1.0.0',

  // Firebase (push notifications) — caminho do service account (admin SDK)
  firebaseServiceAccountPath: resolveFirebaseKey(),

  // "Memória" do agente (historico.md por paciente) — path absoluto alinhado ao volume
  agentDir: process.env.AGENT_DIR ?? './data/agent',
} as const;

export const hasMercadoPago = () => config.mpAccessToken.trim().length > 0;

export const useS3 = () => config.s3Bucket.trim().length > 0;

export const hasAnthropicKey = () =>
  config.anthropicApiKey.trim().length > 0 || !!process.env.ANTHROPIC_AUTH_TOKEN;
