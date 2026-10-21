import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, ExternalLink, LayoutDashboard, LogIn, MousePointerClick, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { DiscordIcon } from '@/components/discord-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { COMMANDS, DASHBOARD_PAGES, FEATURE_GROUPS, REPO_URL, TEAM } from './content';

// ==========================================
// 🏠 หน้า landing (สาธารณะ) — แนะนำบอท ปุ่มเชิญเข้า Discord / เข้า Dashboard และทีมผู้พัฒนา
// ==========================================

const NAV_LINKS = [
    { href: '#features', label: 'ความสามารถ' },
    { href: '#commands', label: 'คำสั่ง' },
    { href: '#dashboard', label: 'Dashboard' },
    { href: '#team', label: 'ทีมผู้พัฒนา' },
];

function GithubIcon({ className = 'size-4' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
    );
}

// ปุ่มเชิญบอท — ลิงก์มาจาก /version (null = บอทยังไม่ออนไลน์ / backend รุ่นเก่า)
function InviteButton({ inviteUrl, size = 'lg', className = '' }: { inviteUrl?: string | null; size?: 'default' | 'lg'; className?: string }) {
    const style = `bg-[#5865F2] text-white hover:bg-[#4752C4] ${className}`;
    if (!inviteUrl) {
        return (
            <Button size={size} disabled title="บอทยังไม่ออนไลน์ ลองใหม่อีกครั้งภายหลัง" className={style}>
                <DiscordIcon /> เพิ่มเข้า Discord
            </Button>
        );
    }
    return (
        <Button asChild size={size} className={style}>
            <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                <DiscordIcon /> เพิ่มเข้า Discord
            </a>
        </Button>
    );
}

function DashboardButton({ size = 'lg', className = '' }: { size?: 'default' | 'lg'; className?: string }) {
    return (
        <Button asChild size={size} variant="outline" className={className}>
            <Link to="/dashboard">
                <LayoutDashboard /> เปิด Dashboard
            </Link>
        </Button>
    );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
    return (
        <div className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="text-sm font-medium text-indigo-300">{eyebrow}</p>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
            {children && <p className="text-pretty text-muted-foreground">{children}</p>}
        </div>
    );
}

// ตัวอย่างแชทแบบ Discord บน hero (ข้อความจำลอง ไม่ได้ดึงจากเซิร์ฟเวอร์จริง)
function ChatPreview({ botName, botAvatar }: { botName: string; botAvatar: string }) {
    return (
        <div className="relative w-full max-w-md">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-indigo-500/20 blur-3xl" aria-hidden="true" />
            <div className="overflow-hidden rounded-2xl border bg-[#313338] text-[15px] shadow-2xl shadow-indigo-950/50">
                <div className="flex items-center gap-2 border-b border-black/30 px-4 py-3 text-sm font-semibold text-slate-200">
                    <span className="text-slate-400">#</span> พูดคุยทั่วไป
                </div>
                <div className="space-y-4 p-4">
                    <div className="flex gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">N</div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-emerald-300">notstacker</p>
                            <p className="text-slate-200">
                                <span className="rounded bg-indigo-500/30 px-1 text-indigo-200">@{botName}</span> พรุ่งนี้ฝนจะตกไหม
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <img src={botAvatar} alt="" className="size-10 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <p className="flex items-center gap-1.5 text-sm font-medium text-indigo-300">
                                {botName}
                                <span className="rounded bg-[#5865F2] px-1 text-[10px] font-semibold text-white">APP</span>
                            </p>
                            <p className="text-slate-200">โอกาสฝนตกช่วงบ่ายประมาณ 60% พกร่มไปด้วยนะ ☔ ดูเรดาร์ฝนเต็มๆ ได้ด้วย /weather</p>
                            <div className="rounded border-l-4 border-amber-400 bg-[#2b2d31] p-3">
                                <p className="text-sm font-semibold text-slate-100">🎉 เลเวลอัป!</p>
                                <p className="text-sm text-slate-300">notstacker ขึ้นเป็น Level 12 และได้รับยศ Active Member</p>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                                    <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-indigo-500 to-sky-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LandingPage() {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;
    const inviteUrl = info?.inviteUrl;
    const featureCount = FEATURE_GROUPS.reduce((sum, group) => sum + group.features.length, 0);

    return (
        <div className="min-h-svh overflow-x-clip bg-background text-foreground">
            {/* แถบบน */}
            <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
                    <a href="#top" className="flex min-w-0 items-center gap-2.5 font-semibold">
                        <img src={bot.avatar} alt="" className="size-8 rounded-full" />
                        <span className="truncate">{bot.name}</span>
                    </a>
                    <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="ส่วนของหน้า">
                        {NAV_LINKS.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        <Button asChild variant="ghost" size="default" className="hidden sm:inline-flex">
                            <Link to="/dashboard">
                                <LogIn /> Dashboard
                            </Link>
                        </Button>
                        <InviteButton inviteUrl={inviteUrl} size="default" />
                    </div>
                </div>
            </header>

            <main id="top">
                {/* Hero */}
                <section className="relative">
                    <div
                        className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(99,102,241,0.25),transparent_70%)]"
                        aria-hidden="true"
                    />
                    <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
                        <div className="space-y-7 text-center lg:text-left">
                            <Badge variant="outline" className="h-6 gap-1.5 border-indigo-400/30 bg-indigo-500/10 px-3 text-indigo-200">
                                <span className="size-1.5 rounded-full bg-emerald-400" />
                                ใช้ฟรี · รองรับหลายเซิร์ฟเวอร์{info?.version ? ` · v${info.version}` : ''}
                            </Badge>
                            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                บอท Discord ที่ดูแล
                                <span className="bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent"> เซิร์ฟเวอร์ของคุณ </span>
                                ได้ครบในตัวเดียว
                            </h1>
                            <p className="mx-auto max-w-xl text-lg text-pretty text-muted-foreground lg:mx-0">
                                กันคนป่วนในห้องเสียง กรองสแปม ระบบเลเวลพร้อมการ์ดรูปภาพ แชทกับ AI รายงานสภาพอากาศ แจ้งเตือน GitHub PR และอีกมาก
                                ตั้งค่าทุกอย่างผ่าน Dashboard บนเว็บ ไม่ต้องจำคำสั่ง
                            </p>
                            <div className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                                <InviteButton inviteUrl={inviteUrl} className="h-11 px-5 text-base" />
                                <DashboardButton className="h-11 px-5 text-base" />
                            </div>
                            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start">
                                {['ตั้งค่าแยกแต่ละเซิร์ฟเวอร์', 'Login ด้วย Discord', 'โอเพนซอร์ส Apache 2.0'].map((item) => (
                                    <li key={item} className="flex items-center gap-1.5">
                                        <Check className="size-4 text-emerald-400" /> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex justify-center lg:justify-end">
                            <ChatPreview botName={bot.name} botAvatar={bot.avatar} />
                        </div>
                    </div>
                </section>

                {/* ตัวเลขสรุป */}
                <section className="border-y bg-card/40">
                    <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center md:grid-cols-4">
                        {[
                            { value: `${featureCount}`, label: 'ความสามารถหลัก' },
                            { value: `${COMMANDS.length}`, label: 'คำสั่ง /' },
                            { value: `${DASHBOARD_PAGES.length}`, label: 'หน้าตั้งค่าต่อเซิร์ฟเวอร์' },
                            { value: '100%', label: 'โอเพนซอร์ส' },
                        ].map((stat) => (
                            <div key={stat.label}>
                                <dt className="sr-only">{stat.label}</dt>
                                <dd className="text-3xl font-bold text-indigo-200">{stat.value}</dd>
                                <dd className="mt-1 text-sm text-muted-foreground">{stat.label}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* ความสามารถ */}
                <section id="features" className="mx-auto max-w-6xl scroll-mt-20 space-y-16 px-4 py-20 sm:py-24">
                    <SectionHeading eyebrow="ความสามารถของบอท" title="ทุกอย่างที่เซิร์ฟเวอร์ต้องใช้">
                        เปิด / ปิดแต่ละความสามารถได้เองในหน้าตั้งค่าของแต่ละเซิร์ฟเวอร์
                    </SectionHeading>
                    {FEATURE_GROUPS.map((group) => (
                        <div key={group.id} className="space-y-6">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                <h3 className="text-xl font-semibold">{group.label}</h3>
                                <p className="text-sm text-muted-foreground">{group.tagline}</p>
                            </div>
                            <div className={`grid gap-4 sm:grid-cols-2 ${group.features.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                                {group.features.map((feature) => (
                                    <article
                                        key={feature.title}
                                        className="group flex flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/5"
                                    >
                                        <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/20">
                                            <feature.icon className="size-5" />
                                        </div>
                                        <h4 className="font-semibold">{feature.title}</h4>
                                        <p className="text-sm text-pretty text-muted-foreground">{feature.description}</p>
                                        <ul className="mt-auto space-y-1.5 pt-1 text-sm">
                                            {feature.points.map((point) => (
                                                <li key={point} className="flex gap-2 text-slate-300">
                                                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {point}
                                                </li>
                                            ))}
                                        </ul>
                                    </article>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>

                {/* คำสั่ง */}
                <section id="commands" className="scroll-mt-20 border-y bg-card/40">
                    <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 sm:py-24">
                        <SectionHeading eyebrow="Slash commands" title="คำสั่งที่ใช้ได้ใน Discord">
                            พิมพ์ / ในช่องแชทแล้วเลือกคำสั่งได้เลย หรือใช้ /gethelp เพื่อดูคำสั่งของเซิร์ฟเวอร์นั้น
                        </SectionHeading>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {COMMANDS.map((command) => (
                                <div key={command.name} className="flex items-start gap-3 rounded-lg border bg-background/60 px-4 py-3">
                                    <code className="shrink-0 rounded-md bg-indigo-500/15 px-2 py-0.5 font-mono text-sm text-indigo-200">{command.name}</code>
                                    <p className="min-w-0 flex-1 text-sm text-muted-foreground">{command.description}</p>
                                    {command.homeOnly && (
                                        <Badge
                                            variant="outline"
                                            className="shrink-0 text-[11px] text-amber-300"
                                            title="ใช้ได้เฉพาะเซิร์ฟเวอร์หลัก NotStackOverflow"
                                        >
                                            เซิร์ฟเวอร์หลัก
                                        </Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Dashboard */}
                <section id="dashboard" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:py-24">
                    <div className="grid items-center gap-12 lg:grid-cols-2">
                        <div className="space-y-6">
                            <p className="text-sm font-medium text-indigo-300">Web Dashboard</p>
                            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">ตั้งค่าทุกอย่างบนเว็บ เห็นผลก่อนส่งจริง</h2>
                            <p className="text-pretty text-muted-foreground">
                                Login ด้วยบัญชี Discord แล้วจัดการได้ทุกเซิร์ฟเวอร์ที่คุณมีสิทธิ์ Manage Server พร้อมพรีวิวข้อความ การ์ดต้อนรับ และรายงาน
                                ก่อนส่งเข้า Discord
                            </p>
                            <ol className="space-y-4">
                                {[
                                    {
                                        icon: MousePointerClick,
                                        title: 'เพิ่มบอทเข้าเซิร์ฟเวอร์',
                                        text: 'กดปุ่ม "เพิ่มเข้า Discord" แล้วเลือกเซิร์ฟเวอร์ของคุณ',
                                    },
                                    { icon: LogIn, title: 'Login ด้วย Discord', text: 'Dashboard จะแสดงเฉพาะเซิร์ฟเวอร์ที่คุณจัดการได้' },
                                    { icon: Settings2, title: 'เลือกห้องและเปิดความสามารถ', text: 'เปิดเฉพาะสิ่งที่ต้องการ ปรับเปลี่ยนได้ตลอด' },
                                ].map((step, index) => (
                                    <li key={step.title} className="flex gap-4">
                                        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-200">
                                            <step.icon className="size-5" />
                                            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                                                {index + 1}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-medium">{step.title}</p>
                                            <p className="text-sm text-muted-foreground">{step.text}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <DashboardButton className="h-11 px-5 text-base" />
                                <InviteButton inviteUrl={inviteUrl} className="h-11 px-5 text-base" />
                            </div>
                        </div>

                        {/* ภาพจำลองหน้าต่าง Dashboard */}
                        <div className="relative" aria-hidden="true">
                            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-sky-500/10 blur-3xl" />
                            <div className="overflow-hidden rounded-2xl border bg-sidebar shadow-2xl shadow-indigo-950/50">
                                <div className="flex items-center gap-1.5 border-b px-4 py-3">
                                    <span className="size-2.5 rounded-full bg-rose-400/70" />
                                    <span className="size-2.5 rounded-full bg-amber-400/70" />
                                    <span className="size-2.5 rounded-full bg-emerald-400/70" />
                                    <span className="ml-3 truncate text-xs text-muted-foreground">NotStack Dashboard</span>
                                </div>
                                <div className="grid grid-cols-[minmax(0,11rem)_1fr]">
                                    <ul className="space-y-0.5 border-r p-3 text-xs">
                                        {DASHBOARD_PAGES.map((page, index) => (
                                            <li
                                                key={page}
                                                className={`truncate rounded-md px-2 py-1.5 ${index === 0 ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground'}`}
                                            >
                                                {page}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="space-y-3 bg-background/60 p-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { label: 'สมาชิกใหม่', value: '+128', color: 'text-emerald-300' },
                                                { label: 'ชั่วโมงในห้องเสียง', value: '342', color: 'text-sky-300' },
                                            ].map((stat) => (
                                                <div key={stat.label} className="rounded-lg border bg-card p-3">
                                                    <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                                                    <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="rounded-lg border bg-card p-3">
                                            <p className="mb-3 text-[11px] text-muted-foreground">กิจกรรม 7 วัน</p>
                                            <div className="flex h-24 items-end gap-1.5">
                                                {[40, 65, 50, 80, 58, 92, 74].map((height, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex-1 rounded-t bg-gradient-to-t from-indigo-500/60 to-indigo-400"
                                                        style={{ height: `${height}%` }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2 rounded-lg border bg-card p-3">
                                            {['Anti-spam', 'กรองคำหยาบ', 'AI Chat'].map((label, index) => (
                                                <div key={label} className="flex items-center justify-between text-xs">
                                                    <span>{label}</span>
                                                    <span
                                                        className={`flex h-4 w-7 items-center rounded-full p-0.5 ${index < 2 ? 'justify-end bg-primary' : 'bg-input'}`}
                                                    >
                                                        <span className="size-3 rounded-full bg-white" />
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ทีมผู้พัฒนา */}
                <section id="team" className="scroll-mt-20 border-t bg-card/40">
                    <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 sm:py-24">
                        <SectionHeading eyebrow="ทีมผู้พัฒนา" title="สร้างโดยชุมชน NotStackOverflow">
                            Bot_NotStack เริ่มจากบอทประจำเซิร์ฟเวอร์ NotStackOverflow และเปิดให้ทุกคนใช้งานได้ โค้ดทั้งหมดเปิดเผยบน GitHub
                        </SectionHeading>
                        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
                            {TEAM.map((member) => (
                                <a
                                    key={member.github}
                                    href={`https://github.com/${member.github}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col items-center gap-3 rounded-xl border bg-background/60 p-6 text-center transition-colors hover:border-indigo-400/40"
                                >
                                    <img
                                        src={`https://github.com/${member.github}.png?size=160`}
                                        alt={member.name}
                                        loading="lazy"
                                        className="size-20 rounded-full border-2 border-white/10 bg-muted"
                                    />
                                    <div>
                                        <p className="font-semibold">{member.name}</p>
                                        <p className="text-sm text-indigo-300">{member.role}</p>
                                    </div>
                                    <p className="text-sm text-pretty text-muted-foreground">{member.description}</p>
                                    <span className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                                        <GithubIcon className="size-3.5" /> @{member.github}
                                    </span>
                                </a>
                            ))}
                        </div>
                        <div className="flex flex-col items-center gap-4">
                            <p className="text-sm text-muted-foreground">และผู้ร่วมพัฒนาทุกคน</p>
                            <a href={`${REPO_URL}/graphs/contributors`} target="_blank" rel="noopener noreferrer">
                                <img
                                    src="https://contrib.rocks/image?repo=NTZ9008/Bot_NotStack"
                                    alt="รายชื่อผู้ร่วมพัฒนาบน GitHub"
                                    loading="lazy"
                                    className="h-12 max-w-full"
                                />
                            </a>
                            <Button asChild variant="outline">
                                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                                    <GithubIcon /> ดูโค้ดบน GitHub <ExternalLink />
                                </a>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* CTA ปิดท้าย */}
                <section className="mx-auto max-w-6xl px-4 py-20 sm:py-24">
                    <div className="relative overflow-hidden rounded-3xl border border-indigo-400/20 bg-gradient-to-br from-indigo-600/30 via-indigo-500/10 to-sky-500/10 px-6 py-14 text-center">
                        <img src={bot.avatar} alt="" className="mx-auto mb-5 size-16 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.5)]" />
                        <h2 className="text-3xl font-semibold tracking-tight text-balance">พร้อมให้ {bot.name} ช่วยดูแลเซิร์ฟเวอร์แล้วหรือยัง</h2>
                        <p className="mx-auto mt-3 max-w-lg text-pretty text-muted-foreground">
                            เพิ่มบอทได้ในไม่กี่คลิก แล้วเปิดเฉพาะความสามารถที่ต้องการผ่าน Dashboard
                        </p>
                        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                            <InviteButton inviteUrl={inviteUrl} className="h-11 px-5 text-base" />
                            <Button asChild size="lg" variant="ghost" className="h-11 px-5 text-base">
                                <Link to="/dashboard">
                                    ไปที่ Dashboard <ArrowRight />
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
                    <p>
                        © {new Date().getFullYear()} {bot.name} · NotStackOverflow · Apache License 2.0
                    </p>
                    <div className="flex items-center gap-4">
                        <Link to="/dashboard" className="hover:text-foreground">
                            Dashboard
                        </Link>
                        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                            <GithubIcon /> GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
