-- Ciclo de vida da teleconsulta (22/10/26): encerramento real (endedAt). Depois de
-- endedAt≠null o /join responde 403 TELECONSULTA_ENDED — a consulta vira histórico
-- (transcrição/pedidos/feedback) e não pode mais ser re-entrada.
-- Aditiva + idempotente (IF NOT EXISTS — padrão da casa, ver 20261020120000_f3).
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP;
