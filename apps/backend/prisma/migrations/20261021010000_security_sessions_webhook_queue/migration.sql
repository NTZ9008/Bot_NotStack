-- AlterTable
ALTER TABLE "pr_messages" ADD COLUMN     "last_delivery_id" TEXT;

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_available_at_idx" ON "webhook_deliveries"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_guild_id_delivery_id_key" ON "webhook_deliveries"("guild_id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_guild_id_digest_key" ON "webhook_deliveries"("guild_id", "digest");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: login ที่ยังใช้งานอยู่ (refresh token ยังไม่หมดอายุ/ไม่ถูกยกเลิก) ได้ session ของตัวเอง
-- ผู้ใช้จึงไม่หลุดจากระบบหลัง deploy — access token เดิมไม่มี sid จะ 401 ครั้งเดียวแล้วหน้าเว็บ refresh ต่อให้เอง
INSERT INTO "auth_sessions" ("id", "user_id", "token_version", "created_at", "expires_at", "absolute_expires_at")
SELECT rt."family_id", rt."user_id", u."token_version", MIN(rt."created_at"), MAX(rt."expires_at"), NOW() + INTERVAL '30 days'
FROM "refresh_tokens" rt
JOIN "users" u ON u."id" = rt."user_id"
WHERE rt."revoked_at" IS NULL AND rt."expires_at" > NOW()
GROUP BY rt."family_id", rt."user_id", u."token_version"
ON CONFLICT ("id") DO NOTHING;
