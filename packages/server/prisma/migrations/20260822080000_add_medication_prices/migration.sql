-- Enriquecimento de medicamentos + cache global de preços (aditivo, idempotente).
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "activeIngredient" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "dosageValue" DOUBLE PRECISION;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "dosageUnit" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "form" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "packQty" INTEGER;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "lab" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "ean" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "productType" TEXT;
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "priceStatus" TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE "medications" ADD COLUMN IF NOT EXISTS "priceCheckedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "medications_priceStatus_priceCheckedAt_idx" ON "medications"("priceStatus", "priceCheckedAt");

CREATE TABLE IF NOT EXISTS "medication_price_snapshots" (
    "id" TEXT NOT NULL,
    "medicationKey" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL DEFAULT 'BR',
    "lowestPriceCents" INTEGER,
    "averagePriceCents" INTEGER,
    "offersCount" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medication_price_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "medication_price_snapshots_medicationKey_locationKey_key" ON "medication_price_snapshots"("medicationKey", "locationKey");

CREATE TABLE IF NOT EXISTS "medication_price_offers" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "pharmacy" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "medication_price_offers_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_price_offers_snapshotId_fkey') THEN
        ALTER TABLE "medication_price_offers" ADD CONSTRAINT "medication_price_offers_snapshotId_fkey"
            FOREIGN KEY ("snapshotId") REFERENCES "medication_price_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS "medication_price_offers_snapshotId_priceCents_idx" ON "medication_price_offers"("snapshotId", "priceCents");
