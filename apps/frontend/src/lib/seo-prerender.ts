// ==========================================
// 🏗️ ใช้ตอน build เท่านั้น (vite.config.ts) — เขียน <head> และเนื้อหา HTML ล่วงหน้าของแต่ละหน้าสาธารณะ
// แยกจาก seo.ts เพื่อไม่ให้เนื้อหา landing (content.ts) ติดไปกับ JS ของหน้า login / privacy / terms
// ห้ามใช้ DOM: รันบน Node
// ==========================================
import type { Plugin } from 'vite';
import { FEATURE_GROUPS } from '../features/landing/content';
import { translate, type MessageKey } from './i18n';
import { PAGES, SITE_ORIGIN, type PublicPath } from './seo';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// HTML ล่วงหน้าเป็นภาษาไทยเสมอ (index.html lang="th")
const th = (key: MessageKey) => escapeHtml(translate('th', key));

const footerLinks = () =>
    `<nav><a href="/">${th('layout.home')}</a> · <a href="/login">${th('seo.loginDashboard')}</a> · <a href="/privacy">${th('login.privacyPolicy')}</a> · <a href="/terms">${th('login.termsOfService')}</a></nav>`;

const simpleBody = (heading: MessageKey, text: MessageKey) => () =>
    `<main class="seo-prerender"><h1>${th(heading)}</h1><p>${th(text)}</p>${footerLinks()}</main>`;

// HTML ล่วงหน้าใน #root — บอทที่ไม่รัน JavaScript ยังเห็นเนื้อหา; React แทนที่ทั้งหมดตอนโหลดเสร็จ (ใช้ตอน build เท่านั้น ไม่ติดไปกับ JS ของหน้าเว็บ)
const BODIES: Record<PublicPath, () => string> = {
    '/': () =>
        `<main class="seo-prerender"><h1>${th('seo.homeH1')}</h1><p>${th('seo.homeIntro')}</p>` +
        FEATURE_GROUPS()
            .map(
                (group) =>
                    `<section><h2>${escapeHtml(group.label)} — ${escapeHtml(group.intro)}</h2><ul>` +
                    group.features.map((f) => `<li><strong>${escapeHtml(f.title)}</strong>: ${escapeHtml(f.description)}</li>`).join('') +
                    `</ul></section>`,
            )
            .join('') +
        `<section><h2>${th('seo.stepsTitle')}</h2><ol><li>${th('seo.stepInvite')}</li><li>${th('seo.stepLogin')}</li><li>${th('landing.stepSetupText')}</li></ol></section>` +
        `${footerLinks()}</main>`,
    '/privacy': simpleBody('seo.privacyH1', 'seo.privacyIntro'),
    '/terms': simpleBody('seo.termsH1', 'seo.termsIntro'),
    '/login': simpleBody('seo.loginDashboard', 'seo.loginIntro'),
};

/** เขียน title / description / canonical / Open Graph / Twitter ของหน้านั้นลงใน index.html ที่ build แล้ว พร้อมเนื้อหาล่วงหน้าใน #root */
export function renderPageHtml(html: string, path: PublicPath): string {
    const page = { title: translate('th', PAGES[path].title), description: translate('th', PAGES[path].description) };
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

// หน้าสาธารณะได้ไฟล์ HTML ของตัวเอง (privacy.html → /privacy บน Cloudflare) ที่มี <head> และเนื้อหาของหน้านั้นจริง
// บอทค้นหาที่ไม่รัน JavaScript จะได้ไม่เห็นแค่ splash และ canonical ไม่ชี้ไปหน้าแรกทุกหน้า
export function seoPagesPlugin(): Plugin {
    return {
        name: 'seo-pages',
        apply: 'build',
        enforce: 'post', // ต้องรันหลัง vite:build-html ที่สร้าง index.html
        generateBundle(_, bundle) {
            const index = bundle['index.html'];
            if (index?.type !== 'asset') return;
            const html = String(index.source);
            for (const path of Object.keys(PAGES) as PublicPath[]) {
                const source = renderPageHtml(html, path);
                if (path === '/') index.source = source;
                else this.emitFile({ type: 'asset', fileName: `${path.slice(1)}.html`, source });
            }
        },
    };
}
