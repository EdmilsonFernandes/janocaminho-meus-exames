-- Foto do produto + EAN nas ofertas (fontes VTEX fornecem).
ALTER TABLE "medication_price_offers" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "medication_price_offers" ADD COLUMN IF NOT EXISTS "ean" TEXT;
