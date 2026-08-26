-- Telemetria do funil público "decifre seu exame" (landing): contagens por evento.
-- LGPD-safe: hash de IP, nada do exame. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "decifre_events" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "itemsCount" INTEGER NOT NULL,
    "abnormalCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "decifre_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "decifre_events_createdAt_idx" ON "decifre_events"("createdAt");
