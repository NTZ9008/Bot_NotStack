import { useEffect, useRef, useState, type ReactNode } from 'react';

// Once visible, retain the subtree and its state across data refreshes.
export function ViewportContent({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (!ref.current) return;
        if (typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' },
        );
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return <div ref={ref}>{visible ? children : fallback}</div>;
}
