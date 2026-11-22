// ==========================================
// 🔎 title / description ของหน้าสาธารณะ — แก้ที่นี่ที่เดียว
// ใช้ทั้งในเบราว์เซอร์ (usePageMeta) และตอน build (seo-prerender.ts) — ห้าม import อะไรเพิ่ม ไฟล์นี้ติดไปกับทุกหน้าสาธารณะ
// ==========================================
export const SITE_ORIGIN = 'https://bntdash.arlifzs.com';

export interface PageSeo {
    title: string;
    description: string;
}

export type PublicPath = '/' | '/privacy' | '/terms' | '/login';

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
