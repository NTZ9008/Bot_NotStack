CREATE TABLE IF NOT EXISTS "scheduled_reminders" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "use_embed" BOOLEAN NOT NULL DEFAULT true,
    "embed_color" TEXT,
    "mention_role_id" TEXT,
    "schedule_type" TEXT NOT NULL,
    "cron_expression" TEXT,
    "run_at" TIMESTAMPTZ(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "next_run_at" TIMESTAMPTZ(3),
    "last_run_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scheduled_reminders_guild_id_idx" ON "scheduled_reminders"("guild_id");

CREATE INDEX IF NOT EXISTS "scheduled_reminders_next_run_at_idx" ON "scheduled_reminders"("next_run_at");

CREATE INDEX IF NOT EXISTS "scheduled_reminders_enabled_next_run_at_idx" ON "scheduled_reminders"("enabled", "next_run_at");
