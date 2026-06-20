-- Verificação de e-mail no cadastro (previne conta com e-mail fake)
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
-- "Avôs" usuários já existentes (já estão em uso) — não exige revalidar
UPDATE "users" SET "emailVerified" = true;
