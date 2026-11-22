// ==========================================
// 🔎 title / description ของหน้าสาธารณะ — แก้ที่นี่ที่เดียว
// ใช้ทั้งในเบราว์เซอร์ (usePageMeta: ภาษาที่เลือก) และตอน build (seo-prerender.ts: ภาษาไทยเสมอ) — ข้อความอยู่ใน locales/*.json
// ห้าม import อะไรเพิ่ม (นอกจาก type) ไฟล์นี้ติดไปกับทุกหน้าสาธารณะ
// ==========================================
import type { MessageKey } from './i18n';
export const SITE_ORIGIN = 'https://bntdash.arlifzs.com';

export interface PageSeo {
    title: MessageKey;
    description: MessageKey;
}

export type PublicPath = '/' | '/privacy' | '/terms' | '/login';

export const PAGES: Record<PublicPath, PageSeo> = {
    '/': { title: 'seo.homeTitle', description: 'seo.homeDescription' },
    '/privacy': { title: 'seo.privacyTitle', description: 'seo.privacyDescription' },
    '/terms': { title: 'seo.termsTitle', description: 'seo.termsDescription' },
    '/login': { title: 'seo.loginTitle', description: 'seo.loginDescription' },
};
