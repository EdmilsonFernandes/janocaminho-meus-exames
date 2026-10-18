-- Auditoria de monetização P0 (18/10/2026): instrumentação do funil de pagamento.
-- Aditiva e idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acquisitionSource" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trialUsedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reportVouchers" INTEGER NOT NULL DEFAULT 0;

-- Paywall hits: tentativas de uso travadas por saldo (o 402). Sem FK de propósito.
CREATE TABLE IF NOT EXISTS "paywall_hits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paywall_hits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "paywall_hits_userId_createdAt_idx" ON "paywall_hits"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "paywall_hits_createdAt_idx" ON "paywall_hits"("createdAt");
