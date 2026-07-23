ALTER TABLE "User"
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_passwordResetTokenHash_key"
ON "User"("passwordResetTokenHash");

CREATE INDEX "User_passwordResetTokenExpiresAt_idx"
ON "User"("passwordResetTokenExpiresAt");
