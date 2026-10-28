-- Fila imediata v1.1: valor PRÓPRIO do atendimento imediato (null = usa consultPriceCents).
-- Aditiva + idempotente (padrão da casa).
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "instantPriceCents" INTEGER;
