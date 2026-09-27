-- CreateTable
CREATE TABLE "weather_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channel_id" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "options" JSONB NOT NULL,
    "last_run_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weather_settings_pkey" PRIMARY KEY ("id")
);

