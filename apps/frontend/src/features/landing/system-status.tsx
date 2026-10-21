import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

// ==========================================
// 🟢 สถานะระบบ + uptime — อ่านจาก GET /api/health (สาธารณะ) ทุก 1 นาที แล้วนับวินาทีต่อเองในหน้า
// ==========================================

interface Health {
    status: 'ok' | 'error';
    database: boolean;
    discord: boolean;
    uptimeSec: number;
}

interface HealthSnapshot extends Health {
    checkedAt: number;
}

// 503 (ฐานข้อมูลล่ม) ยังส่ง body กลับมา — อ่านเองด้วย fetch แทน api() ที่จะ throw ทิ้ง
export const healthQuery = queryOptions({
    queryKey: ['app', 'health'],
    queryFn: async ({ signal }): Promise<HealthSnapshot> => {
        const res = await fetch(apiUrl('/health'), { cache: 'no-store', signal });
        const body = (await res.json()) as Health;
        return { ...body, checkedAt: Date.now() };
    },
    refetchInterval: 60 * 1000,
    retry: 1,
    staleTime: 30 * 1000,
});

function useNow(intervalMs: number) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
}

function splitDuration(totalSec: number) {
    const sec = Math.max(0, Math.floor(totalSec));
    return { days: Math.floor(sec / 86400), hours: Math.floor((sec % 86400) / 3600), minutes: Math.floor((sec % 3600) / 60), seconds: sec % 60 };
}

const pad = (n: number) => String(n).padStart(2, '0');

function Dot({ ok }: { ok: boolean | undefined }) {
    const color = ok === undefined ? 'bg-slate-500' : ok ? 'bg-emerald-400' : 'bg-rose-400';
    return (
        <span className="relative flex size-2">
            {ok && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:hidden" />}
            <span className={`relative inline-flex size-2 rounded-full ${color}`} />
        </span>
    );
}

// บรรทัดสั้นๆ บน hero: ● ออนไลน์ · เปิดมา 3 วัน
export function StatusLine() {
    const { data, isError } = useQuery(healthQuery);
    const online = data ? data.discord : isError ? false : undefined;
    const days = data ? splitDuration(data.uptimeSec).days : 0;
    return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Dot ok={online} />
            {online === undefined ? 'กำลังเช็ค…' : online ? `บอทออนไลน์${days > 0 ? ` · ต่อเนื่อง ${days} วัน` : ''}` : 'บอทออฟไลน์'}
            <a href="#status" className="underline decoration-dotted underline-offset-4 hover:text-foreground">
                ดูสถานะ
            </a>
        </p>
    );
}

export function SystemStatus() {
    const { data, isError, isPending } = useQuery(healthQuery);
    const now = useNow(1000);
    const uptime = data ? splitDuration(data.uptimeSec + (now - data.checkedAt) / 1000) : null;
    const apiOk = isPending ? undefined : !isError && data !== undefined;

    const rows: { label: string; ok: boolean | undefined; note: string }[] = [
        { label: 'บอทใน Discord', ok: isPending ? undefined : Boolean(data?.discord), note: data?.discord ? 'เชื่อมต่ออยู่' : 'ไม่ได้เชื่อมต่อ' },
        { label: 'API / Dashboard', ok: apiOk, note: apiOk ? 'ใช้งานได้' : 'ติดต่อไม่ได้' },
        { label: 'ฐานข้อมูล', ok: isPending ? undefined : Boolean(data?.database), note: data?.database ? 'ปกติ' : 'มีปัญหา' },
    ];

    return (
        <div className="grid overflow-hidden rounded-xl border md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-3 border-b p-6 md:border-r md:border-b-0">
                <p className="text-sm text-muted-foreground">เปิดต่อเนื่องมาแล้ว</p>
                {uptime ? (
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono tabular-nums">
                        <span>
                            <span className="text-4xl font-semibold text-foreground sm:text-5xl">{uptime.days}</span>
                            <span className="ml-1.5 text-sm text-muted-foreground">วัน</span>
                        </span>
                        <span className="text-3xl text-slate-300 sm:text-4xl">
                            {pad(uptime.hours)}:{pad(uptime.minutes)}:<span className="text-slate-500">{pad(uptime.seconds)}</span>
                        </span>
                    </div>
                ) : (
                    <p className="font-mono text-4xl text-slate-600">{isError ? '—' : '··'}</p>
                )}
                <p className="text-xs text-muted-foreground">นับจากเปิดระบบครั้งล่าสุด</p>
            </div>
            <div className="flex flex-col">
                <ul className="flex-1 divide-y">
                    {rows.map((row) => (
                        <li key={row.label} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                            <Dot ok={row.ok} />
                            <span className="flex-1">{row.label}</span>
                            <span className="text-xs text-muted-foreground">{row.ok === undefined ? '…' : row.note}</span>
                        </li>
                    ))}
                </ul>
                <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                    {data
                        ? `เช็คล่าสุด ${new Date(data.checkedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · อัปเดตทุก 1 นาที`
                        : isError
                          ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ จะลองใหม่อัตโนมัติ'
                          : 'กำลังเช็ค…'}
                </p>
            </div>
        </div>
    );
}
