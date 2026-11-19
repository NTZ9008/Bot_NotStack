import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Check } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { DiscordIcon } from '@/components/discord-icon';
import { LandingGlobe } from '@/features/live/live-globe';
import { CommandSearch } from './command-search';
import { FEATURE_GROUPS, TEAM } from './content';
import { FeatureIllustration } from './feature-illustrations';
import { GrowthSection } from './growth-chart';
import { HeroShowcase } from './hero-showcase';
import { usePageMeta } from './legal-pages';
import { prefersReducedMotion, Reveal, useInView, useScrollProgress } from './reveal';
import { StatusLine, SystemStatus } from './system-status';
import './landing.css';
import mascotKneel from './mascot/kneel.webp';
import mascotLaptop2 from './mascot/laptop-2.webp';
import mascotLaptop from './mascot/laptop.webp';
import mascotPockets from './mascot/pockets.webp';
import mascotPoint from './mascot/point.webp';
import mascotPresent from './mascot/present.webp';
import mascotSit from './mascot/sit.webp';
import mascotThumbs2 from './mascot/thumbs-up-2.webp';
import mascotThumbs3 from './mascot/thumbs-up-3.webp';
import mascotThumbs from './mascot/thumbs-up.webp';
import showcaseLevelUp from './showcase/level-up.webp';
import showcaseRank from './showcase/rank.webp';
import showcaseWeather from './showcase/weather.webp';
import showcaseWelcome from './showcase/welcome.webp';

// ==========================================
// 🏠 หน้า landing (สาธารณะ) — แนะนำบอท ค้นหาคำสั่ง สถานะระบบ และทีมผู้พัฒนา
// โทนกรมท่าเข้ม + น้ำเงินไฟฟ้า: navbar ลอยด้านบน, hero เป็นเวทีมีมาสคอต 3 คน, หัว section มีตัวหนังสือลายน้ำ
// ==========================================

// ลำดับเดียวกับ section ในหน้า: รู้จัก → เริ่มใช้ → ใช้งาน → ความน่าเชื่อถือ → คนทำ
const NAV_LINKS = [
    { href: '#features', label: 'ทำอะไรได้' },
    { href: '#start', label: 'เริ่มใช้' },
    { href: '#commands', label: 'คำสั่ง' },
    { href: '#status', label: 'สถานะ' },
    { href: '#growth', label: 'การเติบโต' },
    { href: '#team', label: 'ผู้พัฒนา' },
];

const SECTION_IDS = NAV_LINKS.map((link) => link.href.slice(1));

// ข้อความที่ค่อยๆ สว่างทีละคำตอนเลื่อนผ่าน
const MANIFESTO = 'กันคนป่วน ต้อนรับคนใหม่ เก็บเลเวล แจ้งอากาศทุกเช้า แจ้ง PR ให้ทีม ตั้งค่าผ่านเว็บได้หมด ไม่ต้องจำคำสั่ง'.split(' ');

// การ์ดความสามารถแบบ bento (จอใหญ่ 6 คอลัมน์): กว้าง-แคบ / แคบ-กว้าง สลับกัน
const BENTO_SPANS = ['lg:col-span-4', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-4'];

const STEPS = [
    { title: 'เชิญบอท', text: 'กด “เพิ่มเข้า Discord” แล้วเลือกเซิร์ฟ' },
    { title: 'Login', text: 'เข้า Dashboard ด้วยบัญชี Discord' },
    { title: 'ตั้งค่า', text: 'เลือกห้อง แล้วเปิดสิ่งที่อยากใช้' },
];

const STEP_MS = 4500;

// ท่ามาสคอตของแต่ละขั้น (เรียงตาม STEPS): ชี้ชวนเชิญ → เปิดโน้ตบุ๊ก login → ตั้งค่า
const STEP_MASCOTS = [mascotPoint, mascotLaptop, mascotLaptop2];

// มาสคอต (ภาพตกแต่ง) — motion = ท่าเคลื่อนไหวตอนอยู่เฉยๆ, ชี้เมาส์แล้วเด้ง
function Mascot({
    src,
    motion = 'bob',
    delay = 0,
    className = '',
}: {
    src: string;
    motion?: 'bob' | 'sway' | 'jump' | 'pop';
    delay?: number;
    className?: string;
}) {
    return (
        <img
            src={src}
            alt=""
            aria-hidden
            draggable={false}
            decoding="async"
            style={delay ? { animationDelay: `${delay}ms` } : undefined}
            className={`landing-mascot landing-mascot-${motion} ${className}`}
        />
    );
}

const pad2 = (value: number) => String(value).padStart(2, '0');

// ปุ่มเชิญบอท — ลิงก์มาจาก /version (null = บอทยังไม่ออนไลน์ / backend รุ่นเก่า)
function InviteButton({ inviteUrl, className = '' }: { inviteUrl?: string | null; className?: string }) {
    const style = `inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color] active:scale-[0.97] ${className}`;
    if (!inviteUrl) {
        return (
            <span aria-disabled title="บอทยังไม่ออนไลน์ ลองใหม่อีกครั้งภายหลัง" className={`${style} cursor-not-allowed opacity-50`}>
                <DiscordIcon /> เพิ่มเข้า Discord
            </span>
        );
    }
    return (
        <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className={`${style} hover:scale-[1.03]`}>
            <DiscordIcon /> เพิ่มเข้า Discord
        </a>
    );
}

function DashboardLink({ className = '' }: { className?: string }) {
    return (
        <Link
            to="/dashboard"
            className={`group inline-flex items-center justify-center gap-1.5 rounded-full border border-white/20 font-semibold transition-colors hover:border-white hover:bg-white hover:text-slate-950 ${className}`}
        >
            เข้า Dashboard
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
    );
}

// หัว section: คำอังกฤษตัวโตเป็นลายน้ำด้านหลัง แล้วชื่อไทยวางทับ (ท่อนท้ายเป็นสีน้ำเงิน)
function SectionHead({ eyebrow, title, accent, aside }: { eyebrow: string; title: string; accent?: string; aside?: ReactNode }) {
    return (
        <Reveal className="relative mb-12 text-center sm:mb-16">
            <p
                aria-hidden
                className="landing-watermark text-[clamp(3.5rem,13vw,10rem)] leading-none font-black tracking-[-0.04em] whitespace-nowrap uppercase select-none"
            >
                {eyebrow}
            </p>
            <h2 className="relative -mt-[0.55em] text-[clamp(2rem,5.5vw,3.75rem)] leading-tight font-black tracking-tight sm:-mt-[0.9em]">
                {title} {accent && <span className="text-[var(--ld-blue-ink)]">{accent}</span>}
            </h2>
            {aside && <p className="mx-auto mt-3 max-w-md text-pretty text-muted-foreground">{aside}</p>}
        </Reveal>
    );
}

function Marquee({ items, reverse, className = '' }: { items: string[]; reverse?: boolean; className?: string }) {
    // ทำซ้ำ 2 ชุดแล้วเลื่อนไปครึ่งหนึ่ง จะวนต่อกันได้ไม่สะดุด
    const row = items.flatMap((item) => [item, '✦']);
    return (
        <div className={`flex overflow-hidden whitespace-nowrap select-none ${className}`} aria-hidden>
            <div className={`landing-marquee flex shrink-0 gap-8 pr-8 ${reverse ? 'landing-marquee-reverse' : ''}`}>
                {[...row, ...row].map((item, index) => (
                    <span key={index} className={item === '✦' ? 'text-white/50' : undefined}>
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
}

// section ที่อยู่กลางจอตอนนี้ (ไว้ไฮไลต์ใน navbar)
function useActiveSection(ids: string[]) {
    const [active, setActive] = useState<string | null>(null);
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
            },
            { rootMargin: '-45% 0px -50% 0px' },
        );
        for (const id of ids) {
            const element = document.getElementById(id);
            if (element) observer.observe(element);
        }
        return () => observer.disconnect();
    }, [ids]);
    return active;
}

// คลิกลิงก์ #section (navbar / โลโก้ / "ดูสถานะ") → เลื่อนแบบ smooth ไปหาเนื้อหา (คนที่ปิด animation จะกระโดดไปทันที)
// ไม่แก้ #hash ใน URL เพราะ router จะกระโดดไปที่ section ทันทีแล้วตัด smooth scroll ทิ้ง
function scrollToSection(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    const id = link?.getAttribute('href')?.slice(1);
    if (!id) return;
    const target = id === 'top' ? null : document.getElementById(id);
    if (id !== 'top' && !target) return;
    event.preventDefault();
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    if (target) target.scrollIntoView({ behavior, block: 'start' });
    else window.scrollTo({ top: 0, behavior });
}

// navbar ลอยด้านบน แยกเป็น 2 เม็ด: ซ้าย = โลโก้ + เมนู, ขวา = ปุ่มหลัก
function TopNav({ active, botName, botAvatar, inviteUrl }: { active: string | null; botName: string; botAvatar: string; inviteUrl?: string | null }) {
    const pill = 'flex items-center gap-1 rounded-full border border-white/10 bg-[var(--ld-card)]/80 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl';
    return (
        <nav aria-label="ส่วนของหน้า" className="fixed inset-x-0 top-3 z-40 px-3 sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
                <div className={`${pill} min-w-0`}>
                    <a href="#top" className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-3 pl-0.5 font-bold">
                        <img src={botAvatar} alt="" className="size-8 shrink-0 rounded-full ring-2 ring-[var(--ld-blue)]" />
                        <span className="truncate">{botName}</span>
                    </a>
                    <div className="hidden items-center whitespace-nowrap lg:flex">
                        {NAV_LINKS.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                                    active === link.href.slice(1) ? 'bg-[var(--ld-blue)] text-white' : 'text-muted-foreground hover:text-white'
                                }`}
                            >
                                {link.label}
                            </a>
                        ))}
                    </div>
                </div>
                <div className={`${pill} shrink-0`}>
                    <Link to="/dashboard" className="hidden rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:text-white sm:block">
                        Dashboard
                    </Link>
                    <InviteButton inviteUrl={inviteUrl} className="h-9 bg-[var(--ld-blue)] px-4 text-sm text-white hover:bg-[#3d56ff]" />
                </div>
            </div>
        </nav>
    );
}

// ภาพจริงที่บอทสร้าง (เรนเดอร์จาก renderer ของ backend ด้วยข้อมูลตัวอย่าง) ลอยรอบมาสคอตใน hero — จอไม่กว้างพอซ่อนไว้ ให้มาสคอตเด่น
function WorkCard({ src, label, className }: { src: string; label: string; className: string }) {
    return (
        <figure
            aria-hidden
            className={`landing-float absolute z-20 hidden rounded-2xl border border-white/15 bg-[var(--ld-card)]/80 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-md lg:block ${className}`}
        >
            <img src={src} alt="" className="w-full rounded-xl" />
            <figcaption className="px-1.5 pt-1.5 pb-0.5 text-xs text-slate-400">{label}</figcaption>
        </figure>
    );
}

// สามคนยืนบนเวที: ซ้ายผายมือไปทางการ์ดฝั่งซ้าย (กลับด้านภาพ), กลางล้วงกระเป๋า, ขวาชี้ไปการ์ดฝั่งขวา
const HERO_CREW = [
    { src: mascotPresent, mirror: true, center: false, delay: 250, idle: -1300 },
    { src: mascotPockets, mirror: false, center: true, delay: 100, idle: 0 },
    { src: mascotPoint, mirror: false, center: false, delay: 400, idle: -2600 },
];

function Hero({ inviteUrl }: { inviteUrl?: string | null }) {
    return (
        <section className="landing-grain relative isolate flex min-h-svh flex-col overflow-hidden pt-24">
            {/* พื้นหลังแบบเวที: ไฟส่องจากบน + วงคลื่นรอบตัวมาสคอต + พื้นเวทีเส้นตารางแบบมีมุมมอง */}
            <div aria-hidden className="landing-stage-light absolute inset-0 -z-10" />
            <div
                aria-hidden
                className="landing-stage-rings absolute bottom-[-40%] left-1/2 -z-10 aspect-square w-[170vw] -translate-x-1/2 md:w-[min(110vw,90rem)]"
            />
            <div aria-hidden className="landing-stage-floor absolute -inset-x-1/2 bottom-0 -z-10 h-[45%]" />

            <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
                <Reveal className="flex justify-center">
                    <StatusLine />
                </Reveal>
                <Reveal delay={100}>
                    <h1 className="mt-4 text-[clamp(2.2rem,5.5vw,3.75rem)] leading-[1.1] font-black tracking-tight">
                        บอท Discord <span className="whitespace-nowrap text-[var(--ld-blue-ink)]">ที่ตั้งค่าบนเว็บ</span>
                    </h1>
                </Reveal>
                <Reveal delay={200}>
                    <p className="mx-auto mt-4 max-w-2xl text-pretty text-slate-300 sm:text-lg">
                        บอทประจำเซิร์ฟ NotStackOverflow — กันคนป่วน เก็บเลเวล แจ้งอากาศ แจ้ง PR <span className="text-white">ตอนนี้เซิร์ฟคุณก็ใช้ได้</span>
                    </p>
                </Reveal>
                <Reveal delay={300} className="mt-6 flex flex-wrap justify-center gap-3">
                    <InviteButton inviteUrl={inviteUrl} className="h-12 bg-[var(--ld-blue)] px-6 text-white shadow-lg shadow-[#2a45ff]/40 hover:bg-[#3d56ff]" />
                    <DashboardLink className="h-12 px-6" />
                </Reveal>
            </div>

            {/* เวที: สามคนยืนด้วยกัน + การ์ดผลงานลอยรอบๆ */}
            <div className="relative mx-auto mt-2 flex min-h-[18rem] w-full max-w-6xl flex-1 items-end justify-center px-4 md:min-h-[30rem]">
                <p
                    aria-hidden
                    className="landing-watermark absolute inset-x-0 top-[6%] -z-10 text-center text-[clamp(5rem,19vw,17rem)] leading-none font-black tracking-[-0.06em] whitespace-nowrap uppercase select-none"
                >
                    NotStack
                </p>
                {/* วงไฟใต้เท้า */}
                <div
                    aria-hidden
                    className="absolute bottom-0 left-1/2 -z-10 h-20 w-[min(92%,46rem)] -translate-x-1/2 rounded-[50%] bg-[var(--ld-blue)]/50 blur-2xl"
                />

                <WorkCard src={showcaseWelcome} label="# ยินดีต้อนรับ · การ์ดต้อนรับคนใหม่" className="top-[2%] left-0 w-64 -rotate-3" />
                <WorkCard src={showcaseWeather} label="# สภาพอากาศ · ส่งทุกเช้า 07:00" className="bottom-[10%] left-6 w-72 rotate-2 [animation-delay:-1.5s]" />
                <WorkCard src={showcaseLevelUp} label="# เลเวลอัป · เก็บ XP จากการคุย" className="top-0 right-0 w-72 rotate-3 [animation-delay:-3s]" />
                <WorkCard src={showcaseRank} label="/rank · การ์ดอันดับ" className="right-6 bottom-[14%] w-72 -rotate-2 [animation-delay:-4s]" />

                <div className="flex items-end">
                    {HERO_CREW.map((crew) => (
                        <Reveal key={crew.src} delay={crew.delay} className={crew.center ? 'z-10 -mx-3 sm:-mx-5' : ''}>
                            <Mascot
                                src={crew.src}
                                delay={crew.idle}
                                className={`w-auto ${crew.mirror ? '-scale-x-100' : ''} ${
                                    crew.center ? 'h-[clamp(16rem,54svh,38rem)]' : 'h-[clamp(13rem,45svh,31rem)]'
                                }`}
                            />
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

// mount ของข้างในเมื่อเลื่อนมาถึง (ภาพที่มี animation ตามเวลา จะได้เริ่มเล่นตอนคนเห็นจริงๆ)
function WhenVisible({ children, className = '' }: { children: ReactNode; className?: string }) {
    const [ref, inView] = useInView<HTMLDivElement>(0.25);
    return (
        <div ref={ref} className={className}>
            {inView ? children : null}
        </div>
    );
}

// ตัวอย่างข้อความจริงที่บอทส่งเข้าเซิร์ฟ
function LiveShowcase({ botName, botAvatar }: { botName: string; botAvatar: string }) {
    return (
        <section className="px-4 pb-24 sm:px-8 sm:pb-32">
            <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
                <Reveal>
                    <p className="font-mono text-xs tracking-[0.3em] text-[var(--ld-blue-ink)] uppercase">Every morning · 07:00</p>
                    <h2 className="mt-4 text-[clamp(3rem,8vw,6rem)] leading-none font-black tracking-tight">
                        ตื่นมา
                        <br />
                        <span className="text-[var(--ld-blue-ink)]">ก็รู้เลย</span>
                    </h2>
                    <p className="mt-6 max-w-sm text-lg text-pretty text-slate-300">รายงานอากาศส่งเข้าห้องเองทุกเช้า คนใหม่เข้าเซิร์ฟก็ได้การ์ดต้อนรับทันที</p>
                </Reveal>
                <WhenVisible className="flex min-h-[32rem] justify-center lg:justify-end">
                    <div className="w-full max-w-md rounded-[1.75rem] bg-white/10 p-2.5 shadow-2xl shadow-black/50 ring-1 ring-white/20 lg:[transform:perspective(1400px)_rotateY(-10deg)_rotateX(4deg)]">
                        <HeroShowcase botName={botName} botAvatar={botAvatar} />
                    </div>
                </WhenVisible>
            </div>
        </section>
    );
}

// แถบน้ำเงินเอียงเหมือนเทปแปะ: ลายน้ำตัวโต + ชื่อความสามารถวิ่งสวนกัน
function FeatureBand({ names }: { names: string[] }) {
    const half = Math.ceil(names.length / 2);
    return (
        <section
            aria-label="ความสามารถทั้งหมด"
            className="landing-band landing-grain relative isolate overflow-hidden bg-[var(--ld-blue)] py-20 text-white [--outline-fill:var(--ld-blue)]"
        >
            <p
                aria-hidden
                className="landing-watermark absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 text-center text-[clamp(4rem,17vw,15rem)] leading-none font-black tracking-[-0.05em] whitespace-nowrap uppercase [-webkit-text-stroke-color:rgb(255_255_255/0.18)]"
            >
                All-in-one
            </p>
            <div className="space-y-4 text-[clamp(1.4rem,3.5vw,2.6rem)] font-black tracking-tight">
                <Marquee items={names.slice(0, half)} />
                <Marquee items={names.slice(half)} reverse className="text-white/55" />
            </div>
        </section>
    );
}

// ข้อความตัวใหญ่กลางจอ ค้างไว้ (sticky) แล้วคำค่อยๆ สว่างตามที่เลื่อน — คำล่าสุดเป็นสีน้ำเงิน
function Manifesto() {
    const [ref, progress] = useScrollProgress<HTMLElement>();
    const lit = Math.round(progress * (MANIFESTO.length + 1));
    return (
        <section id="manifesto" ref={ref} className="relative h-[220svh]">
            <div className="sticky top-0 flex h-svh items-center px-4 sm:px-8">
                <p className="mx-auto max-w-6xl text-[clamp(2.2rem,6.5vw,6rem)] leading-[1.15] font-black tracking-tight">
                    {MANIFESTO.map((word, index) => (
                        <span
                            key={word}
                            className={`transition-colors duration-300 motion-reduce:transition-none ${
                                index === lit - 1 ? 'text-[var(--ld-blue-ink)]' : index < lit ? 'text-white' : 'text-white/12'
                            }`}
                        >
                            {word}{' '}
                        </span>
                    ))}
                </p>
            </div>
        </section>
    );
}

function Features({ botName, botAvatar }: { botName: string; botAvatar: string }) {
    return (
        <div className="relative grid gap-5 lg:grid-cols-6">
            {/* มาสคอตนั่งเล่นโน้ตบุ๊กอยู่บนขอบการ์ด */}
            <Mascot src={mascotSit} motion="sway" className="absolute right-6 bottom-full z-10 -mb-7 w-28 sm:w-32 lg:right-[10%] lg:w-36" />
            {FEATURE_GROUPS.map((group, index) => {
                const wide = BENTO_SPANS[index % BENTO_SPANS.length] === 'lg:col-span-4';
                return (
                    <Reveal
                        as="div"
                        key={group.id}
                        delay={(index % 2) * 120}
                        className={`group relative grid gap-8 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[var(--ld-card)] p-6 hover:border-[var(--ld-blue)] sm:p-8 ${BENTO_SPANS[index % BENTO_SPANS.length]} ${wide ? 'xl:grid-cols-2 xl:items-center' : ''}`}
                    >
                        {/* แสงน้ำเงินมุมบนซ้าย */}
                        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-64 rounded-full bg-[var(--ld-blue)]/25 blur-3xl" />
                        <div className="relative">
                            <span className="inline-flex rounded-full bg-[var(--ld-blue)] px-3 py-1 font-mono text-xs font-semibold text-white">
                                {pad2(index + 1)}
                            </span>
                            <h3 className="mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight font-black tracking-tight">{group.label}</h3>
                            <p className="mt-1 text-slate-300">{group.intro}</p>
                            <dl className={`mt-6 grid gap-x-6 gap-y-4 ${wide ? 'sm:grid-cols-2 xl:grid-cols-1' : ''}`}>
                                {group.features.map((feature) => (
                                    <div key={feature.title} className="flex gap-2.5">
                                        <Check className="mt-0.5 size-4 shrink-0 text-[var(--ld-blue-ink)]" />
                                        <div>
                                            <dt className="font-semibold">{feature.title}</dt>
                                            <dd className="text-sm text-pretty text-slate-400">{feature.description}</dd>
                                        </div>
                                    </div>
                                ))}
                            </dl>
                        </div>
                        <div className="relative min-w-0">
                            <FeatureIllustration group={group.id} botName={botName} botAvatar={botAvatar} />
                        </div>
                    </Reveal>
                );
            })}
        </div>
    );
}

// ภาพจำลองเล็กๆ ของแต่ละขั้น
function StepMock({ step, botName, botAvatar }: { step: number; botName: string; botAvatar: string }) {
    const box = 'w-full max-w-sm rounded-2xl bg-[#313338] p-5 text-sm text-slate-200 shadow-2xl shadow-black/40';
    if (step === 0) {
        return (
            <div className={box}>
                <div className="flex items-center gap-3">
                    <img src={botAvatar} alt="" className="size-12 rounded-full" />
                    <div>
                        <p className="font-bold text-white">{botName}</p>
                        <p className="text-xs text-slate-400">ต้องการเข้าร่วมเซิร์ฟของคุณ</p>
                    </div>
                </div>
                <p className="mt-5 text-xs font-semibold text-slate-400 uppercase">เพิ่มเข้าเซิร์ฟ</p>
                <div className="mt-1.5 rounded-md bg-[#1e1f22] px-3 py-2">เซิร์ฟของฉัน ▾</div>
                <div className="mt-5 rounded-md bg-[#5865F2] py-2 text-center font-semibold text-white">ดำเนินการต่อ</div>
            </div>
        );
    }
    if (step === 1) {
        return (
            <div className={`${box} text-center`}>
                <p className="text-lg font-bold text-white">Dashboard</p>
                <p className="mt-1 text-xs text-slate-400">ใช้บัญชี Discord เดิม ไม่ต้องสมัครใหม่</p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-5 py-2.5 font-semibold text-white">
                    <DiscordIcon /> เข้าสู่ระบบด้วย Discord
                </div>
            </div>
        );
    }
    return (
        <div className={`${box} space-y-3`}>
            {['การ์ดต้อนรับ', 'เลเวล & XP', 'รายงานอากาศ'].map((name, index) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-[#2b2d31] px-3 py-2.5">
                    <span>{name}</span>
                    <span className={`flex h-5 w-9 items-center rounded-full p-0.5 ${index < 2 ? 'justify-end bg-[var(--ld-blue)]' : 'bg-slate-600'}`}>
                        <span className="size-4 rounded-full bg-white" />
                    </span>
                </div>
            ))}
        </div>
    );
}

// ขั้นตอนเริ่มใช้: รายการซ้าย (มีแถบนับเวลาเลื่อนขั้นเอง) + ภาพขั้นที่เลือกด้านขวา
function Steps({ botName, botAvatar }: { botName: string; botAvatar: string }) {
    const [ref, inView] = useInView<HTMLDivElement>(0.3);
    const [active, setActive] = useState(0);
    const auto = inView && !prefersReducedMotion();

    useEffect(() => {
        if (!auto) return;
        const timer = setTimeout(() => setActive((current) => (current + 1) % STEPS.length), STEP_MS);
        return () => clearTimeout(timer);
    }, [auto, active]);

    return (
        <div ref={ref} className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
            <ol className="space-y-3">
                {STEPS.map((step, index) => (
                    <li key={step.title}>
                        <button
                            type="button"
                            onClick={() => setActive(index)}
                            aria-current={index === active ? 'step' : undefined}
                            className={`relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-colors ${
                                index === active ? 'border-[var(--ld-blue)] bg-[var(--ld-card)]' : 'border-white/10 hover:bg-white/[0.03]'
                            }`}
                        >
                            <p className="text-xl font-bold">
                                <span className="mr-2 text-[var(--ld-blue-ink)]">{index + 1}</span>
                                {step.title}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                            {index === active && auto && (
                                <span
                                    key={active}
                                    style={{ '--step-ms': `${STEP_MS}ms` } as CSSProperties}
                                    className="landing-progress absolute inset-x-0 bottom-0 h-1 bg-[var(--ld-blue)]"
                                />
                            )}
                        </button>
                    </li>
                ))}
            </ol>
            <div className="landing-grain relative isolate flex min-h-80 items-center justify-center overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#3a55ff] to-[#1c2fd6] p-6 sm:p-10 sm:pl-40 lg:pl-48">
                {/* มาสคอตเปลี่ยนท่าตามขั้น (key ใหม่ = เล่นท่าโผล่ใหม่) */}
                <Mascot
                    key={`mascot-${active}`}
                    src={STEP_MASCOTS[active]}
                    motion="pop"
                    className="absolute bottom-0 left-4 hidden h-[88%] max-h-80 sm:block"
                />
                <p
                    aria-hidden
                    className="landing-watermark absolute -right-4 -bottom-10 -z-10 text-[14rem] leading-none font-black [--outline-fill:#2238e6] [-webkit-text-stroke-color:rgb(255_255_255/0.25)]"
                >
                    {pad2(active + 1)}
                </p>
                <div key={active} className="flex w-full justify-center animate-in fade-in slide-in-from-bottom-3 duration-500">
                    <StepMock step={active} botName={botName} botAvatar={botAvatar} />
                </div>
            </div>
        </div>
    );
}

export function LandingPage() {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;
    const inviteUrl = info?.inviteUrl;
    const active = useActiveSection(SECTION_IDS);
    const featureNames = FEATURE_GROUPS.flatMap((group) => group.features.map((feature) => feature.title));

    usePageMeta({
        title: 'Bot_NotStack — บอท Discord ภาษาไทยพร้อมเว็บ Dashboard',
        description:
            'Bot_NotStack บอท Discord ภาษาไทยจากเซิร์ฟ NotStackOverflow กันคนป่วน ต้อนรับคนใหม่ เก็บเลเวล XP แจ้งอากาศ เช็ค PR/Jira ตั้งค่าผ่านเว็บ Dashboard ได้หมด',
        path: '/',
    });

    return (
        <div className="landing min-h-svh overflow-x-clip bg-[var(--ld-bg)] text-foreground" onClick={scrollToSection}>
            <TopNav active={active} botName={bot.name} botAvatar={bot.avatar} inviteUrl={inviteUrl} />

            <main id="top">
                <Hero inviteUrl={inviteUrl} />

                <FeatureBand names={featureNames} />

                <Manifesto />

                <LiveShowcase botName={bot.name} botAvatar={bot.avatar} />

                <section id="features" className="scroll-mt-20 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead eyebrow="Features" title="ทำอะไรได้" accent="บ้าง" aside="เปิด / ปิดแต่ละอย่างได้เองจาก Dashboard" />
                        <Features botName={bot.name} botAvatar={bot.avatar} />
                    </div>
                </section>

                <section id="start" className="scroll-mt-20 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead eyebrow="Get started" title="เริ่มใช้ใน" accent="3 ขั้น" />
                        <Steps botName={bot.name} botAvatar={bot.avatar} />
                    </div>
                </section>

                <section id="commands" className="scroll-mt-20 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead eyebrow="Commands" title="รวม" accent="คำสั่ง" aside="ค้นหา แล้วกดดูวิธีใช้" />
                        <Reveal delay={100}>
                            <CommandSearch />
                        </Reveal>
                    </div>
                </section>

                <section id="status" className="scroll-mt-20 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <div className="relative">
                            <SectionHead eyebrow="Status" title="สถานะ" accent="ระบบ" aside="ข้อมูลสด อัปเดตทุกนาที" />
                            <Mascot src={mascotKneel} className="absolute right-0 bottom-0 hidden w-28 md:block lg:w-32" />
                        </div>
                        <Reveal delay={100}>
                            <SystemStatus />
                        </Reveal>
                    </div>
                </section>

                <section id="growth" className="scroll-mt-20 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead eyebrow="Growth" title="การ" accent="เติบโต" aside="commit และ PR ตั้งแต่วันแรก" />
                        <Reveal delay={100}>
                            <GrowthSection />
                        </Reveal>
                    </div>
                </section>

                <section id="team" className="scroll-mt-20 px-4 pb-32 sm:px-8 sm:pb-40">
                    <div className="mx-auto max-w-6xl">
                        <div className="relative">
                            <SectionHead eyebrow="Team" title="คนทำ" accent="บอท" aside="เจอบั๊ก ทักมาในเซิร์ฟได้เลย" />
                            <Mascot src={mascotPockets} delay={-2000} className="absolute bottom-0 left-0 hidden w-24 md:block lg:w-28" />
                        </div>
                        <ul className="grid gap-4 md:grid-cols-2">
                            {TEAM.map((member, index) => (
                                <Reveal
                                    as="li"
                                    key={member.github}
                                    delay={index * 120}
                                    className="group relative flex gap-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[var(--ld-card)] p-6 transition-colors hover:border-[var(--ld-blue)]"
                                >
                                    <img
                                        src={`https://github.com/${member.github}.png?size=160`}
                                        alt={member.name}
                                        loading="lazy"
                                        className="size-20 shrink-0 rounded-2xl bg-muted object-cover grayscale transition-[filter,scale] duration-500 group-hover:scale-105 group-hover:grayscale-0"
                                    />
                                    <div className="min-w-0">
                                        <p className="text-lg font-bold">{member.name}</p>
                                        <p className="text-sm text-[var(--ld-blue-ink)]">{member.role}</p>
                                        <p className="mt-2 text-sm text-pretty text-muted-foreground">{member.description}</p>
                                        <a
                                            href={`https://github.com/${member.github}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-3 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            @{member.github} <ArrowUpRight className="size-3" />
                                        </a>
                                    </div>
                                </Reveal>
                            ))}
                        </ul>
                    </div>
                </section>
            </main>

            {/* ปิดท้าย + footer ในบล็อกน้ำเงินเดียวกัน ขอบบนโค้ง */}
            <footer className="landing-cta landing-grain relative isolate overflow-hidden bg-gradient-to-b from-[var(--ld-blue)] to-[#1726b8] px-4 pt-36 pb-10 text-white sm:px-8">
                {/* ลูกโลก (ข้อมูลจำลอง ไม่ใช่กิจกรรมจริง) */}
                <LandingGlobe className="absolute top-10 -right-[30vw] -z-10 aspect-square w-[80vw] opacity-30 [mask-image:radial-gradient(circle,black_50%,transparent_70%)] md:-right-[12vw] md:w-[min(60vw,48rem)] md:opacity-50" />
                <div className="mx-auto max-w-6xl">
                    <div className="grid items-end gap-10 md:grid-cols-[1fr_auto]">
                        <div>
                            <Reveal>
                                <p className="font-mono text-xs tracking-[0.3em] text-white/70 uppercase">Ready?</p>
                                <h2 className="mt-4 text-[clamp(3.5rem,12vw,10rem)] leading-[0.85] font-black tracking-[-0.05em] uppercase">
                                    Just
                                    <br />
                                    add it.
                                </h2>
                            </Reveal>
                            <Reveal delay={150} className="mt-10 flex flex-wrap gap-3">
                                <InviteButton inviteUrl={inviteUrl} className="h-12 bg-white px-6 text-[var(--ld-blue)] hover:bg-indigo-50" />
                                <DashboardLink className="h-12 border-white/40 px-6 hover:text-[var(--ld-blue)]" />
                            </Reveal>
                        </div>
                        {/* สามคนชูนิ้ว โผล่ทีละคน แล้วกระโดดไล่กันเป็นคลื่น */}
                        <div className="flex items-end justify-center -space-x-6 md:justify-end">
                            {[mascotThumbs, mascotThumbs2, mascotThumbs3].map((src, index) => (
                                <Reveal key={src} delay={250 + index * 150} className={index === 1 ? 'z-10' : ''}>
                                    <Mascot
                                        src={src}
                                        motion="jump"
                                        delay={index * 400}
                                        className={index === 1 ? 'w-28 sm:w-36 lg:w-44' : 'w-24 sm:w-32 lg:w-36'}
                                    />
                                </Reveal>
                            ))}
                        </div>
                    </div>

                    <div className="mt-24 flex flex-col gap-3 border-t border-white/20 pt-6 text-sm text-white/75 sm:flex-row sm:items-center sm:justify-between">
                        <p>
                            {bot.name}
                            {info?.version ? ` v${info.version}` : ''} · พัฒนาโดยทีม NotStackOverflow
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                            <Link to="/privacy" className="hover:text-white">
                                นโยบายความเป็นส่วนตัว
                            </Link>
                            <Link to="/terms" className="hover:text-white">
                                ข้อกำหนดการใช้งาน
                            </Link>
                            <Link to="/dashboard" className="hover:text-white">
                                Dashboard →
                            </Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
