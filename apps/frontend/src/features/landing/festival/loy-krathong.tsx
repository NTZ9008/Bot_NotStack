import type { CSSProperties, ReactNode } from 'react';
import './loy-krathong.css';

// ==========================================
// 🪷 ธีมลอยกระทง (ชั่วคราว) — พระจันทร์เต็มดวง, แม่น้ำมีกระทงหลายแบบลอย, โคมลอยขึ้นฟ้า ใน hero
// แสดงเองเฉพาะช่วงเทศกาล (ตามเวลาไทย) · อยากดูก่อน/หลังช่วงนั้นเปิด /?festival=loy-krathong
// จบเทศกาลแล้วเอาออก: ลบโฟลเดอร์ festival/ ทั้งโฟลเดอร์ + บรรทัด import และ <LoyKrathong /> ใน landing-page.tsx
// ==========================================

// วันลอยกระทง 2569 = 24 พ.ย. 2026 (ขึ้น 15 ค่ำ เดือน 12) — เผื่อก่อน/หลังไว้
const SHOW_FROM = '2026-11-17';
const SHOW_UNTIL = '2026-11-27';

function isFestival() {
    if (new URLSearchParams(window.location.search).get('festival') === 'loy-krathong') return true;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
    return today >= SHOW_FROM && today <= SHOW_UNTIL;
}

// ==========================================
// แบบกระทง: ฐาน (ใบตอง / กะลามะพร้าว / ขนมปัง) + สีกลีบดอก + จำนวนเทียน
// ==========================================
interface Variant {
    base: 'leaf' | 'coconut' | 'bread';
    petal: string;
    petalStroke: string;
    inner: string;
    dots: string;
    candles: number;
}

const VARIANTS: Variant[] = [
    { base: 'leaf', petal: '#f9a8d4', petalStroke: '#db2777', inner: '#fdf2f8', dots: '#f59e0b', candles: 1 }, // บัวชมพู
    { base: 'leaf', petal: '#fefce8', petalStroke: '#ca8a04', inner: '#fde68a', dots: '#f97316', candles: 1 }, // บัวขาว
    { base: 'leaf', petal: '#c4b5fd', petalStroke: '#7c3aed', inner: '#f5f3ff', dots: '#facc15', candles: 2 }, // กล้วยไม้ม่วง
    { base: 'coconut', petal: '#fb923c', petalStroke: '#c2410c', inner: '#fde047', dots: '#ef4444', candles: 1 }, // กะลามะพร้าว + ดาวเรือง
    { base: 'bread', petal: '#fda4af', petalStroke: '#e11d48', inner: '#fff1f2', dots: '#22c55e', candles: 1 }, // กระทงขนมปัง
    { base: 'leaf', petal: '#fde047', petalStroke: '#ca8a04', inner: '#fff7ed', dots: '#ec4899', candles: 3 }, // ดาวเรืองเหลือง
    { base: 'coconut', petal: '#f0abfc', petalStroke: '#a21caf', inner: '#fdf4ff', dots: '#fbbf24', candles: 2 }, // กะลา + บานไม่รู้โรย
];

const PETALS = [-60, -30, 0, 30, 60];
const LEAVES = Array.from({ length: 9 }, (_, index) => 18 + index * 10.5);
const CANDLE_X: Record<number, number[]> = { 1: [66], 2: [58, 70], 3: [52, 63, 74] };

function Base({ base }: { base: Variant['base'] }) {
    if (base === 'coconut') {
        return (
            <>
                <path d="M12 64 Q60 100 108 64 Z" fill="#6b3f1f" stroke="#3f230f" strokeWidth="1" />
                <path d="M24 72 Q60 92 96 72 M34 80 Q60 92 86 80" fill="none" stroke="#8a5a2b" strokeWidth="1" />
                <ellipse cx="60" cy="64" rx="48" ry="7" fill="#8a5a2b" stroke="#3f230f" strokeWidth="1" />
            </>
        );
    }
    if (base === 'bread') {
        return (
            <>
                <ellipse cx="60" cy="72" rx="46" ry="13" fill="#e9c58a" stroke="#b7864b" strokeWidth="1.2" />
                <ellipse cx="60" cy="68" rx="42" ry="8" fill="#f3d7a3" />
                {[28, 44, 78, 92].map((x) => (
                    <circle key={x} cx={x} cy={76} r="1.2" fill="#b7864b" />
                ))}
            </>
        );
    }
    return (
        <>
            <ellipse cx="60" cy="72" rx="47" ry="11" fill="#1d6b3a" />
            {LEAVES.map((x, index) => (
                <path
                    key={x}
                    d={`M${x - 7} 72 Q${x} ${46 + Math.abs(x - 60) / 4} ${x + 7} 72 Z`}
                    fill={index % 2 ? '#2f9a52' : '#3fb866'}
                    stroke="#155c2f"
                    strokeWidth="0.8"
                />
            ))}
        </>
    );
}

function KrathongArt({ variant }: { variant: Variant }) {
    return (
        <svg viewBox="0 0 120 96" className="block h-auto w-full overflow-visible">
            <Base base={variant.base} />
            {PETALS.map((angle) => (
                <ellipse
                    key={angle}
                    cx="60"
                    cy="48"
                    rx="7"
                    ry="17"
                    fill={variant.petal}
                    stroke={variant.petalStroke}
                    strokeWidth="0.8"
                    transform={`rotate(${angle} 60 64)`}
                />
            ))}
            <ellipse cx="60" cy="55" rx="9" ry="11" fill={variant.inner} stroke={variant.petalStroke} strokeWidth="0.8" />
            {[30, 44, 76, 90].map((x) => (
                <circle key={x} cx={x} cy={63} r="4" fill={variant.dots} stroke="#00000033" strokeWidth="0.8" />
            ))}
            {[46, 49].map((x) => (
                <g key={x}>
                    <line x1={x} y1="56" x2={x - 2} y2="26" stroke="#a16207" strokeWidth="1.1" />
                    <circle cx={x - 2} cy="26" r="1.3" fill="#ef4444" />
                </g>
            ))}
            {CANDLE_X[variant.candles].map((x, index) => (
                <g key={x}>
                    <rect x={x - 3} y="34" width="6" height="20" rx="1.5" fill="#fef3c7" stroke="#d6a74a" strokeWidth="0.8" />
                    <path
                        className="lk-flame"
                        style={{ animationDelay: `${index * -0.3}s` }}
                        d={`M${x} 15 C${x + 4} 22 ${x + 5} 27 ${x} 31 C${x - 5} 27 ${x - 4} 22 ${x} 15 Z`}
                        fill="url(#lk-flame)"
                    />
                </g>
            ))}
        </svg>
    );
}

// กระทง 16 ใบ กระจายตามความลึก: lane 0 = ไกล (ขอบบนแม่น้ำ) เล็ก จาง ช้า · lane 100 = ใกล้ ใหญ่ ชัด เร็วกว่า
// ค่าคูณ 37 / 53 แค่ทำให้กระจายดูสุ่มแต่ได้ผลเหมือนเดิมทุกครั้ง · delay ติดลบ = เปิดหน้ามาก็ลอยอยู่กลางน้ำแล้ว
const KRATHONGS = Array.from({ length: 16 }, (_, index) => {
    const lane = (index * 37) % 100;
    const depth = lane / 100;
    return {
        lane,
        variant: VARIANTS[index % VARIANTS.length],
        size: Math.round(30 + depth * 64),
        duration: Math.round(110 - depth * 55),
        delay: -((index * 53) % 110),
        reverse: index % 3 === 0,
        opacity: 0.55 + depth * 0.45,
    };
});

// โคมลอย: left = ตำแหน่งแนวนอน (%) — เว้นช่วงกลางไว้ไม่ให้ทับหัวข้อ
const LANTERNS = [
    { left: 6, delay: 0, duration: 22, scale: 1 },
    { left: 14, delay: -9, duration: 26, scale: 0.7 },
    { left: 24, delay: -15, duration: 24, scale: 0.85 },
    { left: 76, delay: -4, duration: 25, scale: 0.8 },
    { left: 86, delay: -12, duration: 21, scale: 1 },
    { left: 94, delay: -18, duration: 27, scale: 0.65 },
];

// ประกายแสงบนผิวน้ำ: [left %, top %, width px, delay s]
const GLINTS = [
    [8, 30, 18, 0],
    [17, 62, 26, -1.2],
    [29, 44, 14, -2.1],
    [41, 78, 30, -0.6],
    [53, 36, 16, -1.7],
    [61, 70, 22, -2.6],
    [70, 52, 12, -0.9],
    [79, 84, 28, -1.4],
    [88, 40, 18, -2.3],
    [95, 66, 20, -0.3],
    [35, 90, 34, -1.9],
    [12, 86, 24, -2.8],
] as const;

export function LoyKrathong() {
    if (!isFestival()) return null;

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[-5] overflow-hidden">
            <svg width="0" height="0" className="absolute">
                <defs>
                    <radialGradient id="lk-flame" cx="50%" cy="70%" r="60%">
                        <stop offset="0%" stopColor="#fffbe6" />
                        <stop offset="45%" stopColor="#ffd166" />
                        <stop offset="100%" stopColor="#ff7b2c" />
                    </radialGradient>
                </defs>
            </svg>

            {/* พระจันทร์เต็มดวง */}
            <div className="lk-moon absolute top-24 right-[6%] size-20 rounded-full sm:top-28 sm:size-28 lg:right-[9%] lg:size-36" />

            {LANTERNS.map((lantern) => (
                <span
                    key={lantern.left}
                    className="lk-lantern-track absolute bottom-[14%]"
                    style={{ left: `${lantern.left}%`, animationDuration: `${lantern.duration}s`, animationDelay: `${lantern.delay}s` }}
                >
                    <span className="lk-lantern block" style={{ scale: lantern.scale }} />
                </span>
            ))}

            {/* แม่น้ำหลังเวที: ระลอกคลื่น 3 ชั้นตามระยะ + ประกายแสง + แสงจันทร์สะท้อน + กระทงลอยผ่าน */}
            <div className="lk-river absolute inset-x-0 bottom-[2%] h-[24%]">
                <div className="lk-horizon absolute inset-x-0 top-[18%] h-px" />
                <div className="lk-waves lk-waves-far absolute inset-x-0 top-[18%] h-[35%]" />
                <div className="lk-waves lk-waves-mid absolute inset-x-0 top-[38%] h-[40%]" />
                <div className="lk-waves lk-waves-near absolute inset-x-0 bottom-0 h-[42%]" />
                <div className="lk-moon-path absolute top-[18%] right-[7%] bottom-0 w-24 lg:right-[10%] lg:w-36" />
                {GLINTS.map(([left, top, width, delay]) => (
                    <span
                        key={`${left}-${top}`}
                        className="lk-glint absolute h-0.5 rounded-full"
                        style={{ left: `${left}%`, top: `${top}%`, width, animationDelay: `${delay}s` }}
                    />
                ))}

                {/* เลน 0-100 ของกระทง วางอยู่ในช่วงผิวน้ำ (ใต้เส้นขอบฟ้า) */}
                <div className="absolute inset-x-0 top-[14%] bottom-[18%]">
                    {KRATHONGS.map((krathong, index) => (
                        <div
                            key={index}
                            className="lk-drift absolute left-0"
                            style={
                                {
                                    top: `${krathong.lane}%`,
                                    width: krathong.size,
                                    opacity: krathong.opacity,
                                    zIndex: krathong.lane,
                                    animationDuration: `${krathong.duration}s`,
                                    animationDelay: `${krathong.delay}s`,
                                    animationDirection: krathong.reverse ? 'reverse' : 'normal',
                                } as CSSProperties
                            }
                        >
                            <div className="lk-bob -translate-y-full" style={{ animationDelay: `${index * -0.7}s` }}>
                                <span className="lk-candle-glow absolute -bottom-1 left-1/2 h-3 w-[90%] -translate-x-1/2 rounded-[50%]" />
                                <KrathongArt variant={krathong.variant} />
                                {/* เงาสะท้อนในน้ำ */}
                                <div className="lk-reflection">
                                    <KrathongArt variant={krathong.variant} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <p className="absolute bottom-[20%] left-4 hidden items-center gap-1.5 rounded-full border border-amber-200/30 bg-[#0b1030]/70 px-3.5 py-1.5 text-sm font-semibold text-amber-100 backdrop-blur sm:flex lg:left-8">
                🪷 สุขสันต์วันลอยกระทง
            </p>
        </div>
    );
}

// ==========================================
// 🛶 กระทงยักษ์ให้มาสคอตยืน — ขอบใบตองด้านหน้าบังเท้า เหมือนยืนอยู่ในกระทงที่ลอยน้ำ
// ห่อแถวมาสคอตใน hero ไว้ นอกช่วงเทศกาลคืน children ตามเดิม
// ==========================================
const RAFT_FOLDS = Array.from({ length: 25 }, (_, index) => 12 + index * 24);
const RAFT_DOTS = Array.from({ length: 12 }, (_, index) => 70 + index * 42);

function RaftArt({ className }: { className: string }) {
    return (
        <svg viewBox="0 0 600 130" preserveAspectRatio="xMidYMax meet" className={className}>
            {/* แสงเทียนกับเงาบนผิวน้ำใต้กระทง */}
            <ellipse cx="300" cy="118" rx="300" ry="12" fill="#ffb347" opacity="0.22" className="lk-glow" />
            <ellipse cx="300" cy="112" rx="270" ry="8" fill="#050a2a" opacity="0.55" />
            {/* ตัวกระทง (ใบตองซ้อน 2 ชั้น) */}
            <path d="M6 44 L44 106 Q300 126 556 106 L594 44 Z" fill="#1d6b3a" stroke="#0f4424" strokeWidth="2" />
            <path d="M24 52 L56 98 Q300 116 544 98 L576 52 Z" fill="#2f9a52" />
            <path d="M48 62 L70 92 Q300 108 530 92 L552 62" fill="none" stroke="#1d6b3a" strokeWidth="2" strokeDasharray="10 8" />
            {/* ดาวเรืองเรียงรอบลำ */}
            {RAFT_DOTS.map((x, index) => (
                <circle key={x} cx={x} cy={84} r="7" fill={index % 2 ? '#f59e0b' : '#fb923c'} stroke="#b45309" strokeWidth="1.2" />
            ))}
            {/* ขอบกลีบใบตองพับ (บังเท้ามาสคอต) */}
            {RAFT_FOLDS.map((x, index) => (
                <path
                    key={x}
                    d={`M${x - 13} 46 Q${x} ${10 + Math.abs(x - 300) / 22} ${x + 13} 46 Z`}
                    fill={index % 2 ? '#2f9a52' : '#3fb866'}
                    stroke="#155c2f"
                    strokeWidth="1.2"
                />
            ))}
            {/* ดอกบัวกับเทียนที่หัวและท้ายกระทง */}
            {[34, 566].map((x) => (
                <g key={x}>
                    {[-34, 0, 34].map((angle) => (
                        <ellipse
                            key={angle}
                            cx={x}
                            cy="20"
                            rx="9"
                            ry="22"
                            fill="#f9a8d4"
                            stroke="#db2777"
                            strokeWidth="1.2"
                            transform={`rotate(${angle} ${x} 42)`}
                        />
                    ))}
                    <ellipse cx={x} cy="32" rx="10" ry="12" fill="#fdf2f8" stroke="#f472b6" strokeWidth="1.2" />
                    <rect x={x - 4} y="-4" width="8" height="24" rx="2" fill="#fef3c7" stroke="#d6a74a" strokeWidth="1" />
                    <path className="lk-flame" d={`M${x} -30 C${x + 6} -20 ${x + 7} -12 ${x} -6 C${x - 7} -12 ${x - 6} -20 ${x} -30 Z`} fill="url(#lk-flame)" />
                </g>
            ))}
        </svg>
    );
}

export function LoyKrathongRaft({ children }: { children: ReactNode }) {
    if (!isFestival()) return <>{children}</>;
    return (
        <div className="lk-raft-bob relative">
            {children}
            <RaftArt className="pointer-events-none absolute -inset-x-[10%] -bottom-[3%] z-30 w-[120%] overflow-visible" />
        </div>
    );
}
