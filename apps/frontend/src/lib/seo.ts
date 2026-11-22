// ==========================================
// 🔎 SEO ของหน้าสาธารณะ — ใช้ทั้งตอน build (vite.config.ts เขียน <head> + เนื้อหา HTML ล่วงหน้าให้บอทค้นหา)
// และตอนเปิดหน้าในเบราว์เซอร์ (usePageMeta) — แก้ title/description ที่นี่ที่เดียว
// ห้ามใช้ DOM ในไฟล์นี้: ถูก import จาก vite.config.ts ที่รันบน Node
// ==========================================
import { FEATURE_GROUPS } from '../features/landing/content';

// ไม่ import escapeHtml จาก discord-markdown: จะลาก chunk นั้นมาโหลดในหน้าสาธารณะทุกหน้า
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const SITE_ORIGIN = 'https://bntdash.arlifzs.com';

export interface PageSeo {
    title: string;
    description: string;
}

const HOME_H1 = 'บอท Discord ที่ตั้งค่าบนเว็บ';
const HOME_INTRO = 'บอทประจำเซิร์ฟ NotStackOverflow — กันคนป่วน เก็บเลเวล แจ้งอากาศ แจ้ง PR ตอนนี้เซิร์ฟคุณก็ใช้ได้';

const footerLinks = () =>
    `<nav><a href="/">หน้าแรก</a> · <a href="/login">เข้าสู่ระบบ Dashboard</a> · <a href="/privacy">นโยบายความเป็นส่วนตัว</a> · <a href="/terms">ข้อกำหนดการใช้งาน</a></nav>`;

const simpleBody = (heading: string, text: string) => () =>
    `<main class="seo-prerender"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(text)}</p>${footerLinks()}</main>`;

type PublicPath = '/' | '/privacy' | '/terms' | '/login';

export const PAGES: Record<PublicPath, PageSeo> = {
    '/': {
        title: 'บอท Discord ภาษาไทย ฟรี ตั้งค่าผ่านเว็บ Dashboard | Bot_NotStack',
        description:
            'Bot_NotStack บอท Discord (บอทดิสคอร์ด) ภาษาไทย ใช้ฟรี กันคนป่วน ต้อนรับสมาชิกใหม่ ระบบเลเวล XP แจ้งพยากรณ์อากาศ แจ้งเตือน GitHub PR และ Jira ตั้งค่าผ่านเว็บ Dashboard ไม่ต้องจำคำสั่ง',
    },
    '/privacy': {
        title: 'นโยบายความเป็นส่วนตัว (Privacy Policy) — Bot_NotStack',
        description:
            'นโยบายความเป็นส่วนตัวของ Bot_NotStack และเว็บ Dashboard อธิบายข้อมูลที่จัดเก็บ การแยกสิทธิ์ตามเซิร์ฟเวอร์ มาตรการความปลอดภัย และสิทธิ์ของผู้ใช้งาน',
    },
    '/terms': {
        title: 'ข้อกำหนดการใช้งาน (Terms of Service) — Bot_NotStack',
        description: 'ข้อกำหนดและเงื่อนไขการใช้งานบอท Discord Bot_NotStack และเว็บ Dashboard สำหรับเจ้าของเซิร์ฟเวอร์และผู้ใช้งาน',
    },
    '/login': {
        title: 'เข้าสู่ระบบ Dashboard — Bot_NotStack บอท Discord ภาษาไทย',
        description: 'เข้าสู่ระบบเว็บ Dashboard ของ Bot_NotStack ด้วยบัญชี Discord เพื่อตั้งค่าบอทในเซิร์ฟเวอร์ของคุณ',
    },
};

// HTML ล่วงหน้าใน #root — บอทที่ไม่รัน JavaScript ยังเห็นเนื้อหา; React แทนที่ทั้งหมดตอนโหลดเสร็จ (ใช้ตอน build เท่านั้น ไม่ติดไปกับ JS ของหน้าเว็บ)
const BODIES: Record<PublicPath, () => string> = {
    '/': () =>
        `<main class="seo-prerender"><h1>${escapeHtml(HOME_H1)}</h1><p>${escapeHtml(HOME_INTRO)}</p>` +
        FEATURE_GROUPS.map(
            (group) =>
                `<section><h2>${escapeHtml(group.label)} — ${escapeHtml(group.intro)}</h2><ul>` +
                group.features.map((f) => `<li><strong>${escapeHtml(f.title)}</strong>: ${escapeHtml(f.description)}</li>`).join('') +
                `</ul></section>`,
        ).join('') +
        `<section><h2>เริ่มใช้ใน 3 ขั้นตอน</h2><ol><li>เชิญบอทเข้าเซิร์ฟ Discord</li><li>Login เข้า Dashboard ด้วยบัญชี Discord</li><li>เลือกห้อง แล้วเปิดสิ่งที่อยากใช้</li></ol></section>` +
        `${footerLinks()}</main>`,
    '/privacy': simpleBody('นโยบายความเป็นส่วนตัว', 'ข้อมูลที่ Bot_NotStack จัดเก็บ การแยกสิทธิ์ตามเซิร์ฟเวอร์ มาตรการความปลอดภัย และสิทธิ์ของผู้ใช้งาน'),
    '/terms': simpleBody('ข้อกำหนดการใช้งาน', 'ข้อกำหนดและเงื่อนไขการใช้งานบอท Discord Bot_NotStack และเว็บ Dashboard'),
    '/login': simpleBody('เข้าสู่ระบบ Dashboard', 'Login ด้วยบัญชี Discord เพื่อตั้งค่าบอท Bot_NotStack ในเซิร์ฟเวอร์ของคุณ'),
};

/** เขียน title / description / canonical / Open Graph / Twitter ของหน้านั้นลงใน index.html ที่ build แล้ว พร้อมเนื้อหาล่วงหน้าใน #root */
export function renderPageHtml(html: string, path: keyof typeof PAGES): string {
    const page = PAGES[path];
    const url = `${SITE_ORIGIN}${path}`;
    const meta: Record<string, string> = {
        description: page.description,
        'og:title': page.title,
        'og:description': page.description,
        'og:url': url,
        'twitter:title': page.title,
        'twitter:description': page.description,
    };
    let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
    for (const [key, value] of Object.entries(meta)) {
        out = out.replace(new RegExp(`(<meta\\s+(?:name|property)="${key}"\\s+content=")[^"]*(")`), (_, a: string, b: string) => a + escapeHtml(value) + b);
    }
    out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, (_, a: string, b: string) => a + url + b);
    return out.replace('<div id="root">', `<div id="root">${BODIES[path]()}`);
}
