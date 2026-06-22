-- AddColumns: referral system (indicação de amigos = créditos)
ALTER TABLE "users" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN "referredBy" TEXT;
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");
