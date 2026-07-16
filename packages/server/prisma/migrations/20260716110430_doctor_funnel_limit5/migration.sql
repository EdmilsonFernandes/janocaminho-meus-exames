-- Sobe o limite padrão de perguntas em aberto de 2 -> 5 (= lote de sugestões do relatório).
-- Simples DDL/DML, válido no Postgres.
ALTER TABLE "doctor_shares" ALTER COLUMN "openQuestionLimit" SET DEFAULT 5;
UPDATE "doctor_shares" SET "openQuestionLimit" = 5 WHERE "openQuestionLimit" = 2;
ALTER TABLE "doctors" ALTER COLUMN "defaultQuestionLimit" SET DEFAULT 5;
UPDATE "doctors" SET "defaultQuestionLimit" = 5 WHERE "defaultQuestionLimit" = 2;
