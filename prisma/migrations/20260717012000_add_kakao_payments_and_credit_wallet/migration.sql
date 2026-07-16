-- Add Kakao identity and one-time welcome credit tracking.
ALTER TABLE "User"
ADD COLUMN "kakaoId" TEXT,
ADD COLUMN "welcomeCreditsGrantedAt" TIMESTAMP(3);

ALTER TABLE "GenerationJob"
ADD COLUMN "creditUnits" INTEGER;

-- Generalize the ledger so purchases and direct AI calls can be recorded.
ALTER TABLE "CreditLedger"
ADD COLUMN "referenceKey" TEXT,
ADD COLUMN "balanceAfter" INTEGER;

UPDATE "CreditLedger"
SET "referenceKey" = 'job:' || "jobId" || ':' || "action"
WHERE "referenceKey" IS NULL;

ALTER TABLE "CreditLedger"
ALTER COLUMN "referenceKey" SET NOT NULL,
ALTER COLUMN "jobId" DROP NOT NULL;

ALTER TABLE "CreditLedger"
DROP CONSTRAINT "CreditLedger_jobId_fkey";

CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");
CREATE UNIQUE INDEX "CreditLedger_referenceKey_key" ON "CreditLedger"("referenceKey");

ALTER TABLE "CreditLedger"
ADD CONSTRAINT "CreditLedger_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CreditPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'kakaopay',
    "productCode" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amountKrw" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "partnerOrderId" TEXT NOT NULL,
    "providerTid" TEXT,
    "providerApprovalId" TEXT,
    "paymentMethod" TEXT,
    "failureReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditPayment_partnerOrderId_key"
ON "CreditPayment"("partnerOrderId");
CREATE UNIQUE INDEX "CreditPayment_providerTid_key"
ON "CreditPayment"("providerTid");
CREATE INDEX "CreditPayment_userId_createdAt_idx"
ON "CreditPayment"("userId", "createdAt");
CREATE INDEX "CreditPayment_status_updatedAt_idx"
ON "CreditPayment"("status", "updatedAt");

ALTER TABLE "CreditPayment"
ADD CONSTRAINT "CreditPayment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing members receive the same one-time grant as new registrations.
UPDATE "User"
SET
  "credits" = "credits" + 30,
  "welcomeCreditsGrantedAt" = CURRENT_TIMESTAMP
WHERE
  "welcomeCreditsGrantedAt" IS NULL
  AND "role" <> 'admin'
  AND "email" NOT LIKE 'deleted-%@deleted.invalid';
