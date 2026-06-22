-- Registra o custo (em créditos) debitado do paciente ao criar um compartilhamento,
-- pra aparecer no extrato de créditos (/billing/credits/history). Default 0 (reativar/editar = grátis).
ALTER TABLE "doctor_shares" ADD COLUMN "creditsCharged" INTEGER NOT NULL DEFAULT 0;
