ALTER TABLE "CharacterPreset" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "CharacterPreset_userId_isDefault_idx" ON "CharacterPreset"("userId", "isDefault");
