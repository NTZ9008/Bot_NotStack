import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { DiscordIcon } from '@/components/discord-icon';
import { Button } from '@/components/ui/button';
import { CommandSearch } from './command-search';
import { FEATURE_GROUPS, TEAM } from './content';
import { FeatureIllustration } from './feature-illustrations';
import { GrowthSection } from './growth-chart';
import { HeroShowcase } from './hero-showcase';
import { usePageMeta } from './legal-pages';
import { prefersReducedMotion, Reveal } from './reveal';
import { StatusLine, SystemStatus } from './system-status';

// ==========================================
// 🏠 หน้า landing (สาธารณะ) — แนะนำบอท ค้นหาคำสั่ง สถานะระบบ และทีมผู้พัฒนา
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

// ปุ่มเชิญบอท — ลิงก์มาจาก /version (null = บอทยังไม่ออนไลน์ / backend รุ่นเก่า)
function InviteButton({ inviteUrl, className = '' }: { inviteUrl?: string | null; className?: string }) {
    const style = `bg-[#5865F2] text-white hover:bg-[#4752C4] ${className}`;
    if (!inviteUrl) {
        return (
            <Button disabled title="บอทยังไม่ออนไลน์ ลองใหม่อีกครั้งภายหลัง" className={style}>
                <DiscordIcon /> เพิ่มเข้า Discord
            </Button>
        );
    }
    return (
        <Button asChild className={style}>
            <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                <DiscordIcon /> เพิ่มเข้า Discord
            </a>
        </Button>
    );
}

function Section({
    id,
    step,
    title,
    aside,
    children,
    band,
}: {
    id: string;
    step: number;
    title: string;
    aside?: ReactNode;
    children: ReactNode;
    band?: boolean;
}) {
    return (
        <div className={band ? 'border-y bg-card/30' : undefined}>
            <section id={id} className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16 sm:py-20">
                <Reveal className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <h2 className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                        <span className="font-mono text-sm font-normal text-indigo-300">{step}</span>
                        {title}
                    </h2>
                    {aside && <div className="max-w-md text-sm text-muted-foreground sm:text-right">{aside}</div>}
                </Reveal>
                {children}
            </section>
        </div>
    );
}

// คลิกลิงก์ #section (เมนูบน / โลโก้ / "ดูสถานะ") → เลื่อนแบบ smooth ไปหาเนื้อหา (คนที่ปิด animation จะกระโดดไปทันที)
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

export function LandingPage() {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;
    const inviteUrl = info?.inviteUrl;

    usePageMeta({
        title: 'Bot_NotStack — บอท Discord ภาษาไทยพร้อมเว็บ Dashboard',
        description:
            'Bot_NotStack บอท Discord ภาษาไทยจากเซิร์ฟ NotStackOverflow กันคนป่วน ต้อนรับคนใหม่ เก็บเลเวล XP แจ้งอากาศ เช็ค PR/Jira ตั้งค่าผ่านเว็บ Dashboard ได้หมด',
        path: '/',
    });

    return (
        <div className="min-h-svh overflow-x-clip bg-background text-foreground" onClick={scrollToSection}>
            <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
                    <a href="#top" className="flex min-w-0 items-center gap-2 font-semibold">
                        <img src={bot.avatar} alt={bot.name} className="size-7 rounded-full" />
                        <span className="truncate">{bot.name}</span>
                    </a>
                    <nav className="ml-4 hidden items-center gap-5 text-sm text-muted-foreground md:flex" aria-label="ส่วนของหน้า">
                        {NAV_LINKS.map((link) => (
                            <a key={link.href} href={link.href} className="hover:text-foreground">
                                {link.label}
                            </a>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-3">
                        <Link to="/dashboard" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
                            Dashboard
                        </Link>
                        <InviteButton inviteUrl={inviteUrl} />
                    </div>
                </div>
            </header>

            <main id="top">
                {/* Hero */}
                <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.15fr_1fr]">
                    <div className="space-y-6">
                        <Reveal>
                            <StatusLine />
                        </Reveal>
                        <Reveal delay={100}>
                            <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
                                บอทประจำเซิร์ฟ
                                <br />
                                NotStackOverflow
                                <span className="mt-2 block text-2xl font-medium text-muted-foreground sm:text-3xl">ตอนนี้เซิร์ฟคุณก็ใช้ได้</span>
                            </h1>
                        </Reveal>
                        <Reveal delay={200}>
                            <p className="max-w-lg text-pretty text-slate-300">
                                กันคนป่วน ต้อนรับคนใหม่ เก็บเลเวล แจ้งอากาศทุกเช้า
                                <br />
                                ตั้งค่าผ่านเว็บได้หมด ไม่ต้องจำคำสั่ง
                            </p>
                        </Reveal>
                        <Reveal delay={300} className="flex flex-wrap items-center gap-3">
                            <InviteButton inviteUrl={inviteUrl} className="h-10 px-4" />
                            <Button asChild variant="outline" className="h-10 px-4">
                                <Link to="/dashboard">เข้า Dashboard</Link>
                            </Button>
                        </Reveal>
                    </div>
                    <Reveal delay={200} from="right" className="flex justify-center lg:justify-end">
                        <HeroShowcase botName={bot.name} botAvatar={bot.avatar} />
                    </Reveal>
                </section>

                {/* ความสามารถ */}
                <Section id="features" step={1} title="ทำอะไรได้บ้าง" aside="เปิด / ปิดแต่ละอย่างได้เอง">
                    <div className="space-y-20 sm:space-y-28">
                        {FEATURE_GROUPS.map((group, index) => {
                            const flipped = index % 2 === 1;
                            return (
                                <div key={group.id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
                                    <Reveal from={flipped ? 'right' : 'left'} className={flipped ? 'lg:order-2' : undefined}>
                                        <h3 className="text-xl font-semibold sm:text-2xl">{group.label}</h3>
                                        <p className="mt-2 text-sm text-pretty text-muted-foreground">{group.intro}</p>
                                        <dl className="mt-6 space-y-4 border-l border-white/10 pl-4">
                                            {group.features.map((feature) => (
                                                <div key={feature.title} className="group relative">
                                                    <span className="absolute top-2 -left-[1.3rem] size-1.5 rounded-full bg-slate-600 transition-colors group-hover:bg-indigo-400" />
                                                    <dt className="font-medium">{feature.title}</dt>
                                                    <dd className="mt-0.5 text-sm text-pretty text-slate-400">{feature.description}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </Reveal>
                                    <Reveal delay={150} from={flipped ? 'left' : 'right'} className={flipped ? 'lg:order-1' : undefined}>
                                        <FeatureIllustration group={group.id} botName={bot.name} botAvatar={bot.avatar} />
                                    </Reveal>
                                </div>
                            );
                        })}
                    </div>
                </Section>

                {/* เริ่มใช้งาน */}
                <Section id="start" step={2} band title="เริ่มใช้ใน 3 ขั้น">
                    <ol className="grid gap-8 sm:grid-cols-3">
                        {[
                            { title: 'เชิญบอท', text: 'กด “เพิ่มเข้า Discord” แล้วเลือกเซิร์ฟ' },
                            { title: 'Login', text: 'เข้า Dashboard ด้วยบัญชี Discord' },
                            { title: 'ตั้งค่า', text: 'เลือกห้อง แล้วเปิดสิ่งที่อยากใช้' },
                        ].map((step, index) => (
                            <Reveal as="li" key={step.title} delay={index * 120} className="border-l-2 border-indigo-400/40 pl-4">
                                <p className="font-mono text-xs text-indigo-300">ขั้นที่ {index + 1}</p>
                                <p className="mt-1 font-medium">{step.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                            </Reveal>
                        ))}
                    </ol>
                    <Reveal delay={300} className="mt-10 flex flex-wrap gap-3">
                        <InviteButton inviteUrl={inviteUrl} className="h-10 px-4" />
                        <Button asChild variant="outline" className="h-10 px-4">
                            <Link to="/dashboard">เข้า Dashboard</Link>
                        </Button>
                    </Reveal>
                </Section>

                {/* คำสั่ง */}
                <Section id="commands" step={3} title="คำสั่ง" aside="ค้นหา แล้วกดดูวิธีใช้">
                    <Reveal delay={100}>
                        <CommandSearch />
                    </Reveal>
                </Section>

                {/* สถานะระบบ */}
                <Section id="status" step={4} band title="สถานะระบบ" aside="ข้อมูลสด อัปเดตทุกนาที">
                    <Reveal delay={100}>
                        <SystemStatus />
                    </Reveal>
                </Section>

                {/* การเติบโตของโปรเจกต์ */}
                <Section id="growth" step={5} title="การเติบโต" aside="commit และ PR ตั้งแต่วันแรก">
                    <Reveal delay={100}>
                        <GrowthSection />
                    </Reveal>
                </Section>

                {/* ทีมผู้พัฒนา */}
                <Section id="team" step={6} band title="ผู้พัฒนา" aside="เจอบั๊ก ทักมาในเซิร์ฟได้เลย">
                    <ul className="grid gap-4 sm:grid-cols-2">
                        {TEAM.map((member, index) => (
                            <Reveal
                                as="li"
                                key={member.github}
                                delay={index * 120}
                                className="flex gap-4 rounded-lg border p-5 hover:-translate-y-0.5 hover:border-indigo-400/40"
                            >
                                <img
                                    src={`https://github.com/${member.github}.png?size=128`}
                                    alt={member.name}
                                    loading="lazy"
                                    className="size-14 shrink-0 rounded-full bg-muted transition-transform duration-300 hover:scale-105"
                                />
                                <div className="min-w-0">
                                    <p className="font-semibold">{member.name}</p>
                                    <p className="text-sm text-indigo-300">{member.role}</p>
                                    <p className="mt-2 text-sm text-pretty text-muted-foreground">{member.description}</p>
                                    <a
                                        href={`https://github.com/${member.github}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        @{member.github} <ArrowUpRight className="size-3" />
                                    </a>
                                </div>
                            </Reveal>
                        ))}
                    </ul>
                </Section>
            </main>

            <footer className="border-t">
                <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
            </footer>
        </div>
    );
}
