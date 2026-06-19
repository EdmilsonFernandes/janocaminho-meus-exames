-- Contador mensal de uploads por dependente (cota grátis do premium).
-- monthlyUploadCount NÃO devolve ao deletar exame (anti-gambiarra).
ALTER TABLE "patients" ADD COLUMN "uploadMonth" TEXT;
ALTER TABLE "patients" ADD COLUMN "monthlyUploadCount" INTEGER NOT NULL DEFAULT 0;
