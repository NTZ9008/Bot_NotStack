// ==========================================
// 📈 การเติบโตของโปรเจกต์ (commit / PR / ผู้ร่วมพัฒนา) — GET /api/growth (สาธารณะ) ใช้ในหน้า landing
// ==========================================

// ค่าสะสมถึงสิ้นสัปดาห์นั้น (week = วันจันทร์ของสัปดาห์ ตามเวลาไทย, YYYY-MM-DD)
export interface GrowthPoint {
    week: string;
    commits: number;
    prs: number;
    merged: number;
    contributors: number;
}

export interface GrowthStats {
    generatedAt: string;
    totals: { commits: number; prs: number; merged: number; contributors: number };
    // ช่วง 30 วันล่าสุด
    recent: { commits: number; prs: number };
    points: GrowthPoint[];
}

export interface GrowthResponse {
    // null = ยังดึงข้อมูลจาก GitHub ไม่สำเร็จ
    stats: GrowthStats | null;
}
