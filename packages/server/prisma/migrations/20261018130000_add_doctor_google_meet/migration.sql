-- Lote "encontro estilo Teams" (18/10/26): credencial OAuth do Google do médico p/ criar
-- salas Meet automaticamente (escopo meetings.space.created). Aditiva + idempotente.
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "googleRefreshTokenEnc" TEXT;
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "googleRefreshTokenIv" TEXT;
