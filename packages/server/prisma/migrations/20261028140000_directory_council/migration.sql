-- DirectoryProfessional: registro no conselho de classe (28/10/26, V1.3+).
-- O vínculo tbCargaHorariaSus traz NU_REGISTRO/SG_UF_CRM/CO_CONSELHO_CLASSE — p/ CR
-- MEDICINA (código 10) o card CNES exibe o CRM e "Salvar" preenche automático.
-- Aditiva e idempotente (a 20261028130000 já aplicada em prod — NÃO editar a antiga).

ALTER TABLE "directory_professionals" ADD COLUMN IF NOT EXISTS "councilType" TEXT;
ALTER TABLE "directory_professionals" ADD COLUMN IF NOT EXISTS "councilUf" TEXT;
ALTER TABLE "directory_professionals" ADD COLUMN IF NOT EXISTS "councilReg" TEXT;
