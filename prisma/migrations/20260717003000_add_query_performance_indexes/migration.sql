CREATE INDEX "GenerationJob_userId_kind_createdAt_idx"
ON "GenerationJob"("userId", "kind", "createdAt");

CREATE INDEX "GenerationJob_userId_status_completedAt_idx"
ON "GenerationJob"("userId", "status", "completedAt");

CREATE INDEX "BoardPost_pinned_createdAt_idx"
ON "BoardPost"("pinned", "createdAt");

CREATE INDEX "BoardComment_postId_createdAt_idx"
ON "BoardComment"("postId", "createdAt");

CREATE INDEX "BoardLike_postId_createdAt_idx"
ON "BoardLike"("postId", "createdAt");

CREATE INDEX "BoardLike_commentId_createdAt_idx"
ON "BoardLike"("commentId", "createdAt");
