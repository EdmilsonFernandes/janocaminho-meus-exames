-- PIX retomável (padrão gateway): guarda QR + expiry na Subscription
-- para devolver o MESMO pagamento quando o usuário sai e volta.
-- Aditiva e idempotente (IF NOT EXISTS) — sobrevive a re-run/estado parcial.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "pixExpiresAt" TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "pixQrCode" TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "pixQrBase64" TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "pixCredits" INTEGER;

-- Índice para o lookup de PIX ativo (findFirst por userId + status + expiresAt)
CREATE INDEX IF NOT EXISTS idx_subscriptions_pix_pending
  ON subscriptions ("userId", status, "pixExpiresAt")
  WHERE status = 'PENDING' AND "periodDays" = 0;
