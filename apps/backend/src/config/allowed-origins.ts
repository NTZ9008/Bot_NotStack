// ==========================================
// 🌐 ALLOWED ORIGINS — หน้าเว็บที่อยู่คนละ origin กับ API (ค่าจาก CORS_ORIGINS / DASHBOARD_URL)
// เขียนได้ 2 แบบ:
// - origin ตรงตัว เช่น https://dash.example.com
// - ทุก subdomain เช่น https://*.example.com (ไม่ใส่ https:// = https) — ไม่รวมโดเมนหลัก example.com เอง ต้องใส่เพิ่มถ้าต้องการ
// ใช้ทั้ง CORS (เทียบทั้ง origin) และ CSRF guard (เทียบแค่ host เพราะหลัง Nginx / Cloudflare ฝั่ง Node อาจเห็นเป็น http)
// ==========================================
const WILDCARD = /^(?:(https?):\/\/)?\*\.((?:[a-z0-9-]+\.)+[a-z0-9-]+)\/?$/i;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hostOf = (url: string): string | null => {
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
};

export interface AllowedOrigins {
    // ส่งให้ app.enableCors({ origin }) — แพ็กเกจ cors เทียบ string ตรงตัว / RegExp ด้วย test()
    cors: (string | RegExp)[];
    // host ของ Origin / Referer (ตัวพิมพ์เล็ก เช่น dash.example.com) อยู่ในรายการหรือไม่
    allowsHost(host: string): boolean;
}

export function allowedOrigins(list: string[]): AllowedOrigins {
    const cors: (string | RegExp)[] = [];
    const hosts = new Set<string>();
    // ".example.com" — host ต้องลงท้ายด้วยตัวนี้ (มีจุดนำหน้า จึงไม่ติด evilexample.com)
    const suffixes: string[] = [];

    for (const value of list) {
        const wildcard = WILDCARD.exec(value);
        if (wildcard) {
            const domain = wildcard[2]!.toLowerCase();
            cors.push(new RegExp(`^${wildcard[1] ?? 'https'}://(?:[a-z0-9-]+\\.)+${escapeRegExp(domain)}$`, 'i'));
            suffixes.push(`.${domain}`);
            continue;
        }
        // origin ไม่มี / ท้าย — ตัดออกให้ด้วย ใส่ผิดนิดเดียวจะได้ไม่ตกทั้งหมด
        cors.push(value.replace(/\/+$/, ''));
        const host = hostOf(value);
        if (host) hosts.add(host);
    }

    return {
        cors,
        allowsHost: (host) => hosts.has(host) || suffixes.some((suffix) => host.endsWith(suffix)),
    };
}
