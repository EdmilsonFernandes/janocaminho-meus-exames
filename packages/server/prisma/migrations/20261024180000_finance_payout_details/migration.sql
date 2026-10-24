-- Onda 3 (§18.1/§18.5): dados de recebimento do médico — chave PIX criptografada.
-- Aditiva + idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial.
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "payoutPixKeyEnc" TEXT;
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "payoutPixKeyIv" TEXT;
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "payoutPixKeyType" TEXT;
