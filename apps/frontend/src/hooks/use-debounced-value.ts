import { useEffect, useState } from 'react';

// ค่าที่เปลี่ยนตามหลังค่าจริงเมื่อหยุดพิมพ์/หยุดขยับไปแล้ว delay ms
export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}
