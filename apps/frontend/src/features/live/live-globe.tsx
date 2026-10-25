import { LIVE_KIND_META, LIVE_KINDS, liveEventLabel, type LiveEvent, type LiveKind, type LiveStats } from '@notstack/shared';
import { Activity } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { StreamStatus } from '@/lib/sse';
import { formatNumber, formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLiveStream, type LiveScope } from './use-live-stream';

const GlobeCanvas = lazy(() => import('./globe-canvas'));

const STATUS_TEXT: Record<StreamStatus, string> = {
    connecting: 'กำลังเชื่อมต่อ',
    live: 'Live',
    reconnecting: 'กำลังต่อใหม่',
    disabled: 'ปิดอยู่',
    unauthorized: 'ต้อง login ใหม่',
};

function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!query) return;
        const onChange = () => setReduced(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

// โหลด three.js เมื่อกล่องเข้ามาใกล้จอ และเบราว์เซอร์ว่างแล้ว — ไม่แย่งเวลาโหลดหน้าแรก
function useMountWhenNear<T extends Element>(): [React.RefObject<T | null>, boolean] {
    const ref = useRef<T>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const element = ref.current;
        if (!element || ready) return;
        let idle: number | undefined;
        const start = () => {
            const schedule = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
            idle = schedule(() => setReady(true), { timeout: 1500 });
        };
        if (typeof IntersectionObserver === 'undefined') {
            start();
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                observer.disconnect();
                start();
            },
            { rootMargin: '300px' },
        );
        observer.observe(element);
        return () => {
            observer.disconnect();
            if (idle !== undefined) (window.cancelIdleCallback ?? window.clearTimeout)(idle);
        };
    }, [ready]);
    return [ref, ready];
}

// re-render ทุก 10 วินาที ให้ "x วินาทีที่แล้ว" เดินเอง
function useNow(intervalMs = 10_000): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
}

export function LiveStatus({ status, className }: { status: StreamStatus; className?: string }) {
    const live = status === 'live';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-wider uppercase',
                live ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/15 bg-white/5 text-slate-400',
                className,
            )}
        >
            <span className="relative flex size-1.5">
                {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />}
                <span className={cn('relative inline-flex size-1.5 rounded-full', live ? 'bg-emerald-400' : 'bg-slate-500')} />
            </span>
            {STATUS_TEXT[status]}
        </span>
    );
}

function Legend({ stats, compact }: { stats: LiveStats; compact?: boolean }) {
    const active = LIVE_KINDS.filter((kind) => stats.perMinute[kind] > 0);
    const kinds: LiveKind[] = active.length ? active : ['message', 'voice', 'member', 'pr'];
    return (
        <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400', compact && 'gap-x-2.5 text-[11px]')}>
            {kinds.map((kind) => (
                <li key={kind} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: LIVE_KIND_META[kind].color, boxShadow: `0 0 8px ${LIVE_KIND_META[kind].color}` }} />
                    {LIVE_KIND_META[kind].label}
                    {stats.perMinute[kind] > 0 && <span className="font-mono text-slate-200 tabular-nums">{formatNumber(stats.perMinute[kind])}</span>}
                </li>
            ))}
        </ul>
    );
}

function describe(event: LiveEvent, scope: LiveScope): { title: string; detail: string } {
    const label = liveEventLabel(event.eventKey);
    if (scope === 'public') return { title: label, detail: event.kind === 'pr' ? 'จาก GitHub' : 'ในเซิร์ฟเวอร์ที่ใช้บอท' };
    const where = [event.channelName && (event.kind === 'pr' ? event.channelName : `#${event.channelName}`), event.guildName].filter(Boolean).join(' · ');
    return { title: event.userName ? `${event.userName} · ${label}` : label, detail: where || (event.summary ?? '') };
}

function FeedItem({ event, scope, now }: { event: LiveEvent; scope: LiveScope; now: number }) {
    const { title, detail } = describe(event, scope);
    const color = LIVE_KIND_META[event.kind].color;
    return (
        <li className="animate-in fade-in slide-in-from-top-1 flex items-start gap-2.5 py-2 duration-500 motion-reduce:animate-none">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-100">{title}</span>
                <span className="block truncate text-xs text-slate-500">{detail}</span>
            </span>
            <time dateTime={event.at} className="shrink-0 pt-0.5 font-mono text-[10px] text-slate-500">
                {formatTimeAgo(event.at, now)}
            </time>
        </li>
    );
}

// ลูกโลกสำรองตอนเครื่องไม่รองรับ WebGL / ระหว่างโหลด three.js
function GlobePlaceholder({ loading }: { loading?: boolean }) {
    return (
        <div className="flex size-full items-center justify-center">
            <div
                className={cn(
                    'aspect-square w-[min(70%,26rem)] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgb(99_102_241/0.45),rgb(15_23_42/0.9)_60%,transparent_72%)] shadow-[0_0_120px_-20px_rgb(99_102_241/0.6)]',
                    loading && 'animate-pulse motion-reduce:animate-none',
                )}
            />
        </div>
    );
}

export interface LiveGlobeProps {
    scope: LiveScope;
    guildId?: string;
    variant?: 'hero' | 'panel';
    className?: string;
    // hero: ตำแหน่งของกล่องข้อมูล (แยกจากตัวลูกโลกที่ล้นขอบจอ)
    hudClassName?: string;
}

// ==========================================
// 🌏 ลูกโลกกิจกรรมสด + แถบข้อมูล
// - hero:  พื้นหลังโปร่ง วางซ้อนใน hero ของหน้า landing (ข้อมูลแบบไม่ระบุตัวตน)
// - panel: การ์ดสีเข้มใน Dashboard พร้อมรายการล่าสุด (ชื่อคน / ห้อง / เซิร์ฟเวอร์)
// ==========================================
export function LiveGlobe({ scope, guildId, variant = 'panel', className, hudClassName }: LiveGlobeProps) {
    const reducedMotion = useReducedMotion();
    const [boxRef, mount] = useMountWhenNear<HTMLDivElement>();
    const [failed, setFailed] = useState(false);
    const live = useLiveStream(scope, { guildId });
    const now = useNow();

    if (variant === 'hero') {
        // ปิด public ไว้ (LIVE_PUBLIC=false) — hero กลับเป็นแบบเดิม
        if (live.status === 'disabled') return null;
        return (
            <>
                <div ref={boxRef} aria-hidden className={cn('pointer-events-none', className)}>
                    {mount && !failed ? (
                        <Suspense fallback={<GlobePlaceholder loading />}>
                            <GlobeCanvas
                                hubs={live.hubs}
                                subscribe={live.subscribe}
                                reducedMotion={reducedMotion}
                                interactive={false}
                                altitude={1.75}
                                onError={() => setFailed(true)}
                            />
                        </Suspense>
                    ) : (
                        <GlobePlaceholder loading={!failed} />
                    )}
                </div>
                <div
                    className={cn(
                        'w-72 rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-xl',
                        hudClassName,
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <LiveStatus status={live.status} />
                        <span className="font-mono text-[11px] text-slate-400">
                            <span className="text-base font-semibold text-white tabular-nums">{formatNumber(live.stats.total)}</span> events/min
                        </span>
                    </div>
                    <div className="mt-2.5">
                        <Legend stats={live.stats} compact />
                    </div>
                    {live.feed[0] && (
                        <ul aria-live="polite" className="mt-1.5 border-t border-white/10">
                            <FeedItem key={live.feed[0].id} event={live.feed[0]} scope={scope} now={now} />
                        </ul>
                    )}
                </div>
            </>
        );
    }

    return (
        <section
            className={cn(
                'relative isolate overflow-hidden rounded-xl border border-white/10 bg-[#05060a] text-slate-100 shadow-sm dark:border-white/10',
                className,
            )}
        >
            <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_30%_40%,rgb(79_70_229/0.22),transparent_70%)]"
            />
            <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div ref={boxRef} className="relative h-[22rem] sm:h-[26rem]">
                    {mount && !failed ? (
                        <Suspense fallback={<GlobePlaceholder loading />}>
                            <GlobeCanvas
                                hubs={live.hubs}
                                subscribe={live.subscribe}
                                showLabels
                                reducedMotion={reducedMotion}
                                altitude={guildId ? 1.7 : 2.1}
                                onError={() => setFailed(true)}
                            />
                        </Suspense>
                    ) : (
                        <GlobePlaceholder loading={!failed} />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                        <div>
                            <p className="flex items-center gap-2 text-sm font-semibold">
                                <Activity className="size-4 text-indigo-300" /> กิจกรรมสด
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                                {guildId ? 'เซิร์ฟเวอร์นี้' : `${formatNumber(live.hubs.length)} เซิร์ฟเวอร์ที่คุณจัดการ`} · ตำแหน่งตามเซิร์ฟเวอร์ ไม่ใช่ตำแหน่งจริงของสมาชิก
                            </p>
                        </div>
                        <LiveStatus status={live.status} />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
                        <p className="font-mono text-xs text-slate-400">
                            <span className="text-3xl font-semibold tracking-tight text-white tabular-nums">{formatNumber(live.stats.total)}</span> เหตุการณ์ / นาที
                        </p>
                        <div className="mt-2">
                            <Legend stats={live.stats} />
                        </div>
                    </div>
                </div>
                <div className="flex min-h-0 flex-col border-t border-white/10 lg:border-t-0 lg:border-l">
                    <p className="px-4 pt-4 text-xs font-medium tracking-wider text-slate-400 uppercase">ล่าสุด</p>
                    {live.status === 'unauthorized' ? (
                        <p className="px-4 py-6 text-sm text-slate-400">session หมดอายุ — รีเฟรชหน้าเพื่อ login ใหม่</p>
                    ) : live.feed.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-slate-400">ยังเงียบอยู่ — มีคนส่งข้อความหรือเข้าห้องเสียงเมื่อไหร่ จะเห็นเส้นวิ่งเข้ามาที่นี่</p>
                    ) : (
                        <ul aria-live="polite" className="max-h-[22rem] divide-y divide-white/5 overflow-y-auto px-4 pb-2 lg:max-h-[24rem]">
                            {live.feed.slice(0, 12).map((event) => (
                                <FeedItem key={event.id} event={event} scope={scope} now={now} />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}
