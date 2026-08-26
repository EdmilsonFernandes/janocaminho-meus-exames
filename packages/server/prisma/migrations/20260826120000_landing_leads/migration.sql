-- Captura de e-mail na landing (popup) — finalidade única (LGPD), sem dado de saúde.
-- Aditiva e idempotente (sobrevive a re-run/estado parcial).
CREATE TABLE IF NOT EXISTS "landing_leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'popup_landing',
    "ipHash" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "landing_leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "landing_leads_email_source_key" ON "landing_leads"("email", "source");
