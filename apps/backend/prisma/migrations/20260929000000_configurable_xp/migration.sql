CREATE TABLE "xp_settings" ("guild_id" TEXT PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 1, "settings" JSONB NOT NULL);
CREATE TABLE "xp_progress" (
  "guild_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "rule_id" TEXT NOT NULL,
  "last_attempt_at" TIMESTAMPTZ(3) NOT NULL, "day" TEXT NOT NULL, "earned" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("guild_id", "user_id", "rule_id")
);
CREATE TABLE "xp_daily" (
  "guild_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "day" TEXT NOT NULL, "earned" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("guild_id", "user_id", "day")
);
CREATE INDEX "xp_daily_day_idx" ON "xp_daily" ("day");
CREATE TABLE "xp_history" (
  "id" SERIAL PRIMARY KEY, "guild_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "source" TEXT NOT NULL, "delta" INTEGER NOT NULL, "balance" INTEGER NOT NULL,
  "reason" TEXT NOT NULL, "actor_id" INTEGER, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "xp_history_guild_id_id_idx" ON "xp_history" ("guild_id", "id");
CREATE INDEX "xp_history_guild_id_user_id_id_idx" ON "xp_history" ("guild_id", "user_id", "id");
CREATE INDEX "xp_history_created_at_idx" ON "xp_history" ("created_at");
CREATE INDEX "levels_guild_id_xp_user_id_idx" ON "levels" ("guild_id", "xp" DESC, "user_id");
