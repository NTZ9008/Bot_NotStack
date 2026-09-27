-- CreateTable
CREATE TABLE "activity_events" (
    "id" SERIAL NOT NULL,
    "event_key" TEXT NOT NULL,
    "guild_id" TEXT,
    "user_id" TEXT,
    "user_name" TEXT,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "channel_id" TEXT,
    "channel_name" TEXT,
    "executor_id" TEXT,
    "executor_name" TEXT,
    "summary" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_created_at_idx" ON "activity_events"("created_at");

-- CreateIndex
CREATE INDEX "activity_events_event_key_created_at_idx" ON "activity_events"("event_key", "created_at");

-- CreateIndex
CREATE INDEX "activity_events_user_id_created_at_idx" ON "activity_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_events_channel_id_created_at_idx" ON "activity_events"("channel_id", "created_at");
