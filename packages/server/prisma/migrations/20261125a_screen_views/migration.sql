-- Medidor de telas (25/11/26): quantas vezes cada conta abriu cada tela, UMA linha por conta+tela+dia.
-- Só o nome da rota (ids trocados por ":id") — nenhum dado clínico. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "screen_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    "platform" TEXT,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screen_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "screen_views_userId_screen_day_key" ON "screen_views"("userId", "screen", "day");
CREATE INDEX IF NOT EXISTS "screen_views_day_idx" ON "screen_views"("day");
CREATE INDEX IF NOT EXISTS "screen_views_screen_day_idx" ON "screen_views"("screen", "day");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'screen_views_userId_fkey') THEN
        ALTER TABLE "screen_views"
        ADD CONSTRAINT "screen_views_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
