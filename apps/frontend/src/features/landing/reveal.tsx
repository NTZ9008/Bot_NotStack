import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

// ==========================================
// ✨ animation ตอนเลื่อนลง — ค่อยๆ fade ขึ้นมาเมื่อเข้ามาในจอ (ครั้งเดียว) ; คนที่ตั้ง reduce motion จะเห็นทันทีไม่มี animation
// ==========================================

export function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// true เมื่อ element โผล่เข้ามาในจอแล้ว (ไม่กลับเป็น false อีก)
export function useInView<T extends Element>(threshold = 0.2): [RefObject<T | null>, boolean] {
    const ref = useRef<T>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element || inView) return;
        if (typeof IntersectionObserver === 'undefined') {
            setInView(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setInView(true);
                    observer.disconnect();
                }
            },
            { threshold, rootMargin: '0px 0px -8% 0px' },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [threshold, inView]);

    return [ref, inView];
}

export function Reveal({
    children,
    delay = 0,
    from = 'bottom',
    className = '',
    as: Tag = 'div',
}: {
    children: ReactNode;
    delay?: number;
    from?: 'bottom' | 'left' | 'right' | 'none';
    className?: string;
    as?: 'div' | 'li' | 'section';
}) {
    const [ref, inView] = useInView<HTMLDivElement>(0.15);
    const hidden = { bottom: 'translate-y-8', left: '-translate-x-8', right: 'translate-x-8', none: '' }[from];
    const style: CSSProperties = { transitionDelay: inView ? `${delay}ms` : '0ms' };

    return (
        <Tag
            ref={ref as never}
            style={style}
            className={`transition-[opacity,translate] duration-700 ease-out motion-reduce:translate-none motion-reduce:opacity-100 motion-reduce:transition-none ${
                inView ? 'translate-none opacity-100' : `opacity-0 ${hidden}`
            } ${className}`}
        >
            {children}
        </Tag>
    );
}

// นับขั้นทีละจังหวะเมื่อ active (ใช้ทำภาพประกอบที่ค่อยๆ เกิดเหตุการณ์ทีละอย่าง)
export function useSteps(active: boolean, total: number, intervalMs: number, startDelayMs = 300) {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (!active) return;
        if (prefersReducedMotion()) {
            setStep(total);
            return;
        }
        let current = 0;
        let timer = setTimeout(function tick() {
            current += 1;
            setStep(current);
            if (current < total) timer = setTimeout(tick, intervalMs);
        }, startDelayMs);
        return () => clearTimeout(timer);
    }, [active, total, intervalMs, startDelayMs]);
    return step;
}
