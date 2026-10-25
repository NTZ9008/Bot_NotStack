import crypto from 'node:crypto';
import type { LivePoint } from '@notstack/shared';

// ==========================================
// 🗺️ ตำแหน่งบนลูกโลก — Discord ไม่บอกตำแหน่งสมาชิก จึงใช้ตำแหน่งของ "เซิร์ฟเวอร์" แล้วกระจายจุดรอบๆ ตามผู้ใช้
// ==========================================

// บอทเป็นของคนไทย — เซิร์ฟเวอร์ที่ไม่รู้ตำแหน่งให้อยู่กรุงเทพฯ
export const DEFAULT_HUB: LivePoint = { lat: 13.7563, lon: 100.5018 };

// สำนักงาน GitHub (ซานฟรานซิสโก) — PR วิ่งจากตรงนี้ไปหาเซิร์ฟเวอร์
export const GITHUB_POINT: LivePoint = { lat: 37.7823, lon: -122.3912 };

// ภาษาหลักของเซิร์ฟเวอร์ (Guild.preferredLocale) → เมืองหลวงของประเทศนั้น
const LOCALE_POINTS: Record<string, LivePoint> = {
    th: DEFAULT_HUB,
    'en-US': { lat: 38.9072, lon: -77.0369 },
    'en-GB': { lat: 51.5072, lon: -0.1276 },
    ja: { lat: 35.6762, lon: 139.6503 },
    ko: { lat: 37.5665, lon: 126.978 },
    'zh-CN': { lat: 39.9042, lon: 116.4074 },
    'zh-TW': { lat: 25.033, lon: 121.5654 },
    vi: { lat: 21.0278, lon: 105.8342 },
    id: { lat: -6.2088, lon: 106.8456 },
    hi: { lat: 28.6139, lon: 77.209 },
    de: { lat: 52.52, lon: 13.405 },
    fr: { lat: 48.8566, lon: 2.3522 },
    'es-ES': { lat: 40.4168, lon: -3.7038 },
    'es-419': { lat: 19.4326, lon: -99.1332 },
    'pt-BR': { lat: -15.7975, lon: -47.8919 },
    it: { lat: 41.9028, lon: 12.4964 },
    nl: { lat: 52.3676, lon: 4.9041 },
    pl: { lat: 52.2297, lon: 21.0122 },
    ru: { lat: 55.7558, lon: 37.6173 },
    uk: { lat: 50.4501, lon: 30.5234 },
    tr: { lat: 39.9334, lon: 32.8597 },
    sv: { lat: 59.3293, lon: 18.0686 },
    fi: { lat: 60.1699, lon: 24.9384 },
    da: { lat: 55.6761, lon: 12.5683 },
    no: { lat: 59.9139, lon: 10.7522 },
    cs: { lat: 50.0755, lon: 14.4378 },
    hu: { lat: 47.4979, lon: 19.0402 },
    ro: { lat: 44.4268, lon: 26.1025 },
    el: { lat: 37.9838, lon: 23.7275 },
    bg: { lat: 42.6977, lon: 23.3219 },
    hr: { lat: 45.815, lon: 15.9819 },
    lt: { lat: 54.6872, lon: 25.2797 },
    he: { lat: 31.7683, lon: 35.2137 },
};

export function localePoint(locale: string | null | undefined): LivePoint | null {
    if (!locale) return null;
    return LOCALE_POINTS[locale] ?? LOCALE_POINTS[locale.split('-')[0]!] ?? null;
}

function hashUnit(seed: string, offset: number): number {
    return crypto.createHash('sha256').update(seed).digest().readUInt32BE(offset) / 0xffffffff;
}

// จุดของผู้ใช้ — กระจายรอบเซิร์ฟเวอร์ (0.6–4.5 องศา) แบบคงที่ต่อ seed แต่ไม่เกี่ยวกับตำแหน่งจริงของคนนั้น
export function scatterPoint(hub: LivePoint, seed: string): LivePoint {
    const angle = hashUnit(seed, 0) * Math.PI * 2;
    const distance = 0.6 + Math.sqrt(hashUnit(seed, 4)) * 3.9;
    const lat = Math.max(-85, Math.min(85, hub.lat + Math.sin(angle) * distance));
    // ลองจิจูดแคบลงตามละติจูด — ชดเชยให้วงกระจายดูกลมบนลูกโลก
    const lonScale = 1 / Math.max(0.2, Math.cos((hub.lat * Math.PI) / 180));
    let lon = hub.lon + Math.cos(angle) * distance * lonScale;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}
