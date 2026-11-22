import { useSyncExternalStore } from 'react';
import { EN } from './i18n-en';

// ==========================================
// 🌐 แปลภาษา (ไทย/English) แบบเบาๆ ในโปรเจกต์เอง — ใช้ข้อความภาษาไทยเป็น key
// ข้อความที่ยังไม่มีคำแปลจะแสดงภาษาไทยเดิม จึงทยอยแปลทีละหน้าได้ (เพิ่มใน i18n-en.ts)
// ตัวแปรในข้อความเขียนเป็น {name} แล้วส่งค่าใน params
// เปลี่ยนภาษาแล้วโหลดหน้าใหม่ 1 ครั้ง ข้อความที่ประกาศนอก component (ค่าคงที่/ตัวเลือก) จึงแปลด้วย tr() ได้เลย
// ==========================================
export type Lang = 'th' | 'en';

const listeners = new Set<() => void>();
// ใน Node (เทสต์) ไม่มี document → ภาษาไทย
const read = (): Lang => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'th');

export function setLang(lang: Lang) {
    document.documentElement.lang = lang;
    try {
        localStorage.setItem('lang', lang);
    } catch {
        // โหมดส่วนตัว/ปิด storage: ใช้ได้แค่หน้านี้ (จะกลับเป็นค่าเดิมหลังโหลดใหม่)
    }
    listeners.forEach((fn) => fn());
    window.location.reload();
}

export function translate(lang: Lang, text: string, params?: Record<string, unknown>): string {
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

// แปลตามภาษาปัจจุบัน — ใช้ได้ทุกที่ (ใน/นอก component) ; tr('บันทึก') → 'Save'
export const tr = (text: string, params?: Record<string, unknown>) => translate(read(), text, params);

// ข้อความที่มากับข้อมูลจาก API (ชื่อ/คำอธิบายของตัวเลือก ข้อความ error) — แปลเฉพาะฟิลด์ประเภทป้ายกำกับ
// และเฉพาะค่าที่ตรงกับคำในพจนานุกรมทั้งข้อความ ข้อมูลที่ผู้ใช้กรอก (ชื่อห้อง ชื่อสมาชิก ฯลฯ) จึงไม่ถูกแตะ
const LABEL_FIELDS = new Set(['label', 'shortLabel', 'description', 'hint', 'message', 'error', 'detail', 'groupLabel', 'summary', 'reason']);
export function translateFields<T>(value: T): T {
    if (read() !== 'en') return value;
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk);
        if (!v || typeof v !== 'object' || v instanceof Blob) return v;
        const out: Record<string, unknown> = {};
        for (const [k, item] of Object.entries(v)) out[k] = typeof item === 'string' && LABEL_FIELDS.has(k) ? (EN[item] ?? item) : walk(item);
        return out;
    };
    return walk(value) as T;
}

// locale ของวันที่/ตัวเลข (ไทย = ปี พ.ศ.)
export const dateLocale = () => (read() === 'en' ? 'en-GB' : 'th-TH');

// const t = useT(); t('ตั้งค่าบอท') → 'Bot settings' เมื่อเลือก English
export function useT() {
    const [lang] = useLang();
    return (text: string, params?: Record<string, unknown>) => translate(lang, text, params);
}
