-- CreateTable
CREATE TABLE "ai_usage" (
    "day" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("day","guild_id")
);
