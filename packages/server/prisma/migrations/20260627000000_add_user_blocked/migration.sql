-- AlterTable: adiciona flag de conta bloqueada pelo admin.
-- Login de usuário bloqueado retorna mensagem amigável de contato com suporte (sem revelar o motivo).
ALTER TABLE "users" ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;
