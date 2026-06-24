-- Nudge de saúde por e-mail: fallback proativo p/ quem NÃO tem push (ex.: iPhone no navegador).
-- Default true (cobre quem já existe). Usuário desliga via link de unsubscribe no próprio e-mail.
ALTER TABLE "users" ADD COLUMN "nudgeEmails" BOOLEAN NOT NULL DEFAULT true;
