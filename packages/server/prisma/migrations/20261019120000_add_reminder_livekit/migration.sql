-- F2 LiveKit (19/10/26): teleconsulta com vídeo DENTRO do app. Reminder ganha o
-- provedor da chamada ('meet'|'livekit'|null) e a sala LiveKit (F3 egress
-- referenciará pelo nome). Nullable = legado (null) mantém comportamento atual.
-- Aditiva + idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial.
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "roomName" TEXT;
