-- Compartilhamento por exame específico: examIds em "doctor_shares".
-- VAZIA = TODOS os exames (backward-compat — shares existentes continuam mostrando tudo).
-- Não-vazia = só os exames cujos IDs estão no array (cada médico pode avaliar um conjunto;
-- pra evolução, o paciente compartilha vários).
-- Aditivo + idempotente (IF NOT EXISTS, backfill seguro) — sobrevive a re-run/estado parcial.
ALTER TABLE "doctor_shares" ADD COLUMN IF NOT EXISTS "examIds" TEXT[];
UPDATE "doctor_shares" SET "examIds" = '{}' WHERE "examIds" IS NULL;
ALTER TABLE "doctor_shares" ALTER COLUMN "examIds" SET DEFAULT '{}';
ALTER TABLE "doctor_shares" ALTER COLUMN "examIds" SET NOT NULL;
