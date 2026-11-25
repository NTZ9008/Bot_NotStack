import { useSyncExternalStore } from 'react';

// ธีม 4 แบบ: สว่าง / มืด / สีเดิม (สีของ Dashboard เดิม slate + indigo) / คริสต์มาส (ชั่วคราวช่วงเทศกาล)
// เก็บใน localStorage ('light' | 'dark' | 'classic' | 'christmas'; ไม่มีค่า = ตามระบบ)
// index.html ใส่ class ให้ก่อนวาดหน้าแล้ว ; สีเดิม/คริสต์มาสเป็นธีมมืดด้วย จึงใส่ทั้ง "dark" และชื่อธีม
export type Theme = 'light' | 'dark' | 'classic' | 'christmas';
const NAMED: Theme[] = ['classic', 'christmas'];

const listeners = new Set<() => void>();
const read = (): Theme => {
    const list = document.documentElement.classList;
    const named = NAMED.find((name) => list.contains(name));
    if (named) return named;
    return list.contains('dark') ? 'dark' : 'light';
};

export function setTheme(theme: Theme) {
    const list = document.documentElement.classList;
    list.toggle('dark', theme !== 'light');
    NAMED.forEach((name) => list.toggle(name, theme === name));
    try {
        localStorage.setItem('theme', theme);
    } catch {
        // โหมดส่วนตัว/ปิด storage: ใช้ได้แค่หน้านี้
    }
    listeners.forEach((fn) => fn());
}

export function useTheme(): [Theme, (theme: Theme) => void] {
    const theme = useSyncExternalStore(
        (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        read,
        () => 'light' as Theme,
    );
    return [theme, setTheme];
}
