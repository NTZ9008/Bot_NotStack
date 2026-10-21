import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { DiscordIcon } from '@/components/discord-icon';
import { Button } from '@/components/ui/button';
import { CommandSearch } from './command-search';
import { FEATURE_GROUPS, TEAM } from './content';
import { FeatureIllustration } from './feature-illustrations';
import { prefersReducedMotion, Reveal } from './reveal';
import { StatusLine, SystemStatus } from './system-status';

// ==========================================
// 🏠 หน้า landing (สาธารณะ) — แนะนำบอท ค้นหาคำสั่ง สถานะระบบ และทีมผู้พัฒนา
// ==========================================

const NAV_LINKS = [
    { href: '#features', label: 'ทำอะไรได้' },
    { href: '#commands', label: 'คำสั่ง' },
    { href: '#status', label: 'สถานะ' },
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

function Section({ id, title, aside, children, className = '' }: { id: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section id={id} className={`mx-auto max-w-5xl scroll-mt-20 px-4 py-16 sm:py-20 ${className}`}>
            <Reveal className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
                {aside && <div className="max-w-md text-sm text-muted-foreground sm:text-right">{aside}</div>}
            </Reveal>
            {children}
        </section>
    );
}

// ตัวอย่างแชทใน Discord (ข้อความจำลอง) — เล่นทีละจังหวะ: ถาม → บอทกำลังพิมพ์ → ตอบ → เลเวลอัป
function useChatStep() {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (prefersReducedMotion()) {
            setStep(4);
            return;
        }
        const timers = [400, 1100, 2500, 3400].map((at, index) => setTimeout(() => setStep(index + 1), at));
        return () => timers.forEach(clearTimeout);
    }, []);
    return step;
}

function ChatMessage({ show, children }: { show: boolean; children: ReactNode }) {
    return (
        <div
            className={`transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${show ? 'translate-none opacity-100' : 'translate-y-2 opacity-0'}`}
        >
            {children}
        </div>
    );
}

function ChatPreview({ botName, botAvatar }: { botName: string; botAvatar: string }) {
    const step = useChatStep();
    return (
        <figure className="w-full max-w-md rotate-[0.6deg] overflow-hidden rounded-lg border border-black/40 bg-[#313338] text-[15px] shadow-xl transition-transform duration-500 hover:rotate-0">
            <div className="flex items-center gap-2 border-b border-black/30 px-4 py-2.5 text-sm font-semibold text-slate-200">
                <span className="text-lg leading-none text-slate-500">#</span> คุยเล่น
            </div>
            <div className="min-h-64 space-y-4 p-4">
                <ChatMessage show={step >= 1}>
                    <div className="flex gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">ม</div>
                        <div className="min-w-0">
                            <p className="text-sm">
                                <span className="font-medium text-emerald-300">มายด์</span> <span className="text-xs text-slate-500">วันนี้ เวลา 17:42</span>
                            </p>
                            <p className="text-slate-200">
                                <span className="rounded bg-indigo-500/30 px-0.5 text-indigo-200">@{botName}</span> เย็นนี้ฝนตกปะ จะออกไปกินหมูกระทะ
                            </p>
                        </div>
                    </div>
                </ChatMessage>
                {step === 2 && (
                    <p className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="flex gap-0.5">
                            {[0, 150, 300].map((delay) => (
                                <span key={delay} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
                            ))}
                        </span>
                        <span className="font-medium text-slate-300">{botName}</span> กำลังพิมพ์…
                    </p>
                )}
                <ChatMessage show={step >= 3}>
                    <div className="flex gap-3">
                        <img src={botAvatar} alt="" className="size-10 shrink-0 rounded-full" />
                        <div className="min-w-0 space-y-1">
                            <p className="flex items-center gap-1.5 text-sm">
                                <span className="font-medium text-indigo-300">{botName}</span>
                                <span className="rounded bg-[#5865F2] px-1 text-[10px] font-semibold text-white">APP</span>
                                <span className="text-xs text-slate-500">วันนี้ เวลา 17:42</span>
                            </p>
                            <p className="text-slate-200">ช่วงหัวค่ำมีลุ้นฝนประมาณ 60% เลย พกร่มไปด้วยดีกว่า ☔ อยากดูเรดาร์ฝนพิมพ์ /weather ได้นะ</p>
                        </div>
                    </div>
                </ChatMessage>
                <ChatMessage show={step >= 4}>
                    <p className="border-t border-white/5 pt-3 text-sm text-slate-400">
                        🎉 <span className="text-slate-200">มายด์</span> เลเวลอัปเป็น <span className="font-semibold text-amber-300">Lv. 12</span> แล้ว!
                    </p>
                </ChatMessage>
            </div>
        </figure>
    );
}

export function LandingPage() {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;
    const inviteUrl = info?.inviteUrl;

    return (
        <div className="min-h-svh overflow-x-clip bg-background text-foreground">
            <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
                    <a href="#top" className="flex min-w-0 items-center gap-2 font-semibold">
                        <img src={bot.avatar} alt="" className="size-7 rounded-full" />
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
                                <span className="mt-2 block text-2xl font-medium text-muted-foreground sm:text-3xl">ที่ตอนนี้เซิร์ฟคุณก็ใช้ได้</span>
                            </h1>
                        </Reveal>
                        <Reveal delay={200}>
                            <p className="max-w-lg text-pretty text-slate-300">
                                เริ่มจากทำไว้กันคนแกล้งในห้องเสียง แล้วก็เพิ่มของที่พวกเราอยากใช้ไปเรื่อยๆ — ระบบเลเวล การ์ดต้อนรับ แจ้งเตือน PR รายงานอากาศ
                                จนตอนนี้เปิดให้เซิร์ฟอื่นเอาไปใช้ด้วย ตั้งค่าทุกอย่างผ่านหน้าเว็บ ไม่ต้องจำคำสั่ง
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
                        <ChatPreview botName={bot.name} botAvatar={bot.avatar} />
                    </Reveal>
                </section>

                {/* ความสามารถ */}
                <Section id="features" title="บอทตัวนี้ทำอะไรได้บ้าง" aside="ทุกอย่างเปิด/ปิดได้แยกกัน ในหน้าตั้งค่าของแต่ละเซิร์ฟ">
                    <div className="space-y-20 sm:space-y-28">
                        {FEATURE_GROUPS.map((group, index) => {
                            const flipped = index % 2 === 1;
                            return (
                                <div key={group.id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
                                    <Reveal from={flipped ? 'right' : 'left'} className={flipped ? 'lg:order-2' : undefined}>
                                        <p className="font-mono text-xs text-indigo-300">{String(index + 1).padStart(2, '0')}</p>
                                        <h3 className="mt-1 text-xl font-semibold sm:text-2xl">{group.label}</h3>
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

                {/* คำสั่ง */}
                <div className="border-y bg-card/30">
                    <Section
                        id="commands"
                        title="คำสั่งทั้งหมด"
                        aside={
                            <>
                                กดที่คำสั่งเพื่อดูวิธีใช้ — ใน Discord พิมพ์ <code className="font-mono text-foreground">/</code> แล้วเลือกได้เลย
                            </>
                        }
                    >
                        <Reveal delay={100}>
                            <CommandSearch />
                        </Reveal>
                    </Section>
                </div>

                {/* สถานะระบบ */}
                <Section id="status" title="สถานะระบบ" aside="ข้อมูลจริงจากเซิร์ฟเวอร์ที่บอทรันอยู่">
                    <Reveal delay={100}>
                        <SystemStatus />
                    </Reveal>
                </Section>

                {/* เริ่มใช้งาน */}
                <div className="border-y bg-card/30">
                    <Section id="start" title="เริ่มใช้ในเซิร์ฟคุณ">
                        <ol className="grid gap-8 sm:grid-cols-3">
                            {[
                                { title: 'เชิญบอท', text: 'กด “เพิ่มเข้า Discord” แล้วเลือกเซิร์ฟที่คุณมีสิทธิ์ Manage Server' },
                                { title: 'Login ด้วย Discord', text: 'เข้า Dashboard แล้วจะเห็นเฉพาะเซิร์ฟที่คุณจัดการได้' },
                                { title: 'เลือกห้อง เปิดสิ่งที่อยากใช้', text: 'ไม่ต้องเปิดทุกอย่าง ค่อยๆ เปิดทีละอันก็ได้ ปรับได้ตลอด' },
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
                </div>

                {/* ทีมผู้พัฒนา */}
                <Section id="team" title="ผู้พัฒนา" aside="ทำกันในเวลาว่าง เจอบั๊กหรืออยากได้อะไรเพิ่ม ทักมาในเซิร์ฟได้เลย">
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
                                    alt=""
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
                    <Link to="/dashboard" className="hover:text-foreground">
                        Dashboard →
                    </Link>
                </div>
            </footer>
        </div>
    );
}
