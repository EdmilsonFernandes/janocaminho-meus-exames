-- Ledger de créditos (extrato / Histórico de Uso). Fonte única: toda entrada/saída grava uma linha.
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "credit_transactions_userId_createdAt_idx" ON "credit_transactions"("userId", "createdAt");
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BACKFILL one-time: reconstrói o histórico antigo das tabelas existentes (roda só no deploy).

-- 1) Gasto de IA: chat (−2), resumo (−10), consolidado (−20). userId vem do dono do paciente.
INSERT INTO "credit_transactions" ("id","userId","delta","kind","label","refId","createdAt")
SELECT gen_random_uuid(), p."ownerId",
  CASE WHEN a."type" = 'CHAT' THEN -2 WHEN a."examId" IS NOT NULL THEN -10 ELSE -20 END,
  CASE WHEN a."type" = 'CHAT' THEN 'ai_chat' WHEN a."examId" IS NOT NULL THEN 'ai_summary' ELSE 'ai_consolidated' END,
  CASE WHEN a."type" = 'CHAT' THEN 'Chat com a IA' WHEN a."examId" IS NOT NULL THEN 'Resumo do exame' ELSE 'Relatório consolidado' END,
  a."id", a."createdAt"
FROM "ai_analyses" a JOIN "patients" p ON p."id" = a."patientId"
WHERE p."ownerId" IS NOT NULL;

-- 2) Compras de pack + bônus de indicação (referral gravava amount=créditos c/ label errado de "compra").
INSERT INTO "credit_transactions" ("id","userId","delta","kind","label","refId","createdAt")
SELECT gen_random_uuid(), s."userId",
  CASE WHEN s."mpPreferenceId" LIKE 'referral_%' THEN s."amount"
       ELSE CASE WHEN s."amount" BETWEEN 9.80 AND 10.00 THEN 50
                 WHEN s."amount" BETWEEN 24.80 AND 25.00 THEN 140
                 WHEN s."amount" BETWEEN 49.80 AND 50.00 THEN 320
                 ELSE ROUND(s."amount" * 25) END END,
  CASE WHEN s."mpPreferenceId" LIKE 'referral_%' THEN 'referral' ELSE 'purchase' END,
  CASE WHEN s."mpPreferenceId" LIKE 'referral_%' THEN 'Bônus de indicação'
       ELSE REPLACE(TO_CHAR(s."amount", 'FM999999990.00'), '.', ',') END,
  s."id", s."updatedAt"
FROM "subscriptions" s
WHERE s."periodDays" = 0 AND s."status" = 'APPROVED';

-- 3) Compartilhamento com médico (débito).
INSERT INTO "credit_transactions" ("id","userId","delta","kind","label","refId","createdAt")
SELECT gen_random_uuid(), p."ownerId", -sh."creditsCharged", 'share', 'Compartilhamento com médico', sh."id", sh."createdAt"
FROM "doctor_shares" sh JOIN "patients" p ON p."id" = sh."patientId"
WHERE sh."creditsCharged" > 0 AND p."ownerId" IS NOT NULL;

-- 4) Conquistas resgatadas (+1 crédito cada).
INSERT INTO "credit_transactions" ("id","userId","delta","kind","label","refId","createdAt")
SELECT gen_random_uuid(), g."userId", 1, 'achievement',
  CASE g."badgeId"
    WHEN 'first_exam' THEN 'Conquista: Primeiro exame'
    WHEN 'collector'  THEN 'Conquista: Colecionador'
    WHEN 'scholar'    THEN 'Conquista: Estudioso'
    WHEN 'archive'    THEN 'Conquista: Arquivista'
    WHEN 'healthy'    THEN 'Conquista: Saudável'
    WHEN 'streak3'    THEN 'Conquista: Constância'
    WHEN 'streak7'    THEN 'Conquista: Dedicado'
    WHEN 'streak30'   THEN 'Conquista: Mestre da saúde'
    ELSE CONCAT('Conquista: ', g."badgeId") END,
  g."badgeId", g."createdAt"
FROM "achievement_grants" g;
