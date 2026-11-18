-- Presença (18/11/2026): heartbeat de 5min do requireAuth → "online agora" / "visto há" no admin.
-- Aditiva e idempotente (drift gate): IF NOT EXISTS sobrevive a re-run/estado parcial.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "users_last_active_idx" ON "users"("lastActiveAt");
