CREATE TABLE IF NOT EXISTS "guild_plugins" (
    "guild_id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installed_by" TEXT,
    "installed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_plugins_pkey" PRIMARY KEY ("guild_id","plugin_id")
);

CREATE INDEX IF NOT EXISTS "guild_plugins_guild_id_enabled_idx" ON "guild_plugins"("guild_id", "enabled");

-- Backward compatibility: auto-install plugins for servers that already configured or used them.
INSERT INTO "guild_plugins" ("guild_id", "plugin_id", "enabled", "installed_by", "updated_at")
SELECT DISTINCT guild_id, 'github-pr', true, 'system:migration', CURRENT_TIMESTAMP
FROM (
    SELECT "guild_id" FROM "config"
    WHERE "key" IN ('PR_CHANNEL_ID', 'PR_ORG_CHANNEL_MAP', 'PR_REPO_MENTION_MAP', 'PR_WEBHOOK_SECRET', 'PR_CHANNEL_PEGASUS', 'PR_MENTION_PEGASUS_TCG_WEB')
      AND "value" IS NOT NULL AND "value" <> '' AND "value" <> '{}'
    UNION
    SELECT "guild_id" FROM "pr_messages"
    UNION
    SELECT "guild_id" FROM "pr_notifications" WHERE "kind" IN ('sent', 'merged', 'closed')
) AS legacy_github_pr
ON CONFLICT ("guild_id", "plugin_id") DO NOTHING;

INSERT INTO "guild_plugins" ("guild_id", "plugin_id", "enabled", "installed_by", "updated_at")
SELECT DISTINCT guild_id, 'grafana-alert', true, 'system:migration', CURRENT_TIMESTAMP
FROM (
    SELECT "guild_id" FROM "config"
    WHERE "key" IN ('GRAFANA_CHANNEL_ID', 'GRAFANA_WEBHOOK_SECRET', 'GRAFANA_LABEL_CHANNEL_MAP')
      AND "value" IS NOT NULL AND "value" <> '' AND "value" <> '{}'
    UNION
    SELECT "guild_id" FROM "pr_notifications" WHERE "kind" IN ('grafana_sent', 'grafana_firing', 'grafana_resolved')
) AS legacy_grafana
ON CONFLICT ("guild_id", "plugin_id") DO NOTHING;

INSERT INTO "guild_plugins" ("guild_id", "plugin_id", "enabled", "installed_by", "updated_at")
SELECT DISTINCT guild_id, 'jira-card', true, 'system:migration', CURRENT_TIMESTAMP
FROM (
    SELECT "guild_id" FROM "jira_settings"
    UNION
    SELECT "guild_id" FROM "jira_tickets"
) AS legacy_jira
ON CONFLICT ("guild_id", "plugin_id") DO NOTHING;

INSERT INTO "guild_plugins" ("guild_id", "plugin_id", "enabled", "installed_by", "updated_at")
SELECT DISTINCT "guild_id", 'savings-goal', true, 'system:migration', CURRENT_TIMESTAMP
FROM "fund_topics"
ON CONFLICT ("guild_id", "plugin_id") DO NOTHING;
