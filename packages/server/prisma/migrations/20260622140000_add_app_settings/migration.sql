-- Config de monetização parametrizada (app_settings) + default de créditos no signup.
-- O painel admin grava aqui (persiste entre restarts/redeploys — antes era só em memória).

CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Novos signups ganham 60 créditos (era 100). Linhas existentes mantêm o saldo.
ALTER TABLE "users" ALTER COLUMN "credits" SET DEFAULT 60;

-- Defaults já no banco (carregados no boot; editáveis pelo painel admin).
INSERT INTO "app_settings" ("key", "value") VALUES
  ('creditCosts', '{"extraction":0,"summary":10,"consolidated":20,"chat":2}'::jsonb),
  ('uploadRules', '{"freeCost":1,"premiumFreeQuota":6,"premiumCost":5}'::jsonb),
  ('grants', '{"freeSignup":60,"monthly":250,"freeExamLimit":2}'::jsonb),
  ('shares', '{"exams":5,"evolution":5,"alerts":3,"summary":5}'::jsonb);
