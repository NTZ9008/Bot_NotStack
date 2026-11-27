CREATE TABLE IF NOT EXISTS "reaction_role_panels" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "embed_color" TEXT NOT NULL DEFAULT '#5865f2',
    "mode" TEXT NOT NULL DEFAULT 'BUTTON',
    "allow_multiple" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reaction_role_panels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reaction_role_items" (
    "id" SERIAL NOT NULL,
    "panel_id" INTEGER NOT NULL,
    "role_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "button_style" TEXT NOT NULL DEFAULT 'PRIMARY',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reaction_role_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reaction_role_panels_guild_id_idx" ON "reaction_role_panels"("guild_id");

CREATE INDEX IF NOT EXISTS "reaction_role_panels_channel_id_message_id_idx" ON "reaction_role_panels"("channel_id", "message_id");

CREATE INDEX IF NOT EXISTS "reaction_role_items_panel_id_sort_order_idx" ON "reaction_role_items"("panel_id", "sort_order");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reaction_role_items_panel_id_fkey'
    ) THEN
        ALTER TABLE "reaction_role_items"
            ADD CONSTRAINT "reaction_role_items_panel_id_fkey"
            FOREIGN KEY ("panel_id") REFERENCES "reaction_role_panels"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
