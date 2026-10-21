-- CreateTable
CREATE TABLE "rank_card_settings" (
    "guild_id" TEXT NOT NULL,
    "theme" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rank_card_settings_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "rank_card_members" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "style" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rank_card_members_pkey" PRIMARY KEY ("guild_id","user_id")
);

-- CreateTable
CREATE TABLE "level_up_settings" (
    "guild_id" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "level_up_settings_pkey" PRIMARY KEY ("guild_id")
);
