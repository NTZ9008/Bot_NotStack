import type { AnyRouter } from '@tanstack/react-router';
import { onINP, onLCP } from 'web-vitals';

interface Sample {
    name: string;
    milliseconds: number;
    route: string;
}
declare global {
    interface Window {
        __notstackPerformance?: readonly Sample[];
    }
}

// Opt-in diagnostics only; nothing leaves the browser. Route templates never include IDs/search text.
export function observePerformance(router: AnyRouter): void {
    if (window.__notstackPerformance) return;
    const samples: Sample[] = [];
    window.__notstackPerformance = samples;
    const record = (name: string, value: number) => {
        samples.push({ name, milliseconds: Math.round(value * 10) / 10, route: router.state.matches.at(-1)?.routeId ?? '/' });
        if (samples.length > 50) samples.shift();
    };
    onINP((metric) => record('INP', metric.value), { reportAllChanges: true });
    onLCP((metric) => record('LCP', metric.value));
    let start = 0;
    let version = 0;
    router.subscribe('onBeforeNavigate', () => {
        start = performance.now();
        version++;
        performance.clearMarks('notstack:navigation:start');
        performance.mark('notstack:navigation:start');
    });
    router.subscribe('onResolved', () => {
        const expected = version;
        if (!start) return;
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                if (expected !== version || !start || document.visibilityState !== 'visible') return;
                record('navigation-next-frame', performance.now() - start);
                performance.clearMeasures('notstack:navigation');
                performance.measure('notstack:navigation', 'notstack:navigation:start');
                start = 0;
            }),
        );
    });
}
