import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
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

// ==========================================
// 🏠 หน้า landing (สาธารณะ) — แนะนำบอท ค้นหาคำสั่ง สถานะระบบ และทีมผู้พัฒนา
// ไม่มี navbar ด้านบน: hero เต็มจอ แล้วมี dock ลอยด้านล่างโผล่มาเมื่อเลื่อนพ้น hero
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

// สีพื้นของการ์ดความสามารถแต่ละกลุ่ม (เรียงตาม FEATURE_GROUPS)
const GROUP_TONES = [
    'from-indigo-600/30 via-slate-950 to-slate-950',
    'from-fuchsia-600/25 via-slate-950 to-slate-950',
    'from-sky-500/25 via-slate-950 to-slate-950',
    'from-emerald-500/20 via-slate-950 to-slate-950',
];

const STEPS = [
    { title: 'เชิญบอท', text: 'กด “เพิ่มเข้า Discord” แล้วเลือกเซิร์ฟ' },
    { title: 'Login', text: 'เข้า Dashboard ด้วยบัญชี Discord' },
    { title: 'ตั้งค่า', text: 'เลือกห้อง แล้วเปิดสิ่งที่อยากใช้' },
];

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

// หัว section ตัวใหญ่: เลขลำดับ + ชื่อภาษาอังกฤษตัวเล็ก แล้วชื่อไทยตัวโต
function SectionHead({ index, eyebrow, title, aside }: { index: number; eyebrow: string; title: string; aside?: ReactNode }) {
    return (
        <Reveal className="mb-10 grid gap-4 border-t border-white/10 pt-6 sm:mb-14 md:grid-cols-[1fr_auto] md:items-end">
            <div>
                <p className="font-mono text-xs tracking-[0.3em] text-indigo-300 uppercase">
                    {pad2(index)} — {eyebrow}
                </p>
                <h2 className="mt-3 text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.05] font-black tracking-tight">{title}</h2>
            </div>
            {aside && <p className="max-w-xs text-sm text-pretty text-muted-foreground md:text-right">{aside}</p>}
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
                    <span key={index} className={item === '✦' ? 'text-indigo-400 [-webkit-text-stroke:0]' : undefined}>
                        {item}
                    </span>
                ))}
            </div>
        </div>
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

// เลื่อนลงมาเกิน fraction ของความสูงจอแล้วหรือยัง (ไว้โชว์ dock หลังพ้น hero)
function useScrolledPast(fraction: number) {
    const [past, setPast] = useState(false);
    useEffect(() => {
        const update = () => setPast(window.scrollY > window.innerHeight * fraction);
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [fraction]);
    return past;
}

// section ที่อยู่กลางจอตอนนี้ (ไว้ไฮไลต์ใน dock)
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

// คลิกลิงก์ #section (dock / โลโก้ / "ดูสถานะ") → เลื่อนแบบ smooth ไปหาเนื้อหา (คนที่ปิด animation จะกระโดดไปทันที)
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

function Hero({ botName, botAvatar, inviteUrl }: { botName: string; botAvatar: string; inviteUrl?: string | null }) {
    const ref = useRef<HTMLElement>(null);

    // แสงตามเมาส์ — เขียนลง CSS variable ตรงๆ ไม่ต้อง re-render
    const onPointerMove = (event: PointerEvent<HTMLElement>) => {
        const element = ref.current;
        if (!element || event.pointerType !== 'mouse') return;
        const rect = element.getBoundingClientRect();
        element.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
        element.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    };

    return (
        <section
            ref={ref}
            onPointerMove={onPointerMove}
            className="landing-grain relative isolate flex min-h-svh flex-col overflow-hidden px-4 pt-5 pb-8 [--spot-x:70%] [--spot-y:30%] sm:px-8"
        >
            {/* พื้นหลัง: เส้นตาราง + แสงตามเมาส์ */}
            <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-[size:72px_72px]"
            />
            <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-[radial-gradient(600px_circle_at_var(--spot-x)_var(--spot-y),rgb(99_102_241/0.28),transparent_60%)]"
            />
            {/* ลูกโลก (ข้อมูลจำลอง ไม่ใช่กิจกรรมจริง) — ชิดขวา ล้นขอบจอ อยู่หลังตัวหนังสือ (จอเล็กจางลงให้อ่านหัวข้อออก) */}
            <LandingGlobe
                className="absolute top-1/2 left-1/2 -z-10 aspect-square w-[150vw] -translate-x-1/2 -translate-y-1/2 md:translate-x-0 opacity-45 [mask-image:radial-gradient(circle,black_55%,transparent_71%)] sm:w-[min(115svh,95vw)] md:left-auto md:-right-[18vw] md:opacity-90 lg:-right-[8vw]"
            />

            {/* มุมบน (ไม่ใช่แถบ navbar) */}
            <div className="flex items-center justify-between gap-4 text-sm">
                <a href="#top" className="flex min-w-0 items-center gap-2.5 font-semibold">
                    <img src={botAvatar} alt={botName} className="size-8 rounded-full ring-1 ring-white/20" />
                    <span className="truncate">{botName}</span>
                </a>
                <Link to="/dashboard" className="group inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    Dashboard
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
            </div>

            <div className="flex flex-1 flex-col justify-center py-10">
                <Reveal>
                    <StatusLine />
                </Reveal>
                <h1 className="mt-6 text-[clamp(3.6rem,15.5vw,14rem)] leading-[0.82] font-black tracking-[-0.055em] uppercase">
                    <Reveal delay={80}>
                        <span className="block">Not</span>
                    </Reveal>
                    <Reveal delay={180} from="left">
                        <span className="landing-outline block">Stack</span>
                    </Reveal>
                    <Reveal delay={280}>
                        <span className="block bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-sky-300 bg-clip-text pr-[0.06em] text-transparent">
                            Overflow.
                        </span>
                    </Reveal>
                </h1>

                <div className="mt-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
                    <Reveal delay={380}>
                        <p className="max-w-md text-lg text-pretty text-slate-300 sm:text-xl">
                            บอทประจำเซิร์ฟ NotStackOverflow — <span className="text-white">ตอนนี้เซิร์ฟคุณก็ใช้ได้</span>
                        </p>
                    </Reveal>
                    <Reveal delay={460} className="flex flex-wrap gap-3">
                        <InviteButton inviteUrl={inviteUrl} className="h-12 bg-white px-6 text-slate-950 hover:bg-indigo-100" />
                        <DashboardLink className="h-12 px-6" />
                    </Reveal>
                </div>
            </div>

            <a href="#manifesto" className="mx-auto flex items-center gap-2 text-xs tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground">
                <ArrowDown className="size-4 animate-bounce motion-reduce:animate-none" /> Scroll
            </a>
        </section>
    );
}

// ข้อความตัวใหญ่กลางจอ ค้างไว้ (sticky) แล้วคำค่อยๆ สว่างตามที่เลื่อน
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
                            className={`transition-colors duration-300 motion-reduce:transition-none ${index < lit ? 'text-white' : 'text-white/12'}`}
                        >
                            {word}{' '}
                        </span>
                    ))}
                </p>
            </div>
        </section>
    );
}

function Dock({
    visible,
    active,
    botName,
    botAvatar,
    inviteUrl,
}: {
    visible: boolean;
    active: string | null;
    botName: string;
    botAvatar: string;
    inviteUrl?: string | null;
}) {
    return (
        <nav
            aria-label="ส่วนของหน้า"
            className={`fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border border-white/10 bg-slate-950/70 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl transition-[opacity,translate] duration-500 motion-reduce:transition-none ${
                visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
            }`}
        >
            <a href="#top" aria-label="กลับขึ้นบนสุด" className="shrink-0 rounded-full p-0.5">
                <img src={botAvatar} alt={botName} className="size-8 rounded-full" />
            </a>
            <div className="hidden items-center whitespace-nowrap lg:flex">
                {NAV_LINKS.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                            active === link.href.slice(1) ? 'bg-white/12 text-white' : 'text-muted-foreground hover:text-white'
                        }`}
                    >
                        {link.label}
                    </a>
                ))}
            </div>
            <Link to="/dashboard" className="shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:text-white">
                Dashboard
            </Link>
            <InviteButton inviteUrl={inviteUrl} className="h-9 shrink-0 bg-[#5865F2] px-4 text-sm text-white hover:bg-[#4752C4]" />
        </nav>
    );
}

export function LandingPage() {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;
    const inviteUrl = info?.inviteUrl;
    const pastHero = useScrolledPast(0.85);
    const active = useActiveSection(SECTION_IDS);
    const featureNames = FEATURE_GROUPS.flatMap((group) => group.features.map((feature) => feature.title));
    const half = Math.ceil(featureNames.length / 2);

    usePageMeta({
        title: 'Bot_NotStack — บอท Discord ภาษาไทยพร้อมเว็บ Dashboard',
        description:
            'Bot_NotStack บอท Discord ภาษาไทยจากเซิร์ฟ NotStackOverflow กันคนป่วน ต้อนรับคนใหม่ เก็บเลเวล XP แจ้งอากาศ เช็ค PR/Jira ตั้งค่าผ่านเว็บ Dashboard ได้หมด',
        path: '/',
    });

    return (
        <div className="min-h-svh overflow-x-clip bg-[#05060a] text-foreground" onClick={scrollToSection}>
            <main id="top">
                <Hero botName={bot.name} botAvatar={bot.avatar} inviteUrl={inviteUrl} />

                {/* ตัวหนังสือวิ่ง */}
                <div className="space-y-3 border-y border-white/10 py-6 text-[clamp(1.5rem,4vw,3rem)] font-black tracking-tight uppercase">
                    <Marquee items={featureNames.slice(0, half)} />
                    <Marquee items={featureNames.slice(half)} reverse className="landing-outline" />
                </div>

                <Manifesto />

                {/* ความสามารถ — การ์ดเต็มจอซ้อนกันตอนเลื่อน (จอใหญ่) */}
                <section id="features" className="scroll-mt-6 px-4 pb-24 sm:px-8">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead index={1} eyebrow="Features" title="ทำอะไรได้บ้าง" aside="เปิด / ปิดแต่ละอย่างได้เอง" />
                        <div className="space-y-6 lg:space-y-[18svh]">
                            {FEATURE_GROUPS.map((group, index) => (
                                <article
                                    key={group.id}
                                    style={{ top: `calc(5svh + ${index * 1.75}rem)` }}
                                    className={`grid items-center gap-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 bg-gradient-to-br p-6 shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.8)] sm:p-10 lg:sticky lg:min-h-[82svh] lg:grid-cols-[1fr_1.05fr] lg:p-14 ${GROUP_TONES[index % GROUP_TONES.length]}`}
                                >
                                    <div>
                                        <p className="font-mono text-sm text-white/50">
                                            {pad2(index + 1)} / {pad2(FEATURE_GROUPS.length)}
                                        </p>
                                        <h3 className="mt-4 text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.05] font-black tracking-tight">{group.label}</h3>
                                        <p className="mt-3 text-lg text-slate-300">{group.intro}</p>
                                        <dl className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                                            {group.features.map((feature) => (
                                                <div key={feature.title} className="border-t border-white/15 pt-3">
                                                    <dt className="font-semibold">{feature.title}</dt>
                                                    <dd className="mt-1 text-sm text-pretty text-slate-400">{feature.description}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                    <div className="min-w-0">
                                        <FeatureIllustration group={group.id} botName={bot.name} botAvatar={bot.avatar} />
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ของจริงในเซิร์ฟ */}
                <section className="landing-grain relative overflow-hidden border-y border-white/10 bg-gradient-to-b from-indigo-950/40 to-transparent px-4 py-24 sm:px-8 sm:py-32">
                    <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
                        <Reveal>
                            <p className="font-mono text-xs tracking-[0.3em] text-indigo-300 uppercase">Every morning · 07:00</p>
                            <h2 className="mt-4 text-[clamp(3rem,8vw,7rem)] leading-[1] font-black tracking-tight">
                                ตื่นมา
                                <br />
                                <span className="landing-outline">ก็รู้เลย</span>
                            </h2>
                            <p className="mt-6 max-w-sm text-lg text-pretty text-slate-300">
                                รายงานอากาศส่งเข้าห้องเองทุกเช้า คนใหม่เข้าเซิร์ฟก็ได้การ์ดต้อนรับทันที
                            </p>
                        </Reveal>
                        <WhenVisible className="flex min-h-[32rem] justify-center lg:justify-end">
                            <HeroShowcase botName={bot.name} botAvatar={bot.avatar} />
                        </WhenVisible>
                    </div>
                </section>

                {/* เริ่มใช้งาน */}
                <section id="start" className="scroll-mt-6 px-4 py-24 sm:px-8 sm:py-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead index={2} eyebrow="Get started" title="เริ่มใช้ใน 3 ขั้น" />
                        <ol className="grid gap-10 md:grid-cols-3">
                            {STEPS.map((step, index) => (
                                <Reveal as="li" key={step.title} delay={index * 120} className="group">
                                    <p className="landing-outline text-[clamp(5rem,12vw,9rem)] leading-none font-black transition-colors duration-500 group-hover:text-white">
                                        {pad2(index + 1)}
                                    </p>
                                    <p className="mt-4 text-2xl font-bold">{step.title}</p>
                                    <p className="mt-1 text-muted-foreground">{step.text}</p>
                                </Reveal>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* คำสั่ง */}
                <section id="commands" className="scroll-mt-6 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead index={3} eyebrow="Commands" title="คำสั่ง" aside="ค้นหา แล้วกดดูวิธีใช้" />
                        <Reveal delay={100}>
                            <CommandSearch />
                        </Reveal>
                    </div>
                </section>

                {/* สถานะระบบ */}
                <section id="status" className="scroll-mt-6 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead index={4} eyebrow="Status" title="สถานะระบบ" aside="ข้อมูลสด อัปเดตทุกนาที" />
                        <Reveal delay={100}>
                            <SystemStatus />
                        </Reveal>
                    </div>
                </section>

                {/* การเติบโตของโปรเจกต์ */}
                <section id="growth" className="scroll-mt-6 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead index={5} eyebrow="Growth" title="การเติบโต" aside="commit และ PR ตั้งแต่วันแรก" />
                        <Reveal delay={100}>
                            <GrowthSection />
                        </Reveal>
                    </div>
                </section>

                {/* ทีมผู้พัฒนา */}
                <section id="team" className="scroll-mt-6 px-4 pb-24 sm:px-8 sm:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <SectionHead index={6} eyebrow="Team" title="ผู้พัฒนา" aside="เจอบั๊ก ทักมาในเซิร์ฟได้เลย" />
                        <ul className="grid gap-4 md:grid-cols-2">
                            {TEAM.map((member, index) => (
                                <Reveal
                                    as="li"
                                    key={member.github}
                                    delay={index * 120}
                                    className="group relative flex gap-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-indigo-400/50 hover:bg-white/[0.06]"
                                >
                                    <img
                                        src={`https://github.com/${member.github}.png?size=160`}
                                        alt={member.name}
                                        loading="lazy"
                                        className="size-20 shrink-0 rounded-2xl bg-muted object-cover grayscale transition-[filter,scale] duration-500 group-hover:scale-105 group-hover:grayscale-0"
                                    />
                                    <div className="min-w-0">
                                        <p className="text-lg font-bold">{member.name}</p>
                                        <p className="text-sm text-indigo-300">{member.role}</p>
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

                {/* ปิดท้าย — แถบสี Discord เต็มจอ */}
                <section className="landing-grain relative overflow-hidden bg-[#5865F2] px-4 py-24 text-white sm:px-8 sm:py-32">
                    <div className="mx-auto max-w-6xl">
                        <Reveal>
                            <p className="font-mono text-xs tracking-[0.3em] text-white/70 uppercase">Ready?</p>
                            <h2 className="mt-4 text-[clamp(3.5rem,13vw,11rem)] leading-[0.85] font-black tracking-[-0.05em] uppercase">
                                Just
                                <br />
                                add it.
                            </h2>
                        </Reveal>
                        <Reveal delay={150} className="mt-10 flex flex-wrap gap-3">
                            <InviteButton inviteUrl={inviteUrl} className="h-12 bg-white px-6 text-[#3b45c4] hover:bg-indigo-50" />
                            <DashboardLink className="h-12 border-white/40 px-6 hover:text-[#3b45c4]" />
                        </Reveal>
                    </div>
                </section>
            </main>

            <footer className="overflow-hidden px-4 pt-10 pb-28 sm:px-8">
                <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>
                        {bot.name}
                        {info?.version ? ` v${info.version}` : ''} · พัฒนาโดยทีม NotStackOverflow
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <Link to="/privacy" className="hover:text-foreground">
                            นโยบายความเป็นส่วนตัว
                        </Link>
                        <Link to="/terms" className="hover:text-foreground">
                            ข้อกำหนดการใช้งาน
                        </Link>
                        <Link to="/dashboard" className="hover:text-foreground">
                            Dashboard →
                        </Link>
                    </div>
                </div>
                <p
                    aria-hidden
                    className="pointer-events-none mt-8 text-center text-[clamp(3rem,16vw,15rem)] leading-[0.8] font-black tracking-[-0.06em] whitespace-nowrap text-white/[0.04] uppercase select-none"
                >
                    NotStack
                </p>
            </footer>

            <Dock visible={pastHero} active={active} botName={bot.name} botAvatar={bot.avatar} inviteUrl={inviteUrl} />
        </div>
    );
}
