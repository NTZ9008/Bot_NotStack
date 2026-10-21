import type { ReactNode } from 'react';
import { useInView, useSteps } from './reveal';

// ==========================================
// 🖼️ ภาพประกอบความสามารถแต่ละกลุ่ม — หน้าตาแบบ Discord (ข้อความจำลอง) ค่อยๆ เล่นเหตุการณ์ทีละอย่างเมื่อเลื่อนมาเห็น
// ==========================================

// แสดงเมื่อถึงขั้นที่กำหนด (fade + เลื่อนขึ้นเล็กน้อย)
function Appear({ show, children, className = '' }: { show: boolean; children: ReactNode; className?: string }) {
    return (
        <div
            className={`transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${show ? 'translate-none opacity-100' : 'translate-y-3 opacity-0'} ${className}`}
        >
            {children}
        </div>
    );
}

function Frame({ channel, children, tilt }: { channel: string; children: ReactNode; tilt: string }) {
    return (
        <div className={`w-full max-w-md overflow-hidden rounded-lg border border-black/40 bg-[#313338] text-sm shadow-xl ${tilt}`}>
            <div className="flex items-center gap-2 border-b border-black/30 px-4 py-2.5 font-semibold text-slate-200">
                <span className="text-lg leading-none text-slate-500">#</span> {channel}
            </div>
            <div className="space-y-3 p-4">{children}</div>
        </div>
    );
}

function BotLine({ avatar, name }: { avatar: string; name: string }) {
    return (
        <p className="flex items-center gap-1.5">
            <img src={avatar} alt="" className="size-5 rounded-full" />
            <span className="font-medium text-indigo-300">{name}</span>
            <span className="rounded bg-[#5865F2] px-1 text-[10px] font-semibold text-white">APP</span>
        </p>
    );
}

function Embed({ color, children }: { color: string; children: ReactNode }) {
    return <div className={`space-y-1.5 rounded border-l-4 bg-[#2b2d31] p-3 ${color}`}>{children}</div>;
}

interface BotProps {
    botName: string;
    botAvatar: string;
}

function SecurityIllustration({ botName, botAvatar, active }: BotProps & { active: boolean }) {
    const step = useSteps(active, 3, 900);
    return (
        <Frame channel="security" tilt="-rotate-[0.8deg]">
            <Appear show={step >= 1} className="space-y-2">
                <BotLine avatar={botAvatar} name={botName} />
                <Embed color="border-amber-400">
                    <p className="font-semibold text-slate-100">⚠️ มีคนเปลี่ยนการตั้งค่าห้องเสียง</p>
                    <div className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-slate-300">
                        <span className="text-slate-500">ห้อง</span>
                        <span>🔊 เล่นเกม</span>
                        <span className="text-slate-500">Bitrate</span>
                        <span>
                            96 kbps →{' '}
                            <span className={`font-semibold transition-colors duration-700 ${step >= 2 ? 'text-rose-300' : 'text-slate-300'}`}>8 kbps</span>
                        </span>
                        <span className="text-slate-500">โดย</span>
                        <span className="text-indigo-200">@ขี้แกล้ง</span>
                    </div>
                </Embed>
            </Appear>
            <Appear show={step >= 3}>
                <Embed color="border-rose-400">
                    <p className="text-slate-200">
                        🚫 <span className="font-semibold">Voice Guard</span> ตัด <span className="text-indigo-200">@คนนอก</span> ออกจาก 🔊 ประชุมทีม
                    </p>
                    <p className="text-xs text-slate-400">เหตุผล: ไม่อยู่ใน whitelist ของห้องนี้</p>
                </Embed>
            </Appear>
        </Frame>
    );
}

function CommunityIllustration({ active }: { active: boolean }) {
    const step = useSteps(active, 4, 650);
    const gains = [
        { label: '+15 XP', reason: 'พิมพ์ในห้อง' },
        { label: '+40 XP', reason: 'อยู่ห้องเสียง 10 นาที' },
    ];
    return (
        <div className="relative w-full max-w-md rotate-[0.8deg]">
            {/* การ์ด /rank */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#1e1b4b] via-[#1e293b] to-[#0f172a] p-5 shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-2xl font-semibold text-white ring-4 ring-indigo-400/40">
                        ม
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-lg font-semibold">มายด์</p>
                            <p className="shrink-0 text-sm text-slate-400">
                                อันดับ <span className="font-semibold text-slate-100">#3</span>
                            </p>
                        </div>
                        <p className="text-sm text-indigo-200">
                            Level{' '}
                            <span className={`inline-block font-bold transition-transform duration-300 ${step >= 4 ? 'scale-125 text-amber-300' : ''}`}>
                                {step >= 4 ? 13 : 12}
                            </span>
                        </p>
                    </div>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-black/40">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-[width] duration-700 ease-out"
                        style={{ width: step >= 4 ? '6%' : step >= 3 ? '97%' : step >= 2 ? '82%' : step >= 1 ? '70%' : '0%' }}
                    />
                </div>
                <p className="mt-1.5 text-right font-mono text-xs text-slate-400">{step >= 4 ? '30 / 5,400 XP' : '3,450 / 5,000 XP'}</p>
            </div>
            {/* XP ที่ได้เพิ่ม */}
            <div className="mt-3 flex flex-wrap gap-2">
                {gains.map((gain, index) => (
                    <Appear key={gain.label} show={step >= index + 2}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs">
                            <span className="font-semibold text-emerald-300">{gain.label}</span>
                            <span className="text-slate-400">{gain.reason}</span>
                        </span>
                    </Appear>
                ))}
                <Appear show={step >= 4}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
                        🎉 เลเวลอัป! ได้ยศ Regular
                    </span>
                </Appear>
            </div>
        </div>
    );
}

function TeamIllustration({ botName, botAvatar, active }: BotProps & { active: boolean }) {
    const step = useSteps(active, 3, 900);
    const merged = step >= 3;
    const rows = [
        { icon: '✅', text: 'CI ผ่าน 3/3', show: step >= 1 },
        { icon: '👍', text: 'approve โดย @arlif', show: step >= 2 },
        { icon: '🟣', text: 'merge เข้า release แล้ว', show: step >= 3 },
    ];
    return (
        <Frame channel="pull-requests" tilt="-rotate-[0.6deg]">
            <BotLine avatar={botAvatar} name={botName} />
            <Embed color={`transition-colors duration-500 ${merged ? 'border-purple-400' : 'border-emerald-400'}`}>
                <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sky-300">#128 เพิ่มหน้าแรกของบอท</p>
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-500 ${merged ? 'bg-purple-500/25 text-purple-200' : 'bg-emerald-500/20 text-emerald-200'}`}
                    >
                        {merged ? 'Merged' : 'Open'}
                    </span>
                </div>
                <p className="text-xs text-slate-400">boatngin ต้องการ merge 4 commits</p>
                <ul className="space-y-1 pt-1 text-slate-300">
                    {rows.map((row) => (
                        <li key={row.text}>
                            <Appear show={row.show}>
                                {row.icon} {row.text}
                            </Appear>
                        </li>
                    ))}
                </ul>
            </Embed>
            <p className="text-xs text-slate-500">ข้อความเดิมถูกแก้ไขเรื่อยๆ — ไม่มีข้อความใหม่มารกห้อง</p>
        </Frame>
    );
}

function LogsIllustration({ active }: { active: boolean }) {
    const step = useSteps(active, 4, 450);
    const events = [
        { time: '20:14', icon: '📥', text: 'มายด์ เข้าเซิร์ฟ' },
        { time: '20:16', icon: '🔊', text: 'บอส ย้ายจาก เล่นเกม → ฟังเพลง' },
        { time: '20:21', icon: '✏️', text: 'ปอนด์ แก้ข้อความใน #คุยเล่น' },
        { time: '20:23', icon: '🗑️', text: 'ข้อความถูกลบใน #ประกาศ' },
    ];
    const bars = [35, 52, 44, 70, 58, 88, 64];
    return (
        <div className="w-full max-w-md space-y-3 rotate-[0.6deg]">
            <Frame channel="server-log" tilt="">
                <ul className="space-y-2">
                    {events.map((event, index) => (
                        <li key={event.text}>
                            <Appear show={step > index} className="flex items-center gap-2 rounded bg-[#2b2d31] px-3 py-2">
                                <span className="font-mono text-xs text-slate-500">{event.time}</span>
                                <span>{event.icon}</span>
                                <span className="truncate text-slate-200">{event.text}</span>
                            </Appear>
                        </li>
                    ))}
                </ul>
            </Frame>
            <div className="rounded-lg border bg-card p-4 shadow-xl">
                <p className="mb-3 text-xs text-muted-foreground">คนในห้องเสียง 7 วันล่าสุด</p>
                <div className="flex h-20 items-end gap-2">
                    {bars.map((height, index) => (
                        <div
                            key={index}
                            className="flex-1 rounded-t bg-gradient-to-t from-indigo-500/50 to-indigo-400 transition-[height] duration-700 ease-out motion-reduce:transition-none"
                            style={{ height: active ? `${height}%` : '4%', transitionDelay: `${index * 70}ms` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export function FeatureIllustration({ group, botName, botAvatar }: BotProps & { group: string }) {
    const [ref, active] = useInView<HTMLDivElement>(0.35);
    return (
        <div ref={ref} aria-hidden="true" className="flex justify-center">
            {group === 'security' && <SecurityIllustration botName={botName} botAvatar={botAvatar} active={active} />}
            {group === 'community' && <CommunityIllustration active={active} />}
            {group === 'team' && <TeamIllustration botName={botName} botAvatar={botAvatar} active={active} />}
            {group === 'logs' && <LogsIllustration active={active} />}
        </div>
    );
}
