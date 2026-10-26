-- §5 dono (26/10/26) — estratégia de ausência DIFERENCIADA (tolerância 10min configurável):
-- no_show passa a registrar QUEM faltou (noShowBy) e o 1º join do MÉDICO ganha carimbo
-- próprio (simetria do patientJoinedAt) p/ o /end e o auto-end decidirem noShowBy='doctor'.
-- Aditiva + idempotente (IF NOT EXISTS — padrão do repo).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "doctorJoinedAt" TIMESTAMP(3);
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "noShowBy" TEXT;
