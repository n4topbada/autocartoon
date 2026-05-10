CREATE INDEX "CharacterGroup_userId_order_idx" ON "CharacterGroup"("userId", "order");
CREATE INDEX "CharacterPreset_userId_order_idx" ON "CharacterPreset"("userId", "order");
CREATE INDEX "CharacterPreset_groupId_order_idx" ON "CharacterPreset"("groupId", "order");
CREATE INDEX "CharacterPreset_isPublic_groupId_createdAt_idx" ON "CharacterPreset"("isPublic", "groupId", "createdAt");
CREATE INDEX "SavedBackground_userId_createdAt_idx" ON "SavedBackground"("userId", "createdAt");
CREATE INDEX "GeneratedImage_requestId_idx" ON "GeneratedImage"("requestId");
