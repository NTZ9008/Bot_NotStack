CREATE TABLE IF NOT EXISTS "uptime_targets" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "interval_minutes" INTEGER NOT NULL,
    "channel_id" TEXT NOT NULL,
    "mention_role_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "last_status_code" INTEGER,
    "last_latency_ms" INTEGER,
    "last_checked_at" TIMESTAMPTZ(3),
    "next_check_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uptime_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "uptime_check_logs" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "status_code" INTEGER,
    "latency_ms" INTEGER,
    "error" TEXT,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uptime_check_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "uptime_targets_guild_id_idx" ON "uptime_targets"("guild_id");

CREATE INDEX IF NOT EXISTS "uptime_targets_enabled_next_check_at_idx" ON "uptime_targets"("enabled", "next_check_at");

CREATE INDEX IF NOT EXISTS "uptime_check_logs_target_id_checked_at_idx" ON "uptime_check_logs"("target_id", "checked_at");

CREATE INDEX IF NOT EXISTS "uptime_check_logs_checked_at_idx" ON "uptime_check_logs"("checked_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uptime_check_logs_target_id_fkey'
    ) THEN
        ALTER TABLE "uptime_check_logs"
            ADD CONSTRAINT "uptime_check_logs_target_id_fkey"
            FOREIGN KEY ("target_id") REFERENCES "uptime_targets"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
