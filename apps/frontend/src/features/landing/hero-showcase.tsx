import { useEffect, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from './reveal';

// ==========================================
// 🌤️ ภาพบนสุดของหน้า landing — รายงานอากาศประจำวัน (หน้าตาตามค่าเริ่มต้นของระบบ Weather)
// แล้วตามด้วยข้อความ + การ์ดต้อนรับสมาชิกใหม่ (ตามค่าเริ่มต้นของระบบ Welcome) ; ข้อมูลทั้งหมดเป็นตัวอย่าง
// ==========================================

const WEATHER_FIELDS: { label: string; value: string; detail?: string }[] = [
    { label: '🌡️ อุณหภูมิ', value: '29.4°C' },
    { label: '🥵 รู้สึกเหมือน', value: '34.1°C' },
    { label: '🔺 สูงสุด / ต่ำสุด', value: '33° / 26°' },
    { label: '☔ โอกาสฝนตก', value: '70%', detail: 'ฝนรวม ~4.2 มม.' },
    { label: '💧 ความชื้น', value: '78%' },
    { label: '💨 ลม', value: '11 กม./ชม.', detail: 'ทิศตะวันตกเฉียงใต้' },
    { label: '😷 PM2.5', value: '18.5 µg/m³', detail: '🟢 ดี' },
    { label: '🌅 ขึ้น / ตก', value: '06:09 / 17:55' },
    { label: '☁️ เมฆปกคลุม', value: '64%' },
];

// อุณหภูมิ / โอกาสฝน ทุก 3 ชม. (07:00 → 04:00) สำหรับกราฟพยากรณ์
const FORECAST = [
    { time: '07', temp: 27, rain: 10 },
    { time: '10', temp: 31, rain: 15 },
    { time: '13', temp: 33, rain: 40 },
    { time: '16', temp: 32, rain: 70 },
    { time: '19', temp: 29, rain: 55 },
    { time: '22', temp: 28, rain: 20 },
    { time: '01', temp: 27, rain: 10 },
    { time: '04', temp: 26, rain: 5 },
];

function useTimeline(times: number[]) {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (prefersReducedMotion()) {
            setStep(times.length);
            return;
        }
        const timers = times.map((at, index) => setTimeout(() => setStep(index + 1), at));
        return () => timers.forEach(clearTimeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return step;
}

function Show({ show, children, className = '', delay = 0 }: { show: boolean; children: ReactNode; className?: string; delay?: number }) {
    return (
        <div
            style={{ transitionDelay: show ? `${delay}ms` : '0ms' }}
            className={`transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${show ? 'translate-none opacity-100' : 'translate-y-2 opacity-0'} ${className}`}
        >
            {children}
        </div>
    );
}

function ChannelBar({ name, note }: { name: string; note?: string }) {
    return (
        <div className="flex items-center gap-2 border-b border-black/30 px-4 py-2.5 text-sm font-semibold text-slate-200">
            <span className="text-lg leading-none text-slate-500">#</span>
            {name}
            {note && <span className="ml-auto truncate text-xs font-normal text-slate-400">{note}</span>}
        </div>
    );
}

function BotHeader({ botName, botAvatar, time }: { botName: string; botAvatar: string; time: string }) {
    return (
        <p className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-indigo-300">{botName}</span>
            <span className="rounded bg-[#5865F2] px-1 text-[10px] font-semibold text-white">APP</span>
            <span className="text-xs text-slate-500">{time}</span>
            <img src={botAvatar} alt="" className="order-first mr-1.5 size-8 rounded-full" />
        </p>
    );
}

// กราฟพยากรณ์แบบเดียวกับรูปที่บอทแนบ (ธีมสว่าง เส้นอุณหภูมิสีส้ม แท่งโอกาสฝนสีฟ้า)
function ForecastChart({ draw }: { draw: boolean }) {
    const w = 320;
    const h = 92;
    const x = (i: number) => 18 + (i / (FORECAST.length - 1)) * (w - 36);
    const y = (t: number) => 14 + ((34 - t) / 9) * (h - 40);
    const line = FORECAST.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.temp)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full rounded bg-white" aria-hidden="true">
            {FORECAST.map((p, i) => (
                <rect
                    key={p.time}
                    x={x(i) - 7}
                    width={14}
                    rx={2}
                    y={h - 18 - (p.rain / 100) * 34}
                    height={(p.rain / 100) * 34}
                    fill="#7dd3fc"
                    className="origin-bottom transition-transform duration-700 ease-out motion-reduce:transition-none"
                    style={{ transform: draw ? 'scaleY(1)' : 'scaleY(0)', transformBox: 'fill-box', transitionDelay: `${i * 60}ms` }}
                />
            ))}
            <path
                d={line}
                fill="none"
                stroke="#F97316"
                strokeWidth={2.5}
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={draw ? 0 : 1}
                className="transition-[stroke-dashoffset] duration-[1200ms] ease-out motion-reduce:transition-none"
            />
            {FORECAST.map((p, i) => (
                <g key={p.time} className="transition-opacity duration-500" style={{ opacity: draw ? 1 : 0, transitionDelay: `${300 + i * 80}ms` }}>
                    <circle cx={x(i)} cy={y(p.temp)} r={2.5} fill="#F97316" />
                    <text x={x(i)} y={y(p.temp) - 6} textAnchor="middle" fontSize={8} fill="#9a3412">
                        {p.temp}°
                    </text>
                    <text x={x(i)} y={h - 5} textAnchor="middle" fontSize={8} fill="#64748b">
                        {p.time}:00
                    </text>
                </g>
            ))}
        </svg>
    );
}

export function HeroShowcase({ botName, botAvatar }: { botName: string; botAvatar: string }) {
    // 1 ข้อความรายงานขึ้น → 2 ช่องข้อมูล → 3 กราฟ → 4 สมาชิกใหม่เข้าเซิร์ฟ → 5 การ์ดต้อนรับ
    const step = useTimeline([300, 700, 1300, 2600, 3100]);
    const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

    return (
        <div className="relative w-full max-w-md pb-4">
            {/* รายงานอากาศประจำวัน */}
            <figure className="overflow-hidden rounded-lg border border-black/40 bg-[#313338] shadow-xl lg:-rotate-[0.6deg]">
                <ChannelBar name="สภาพอากาศ" note="⏰ ส่งเองทุกวัน 07:00" />
                <Show show={step >= 1} className="space-y-1.5 p-4">
                    <BotHeader botName={botName} botAvatar={botAvatar} time="วันนี้ เวลา 07:00" />
                    <div className="pl-[2.375rem] text-sm">
                        <p className="text-slate-200">☀️ พยากรณ์อากาศวันนี้</p>
                        <div className="mt-1.5 rounded border-l-4 border-[#F59E0B] bg-[#2b2d31] p-3">
                            <p className="font-semibold text-sky-300">รายงานสภาพอากาศ กรุงเทพมหานคร</p>
                            <p className="mt-0.5 text-xs text-slate-300">{today}</p>
                            <p className="text-xs text-slate-200">
                                🌦️ <span className="font-semibold">ฝนเล็กน้อย</span>
                            </p>
                            <dl className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-2 text-[11px] leading-tight">
                                {WEATHER_FIELDS.map((field, index) => (
                                    <Show key={field.label} show={step >= 2} delay={index * 60}>
                                        <dt className="font-semibold text-slate-100">{field.label}</dt>
                                        <dd className="mt-0.5 text-slate-300">{field.value}</dd>
                                        {field.detail && <dd className="text-slate-400">{field.detail}</dd>}
                                    </Show>
                                ))}
                            </dl>
                            <ForecastChart draw={step >= 3} />
                            <p className="mt-2 text-[10px] text-slate-400">ข้อมูลจาก OpenWeatherMap • วันนี้ เวลา 07:00</p>
                        </div>
                    </div>
                </Show>
            </figure>

            {/* ต้อนรับสมาชิกใหม่ */}
            <figure
                className={`relative z-10 mt-4 overflow-hidden rounded-lg border border-black/40 bg-[#313338] shadow-2xl transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none sm:-mt-10 sm:ml-10 sm:-mr-6 lg:rotate-[1.2deg] ${
                    step >= 4 ? 'translate-none opacity-100' : 'translate-y-6 opacity-0'
                }`}
            >
                <ChannelBar name="ยินดีต้อนรับ" note="มีคนเข้าเซิร์ฟใหม่" />
                <div className="space-y-1.5 p-4">
                    <BotHeader botName={botName} botAvatar={botAvatar} time="วันนี้ เวลา 19:24" />
                    <div className="pl-[2.375rem] text-sm">
                        <p className="text-slate-200">
                            ยินดีต้อนรับ <span className="rounded bg-indigo-500/30 px-0.5 text-indigo-200">@มายด์</span> เข้าสู่{' '}
                            <span className="font-semibold">NotStackOverflow</span> 🎉
                        </p>
                        {/* การ์ดต้อนรับ 1024×450 ตามค่าเริ่มต้น: พื้นคราม + รูปโปรไฟล์วงกลมขอบขาว + WELCOME / ชื่อ / ลำดับสมาชิก */}
                        <div className="relative mt-2 aspect-[1024/450] overflow-hidden rounded-md bg-[#312e81]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(129,140,248,0.45),transparent_55%),radial-gradient(circle_at_85%_90%,rgba(56,189,248,0.3),transparent_50%)]" />
                            <div className="absolute inset-0 bg-black/30" />
                            <div className="relative flex h-full flex-col items-center justify-center text-center">
                                <div
                                    className={`flex aspect-square h-[38%] items-center justify-center rounded-full border-[3px] border-white bg-emerald-700 text-lg font-semibold text-white transition-transform duration-500 ease-out motion-reduce:transition-none ${
                                        step >= 5 ? 'scale-100' : 'scale-0'
                                    }`}
                                >
                                    ม
                                </div>
                                <Show show={step >= 5} delay={150}>
                                    <p className="mt-1.5 text-base leading-none font-black tracking-[0.2em] text-white sm:text-lg">WELCOME</p>
                                </Show>
                                <Show show={step >= 5} delay={250}>
                                    <p className="mt-1 text-sm leading-none font-bold text-[#fde68a]">มายด์</p>
                                </Show>
                                <Show show={step >= 5} delay={350}>
                                    <p className="mt-1 text-[10px] text-slate-200">สมาชิกคนที่ #128 ของ NotStackOverflow</p>
                                </Show>
                            </div>
                        </div>
                    </div>
                </div>
            </figure>
        </div>
    );
}
