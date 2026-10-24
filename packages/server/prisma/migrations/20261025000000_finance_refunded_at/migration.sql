-- Onda 4 (§18.5-18.7): execução financeira.
-- 1) marca de estorno EXECUTADO no provedor (cache de leitura do evento
--    refund_<reminderId> do ledger — a fonte da verdade continua no ledger).
-- 2) payouts.updatedAt: idade do ESTADO (unknown >30min → conciliar; >24h sem
--    registro no provedor → failed). Aditivas + idempotentes (IF NOT EXISTS).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();
