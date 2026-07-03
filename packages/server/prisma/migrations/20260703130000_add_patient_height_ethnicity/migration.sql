-- AlterTable
-- M1 (perfil biométrico): adiciona altura (cm) e etnia ao paciente.
-- Base do BMI no M2; etnia IBGE (sem acento). Ambas nullable/aditivas.
-- IF NOT EXISTS por convenção do projeto (SKILL.md): dev usa db push, migrations aditivas.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "heightCm" INTEGER;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "ethnicity" TEXT;
