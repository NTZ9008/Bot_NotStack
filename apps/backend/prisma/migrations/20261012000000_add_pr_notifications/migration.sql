CREATE TABLE "pr_notifications" (
    "guild_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pr_notifications_pkey" PRIMARY KEY ("guild_id", "message_id", "kind")
);
CREATE INDEX "pr_notifications_guild_id_created_at_idx" ON "pr_notifications"("guild_id", "created_at");
