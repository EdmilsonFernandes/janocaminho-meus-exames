-- PATROCINADORES & CAMPANHAS + OPINIÕES DOS USUÁRIOS (02/11/26).
-- Aditiva e idempotente (IF NOT EXISTS / DO-block — padrão da casa).

CREATE TABLE IF NOT EXISTS "sponsors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sponsor_campaigns" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Saiba mais',
    "ctaType" TEXT NOT NULL DEFAULT 'none',
    "ctaTarget" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'patient',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "frequencyHours" INTEGER NOT NULL DEFAULT 72,
    "maxImpressionsPerUser" INTEGER NOT NULL DEFAULT 2,
    "publishedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sponsor_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "sponsor_campaigns_status_startsAt_endsAt_idx" ON "sponsor_campaigns"("status", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "sponsor_campaigns_sponsorId_idx" ON "sponsor_campaigns"("sponsorId");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sponsor_campaigns_sponsorId_fkey') THEN
        ALTER TABLE "sponsor_campaigns"
            ADD CONSTRAINT "sponsor_campaigns_sponsorId_fkey"
            FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "sponsor_campaign_events" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "impressionId" TEXT NOT NULL,
    "platform" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sponsor_campaign_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_campaign_events_campaignId_type_impressionId_key" ON "sponsor_campaign_events"("campaignId", "type", "impressionId");
CREATE INDEX IF NOT EXISTS "sponsor_campaign_events_campaignId_type_createdAt_idx" ON "sponsor_campaign_events"("campaignId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "sponsor_campaign_events_subjectKey_campaignId_type_idx" ON "sponsor_campaign_events"("subjectKey", "campaignId", "type");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sponsor_campaign_events_campaignId_fkey') THEN
        ALTER TABLE "sponsor_campaign_events"
            ADD CONSTRAINT "sponsor_campaign_events_campaignId_fkey"
            FOREIGN KEY ("campaignId") REFERENCES "sponsor_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "feedback_responses" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "surveyKey" TEXT NOT NULL,
    "surveyVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "comment" TEXT,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "improvementKey" TEXT,
    "adminNotes" TEXT,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_responses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_responses_clientKey_key" ON "feedback_responses"("clientKey");
CREATE INDEX IF NOT EXISTS "feedback_responses_createdAt_idx" ON "feedback_responses"("createdAt");
CREATE INDEX IF NOT EXISTS "feedback_responses_subjectType_subjectId_idx" ON "feedback_responses"("subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "feedback_responses_status_createdAt_idx" ON "feedback_responses"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "feedback_responses_category_createdAt_idx" ON "feedback_responses"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "feedback_responses_improvementKey_idx" ON "feedback_responses"("improvementKey");

CREATE TABLE IF NOT EXISTS "feedback_prompt_states" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "surveyKey" TEXT NOT NULL,
    "lastInvitedAt" TIMESTAMP(3),
    "lastDismissedAt" TIMESTAMP(3),
    "dismissCount" INTEGER NOT NULL DEFAULT 0,
    "lastAnsweredAt" TIMESTAMP(3),
    "lastAnsweredVersion" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_prompt_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_prompt_states_subjectType_subjectId_surveyKey_key" ON "feedback_prompt_states"("subjectType", "subjectId", "surveyKey");
