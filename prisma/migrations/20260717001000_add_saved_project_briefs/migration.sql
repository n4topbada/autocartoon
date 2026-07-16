CREATE TABLE "SavedProjectBrief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedProjectBrief_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedProjectBrief_userId_updatedAt_idx" ON "SavedProjectBrief"("userId", "updatedAt");

ALTER TABLE "SavedProjectBrief" ADD CONSTRAINT "SavedProjectBrief_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
