// ==========================================
// 🌐 ALLOWED ORIGINS — หน้าเว็บที่อยู่คนละ origin กับ API (ค่าจาก CORS_ORIGINS / DASHBOARD_URL)
// เขียนได้หลายแบบ:
// - origin ตรงตัว เช่น https://dash.example.com
// - ทุก subdomain เช่น https://*.example.com (ไม่ใส่ https:// = https)
// - wildcard preview เช่น https://*-bot-notstack.mathermobile6439.workers.dev
// - wildcard port เช่น http://localhost:*
// ใช้ทั้ง CORS (เทียบ origin) และ CSRF guard (เทียบ host)
// ==========================================

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
    allowsOrigin(origin: string): boolean;
}

function parseOriginPattern(pattern: string): { cors: string | RegExp; hostMatcher: (host: string) => boolean } {
    // ตัดเครื่องหมายคำพูดรอบข้าง, ช่องว่าง และ trailing slash
    const trimmed = pattern
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
        .replace(/\/+$/, '');
    if (!trimmed) {
        return { cors: '', hostMatcher: () => false };
    }

    // กรณีไม่มี Wildcard (*) ให้เช็คแบบตรงตัว (Exact Match)
    if (!trimmed.includes('*')) {
        const host = hostOf(trimmed);
        return {
            cors: trimmed,
            hostMatcher: (h) => host !== null && h.toLowerCase() === host.toLowerCase(),
        };
    }

    // กรณีมี Wildcard (*): แยกโปรโตคอลและโฮสต์
    const match = /^(?:(https?):\/\/)?(.*)$/i.exec(trimmed);
    const protocol = match?.[1] ? match[1].toLowerCase() : 'https';
    const hostPattern = match?.[2] ?? trimmed;

    let hostRegexStr: string;

    // แบบที่ 1: *.domain.com (Subdomain wildcard ทั่วไป)
    if (hostPattern.startsWith('*.')) {
        const rest = hostPattern.slice(2);
        hostRegexStr = `(?:[a-z0-9-]+\\.)+${escapeRegExp(rest)}`;
    } else {
        // แบบที่ 2: Complex wildcard เช่น *-bot-notstack.mathermobile6439.workers.dev หรือ localhost:*
        const labels = hostPattern.split('.');
        const regexLabels = labels.map((label) => {
            if (label === '*') return '[a-z0-9-]+';
            // แปลง *- ให้รองรับทั้งแบบมี branch prefix และ production worker (เช่น feat-bot-notstack และ bot-notstack)
            // แปลง * อื่นๆ เป็น [a-z0-9-]+
            return escapeRegExp(label).replace(/\\\*-/g, '(?:[a-z0-9-]+-)?').replace(/\\\*/g, '[a-z0-9-]+');
        });
        hostRegexStr = regexLabels.join('\\.');
    }

    const corsRegex = new RegExp(`^${protocol === '(?:https?|http)' ? 'https?' : protocol}://${hostRegexStr}$`, 'i');
    const hostRegex = new RegExp(`^${hostRegexStr}$`, 'i');

    return {
        cors: corsRegex,
        hostMatcher: (h) => hostRegex.test(h),
    };
}

export function allowedOrigins(list: string[]): AllowedOrigins {
    const cors: (string | RegExp)[] = [];
    const hostMatchers: ((host: string) => boolean)[] = [];

    for (const item of list) {
        const parsed = parseOriginPattern(item);
        if (parsed.cors) {
            cors.push(parsed.cors);
            hostMatchers.push(parsed.hostMatcher);
        }
    }

    return {
        cors,
        allowsOrigin: (origin) => cors.some((pattern) => (typeof pattern === 'string' ? pattern === origin : pattern.test(origin))),
        allowsHost: (host) => {
            const normalized = host.toLowerCase();
            return hostMatchers.some((matcher) => matcher(normalized));
        },
    };
}
