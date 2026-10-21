CREATE TABLE "fund_topics" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount_per_member" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "report_channel_id" TEXT NOT NULL DEFAULT '',
    "due_date" TIMESTAMPTZ(3),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "fund_topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fund_members" (
    "id" SERIAL NOT NULL,
    "topic_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "target_amount" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fund_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fund_payments" (
    "id" SERIAL NOT NULL,
    "topic_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "paid_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fund_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fund_topics_guild_id_idx" ON "fund_topics"("guild_id");
CREATE UNIQUE INDEX "fund_members_topic_id_user_id_key" ON "fund_members"("topic_id", "user_id");
CREATE INDEX "fund_payments_topic_id_idx" ON "fund_payments"("topic_id");
CREATE INDEX "fund_payments_member_id_idx" ON "fund_payments"("member_id");

ALTER TABLE "fund_members" ADD CONSTRAINT "fund_members_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "fund_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fund_payments" ADD CONSTRAINT "fund_payments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "fund_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fund_payments" ADD CONSTRAINT "fund_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "fund_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
