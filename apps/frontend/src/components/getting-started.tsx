import { tr } from '../lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, useSyncExternalStore } from 'react';
import { aiSettingsQuery } from '@/api/ai';
import { configQuery, levelsQuery } from '@/api/bot';
import { welcomeCardsQuery } from '@/api/welcome';
import { ArrowLeft, ArrowRight, Bot, Check, Settings, Trophy, UserPlus, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import mascotLaptop from '@/features/landing/mascot/laptop.webp';
import mascotPoint from '@/features/landing/mascot/point.webp';
import mascotPresent from '@/features/landing/mascot/present.webp';
import mascotThumbs from '@/features/landing/mascot/thumbs-up.webp';
import { useGuild } from '@/hooks/use-guild';
import { cn } from '@/lib/utils';

// ==========================================
// 🧭 ตั้งค่าบอทแบบ "เล่าเรื่อง" ทีละขั้น — โผล่เฉพาะตอนที่ยังตั้งค่าไม่ครบ
// แต่ละขั้นเช็คจากค่าจริงของเซิร์ฟเวอร์ (ติ๊กให้เอง) ; กด "ข้าม" / "ซ่อน" จำไว้ในเครื่องนี้ต่อเซิร์ฟเวอร์
// ==========================================

type StepKey = 'config' | 'welcome' | 'levels' | 'ai';
const STEP_ICONS = { config: Settings, welcome: UserPlus, levels: Trophy, ai: Bot };
const STEP_ART = { config: mascotLaptop, welcome: mascotPresent, levels: mascotThumbs, ai: mascotPoint };
const STEP_PATH = {
    config: '/servers/$guildId/config',
    welcome: '/servers/$guildId/welcome',
    levels: '/servers/$guildId/levels',
    ai: '/servers/$guildId/ai',
} as const;

interface SetupMemory {
    skipped: StepKey[];
    hidden: boolean;
}

// localStorage อาจใช้ไม่ได้ (โหมดส่วนตัว) — ตอนนั้นจำได้แค่ในหน้านี้
const listeners = new Set<() => void>();
const memoryKey = (guildId: string) => `setup:${guildId}`;
const cache = new Map<string, string>();
function readMemory(guildId: string): string {
    try {
        return localStorage.getItem(memoryKey(guildId)) ?? cache.get(guildId) ?? '';
    } catch {
        return cache.get(guildId) ?? '';
    }
}
function writeMemory(guildId: string, value: SetupMemory) {
    const raw = JSON.stringify(value);
    cache.set(guildId, raw);
    try {
        localStorage.setItem(memoryKey(guildId), raw);
    } catch {
        // ไม่มี storage: เก็บแค่ใน cache
    }
    listeners.forEach((fn) => fn());
}
function useSetupMemory(guildId: string): [SetupMemory, (next: SetupMemory) => void] {
    const raw = useSyncExternalStore(
        (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        () => readMemory(guildId),
    );
    let memory: SetupMemory = { skipped: [], hidden: false };
    try {
        if (raw) memory = { ...memory, ...(JSON.parse(raw) as Partial<SetupMemory>) };
    } catch {
        // ค่าเสีย: เริ่มใหม่
    }
    return [memory, (next) => writeMemory(guildId, next)];
}

export function GettingStarted() {
    const guild = useGuild();
    const [memory, setMemory] = useSetupMemory(guild.id);
    // เช็คจากค่าจริง — ถ้าโหลดไม่ได้ถือว่ายังไม่เสร็จ (ผู้ใช้กดข้ามได้)
    const { data: config } = useQuery(configQuery(guild.id));
    const { data: cards } = useQuery(welcomeCardsQuery(guild.id));
    const { data: levels } = useQuery(levelsQuery(guild.id));
    const { data: ai } = useQuery(aiSettingsQuery(guild.id));
    const done: Record<StepKey, boolean> = {
        config: Boolean(config?.some((row) => row.type === 'channel' && row.value)),
        welcome: Boolean(cards && cards.length > 0),
        levels: Boolean(levels && levels.total > 0),
        ai: Boolean(ai?.aiEnabled && (ai.hasKey || ai.isUsingFallbackHomeKey)),
    };
    const steps = (Object.keys(STEP_PATH) as StepKey[]).map((key) => ({
        key,
        done: done[key],
        skipped: !done[key] && memory.skipped.includes(key),
    }));
    const firstOpen = steps.findIndex((step) => !step.done && !step.skipped);
    const [picked, setPicked] = useState<number | null>(null);
    const current = picked ?? Math.max(0, firstOpen);
    const finished = steps.filter((step) => step.done).length;

    // ครบแล้ว (หรือข้ามหมด / กดซ่อน) ไม่ต้องรบกวนอีก
    if (memory.hidden || firstOpen === -1) return null;

    const step = steps[current] ?? steps[0]!;
    const Icon = STEP_ICONS[step.key];
    const skip = () => {
        setMemory({ ...memory, skipped: [...new Set([...memory.skipped, step.key])] });
        setPicked(null);
    };

    return (
        <Card className="gap-0 overflow-hidden py-0" aria-labelledby="setup-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                    <h2 id="setup-title" className="font-semibold">
                        {tr('setup.title')}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground tabular-nums">
                        {tr('setup.progress', { done: finished, total: steps.length })}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setMemory({ ...memory, hidden: true })}
                        aria-label={tr('setup.hide')}
                        title={tr('setup.hide')}
                    >
                        <X />
                    </Button>
                </div>
            </div>

            {/* แถบขั้นตอน: กดดูขั้นไหนก็ได้ ; ขั้นที่เสร็จมีเครื่องหมายถูก */}
            <ol className="grid grid-cols-4 gap-1.5 px-5 pt-4">
                {steps.map((s, i) => (
                    <li key={s.key}>
                        <button
                            type="button"
                            onClick={() => setPicked(i)}
                            aria-current={i === current ? 'step' : undefined}
                            aria-label={`${tr('setup.stepOf', { step: i + 1, total: steps.length })}: ${tr(`setup.${s.key}Title`)}${s.done ? ` (${tr('setup.done')})` : ''}`}
                            className="group block w-full rounded-full py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                                <span
                                    className={cn(
                                        'block h-full origin-left rounded-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
                                        s.done ? 'scale-x-100 bg-success' : i === current ? 'scale-x-50 bg-primary' : 'scale-x-0 bg-primary',
                                    )}
                                />
                            </span>
                        </button>
                    </li>
                ))}
            </ol>

            {/* key ตามขั้น: เปลี่ยนขั้นแล้วเนื้อหาเลื่อนเข้ามาใหม่ */}
            <div key={step.key} className="dash-page-in grid items-center gap-5 p-5 sm:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-foreground">
                            <Icon className="size-4" />
                        </span>
                        {tr('setup.stepOf', { step: current + 1, total: steps.length })}
                        {step.done && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-success">
                                <Check className="size-3" /> {tr('setup.done')}
                            </span>
                        )}
                        {step.skipped && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{tr('setup.skipped')}</span>}
                    </p>
                    <h3 className="text-xl font-bold tracking-tight">{tr(`setup.${step.key}Title`)}</h3>
                    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{tr(`setup.${step.key}Body`)}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button asChild>
                            <Link to={STEP_PATH[step.key]} params={{ guildId: guild.id }}>
                                {tr(`setup.${step.key}Cta`)} <ArrowRight />
                            </Link>
                        </Button>
                        {!step.done && !step.skipped && (
                            <Button variant="ghost" onClick={skip}>
                                {tr('setup.skip')}
                            </Button>
                        )}
                        <span className="ml-auto flex gap-1">
                            <Button
                                variant="outline"
                                size="icon-sm"
                                disabled={current === 0}
                                onClick={() => setPicked(current - 1)}
                                aria-label={tr('setup.back')}
                            >
                                <ArrowLeft />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                disabled={current === steps.length - 1}
                                onClick={() => setPicked(current + 1)}
                                aria-label={tr('setup.next')}
                            >
                                <ArrowRight />
                            </Button>
                        </span>
                    </div>
                </div>
                <img
                    src={STEP_ART[step.key]}
                    alt=""
                    width={160}
                    height={160}
                    loading="lazy"
                    className="dash-float mx-auto hidden h-40 w-auto drop-shadow-xl sm:block"
                />
            </div>
        </Card>
    );
}
