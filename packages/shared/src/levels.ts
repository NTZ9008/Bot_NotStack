// ==========================================
// 🏆 LEVEL & XP
// ==========================================
export interface LevelRow {
    userId: string;
    xp: number;
    level: number;
    username: string;
}

// XP ที่ต้องมีเพื่อขึ้นเลเวลถัดไป: 100 * (level + 1)^2 → Lvl 1 = 100, Lvl 2 = 400, Lvl 3 = 900
export const xpForNextLevel = (level: number): number => 100 * Math.pow(level + 1, 2);
