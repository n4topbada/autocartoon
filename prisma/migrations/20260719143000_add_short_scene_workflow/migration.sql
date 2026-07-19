ALTER TABLE "ProjectCut"
ADD COLUMN "videoPrompt" TEXT,
ADD COLUMN "videoProvider" TEXT NOT NULL DEFAULT 'veo',
ADD COLUMN "videoResolution" TEXT NOT NULL DEFAULT '720p',
ADD COLUMN "videoGenerateAudio" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "videoApprovedAt" TIMESTAMP(3);

CREATE INDEX "ProjectCut_videoApprovedAt_idx" ON "ProjectCut"("videoApprovedAt");
