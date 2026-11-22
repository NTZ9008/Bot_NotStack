import { useEffect } from 'react';
// relative (ไม่ใช่ @/) ให้ tests/frontend-lib.test.cjs โหลดไฟล์นี้บน Node ได้
import { PAGES, SITE_ORIGIN, type PublicPath } from '../lib/seo';

type MetaDocument = Pick<Document, 'title' | 'querySelector'>;

/** เขียน title / description / canonical / Open Graph / Twitter ของหน้านั้นลงใน <head> */
export function applyPageMeta(doc: MetaDocument, path: PublicPath) {
    const { title, description } = PAGES[path];
    const url = `${SITE_ORIGIN}${path}`;
    doc.title = title;
    const meta: Record<string, string> = {
        'meta[name="description"]': description,
        'meta[property="og:title"]': title,
        'meta[property="og:description"]': description,
        'meta[property="og:url"]': url,
        'meta[name="twitter:title"]': title,
        'meta[name="twitter:description"]': description,
    };
    for (const [selector, content] of Object.entries(meta)) {
        const el = doc.querySelector<HTMLMetaElement>(selector);
        if (el) el.content = content;
    }
    const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = url;
}

// เปลี่ยน <head> ตอนเปลี่ยนหน้าในเบราว์เซอร์ — ตอน build หน้าเหล่านี้ได้ <head> ของตัวเองอยู่แล้ว (seo-prerender.ts)
export function usePageMeta(path: PublicPath) {
    useEffect(() => applyPageMeta(document, path), [path]);
}
