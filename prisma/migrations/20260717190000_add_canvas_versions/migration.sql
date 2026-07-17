CREATE TABLE "CanvasVersion" (
    "id" TEXT NOT NULL,
    "cutId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "canvas" JSONB,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanvasVersion_cutId_createdAt_idx"
ON "CanvasVersion"("cutId", "createdAt");

ALTER TABLE "CanvasVersion"
ADD CONSTRAINT "CanvasVersion_cutId_fkey"
FOREIGN KEY ("cutId") REFERENCES "ProjectCut"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
