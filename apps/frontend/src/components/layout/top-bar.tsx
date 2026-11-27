import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useRouterState } from '@tanstack/react-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { guildQuery } from '@/api/guilds';
import { House } from '@/components/icons';
import { SidebarTrigger } from '@/components/ui/sidebar';
import headWhite from '@/features/landing/mascot/head-white.webp';
import { trText, useT } from '@/lib/i18n';
import { CommandPalette } from './command-palette';
import { findNavItem } from './nav-items';
import { ProfileMenu } from './profile-menu';
import { LanguageSwitcher, ThemeSwitcher } from './theme-toggle';

// ==========================================
// 🧭 แถบบนแบบแคปซูลลอย (โทนเดียวกับแถบนำทางของหน้า landing)
// ลิงก์ด่วนตรงกลางมีพื้นสีที่ "เลื่อน" ไปหาลิงก์ที่เปิดอยู่
// ==========================================
export function TopBar() {
    const t = useT();
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const isNavigating = useRouterState({ select: (state) => state.isLoading });
    const routePath = useRouterState({ select: (state) => state.matches.at(-1)?.fullPath?.replace(/\/$/, '') || '/' });

    // ลิงก์ด่วน: หน้าแรก / เซิร์ฟเวอร์ / (ภาพรวม + เลเวล ของเซิร์ฟเวอร์ที่เลือก) / บัญชี
    const paths = [
        '/servers',
        ...(guildId ? [...(guild?.access === 'manage' ? ['/servers/$guildId/overview'] : []), '/servers/$guildId/levels'] : []),
        '/account',
    ];
    const links = paths.flatMap((to) => {
        const item = findNavItem(to);
        return item ? [{ to, label: trText(item.label), icon: item.icon, guild: Boolean(item.guild) }] : [];
    });

    // พื้นสีเลื่อนตามลิงก์ที่ active (วัดตำแหน่งจริงหลังวาด)
    const navRef = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
    const activeKey = links.find((link) => link.to === routePath)?.to ?? null;
    useLayoutEffect(() => {
        const nav = navRef.current;
        if (!nav) return;
        const measure = () => {
            const el = activeKey ? nav.querySelector<HTMLElement>(`[data-to="${activeKey}"]`) : null;
            setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
        };
        measure();
        // ฟอนต์โหลดเสร็จ / เปลี่ยนภาษา / ย่อขยายจอ ทำให้ความกว้างลิงก์เปลี่ยน — วัดใหม่
        const observer = new ResizeObserver(measure);
        observer.observe(nav);
        return () => observer.disconnect();
    }, [activeKey, links.length]);

    return (
        <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3 md:px-4">
            <div className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-2 rounded-2xl bg-card/80 px-2.5 shadow-soft ring-1 ring-border backdrop-blur-xl">
                <SidebarTrigger className="size-9 rounded-full" />
                <Link
                    to="/servers"
                    className="landing-brand group flex shrink-0 items-center gap-2.5 rounded-xl pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="grid size-10 place-items-end overflow-hidden rounded-xl bg-gradient-to-br from-[#3a55ff] to-[#1c2fd6] ring-1 ring-white/20">
                        <img
                            src={headWhite}
                            alt=""
                            width={40}
                            height={40}
                            className="size-10 translate-y-1 transition-transform duration-300 group-hover:translate-y-0 group-hover:scale-110"
                        />
                    </span>
                    <span className="sr-only leading-none sm:not-sr-only sm:block">
                        <span className="block max-w-36 truncate text-[15px] font-black tracking-tight">{bot.name}</span>
                        <span className="mt-1 block font-mono text-[10px] tracking-[0.25em] text-ink uppercase">Dashboard</span>
                    </span>
                </Link>

                <nav
                    ref={navRef}
                    aria-label={t('app.mainNav')}
                    className="relative mx-auto hidden items-center gap-0.5 rounded-full bg-muted p-1 ring-1 ring-border 2xl:flex"
                >
                    <span
                        aria-hidden
                        className="absolute inset-y-1 rounded-full bg-card shadow-sm ring-1 ring-border transition-[left,width,opacity] duration-500 ease-spring motion-reduce:transition-none dark:bg-primary dark:ring-0"
                        style={{ left: pill?.left ?? 0, width: pill?.width ?? 0, opacity: pill ? 1 : 0 }}
                    />
                    <a
                        href="/"
                        className="relative flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <House className="hidden size-4 2xl:block" />
                        {t('app.home')}
                    </a>
                    {links.map((link) => (
                        <Link
                            key={link.to}
                            data-to={link.to}
                            to={link.to}
                            params={link.guild ? { guildId } : {}}
                            className="relative flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground data-[status=active]:text-accent-foreground dark:data-[status=active]:text-white"
                            activeOptions={{ exact: true }}
                        >
                            <link.icon className="hidden size-4 2xl:block" />
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-1.5 2xl:ml-0">
                    <CommandPalette />
                    <div className="hidden items-center gap-1.5 md:flex">
                        <LanguageSwitcher short />
                        <ThemeSwitcher iconOnly />
                    </div>
                    <ProfileMenu />
                </div>

                {isNavigating && (
                    <div role="progressbar" aria-label={t('app.openingPage')} className="absolute inset-x-5 bottom-0 h-0.5 overflow-hidden rounded-full">
                        <div className="dash-progress h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-ink" />
                    </div>
                )}
            </div>
        </header>
    );
}
