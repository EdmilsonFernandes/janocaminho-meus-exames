-- Adiciona UF (estado) do CRM no médico, p/ busca estruturada CRM + UF.
-- Coluna anulável (nullable) → aditiva, sem risco a dados existentes.
ALTER TABLE "doctors" ADD COLUMN "crmUf" TEXT;
