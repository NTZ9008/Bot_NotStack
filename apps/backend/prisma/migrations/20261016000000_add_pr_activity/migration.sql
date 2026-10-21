ALTER TABLE "pr_messages" ADD COLUMN "head_sha" TEXT,
ADD COLUMN "activity" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "pr_messages_guild_id_repo_full_name_head_sha_idx" ON "pr_messages"("guild_id", "repo_full_name", "head_sha");
