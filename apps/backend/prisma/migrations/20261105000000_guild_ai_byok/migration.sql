CREATE TABLE "guild_ai_config" (
    "guild_id" TEXT NOT NULL,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gemini_api_key_encrypted" TEXT,
    "ai_daily_limit" INTEGER NOT NULL DEFAULT 500,
    CONSTRAINT "guild_ai_config_pkey" PRIMARY KEY ("guild_id")
);

CREATE TABLE "ai_model_usage" (
    "day" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ai_model_usage_pkey" PRIMARY KEY ("day", "guild_id", "model_name")
);
CREATE INDEX "ai_model_usage_guild_id_day_idx" ON "ai_model_usage"("guild_id", "day");
