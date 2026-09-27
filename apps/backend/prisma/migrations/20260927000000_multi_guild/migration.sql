-- ==========================================
-- 🏰 MULTI-SERVER — แยกการตั้งค่า/ข้อมูลตามเซิร์ฟเวอร์ Discord (guild_id)
-- ข้อมูลเดิมทั้งหมดถูกกำหนดให้เป็นของเซิร์ฟเวอร์หลัก 1273939427575595181 — ไม่มีแถวไหนถูกลบ
-- ⚠️ migration นี้เปลี่ยน primary key หลายตาราง โค้ดเวอร์ชันก่อนหน้าจะใช้ฐานข้อมูลนี้ไม่ได้อีก
--    (ย้อนกลับ = restore จาก backup) — สำรองฐานข้อมูลด้วย pg_dump ก่อน deploy
-- Postgres รันทั้งไฟล์ใน transaction เดียว: ถ้าบรรทัดไหนพัง จะไม่มีอะไรเปลี่ยน
-- ==========================================

-- เซิร์ฟเวอร์ที่บอทอยู่ (ชื่อ/รูปถูกเติมเองตอนบอทออนไลน์)
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "icon_url" TEXT,
    "owner_id" TEXT,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);
INSERT INTO "guilds" ("id", "updated_at") VALUES ('1273939427575595181', CURRENT_TIMESTAMP);

-- config: key → (guild_id, key)
ALTER TABLE "config" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "config" ALTER COLUMN "guild_id" DROP DEFAULT;
ALTER TABLE "config" DROP CONSTRAINT "config_pkey";
ALTER TABLE "config" ADD CONSTRAINT "config_pkey" PRIMARY KEY ("guild_id", "key");

-- levels: user_id → (guild_id, user_id)
ALTER TABLE "levels" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "levels" ALTER COLUMN "guild_id" DROP DEFAULT;
ALTER TABLE "levels" DROP CONSTRAINT "levels_pkey";
ALTER TABLE "levels" ADD CONSTRAINT "levels_pkey" PRIMARY KEY ("guild_id", "user_id");

-- ห้องที่ใช้ระบบตั๋วได้ (เดิมเขียนตายตัวในโค้ด 4 ห้องของเซิร์ฟเวอร์หลัก)
CREATE TABLE "room_access_channels" (
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_access_channels_pkey" PRIMARY KEY ("guild_id", "channel_id")
);
INSERT INTO "room_access_channels" ("guild_id", "channel_id") VALUES
    ('1273939427575595181', '1475009551475675299'),
    ('1273939427575595181', '1430932852928680059'),
    ('1273939427575595181', '1420442631120490667'),
    ('1273939427575595181', '1383415462158929990');

ALTER TABLE "room_access" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "room_access" ALTER COLUMN "guild_id" DROP DEFAULT;
CREATE INDEX "room_access_guild_id_idx" ON "room_access"("guild_id");

-- Voice Guard (channel id ไม่ซ้ำข้ามเซิร์ฟเวอร์อยู่แล้ว — เพิ่ม guild_id ไว้แยกรายการ)
ALTER TABLE "voice_whitelist_channels" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "voice_whitelist_channels" ALTER COLUMN "guild_id" DROP DEFAULT;
CREATE INDEX "voice_whitelist_channels_guild_id_idx" ON "voice_whitelist_channels"("guild_id");

ALTER TABLE "voice_blacklist_channels" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "voice_blacklist_channels" ALTER COLUMN "guild_id" DROP DEFAULT;
CREATE INDEX "voice_blacklist_channels_guild_id_idx" ON "voice_blacklist_channels"("guild_id");

-- Log Manager
ALTER TABLE "log_settings" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "log_settings" ALTER COLUMN "guild_id" DROP DEFAULT;
ALTER TABLE "log_settings" DROP CONSTRAINT "log_settings_pkey";
ALTER TABLE "log_settings" ADD CONSTRAINT "log_settings_pkey" PRIMARY KEY ("guild_id", "event_key");

ALTER TABLE "log_options" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "log_options" ALTER COLUMN "guild_id" DROP DEFAULT;
ALTER TABLE "log_options" DROP CONSTRAINT "log_options_pkey";
ALTER TABLE "log_options" ADD CONSTRAINT "log_options_pkey" PRIMARY KEY ("guild_id", "key");

-- PR Bot: repo เดียวกันแจ้งได้หลายเซิร์ฟเวอร์
ALTER TABLE "pr_messages" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "pr_messages" ALTER COLUMN "guild_id" DROP DEFAULT;
ALTER TABLE "pr_messages" DROP CONSTRAINT "pr_messages_pkey";
ALTER TABLE "pr_messages" ADD CONSTRAINT "pr_messages_pkey" PRIMARY KEY ("guild_id", "repo_full_name", "pr_number");

-- Audit log: การกระทำที่แก้ค่าของเซิร์ฟเวอร์ (ไม่ใช่ login / จัดการผู้ใช้) เดิมเป็นของเซิร์ฟเวอร์หลักทั้งหมด
ALTER TABLE "audit_logs" ADD COLUMN "guild_id" TEXT;
UPDATE "audit_logs" SET "guild_id" = '1273939427575595181' WHERE "action" NOT LIKE 'auth.%' AND "action" NOT LIKE 'user.%';
CREATE INDEX "audit_logs_guild_id_created_at_idx" ON "audit_logs"("guild_id", "created_at");

-- Activity: เหตุการณ์เก่าที่ไม่ได้บันทึกเซิร์ฟเวอร์ไว้ เกิดในเซิร์ฟเวอร์หลักทั้งหมด (บอทเคยอยู่เซิร์ฟเวอร์เดียว)
UPDATE "activity_events" SET "guild_id" = '1273939427575595181' WHERE "guild_id" IS NULL;
ALTER TABLE "activity_events" ALTER COLUMN "guild_id" SET NOT NULL;
CREATE INDEX "activity_events_guild_id_created_at_idx" ON "activity_events"("guild_id", "created_at");

-- Welcome Announcement: การ์ด + คลังรูปแยกตามเซิร์ฟเวอร์
ALTER TABLE "welcome_cards" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "welcome_cards" ALTER COLUMN "guild_id" DROP DEFAULT;
CREATE INDEX "welcome_cards_guild_id_idx" ON "welcome_cards"("guild_id");

ALTER TABLE "welcome_assets" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "welcome_assets" ALTER COLUMN "guild_id" DROP DEFAULT;
CREATE INDEX "welcome_assets_guild_id_idx" ON "welcome_assets"("guild_id");

-- Weather: แถวเดียว (id = 1) → เซิร์ฟเวอร์ละแถว (คอลัมน์ id มีค่าเป็น 1 เสมอ ไม่มีข้อมูลอะไรหาย)
ALTER TABLE "weather_settings" ADD COLUMN "guild_id" TEXT NOT NULL DEFAULT '1273939427575595181';
ALTER TABLE "weather_settings" ALTER COLUMN "guild_id" DROP DEFAULT;
ALTER TABLE "weather_settings" DROP CONSTRAINT "weather_settings_pkey";
ALTER TABLE "weather_settings" DROP COLUMN "id";
ALTER TABLE "weather_settings" ADD CONSTRAINT "weather_settings_pkey" PRIMARY KEY ("guild_id");
