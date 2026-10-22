-- Fila de transcrição (22/10/26): retryCount do job transcriptionQueue — conta as
-- tentativas de STT que falharam por rede/timeout; ≥5 → abort definitivo (áudio
-- removido + push "falhou definitivamente"); sucesso/re-upload → 0.
-- Aditiva + idempotente (IF NOT EXISTS — padrão da casa, ver 20261022120000).
-- DEFAULT 0: as rows existentes nascem zeradas (increment sobre NULL seria NULL).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER DEFAULT 0;
