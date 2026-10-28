-- CUPONS DE DESCONTO NO CHECKOUT (T3, 28/10/26): código promocional (founder/indicação)
-- aplicável a assinatura mensal e compra de créditos. Aditiva e idempotente
-- (IF NOT EXISTS / DO-block — padrão da casa, sobrevive a re-run/estado parcial).

CREATE TABLE IF NOT EXISTS "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'any',
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");
CREATE INDEX IF NOT EXISTS "coupons_active_code_idx" ON "coupons"("active", "code");

CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCentsOriginal" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);
-- 1 uso por usuário por tipo (v1 simples).
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_couponId_userId_kind_key"
    ON "coupon_redemptions"("couponId", "userId", "kind");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_userId_idx" ON "coupon_redemptions"("userId");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupon_redemptions_couponId_fkey'
    ) THEN
        ALTER TABLE "coupon_redemptions"
            ADD CONSTRAINT "coupon_redemptions_couponId_fkey"
            FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Cupom aplicado gravado na própria Subscription (drift-safe: nullable) — o webhook lê
-- na aprovação p/ incrementar uses + criar a redemption.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "couponDiscountCents" INTEGER;
