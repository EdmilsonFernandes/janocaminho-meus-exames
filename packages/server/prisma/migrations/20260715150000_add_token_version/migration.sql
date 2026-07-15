-- tokenVersion em users: invalida sessões JWT após reset/troca de senha (payload.ver vs DB).
-- Aditiva (IF NOT EXISTS) — convenção do projeto (SKILL.md): dev usa db push, migrate deploy em prod.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
