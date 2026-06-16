import 'dotenv/config';

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') {
    // algumas chaves são opcionais em dev (ex.: ANTHROPIC_API_KEY); só falham onde usadas.
    if (fallback === undefined) return '';
  }
  return v ?? '';
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',

  databaseUrl: required('DATABASE_URL', 'postgresql://meus_exames:meus_exames_dev@localhost:5433/meus_exames?schema=public'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  extractionModel: process.env.EXTRACTION_MODEL ?? 'claude-opus-4-8',
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
} as const;

export const hasMercadoPago = () => config.mpAccessToken.trim().length > 0;

export const useS3 = () => config.s3Bucket.trim().length > 0;

export const hasAnthropicKey = () =>
  config.anthropicApiKey.trim().length > 0 || !!process.env.ANTHROPIC_AUTH_TOKEN;
