CREATE TABLE "jira_settings" (
    "guild_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "site_url" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "api_token" TEXT NOT NULL DEFAULT '',
    "project_key" TEXT NOT NULL DEFAULT '',
    "panel_channel_id" TEXT NOT NULL DEFAULT '',
    "panel_message_id" TEXT NOT NULL DEFAULT '',
    "log_channel_id" TEXT NOT NULL DEFAULT '',
    "category_id" TEXT NOT NULL DEFAULT '',
    "options" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "jira_settings_pkey" PRIMARY KEY ("guild_id")
);

CREATE TABLE "jira_tickets" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "channel_id" TEXT,
    "issue_key" TEXT,
    "issue_url" TEXT,
    "issue_type" TEXT,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "card_created_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    CONSTRAINT "jira_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jira_tickets_guild_id_created_at_idx" ON "jira_tickets"("guild_id", "created_at");
CREATE INDEX "jira_tickets_guild_id_user_id_closed_at_idx" ON "jira_tickets"("guild_id", "user_id", "closed_at");
CREATE INDEX "jira_tickets_channel_id_idx" ON "jira_tickets"("channel_id");
