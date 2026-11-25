import type { CSSProperties, ReactNode } from 'react';
import { isChristmasSeason } from '@/lib/christmas';
import './christmas.css';
import xmGold from './xmas-gold.webp';
import xmNavy from './xmas-navy.webp';
import xmWhite from './xmas-white.webp';

// ==========================================
// 🎄 ธีมคริสต์มาส + ปีใหม่ (ชั่วคราว) — หิมะตก, เนินหิมะมีต้นคริสต์มาส, ดาวดวงใหญ่, พลุปีใหม่,
// มาสคอต 3 คนนั่งเลื่อนหิมะมีกวางเรนเดียร์ลาก, การ์ดฟีเจอร์ผูกโบเป็นกล่องของขวัญ
// แสดงเองเฉพาะช่วงเทศกาล (ดู lib/christmas.ts) · อยากดูก่อน/หลังช่วงนั้นเปิด /?festival=christmas
// จบเทศกาลแล้วเอาออก: ลบ christmas.tsx/.css + บรรทัด import และ component ที่ขึ้นต้นด้วย Christmas ใน landing-page.tsx
// ==========================================

const isFestival = isChristmasSeason;

// ==========================================
// 🎄 ต้นคริสต์มาส: ใบสน 3 ชั้น + ลูกบอลประดับ + ดาวบนยอด (ใช้ทั้งบนเนินหิมะและข้างหัวข้อฟีเจอร์)
// ==========================================
const ORNAMENTS = [
    [44, 52, '#ef4444'],
    [58, 60, '#facc15'],
    [36, 80, '#60a5fa'],
    [62, 86, '#ef4444'],
    [48, 96, '#facc15'],
    [30, 112, '#f472b6'],
    [70, 110, '#60a5fa'],
    [52, 120, '#ef4444'],
] as const;

function TreeArt({ className, style, star = true }: { className?: string; style?: CSSProperties; star?: boolean }) {
    return (
        <svg viewBox="0 0 100 150" className={className} style={style}>
            <rect x="44" y="124" width="12" height="20" rx="2" fill="#7c4a24" />
            <path d="M50 22 L78 62 H22 Z" fill="#1f7a45" />
            <path d="M50 44 L86 96 H14 Z" fill="#17663a" />
            <path d="M50 70 L94 130 H6 Z" fill="#11552f" />
            {/* หิมะเกาะปลายกิ่ง */}
            <path d="M22 62 Q36 56 50 62 Q64 56 78 62 L74 58 Q50 50 26 58 Z" fill="#f1f5ff" />
            <path d="M14 96 Q32 88 50 96 Q68 88 86 96 L80 91 Q50 82 20 91 Z" fill="#f1f5ff" />
            <path d="M6 130 Q28 121 50 130 Q72 121 94 130 L88 125 Q50 115 12 125 Z" fill="#f1f5ff" />
            {ORNAMENTS.map(([cx, cy, fill], index) => (
                <circle key={index} cx={cx} cy={cy} r="3.6" fill={fill} className="xm-twinkle" style={{ animationDelay: `${index * -0.4}s` }} />
            ))}
            {star && <StarShape cx={50} cy={18} r={11} className="xm-tree-star" />}
        </svg>
    );
}

function StarShape({ cx, cy, r, className }: { cx: number; cy: number; r: number; className?: string }) {
    const points = Array.from({ length: 10 }, (_, index) => {
        const angle = (Math.PI / 5) * index - Math.PI / 2;
        const radius = index % 2 ? r * 0.45 : r;
        return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
    }).join(' ');
    return <polygon points={points} fill="#ffd54a" stroke="#f59e0b" strokeWidth="1" className={className} />;
}

// หิมะ 48 เกล็ด: ค่าคูณ 37/53/29 แค่ให้กระจายดูสุ่มแต่ได้ผลเหมือนเดิมทุกครั้ง · delay ติดลบ = เปิดหน้ามาหิมะตกอยู่แล้ว
const FLAKES = Array.from({ length: 48 }, (_, index) => ({
    left: (index * 37) % 100,
    size: 3 + ((index * 53) % 6),
    duration: 9 + ((index * 29) % 10),
    delay: -((index * 53) % 18),
    drift: index % 2 ? 24 : -24,
}));

// ต้นไม้บนเนินหิมะ: [left %, ความสูง rem, มีดาวไหม] — เว้นกลางจอไว้ให้มาสคอต
const HILL_TREES = [
    [2, 7, true],
    [8, 4.5, false],
    [14, 6, false],
    [83, 5, false],
    [89, 8, true],
    [96, 4.5, false],
] as const;

// พลุปีใหม่: [left %, top %, สี, delay s, ขนาด rem]
const FIREWORKS = [
    [10, 16, '#facc15', 0, 7],
    [22, 30, '#f472b6', -1.6, 5],
    [78, 34, '#60a5fa', -0.8, 6],
    [92, 14, '#34d399', -2.4, 7],
] as const;
const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);

// ทั้งหน้า: ทับตัวแปรสีของ .landing ด้วยโทนคริสต์มาส (เขียวสน / แดง / ทอง) — ดู .xm-theme ใน christmas.css
export function christmasTheme() {
    return isFestival() ? 'xm-theme' : '';
}

// ❄️ หิมะตกทั้งหน้า: ชั้น fixed ลอยหน้าเนื้อหา (แต่ใต้ navbar) กดทะลุได้
export function ChristmasSnow() {
    if (!isFestival()) return null;
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
            {FLAKES.map((flake, index) => (
                <span
                    key={index}
                    className="xm-flake absolute -top-4 rounded-full bg-white"
                    style={
                        {
                            left: `${flake.left}%`,
                            width: flake.size,
                            height: flake.size,
                            opacity: 0.25 + flake.size / 16,
                            animationDuration: `${flake.duration}s`,
                            animationDelay: `${flake.delay}s`,
                            '--xm-drift': `${flake.drift}px`,
                            '--xm-still': `${(index * 29) % 95}svh`,
                        } as CSSProperties
                    }
                />
            ))}
        </div>
    );
}

// 💡 ไฟประดับห้อยเป็นสาย: สายไฟโค้งเป็นช่วงๆ + หลอดสีสลับกันกะพริบ
const BULB_COLORS = ['#ef4444', '#facc15', '#22c55e', '#60a5fa'];
const BULB_SPANS = 20;
const WIRE = `M0 1 ${Array.from({ length: BULB_SPANS }, (_, index) => `Q${index * 5 + 2.5} 9 ${index * 5 + 5} 1`).join(' ')}`;

export function ChristmasLights({ className }: { className: string }) {
    if (!isFestival()) return null;
    return (
        <div aria-hidden className={`pointer-events-none ${className}`}>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                <path d={WIRE} fill="none" stroke="#14532d" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {Array.from({ length: BULB_SPANS }, (_, index) => (
                <span
                    key={index}
                    className="xm-bulb absolute top-1/2 h-2.5 w-1.5 -translate-x-1/2 rounded-full"
                    style={
                        {
                            left: `${index * 5 + 2.5}%`,
                            '--xm-bulb': BULB_COLORS[index % BULB_COLORS.length],
                            animationDelay: `${(index % 3) * -0.5}s`,
                        } as CSSProperties
                    }
                />
            ))}
        </div>
    );
}

export function Christmas() {
    if (!isFestival()) return null;

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[-5] overflow-hidden">
            <div className="xm-sky absolute inset-0" />

            {/* ดาวคริสต์มาสดวงใหญ่ */}
            <svg viewBox="0 0 100 100" className="xm-big-star absolute top-20 right-[4%] size-12 sm:top-28 sm:right-[6%] sm:size-28 lg:right-[9%] lg:size-32">
                <StarShape cx={50} cy={50} r={42} />
            </svg>

            {FIREWORKS.map(([left, top, color, delay, size]) => (
                <svg
                    key={left}
                    viewBox="-50 -50 100 100"
                    className="xm-firework absolute hidden sm:block"
                    style={{ left: `${left}%`, top: `${top}%`, width: `${size}rem`, color, animationDelay: `${delay}s` }}
                >
                    {RAYS.map((angle) => (
                        <line
                            key={angle}
                            x1="0"
                            y1="-14"
                            x2="0"
                            y2="-44"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            transform={`rotate(${angle})`}
                        />
                    ))}
                    <circle r="5" fill="currentColor" />
                </svg>
            ))}

            {/* เนินหิมะหลังเวที + ต้นคริสต์มาส */}
            <div className="absolute inset-x-0 bottom-0 h-[22%]">
                {HILL_TREES.map(([left, height, star]) => (
                    <TreeArt
                        key={left}
                        star={star}
                        className="absolute bottom-[38%] w-auto -translate-x-1/2"
                        style={{ left: `${left}%`, height: `${height}rem` }}
                    />
                ))}
                <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className="absolute inset-0 size-full">
                    <path d="M0 90 Q200 30 420 80 T820 70 T1200 60 V200 H0 Z" fill="#c9d6ff" opacity="0.55" />
                    <path d="M0 120 Q260 70 560 115 T1200 100 V200 H0 Z" fill="#eef3ff" />
                </svg>
            </div>
        </div>
    );
}

// ==========================================
// 🛷 เลื่อนหิมะ + กวางเรนเดียร์ — ตัวเลื่อนด้านหน้าบังครึ่งล่างของมาสคอต ให้ดูเหมือนนั่งอยู่ในเลื่อน
// ห่อแถวมาสคอตใน hero ไว้ นอกช่วงเทศกาลคืน children ตามเดิม
// ==========================================
function Reindeer({ x, nose }: { x: number; nose?: boolean }) {
    return (
        <g transform={`translate(${x} 0)`}>
            {/* ขาหลังกับขาหน้า (วิ่งสลับกัน) */}
            {[
                [88, 'xm-leg-a'],
                [96, 'xm-leg-b'],
                [46, 'xm-leg-b'],
                [54, 'xm-leg-a'],
            ].map(([lx, cls]) => (
                <line key={lx} x1={lx} y1="92" x2={lx} y2="128" stroke="#6b3d1e" strokeWidth="6" strokeLinecap="round" className={`${cls} xm-leg`} />
            ))}
            <ellipse cx="72" cy="88" rx="36" ry="17" fill="#9a5b2e" />
            <ellipse cx="74" cy="94" rx="24" ry="9" fill="#c98a55" />
            <path d="M106 80 q10 -6 8 4" fill="none" stroke="#f5e6d3" strokeWidth="5" strokeLinecap="round" />
            {/* คอ หัว เขา */}
            <path d="M46 82 L30 52 L42 48 L58 80 Z" fill="#9a5b2e" />
            <ellipse cx="28" cy="48" rx="14" ry="10" fill="#9a5b2e" />
            <ellipse cx="16" cy="52" rx="8" ry="6" fill="#b06d3a" />
            <circle cx="10" cy="51" r={nose ? 5 : 3} fill={nose ? '#ef4444' : '#3b2414'} className={nose ? 'xm-nose' : ''} />
            <circle cx="26" cy="44" r="2" fill="#1e1208" />
            <path d="M36 42 l8 -6 l-2 8 Z" fill="#7a4522" />
            <path
                d="M30 38 L32 16 M32 26 L24 18 M32 22 L40 12 M36 38 L46 18 M44 22 L52 16 M42 26 L50 30"
                stroke="#d6b07a"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
            />
            {/* สายรัดอกมีกระดิ่ง */}
            <path d="M48 76 Q60 96 74 104" fill="none" stroke="#dc2626" strokeWidth="6" />
            <circle cx="60" cy="94" r="4" fill="#facc15" stroke="#b45309" strokeWidth="1" />
        </g>
    );
}

function ReindeerTeam({ className }: { className: string }) {
    return (
        <svg viewBox="0 0 400 140" className={className}>
            <path d="M74 96 L400 100 M194 96 L400 110 M314 96 L400 104" stroke="#facc15" strokeWidth="2.5" fill="none" />
            <Reindeer x={240} />
            <Reindeer x={120} />
            <Reindeer x={0} nose />
        </svg>
    );
}

// เลื่อนยาวพอให้ 3 คนนั่งเรียงกัน: ท้ายเลื่อน (สูง) อยู่ซ้าย หัวเลื่อนม้วนขึ้นอยู่ขวา ฝั่งเดียวกับกวาง
// ขอบบนตรงกลางยุบลง (y 100) ให้เห็นมือคนกลางที่ถือสายบังเหียน
const SLEIGH_STRUTS = [150, 380, 610, 820];
const SLEIGH_FLAKES = [200, 390, 580, 770];

function SleighArt({ className }: { className: string }) {
    return (
        <svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax meet" className={className}>
            <ellipse cx="500" cy="292" rx="470" ry="8" fill="#0b1030" opacity="0.35" />
            {/* แท่นเลื่อน (สีทอง) ปลายด้านหน้าม้วนขึ้น */}
            <path d="M40 266 V284 H900 Q964 284 966 246 Q968 214 938 214" fill="none" stroke="#f5c542" strokeWidth="10" strokeLinecap="round" />
            {SLEIGH_STRUTS.map((x) => (
                <line key={x} x1={x} y1="262" x2={x} y2="284" stroke="#f5c542" strokeWidth="8" />
            ))}
            {/* ตัวเลื่อนสีแดง + ขอบทอง + ขอบบนสีครีม */}
            <path d="M24 18 Q300 100 600 100 Q860 100 952 50 Q1000 170 900 270 H70 Q14 190 24 18 Z" fill="#c81e2e" stroke="#7f1018" strokeWidth="3" />
            <path d="M46 52 Q36 186 86 250 H884 Q950 180 934 84" fill="none" stroke="#f5c542" strokeWidth="6" />
            <path d="M24 18 Q300 100 600 100 Q860 100 952 50" fill="none" stroke="#fff4d6" strokeWidth="14" strokeLinecap="round" />
            {SLEIGH_FLAKES.map((x) => (
                <g key={x} stroke="#f5c542" strokeWidth="4" strokeLinecap="round">
                    <line x1={x - 20} y1="190" x2={x + 20} y2="190" />
                    <line x1={x - 10} y1="172" x2={x + 10} y2="208" />
                    <line x1={x + 10} y1="172" x2={x - 10} y2="208" />
                </g>
            ))}
            {/* กล่องของขวัญโผล่จากท้ายเลื่อน */}
            <rect x="34" y="-26" width="50" height="46" rx="3" fill="#16a34a" />
            <rect x="54" y="-26" width="10" height="46" fill="#facc15" />
            <path d="M59 -26 q-16 -16 -20 0 M59 -26 q16 -16 20 0" fill="none" stroke="#facc15" strokeWidth="5" />
        </svg>
    );
}

// ชุดนั่งเลื่อนของมาสคอต 3 คน (เรียงซ้าย→ขวาแบบเดียวกับ hero) — นอกช่วงเทศกาลคืน null ให้ใช้ชุดปกติ
export function christmasCrew(): readonly [string, string, string] | null {
    return isFestival() ? [xmGold, xmWhite, xmNavy] : null;
}

// ห่อแถวมาสคอตใน hero: กวางอยู่ขวาหันไปทางขวา (กลับด้านทั้งรูป) · ขนาด/สัดส่วนภาพชุดนั่งอยู่ใน .xm-crew (christmas.css)
export function ChristmasSleigh({ children }: { children: ReactNode }) {
    if (!isFestival()) return <>{children}</>;
    return (
        <div className="xm-crew xm-sleigh-bob relative md:-translate-x-[24%]">
            <ReindeerTeam className="xm-team pointer-events-none absolute bottom-[1%] left-[103%] hidden w-[70%] -scale-x-100 overflow-visible md:block" />
            {children}
            <SleighArt className="pointer-events-none absolute -inset-x-[7%] -bottom-[4%] z-30 w-[114%] overflow-visible" />
        </div>
    );
}

// ==========================================
// 🎁 โบกล่องของขวัญ: ริบบิ้นไขว้ตรงมุมขวาบนของการ์ดฟีเจอร์ (อยู่หลังตัวหนังสือ) + โบตรงจุดตัด
// จอเล็กริบบิ้นแนวตั้งชิดขอบกว่า ไม่ให้พาดกลางตัวหนังสือ
// ==========================================
export function ChristmasGiftRibbon() {
    if (!isFestival()) return null;
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 right-8 w-3 sm:right-14 bg-[#dc2626]/80 shadow-[inset_0_0_0_1px_#facc1555]" />
            <div className="absolute inset-x-0 top-14 h-3 bg-[#dc2626]/80 shadow-[inset_0_0_0_1px_#facc1555]" />
            <svg viewBox="0 0 80 60" className="absolute top-[2.375rem] right-1.5 w-16 sm:top-8 sm:right-[1.375rem] sm:w-20">
                <path d="M40 30 C20 6 6 18 16 30 C6 42 20 50 40 30 Z" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
                <path d="M40 30 C60 6 74 18 64 30 C74 42 60 50 40 30 Z" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
                <circle cx="40" cy="30" r="7" fill="#facc15" stroke="#b45309" strokeWidth="2" />
            </svg>
        </div>
    );
}

// ต้นคริสต์มาสข้างหัวข้อ section ฟีเจอร์
export function ChristmasTree({ className }: { className: string }) {
    if (!isFestival()) return null;
    return <TreeArt className={className} />;
}
