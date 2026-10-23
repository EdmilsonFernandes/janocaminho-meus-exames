-- Consulta particular (23/10/26): médico define valor padrão da teleconsulta; o
-- Reminder congela o valor no agendamento e rastreia o pagamento (paidAt/paymentRef).
-- Aditiva e idempotente (IF NOT EXISTS — sobrevive a re-run/estado parcial).
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "consultPriceCents" INTEGER;

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "consultPriceCents" INTEGER;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;
