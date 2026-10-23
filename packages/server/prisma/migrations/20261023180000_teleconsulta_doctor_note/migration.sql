-- QuickNote do médico (23/10): nota clínica da teleconsulta no prontuário.
-- Aditiva + idempotente (sobrevive a re-run/estado parcial).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "doctorNote" TEXT;
