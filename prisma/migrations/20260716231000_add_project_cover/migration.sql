ALTER TABLE "CreativeProject" ADD COLUMN "coverCutId" TEXT;
CREATE UNIQUE INDEX "CreativeProject_coverCutId_key" ON "CreativeProject"("coverCutId");
ALTER TABLE "CreativeProject" ADD CONSTRAINT "CreativeProject_coverCutId_fkey"
  FOREIGN KEY ("coverCutId") REFERENCES "ProjectCut"("id") ON DELETE SET NULL ON UPDATE CASCADE;
