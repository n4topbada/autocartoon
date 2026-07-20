CREATE TABLE "CouponCampaign" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 600,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponCampaign_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CouponCampaign_credits_check" CHECK ("credits" = 600),
    CONSTRAINT "CouponCampaign_max_redemptions_check" CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0),
    CONSTRAINT "CouponCampaign_redeemed_count_check" CHECK ("redeemedCount" >= 0),
    CONSTRAINT "CouponCampaign_quota_check" CHECK ("maxRedemptions" IS NULL OR "redeemedCount" <= "maxRedemptions")
);

CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CouponRedemption_credits_check" CHECK ("credits" = 600)
);

CREATE UNIQUE INDEX "CouponCampaign_code_key" ON "CouponCampaign"("code");
CREATE INDEX "CouponCampaign_active_startsAt_endsAt_idx" ON "CouponCampaign"("active", "startsAt", "endsAt");
CREATE INDEX "CouponCampaign_createdAt_idx" ON "CouponCampaign"("createdAt");
CREATE UNIQUE INDEX "CouponRedemption_campaignId_userId_key" ON "CouponRedemption"("campaignId", "userId");
CREATE INDEX "CouponRedemption_userId_redeemedAt_idx" ON "CouponRedemption"("userId", "redeemedAt");
CREATE INDEX "CouponRedemption_campaignId_redeemedAt_idx" ON "CouponRedemption"("campaignId", "redeemedAt");

ALTER TABLE "CouponCampaign"
ADD CONSTRAINT "CouponCampaign_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
ADD CONSTRAINT "CouponRedemption_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "CouponCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
ADD CONSTRAINT "CouponRedemption_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
