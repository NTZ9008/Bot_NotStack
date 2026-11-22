import { useSyncExternalStore } from 'react';
import { EN } from './i18n-en';

// ==========================================
// 🌐 แปลภาษา (ไทย/English) แบบเบาๆ ในโปรเจกต์เอง — ใช้ข้อความภาษาไทยเป็น key
// ข้อความที่ยังไม่มีคำแปลจะแสดงภาษาไทยเดิม จึงทยอยแปลทีละหน้าได้ (เพิ่มใน i18n-en.ts)
// ตัวแปรในข้อความเขียนเป็น {name} แล้วส่งค่าใน params
// ==========================================
export type Lang = 'th' | 'en';

const listeners = new Set<() => void>();
const read = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'th');

export function setLang(lang: Lang) {
    document.documentElement.lang = lang;
    try {
        localStorage.setItem('lang', lang);
    } catch {
        // โหมดส่วนตัว/ปิด storage: ใช้ได้แค่หน้านี้
    }
    listeners.forEach((fn) => fn());
}

export function translate(lang: Lang, text: string, params?: Record<string, string | number>): string {
    const out = lang === 'en' ? (EN[text] ?? text) : text;
    return params ? out.replace(/\{(\w+)\}/g, (m, key: string) => (key in params ? String(params[key]) : m)) : out;
}

export function useLang(): [Lang, (lang: Lang) => void] {
    const lang = useSyncExternalStore(
        (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        read,
        () => 'th' as Lang,
    );
    return [lang, setLang];
}

// const t = useT(); t('ตั้งค่าบอท') → 'Bot settings' เมื่อเลือก English
export function useT() {
    const [lang] = useLang();
    return (text: string, params?: Record<string, string | number>) => translate(lang, text, params);
}
