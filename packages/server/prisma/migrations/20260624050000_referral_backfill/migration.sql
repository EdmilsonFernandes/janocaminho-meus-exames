-- Backfill de INDICAÇÕES no extrato: derivado do vínculo User.referredBy (não das subscriptions,
-- que podem não existir p/ indicações antigas). +30 por indicação realizada.
-- Display-only (o saldo já foi creditado na época); a guarda NOT EXISTS evita duplicar com o que
-- já veio do backfill anterior (subscriptions) ou foi gravado pra frente (auth.routes).
INSERT INTO "credit_transactions" ("id","userId","delta","kind","label","refId","createdAt")
SELECT gen_random_uuid(), referrer."id", 30, 'referral', 'Bônus de indicação',
       CONCAT('referral_', referred."id"), COALESCE(referred."createdAt", now())
FROM "users" referred
JOIN "users" referrer ON referrer."referralCode" = referred."referredBy"
WHERE referred."referredBy" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "credit_transactions" ct
    WHERE ct."userId" = referrer."id" AND ct."refId" = CONCAT('referral_', referred."id")
  );
