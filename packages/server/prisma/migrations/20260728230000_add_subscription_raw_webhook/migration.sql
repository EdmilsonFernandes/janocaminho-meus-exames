-- Payload bruto do Mercado Pago no Subscription (auditoria p/ admin).
-- O webhook do MP (billing.routes /webhook) grava o payment completo aqui,
-- pra o admin conferir em caso de disputa/reclamação ("o usuário pagou?").
-- Aditiva + idempotente (IF NOT EXISTS).
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "rawWebhook" JSONB;
