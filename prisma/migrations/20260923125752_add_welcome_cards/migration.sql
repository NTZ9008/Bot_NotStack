-- CreateTable
CREATE TABLE "welcome_cards" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channel_id" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "design" JSONB NOT NULL,
    "background_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "welcome_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welcome_assets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "welcome_cards_background_id_idx" ON "welcome_cards"("background_id");

-- AddForeignKey
ALTER TABLE "welcome_cards" ADD CONSTRAINT "welcome_cards_background_id_fkey" FOREIGN KEY ("background_id") REFERENCES "welcome_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
