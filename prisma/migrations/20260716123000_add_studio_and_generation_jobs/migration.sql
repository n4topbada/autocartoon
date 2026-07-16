-- Extend character references for four-side views and reusable persona settings.
ALTER TABLE "CharacterPreset"
ADD COLUMN "description" TEXT,
ADD COLUMN "persona" JSONB,
ADD COLUMN "voiceConfig" JSONB;

ALTER TABLE "PresetImage"
ADD COLUMN "view" TEXT NOT NULL DEFAULT 'reference',
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "PresetImage_presetId_idx";
CREATE INDEX "PresetImage_presetId_view_order_idx"
ON "PresetImage"("presetId", "view", "order");

-- Project and cut data is intentionally independent from generated assets so
-- users can edit a project while long-running generation jobs are in flight.
CREATE TABLE "CreativeProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "canvasWidth" INTEGER NOT NULL DEFAULT 1080,
    "canvasHeight" INTEGER NOT NULL DEFAULT 1920,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectCut" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 5000,
    "prompt" TEXT NOT NULL DEFAULT '',
    "negativePrompt" TEXT,
    "dialogue" TEXT,
    "speakerPresetId" TEXT,
    "scene" JSONB,
    "canvas" JSONB,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCut_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "cutId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "runId" TEXT,
    "operationName" TEXT,
    "creditSource" TEXT,
    "estimatedCostUsdMicros" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationArtifact" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GenerationRequest" ADD COLUMN "jobId" TEXT;

CREATE UNIQUE INDEX "GenerationRequest_jobId_key" ON "GenerationRequest"("jobId");
CREATE UNIQUE INDEX "ProjectCut_projectId_order_key" ON "ProjectCut"("projectId", "order");
CREATE UNIQUE INDEX "GenerationJob_runId_key" ON "GenerationJob"("runId");
CREATE UNIQUE INDEX "GenerationJob_userId_idempotencyKey_key" ON "GenerationJob"("userId", "idempotencyKey");
CREATE UNIQUE INDEX "CreditLedger_jobId_action_key" ON "CreditLedger"("jobId", "action");

CREATE INDEX "CreativeProject_userId_updatedAt_idx" ON "CreativeProject"("userId", "updatedAt");
CREATE INDEX "ProjectCut_projectId_updatedAt_idx" ON "ProjectCut"("projectId", "updatedAt");
CREATE INDEX "GenerationJob_userId_createdAt_idx" ON "GenerationJob"("userId", "createdAt");
CREATE INDEX "GenerationJob_userId_status_updatedAt_idx" ON "GenerationJob"("userId", "status", "updatedAt");
CREATE INDEX "GenerationJob_projectId_createdAt_idx" ON "GenerationJob"("projectId", "createdAt");
CREATE INDEX "GenerationJob_cutId_createdAt_idx" ON "GenerationJob"("cutId", "createdAt");
CREATE INDEX "GenerationArtifact_jobId_createdAt_idx" ON "GenerationArtifact"("jobId", "createdAt");
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");
CREATE INDEX "ProjectAsset_projectId_createdAt_idx" ON "ProjectAsset"("projectId", "createdAt");
CREATE INDEX "ProjectAsset_jobId_idx" ON "ProjectAsset"("jobId");

ALTER TABLE "CreativeProject"
ADD CONSTRAINT "CreativeProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCut"
ADD CONSTRAINT "ProjectCut_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreativeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GenerationJob"
ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreativeProject"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "GenerationJob_cutId_fkey" FOREIGN KEY ("cutId") REFERENCES "ProjectCut"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GenerationArtifact"
ADD CONSTRAINT "GenerationArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedger"
ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "CreditLedger_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAsset"
ADD CONSTRAINT "ProjectAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreativeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ProjectAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GenerationRequest"
ADD CONSTRAINT "GenerationRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
