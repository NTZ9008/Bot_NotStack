import { useEffect } from 'react';
import { PAGES, SITE_ORIGIN } from '@/lib/seo';

// เปลี่ยน <head> ตอนเปลี่ยนหน้าในเบราว์เซอร์ — ตอน build หน้าเหล่านี้ได้ <head> ของตัวเองอยู่แล้ว (vite.config.ts)
export function usePageMeta(path: keyof typeof PAGES) {
    const { title, description } = PAGES[path];
    useEffect(() => {
        const url = `${SITE_ORIGIN}${path}`;
        document.title = title;
        const setMeta = (selector: string, content: string) => {
            const el = document.querySelector<HTMLMetaElement>(selector);
            if (el) el.content = content;
        };
        setMeta('meta[name="description"]', description);
        setMeta('meta[property="og:title"]', title);
        setMeta('meta[property="og:description"]', description);
        setMeta('meta[property="og:url"]', url);
        setMeta('meta[name="twitter:title"]', title);
        setMeta('meta[name="twitter:description"]', description);
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (canonical) canonical.href = url;
    }, [title, description, path]);
}
