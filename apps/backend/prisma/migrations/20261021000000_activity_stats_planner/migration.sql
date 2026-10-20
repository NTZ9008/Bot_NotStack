-- กราฟหน้า Overview นับ activity_events แยกตามชั่วโมง/วันตามเวลาไทย
-- ถ้าไม่มีสถิติของนิพจน์นี้ Postgres จะเดาว่าทุกแถวเป็นคนละกลุ่ม แล้วเลือกแผน sort ทั้งตาราง (ช้า)
-- นิพจน์ต้องตรงกับ ActivityStatsService.timeSeries ทุกตัวอักษร — ต้องใช้ PostgreSQL 14 ขึ้นไป (เวอร์ชันเก่าข้ามไปเฉยๆ)
DO $$
BEGIN
    IF current_setting('server_version_num')::int >= 140000 THEN
        EXECUTE 'CREATE STATISTICS IF NOT EXISTS "activity_events_bkk_day_stats" (ndistinct) ON (date_trunc(''day'', "created_at" AT TIME ZONE ''Asia/Bangkok'')), "event_key" FROM "activity_events"';
        EXECUTE 'CREATE STATISTICS IF NOT EXISTS "activity_events_bkk_hour_stats" (ndistinct) ON (date_trunc(''hour'', "created_at" AT TIME ZONE ''Asia/Bangkok'')), "event_key" FROM "activity_events"';
    END IF;
END $$;

ANALYZE "activity_events";
