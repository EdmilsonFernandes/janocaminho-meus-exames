-- Conquistas (gamificação): streak server-side (anti-farm) + 1 crédito por badge (1x só, via unique).
ALTER TABLE "users" ADD COLUMN "streakDays" INTEGER NOT NULL DEFAULT 0,
                      ADD COLUMN "lastActiveDay" TEXT,
                      ADD COLUMN "achievementAlerts" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "achievement_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_grants_pkey" PRIMARY KEY ("id")
);

-- Anti-farm: 1 resgate por conquista por usuário, pra sempre.
CREATE UNIQUE INDEX "achievement_grants_userId_badgeId_key" ON "achievement_grants"("userId", "badgeId");

ALTER TABLE "achievement_grants" ADD CONSTRAINT "achievement_grants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
