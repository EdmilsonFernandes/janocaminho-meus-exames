-- Médico agora valida e-mail no cadastro (OTP), igual o paciente. Antes logava direto (furo: e-mail falso + CRM alheio).
ALTER TABLE "doctors" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
-- Médicos JÁ cadastrados continuam ativos (não bloqueia quem já usa a conta).
UPDATE "doctors" SET "emailVerified" = true;
