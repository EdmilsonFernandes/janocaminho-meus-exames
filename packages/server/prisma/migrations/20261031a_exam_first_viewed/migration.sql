-- Funil "resultado visualizado": 1ª vez que o dono abriu o exame extraído.
-- Aditiva e idempotente (IF NOT EXISTS) — segura p/ re-run e estado parcial.
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "firstViewedAt" TIMESTAMP(3);
