CREATE TABLE "CreditAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorUserId" TEXT,
    "ledgerId" TEXT,
    "jobId" TEXT,
    "traceId" TEXT NOT NULL,
    "referenceId" TEXT,
    "operation" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "balanceBefore" INTEGER,
    "balanceAfter" INTEGER,
    "balanceVerified" BOOLEAN,
    "reasonCode" TEXT,
    "summary" TEXT NOT NULL,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditAuditEvent_userId_createdAt_idx" ON "CreditAuditEvent"("userId", "createdAt");
CREATE INDEX "CreditAuditEvent_actorUserId_createdAt_idx" ON "CreditAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "CreditAuditEvent_status_createdAt_idx" ON "CreditAuditEvent"("status", "createdAt");
CREATE INDEX "CreditAuditEvent_operation_createdAt_idx" ON "CreditAuditEvent"("operation", "createdAt");
CREATE INDEX "CreditAuditEvent_source_createdAt_idx" ON "CreditAuditEvent"("source", "createdAt");
CREATE INDEX "CreditAuditEvent_traceId_createdAt_idx" ON "CreditAuditEvent"("traceId", "createdAt");
CREATE INDEX "CreditAuditEvent_referenceId_idx" ON "CreditAuditEvent"("referenceId");
CREATE INDEX "CreditAuditEvent_ledgerId_idx" ON "CreditAuditEvent"("ledgerId");
CREATE INDEX "CreditAuditEvent_jobId_createdAt_idx" ON "CreditAuditEvent"("jobId", "createdAt");

ALTER TABLE "CreditAuditEvent"
ADD CONSTRAINT "CreditAuditEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditAuditEvent"
ADD CONSTRAINT "CreditAuditEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditAuditEvent"
ADD CONSTRAINT "CreditAuditEvent_ledgerId_fkey"
FOREIGN KEY ("ledgerId") REFERENCES "CreditLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditAuditEvent"
ADD CONSTRAINT "CreditAuditEvent_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the existing ledger as searchable audit history. New events are recorded atomically
-- by the application with richer before/after verification and failure details.
INSERT INTO "CreditAuditEvent" (
    "id",
    "userId",
    "ledgerId",
    "jobId",
    "traceId",
    "referenceId",
    "operation",
    "direction",
    "status",
    "source",
    "units",
    "balanceBefore",
    "balanceAfter",
    "balanceVerified",
    "reasonCode",
    "summary",
    "createdAt"
)
SELECT
    'legacy_' || md5("CreditLedger"."id"),
    "CreditLedger"."userId",
    "CreditLedger"."id",
    "CreditLedger"."jobId",
    'CR-' || upper(substr(md5(regexp_replace("CreditLedger"."referenceKey", ':(charge|refund|grant|credit)$', '')), 1, 12)),
    regexp_replace("CreditLedger"."referenceKey", ':(charge|refund|grant|credit)$', ''),
    "CreditLedger"."action",
    CASE
        WHEN "CreditLedger"."action" IN ('grant', 'purchase', 'refund') THEN 'credit'
        WHEN "CreditLedger"."action" = 'charge' THEN 'debit'
        ELSE 'neutral'
    END,
    'success',
    "CreditLedger"."source",
    "CreditLedger"."units",
    CASE
        WHEN "CreditLedger"."balanceAfter" IS NULL THEN NULL
        WHEN "CreditLedger"."action" IN ('grant', 'purchase', 'refund') THEN "CreditLedger"."balanceAfter" - "CreditLedger"."units"
        WHEN "CreditLedger"."action" = 'charge' THEN "CreditLedger"."balanceAfter" + "CreditLedger"."units"
        ELSE NULL
    END,
    "CreditLedger"."balanceAfter",
    CASE
        WHEN "CreditLedger"."balanceAfter" IS NULL THEN NULL
        WHEN "CreditLedger"."action" IN ('grant', 'purchase', 'refund', 'charge') THEN TRUE
        ELSE NULL
    END,
    'HISTORICAL_LEDGER_BACKFILL',
    COALESCE("CreditLedger"."note", "CreditLedger"."action" || ' / ' || "CreditLedger"."source"),
    "CreditLedger"."createdAt"
FROM "CreditLedger";
