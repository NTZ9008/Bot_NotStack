-- AlterTable
ALTER TABLE "fund_topics" ADD COLUMN "start_date" TIMESTAMPTZ(3),
ADD COLUMN "daily_rate" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "fund_payments" ADD COLUMN "period_start" TIMESTAMPTZ(3),
ADD COLUMN "period_end" TIMESTAMPTZ(3);
