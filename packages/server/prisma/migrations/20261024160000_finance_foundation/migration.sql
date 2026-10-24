-- ONDA 2 — Fundação financeira (§18 spec gaps 24/10 + arquitetura A, docs/design/
-- 2026-10-24-finance-architecture.md). Aditiva e idempotente (IF NOT EXISTS — sobrevive
-- a re-run/estado parcial, padrão do repo). SEM FK (scalars, drift-safe).

-- Regra comercial: geral (doctorId NULL) ou específica por médico, com vigência.
CREATE TABLE IF NOT EXISTS "commission_rules" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT,
    "platformBps" INTEGER NOT NULL DEFAULT 2000,
    "feeBearer" TEXT NOT NULL DEFAULT 'platform',
    "releaseDelayDays" INTEGER NOT NULL DEFAULT 3,
    "minPayoutCents" INTEGER NOT NULL DEFAULT 2000,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "commission_rules_doctorId_validFrom_idx" ON "commission_rules"("doctorId", "validFrom");

-- Ledger de partidas duplas — imutável (só INSERT; correção = compensatório).
CREATE TABLE IF NOT EXISTS "ledger_entries" (
    "id" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "reminderId" TEXT,
    "doctorId" TEXT,
    "account" TEXT NOT NULL,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" TEXT,
    "ruleSnapshot" JSONB,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
-- Unicidade parcial por txn: 2 postagens do mesmo evento NÃO duplicam partidas
-- (idempotência estrutural; NULLs são distintos no PG → a checagem prévia no app é a
-- barreira primária, esta é o cinto de segurança).
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_txnId_account_refId_key"
    ON "ledger_entries"("txnId", "account", "refId");
CREATE INDEX IF NOT EXISTS "ledger_entries_reminderId_idx" ON "ledger_entries"("reminderId");
CREATE INDEX IF NOT EXISTS "ledger_entries_doctorId_createdAt_idx" ON "ledger_entries"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ledger_entries_account_createdAt_idx" ON "ledger_entries"("account", "createdAt");

-- Repasse (máquina de estados da onda 4 — fundação agora).
CREATE TABLE IF NOT EXISTS "payouts" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "providerTransferId" TEXT,
    "reserveTxnId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_reminderId_key" ON "payouts"("reminderId");
CREATE INDEX IF NOT EXISTS "payouts_doctorId_status_idx" ON "payouts"("doctorId", "status");

-- Snapshot da regra congelada no agendamento + elegibilidade de liberação (D+N).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "commissionSnapshot" JSONB;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "releaseEligibleAt" TIMESTAMP(3);
