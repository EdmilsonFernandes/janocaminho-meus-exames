-- Usabilidade admin: espelho server-side do toggle de Libras (antes só localStorage).
-- Aditiva e idempotente — sobrevive a re-run/estado parcial.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "librasEnabled" BOOLEAN NOT NULL DEFAULT false;
