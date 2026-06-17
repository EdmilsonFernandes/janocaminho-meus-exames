-- AlterTable: gênero do paciente ("male"|"female") define a coluna de referência (Homens/Mulheres)
ALTER TABLE "patients" ADD COLUMN "gender" TEXT;
