-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "description" TEXT,
    "sort_order" SERIAL NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "levels" (
    "user_id" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "room_access" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "expire_at" TIMESTAMPTZ(3) NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "room_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_whitelist_channels" (
    "channel_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "voice_whitelist_channels_pkey" PRIMARY KEY ("channel_id")
);

-- CreateTable
CREATE TABLE "voice_whitelist_users" (
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "voice_whitelist_users_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "voice_blacklist_channels" (
    "channel_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "voice_blacklist_channels_pkey" PRIMARY KEY ("channel_id")
);

-- CreateTable
CREATE TABLE "voice_blacklist_users" (
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "voice_blacklist_users_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "log_settings" (
    "event_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channel_id" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "log_settings_pkey" PRIMARY KEY ("event_key")
);

-- CreateTable
CREATE TABLE "log_options" (
    "key" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "log_options_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "pr_messages" (
    "repo_full_name" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,

    CONSTRAINT "pr_messages_pkey" PRIMARY KEY ("repo_full_name","pr_number")
);

-- CreateIndex
CREATE INDEX "room_access_user_id_room_id_idx" ON "room_access"("user_id", "room_id");
