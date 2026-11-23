import { useLayoutEffect, useRef } from 'react';

// พื้นหลัง "ปุ่มที่เลือก" แบบเลื่อนตาม (Tabs / ToggleGroup) — วัดตำแหน่ง+ขนาดปุ่มที่ active แล้วย้าย indicator ไปทับ
// รองรับปุ่มกว้างไม่เท่ากันและแถวที่ wrap (เลื่อนทั้งแกน x/y)
export function useSlidingIndicator<L extends HTMLElement = HTMLDivElement>(activeSelector: string, enabled = true) {
    const listRef = useRef<L>(null);
    const indicatorRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const list = listRef.current;
        const pill = indicatorRef.current;
        if (!enabled || !list || !pill) return;

        const place = () => {
            const active = list.querySelector<HTMLElement>(`:scope > ${activeSelector}`);
            pill.style.opacity = active ? '1' : '0';
            if (!active) return;
            pill.style.width = `${active.offsetWidth}px`;
            pill.style.height = `${active.offsetHeight}px`;
            pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
        };

        place();
        // วางตำแหน่งแรกแบบไม่ animate แล้วค่อยเปิด transition
        const raf = requestAnimationFrame(() => (pill.dataset.ready = ''));
        const mutations = new MutationObserver(place);
        mutations.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-state'], childList: true });
        const resize = new ResizeObserver(place);
        resize.observe(list);
        for (const child of list.children) resize.observe(child);
        return () => {
            cancelAnimationFrame(raf);
            mutations.disconnect();
            resize.disconnect();
        };
    }, [activeSelector, enabled]);

    return { listRef, indicatorRef };
}

// class พื้นฐานของ indicator: วางมุมซ้ายบน, animate ด้วย spring เดียวกับ ThemeSwitcher
export const slidingIndicatorClass =
    'pointer-events-none absolute top-0 left-0 opacity-0 data-ready:transition-[transform,width,height,opacity] data-ready:duration-500 data-ready:ease-spring-soft motion-reduce:transition-none!';
