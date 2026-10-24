-- Brief v2 (24/10/26): alergias do paciente — destaque no brief médico + insumo do
-- SOAP/resumo pós-consulta. Aditiva e idempotente (sobrevive a re-run/estado parcial).
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "allergies" TEXT;
