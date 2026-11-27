CREATE TABLE IF NOT EXISTS "ticket_configs" (
    "guild_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL DEFAULT '',
    "log_channel_id" TEXT,
    "panel_channel_id" TEXT,
    "panel_message_id" TEXT,
    "staff_role_ids" JSONB NOT NULL DEFAULT '[]',
    "panel_title" TEXT NOT NULL DEFAULT '🎫 ติดต่อทีมงาน / แจ้งปัญหา',
    "panel_description" TEXT NOT NULL DEFAULT 'กดปุ่มด้านล่างเพื่อเปิดห้อง Ticket ส่วนตัว ทีมงานจะเข้ามาดูแลโดยเร็วที่สุด',
    "panel_color" TEXT NOT NULL DEFAULT '#5865F2',
    "dm_transcript" BOOLEAN NOT NULL DEFAULT true,
    "max_open_per_user" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_configs_pkey" PRIMARY KEY ("guild_id")
);

CREATE TABLE IF NOT EXISTS "tickets" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "channel_id" TEXT,
    "opener_id" TEXT NOT NULL,
    "claimed_by_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT,
    "transcript_markdown" TEXT,
    "closed_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tickets_guild_id_ticket_number_key" ON "tickets"("guild_id", "ticket_number");

CREATE INDEX IF NOT EXISTS "tickets_guild_id_status_created_at_idx" ON "tickets"("guild_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "tickets_guild_id_opener_id_status_idx" ON "tickets"("guild_id", "opener_id", "status");

CREATE INDEX IF NOT EXISTS "tickets_channel_id_idx" ON "tickets"("channel_id");
