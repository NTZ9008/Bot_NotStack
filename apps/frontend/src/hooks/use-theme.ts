import { useSyncExternalStore } from 'react';

// ธีมสว่าง/มืด — เก็บใน localStorage ('light' | 'dark'; ไม่มีค่า = ตามระบบ) ; index.html ใส่ class ให้ก่อนวาดหน้าแล้ว
export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

export function setTheme(theme: Theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
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
