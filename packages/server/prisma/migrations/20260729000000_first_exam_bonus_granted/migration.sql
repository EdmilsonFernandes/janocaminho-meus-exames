-- Flag "bônus de 1º exame já concedido" (anti re-farm).
-- Aditiva (IF NOT EXISTS) — sobrevive a re-run/estado parcial. Default false (todos os users
-- existentes continuam elegíveis até extraírem o próximo exame; aí o grant vira atômico e único).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firstExamBonusGranted" BOOLEAN NOT NULL DEFAULT false;
