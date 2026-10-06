-- Coerência client↔server: o toggle "Saúde Esportiva" do paciente passa a morar no
-- servidor (active). Antes era só localStorage → IA continuava com contexto após
-- desligar. Idempotente (IF NOT EXISTS).
ALTER TABLE "sports_profiles" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
