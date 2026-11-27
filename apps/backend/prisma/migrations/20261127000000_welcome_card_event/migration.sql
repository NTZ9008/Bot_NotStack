-- Welcome cards can now fire on member leave as well as join; existing cards stay 'join'.
ALTER TABLE "welcome_cards" ADD COLUMN "event" TEXT NOT NULL DEFAULT 'join';
DROP INDEX "welcome_cards_guild_id_idx";
CREATE INDEX "welcome_cards_guild_id_event_idx" ON "welcome_cards"("guild_id", "event");
