-- Backoffice: models de gestão (AuditLog, AiUsageLog, ProcessingJob, PushCampaign, Plan, Payment, SupportTicket).
-- Standalone (FKs escalares) — não altera models existentes.

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorType_actorId_idx" ON "audit_logs"("actorType", "actorId");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costBrl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");
CREATE INDEX "ai_usage_logs_userId_createdAt_idx" ON "ai_usage_logs"("userId", "createdAt");
CREATE INDEX "ai_usage_logs_feature_createdAt_idx" ON "ai_usage_logs"("feature", "createdAt");

CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "error" TEXT,
    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "processing_jobs_status_queuedAt_idx" ON "processing_jobs"("status", "queuedAt");
CREATE INDEX "processing_jobs_examId_idx" ON "processing_jobs"("examId");

CREATE TABLE "push_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceFilter" JSONB,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "push_campaigns_createdAt_idx" ON "push_campaigns"("createdAt");

CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceBrl" DOUBLE PRECISION NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plans_name_key" UNIQUE ("name")
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "userId" TEXT NOT NULL,
    "mpPaymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT,
    "amountBrl" DOUBLE PRECISION NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "rawWebhook" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_mpPaymentId_key" UNIQUE ("mpPaymentId")
);
CREATE INDEX "payments_userId_createdAt_idx" ON "payments"("userId", "createdAt");
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "support_tickets_status_updatedAt_idx" ON "support_tickets"("status", "updatedAt");
CREATE INDEX "support_tickets_userId_createdAt_idx" ON "support_tickets"("userId", "createdAt");
