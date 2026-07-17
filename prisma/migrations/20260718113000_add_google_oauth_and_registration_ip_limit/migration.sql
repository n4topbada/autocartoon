-- Add Google identity support and an HMAC-keyed registration limit table.
ALTER TABLE "User"
ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

CREATE TABLE "RegistrationIp" (
    "ipHash" TEXT NOT NULL,
    "accountCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationIp_pkey" PRIMARY KEY ("ipHash")
);
