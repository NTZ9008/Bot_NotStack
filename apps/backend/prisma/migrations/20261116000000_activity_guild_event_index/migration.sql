-- Relations page filters by guild + event type + time; avoids scanning other guilds' rows.
CREATE INDEX "activity_events_guild_id_event_key_created_at_idx" ON "activity_events"("guild_id", "event_key", "created_at");
