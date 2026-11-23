import { useSyncExternalStore } from 'react';

// ธีม 3 แบบ: สว่าง / มืด / สีเดิม (สีของ Dashboard เดิม slate + indigo) — เก็บใน localStorage ('light' | 'dark' | 'classic'; ไม่มีค่า = ตามระบบ)
// index.html ใส่ class ให้ก่อนวาดหน้าแล้ว ; สีเดิมเป็นธีมมืดด้วย จึงใส่ทั้ง "dark" และ "classic"
export type Theme = 'light' | 'dark' | 'classic';

const listeners = new Set<() => void>();
const read = (): Theme => {
    const list = document.documentElement.classList;
    if (list.contains('classic')) return 'classic';
    return list.contains('dark') ? 'dark' : 'light';
};

export function setTheme(theme: Theme) {
    const list = document.documentElement.classList;
    list.toggle('dark', theme !== 'light');
    list.toggle('classic', theme === 'classic');
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
