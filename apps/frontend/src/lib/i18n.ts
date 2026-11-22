import { useSyncExternalStore } from 'react';
import th from '../locales/th.json' with { type: 'json' };

// ==========================================
// 🌐 แปลภาษา (ไทย/English) แบบเบาๆ ในโปรเจกต์เอง — ข้อความอยู่ใน src/locales/{th,en}.json ตาม key (เช่น 'common.save')
// key ที่ไม่มีใน en.json จะแสดงภาษาไทย ; ตัวแปรในข้อความเขียนเป็น {name} แล้วส่งค่าใน params
// เพิ่มข้อความใหม่: ใส่ key เดียวกันทั้งสองไฟล์ (th.json เป็นตัวกำหนด key ที่ใช้ได้ — พิมพ์ key ผิด TypeScript จะเตือน)
// เปลี่ยนภาษาไม่ต้องโหลดหน้าใหม่: main.tsx remount ทั้งแอป + โหลดข้อมูล API ใหม่ ; ค่าคงที่นอก component ที่มีข้อความแปล
// ต้องห่อด้วย byLang(() => ...) แล้วเรียก X() (ถ้าเรียก tr() ตรงๆ ตอน import จะค้างเป็นภาษาตอนเปิดหน้า)
// ==========================================
export type Lang = 'th' | 'en';
export type MessageKey = keyof typeof th;
type Params = Record<string, unknown>;

// en.json โหลดเฉพาะตอนเลือก English (ผู้ใช้ภาษาไทยไม่ต้องโหลด) — main.tsx รอ loadLang ก่อน render ครั้งแรก
const DICT: Record<Lang, Partial<Record<MessageKey, string>>> = { th, en: {} };
export async function loadLang(lang: Lang) {
    if (lang === 'en' && !Object.keys(DICT.en).length) DICT.en = (await import('../locales/en.json', { with: { type: 'json' } })).default;
}
// ข้อความไทยที่มาตอนรันไทม์ (ข้อมูลจาก API, ป้ายจาก @notstack/shared ที่บอทใช้ร่วม) → key
// ข้อความไทยเดียวกันมีได้หลาย key (แปลอังกฤษต่างกันตามบริบท) → ใช้ data.* ก่อน แล้วค่อย key แรกตามลำดับในไฟล์
export function keyByText(dict: Record<string, string>) {
    const map = new Map<string, MessageKey>();
    const entries = Object.entries(dict);
    for (const [key, text] of [...entries.filter(([k]) => k.startsWith('data.')), ...entries]) if (!map.has(text)) map.set(text, key as MessageKey);
    return map;
}
const KEY_BY_TEXT = keyByText(th);

const listeners = new Set<() => void>();
// ใน Node (เทสต์) ไม่มี document → ภาษาไทย
const read = (): Lang => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'th');

export async function setLang(lang: Lang) {
    await loadLang(lang);
    document.documentElement.lang = lang;
    try {
        localStorage.setItem('lang', lang);
    } catch {
        // โหมดส่วนตัว/ปิด storage: ใช้ได้แค่หน้านี้ (จะกลับเป็นค่าเดิมหลังโหลดใหม่)
    }
    listeners.forEach((fn) => fn());
}

// ค่าคงที่ระดับไฟล์ที่มีข้อความแปล — คำนวณครั้งแรกที่ใช้ในแต่ละภาษาแล้ว cache ไว้ (reference คงที่ภายในภาษาเดียวกัน)
export function byLang<T>(make: () => T): () => T {
    const cache = new Map<Lang, T>();
    return () => {
        const lang = read();
        if (!cache.has(lang)) cache.set(lang, make());
        return cache.get(lang) as T;
    };
}

const fill = (text: string, params?: Params) => (params ? text.replace(/\{(\w+)\}/g, (m, key: string) => (key in params ? String(params[key]) : m)) : text);

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
    return fill(DICT[lang][key] ?? th[key] ?? key, params);
}

// แปลข้อความไทยที่ไม่ได้เขียนเป็น key ในโค้ด (มาจาก API / @notstack/shared) — ไม่พบในพจนานุกรมก็คืนข้อความเดิม
export function translateText(lang: Lang, text: string, params?: Params): string {
    const key = KEY_BY_TEXT.get(text);
    return key ? translate(lang, key, params) : fill(text, params);
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

// แปลตามภาษาปัจจุบัน — ใช้ได้ทุกที่ (ใน/นอก component) ; tr('common.save') → 'Save'
export const tr = (key: MessageKey, params?: Params) => translate(read(), key, params);
// tr สำหรับข้อความไทยตอนรันไทม์ (ดู translateText)
export const trText = (text: string, params?: Params) => translateText(read(), text, params);

// ข้อความที่มากับข้อมูลจาก API (ชื่อ/คำอธิบายของตัวเลือก ข้อความ error) — แปลเฉพาะฟิลด์ประเภทป้ายกำกับ
// และเฉพาะค่าที่ตรงกับคำในพจนานุกรมทั้งข้อความ ข้อมูลที่ผู้ใช้กรอก (ชื่อห้อง ชื่อสมาชิก ฯลฯ) จึงไม่ถูกแตะ
const LABEL_FIELDS = new Set(['label', 'shortLabel', 'description', 'hint', 'message', 'error', 'detail', 'groupLabel', 'summary', 'reason']);
export function translateFields<T>(value: T): T {
    if (read() !== 'en') return value;
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk);
        if (!v || typeof v !== 'object' || v instanceof Blob) return v;
        const out: Record<string, unknown> = {};
        for (const [k, item] of Object.entries(v)) out[k] = typeof item === 'string' && LABEL_FIELDS.has(k) ? translateText('en', item) : walk(item);
        return out;
    };
    return walk(value) as T;
}

// คำแปลที่มีตัวหนา/โค้ดกลางประโยค เช่น '<b>ชื่อ</b> ใช้ <code>id</code> และ {link}' → token ให้ component render เอง (ไม่ใช้ innerHTML)
export type RichToken = { tag: 'text' | 'b' | 'code'; text: string } | { tag: 'slot'; name: string };
export function splitRichText(text: string): RichToken[] {
    return text
        .split(/(<b>.*?<\/b>|<code>.*?<\/code>|\{\w+\})/)
        .filter(Boolean)
        .map((part): RichToken => {
            const tag = /^<(b|code)>(.*)<\/\1>$/.exec(part);
            if (tag) return { tag: tag[1] as 'b' | 'code', text: tag[2] };
            const slot = /^\{(\w+)\}$/.exec(part);
            return slot ? { tag: 'slot', name: slot[1] } : { tag: 'text', text: part };
        });
}

// locale ของวันที่/ตัวเลข (ไทย = ปี พ.ศ.)
export const dateLocale = () => (read() === 'en' ? 'en-GB' : 'th-TH');

// const t = useT(); t('layout.botSettings') → 'Bot settings' เมื่อเลือก English
export function useT() {
    const [lang] = useLang();
    return (key: MessageKey, params?: Params) => translate(lang, key, params);
}
