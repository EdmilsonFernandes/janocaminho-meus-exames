-- AlterTable: adiciona bloqueio administrativo de médicos
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;
