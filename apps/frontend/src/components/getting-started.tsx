import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronDown, Compass } from 'lucide-react';
import { visibleNavGroups } from '@/components/layout/nav-items';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useGuild } from '@/hooks/use-guild';
import { PAGE_GUIDES } from '@/lib/page-guides';

const FIRST_STEPS = ['config', 'welcome', 'levels'] as const;

export function GettingStarted() {
    const guild = useGuild();
    const { isAdmin } = useAuth();
    const groups = visibleNavGroups(isAdmin, guild)
        .map((group) => ({ ...group, items: group.items.filter((item) => item.guild && item.guide !== 'overview') }))
        .filter((group) => group.items.length > 0);
    const items = groups.flatMap((group) => group.items);

    return (
        <Card className="border-primary/25 bg-primary/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Compass className="size-5 text-indigo-300" /> เริ่มต้นใช้งานบอท
                </CardTitle>
                <CardDescription>เลือกสิ่งที่อยากทำใน {guild.name} — ไม่จำเป็นต้องตั้งค่าทุกฟีเจอร์ แต่ละหน้ามีปุ่ม ⓘ วิธีใช้งาน</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                    {FIRST_STEPS.map((key) => {
                        const item = items.find((entry) => entry.guide === key);
                        if (!item) return null;
                        return (
                            <Link
                                key={key}
                                to={item.to}
                                params={{ guildId: guild.id }}
                                className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring"
                            >
                                <item.icon className="mt-0.5 size-5 shrink-0 text-indigo-300" />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="text-sm font-medium">{key === 'config' ? 'เริ่มที่นี่: ตั้งค่าบอท' : item.label}</p>
                                    <p className="text-xs leading-relaxed text-muted-foreground">{PAGE_GUIDES[key].summary}</p>
                                </div>
                                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            </Link>
                        );
                    })}
                </div>
                <details className="group rounded-lg border bg-card/50">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        ดูทุกฟีเจอร์ของเซิร์ฟเวอร์
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-5 border-t p-4 sm:grid-cols-2">
                        {groups.map((group) => (
                            <section key={group.label} className="space-y-2">
                                <h3 className="text-xs font-semibold text-muted-foreground">{group.label}</h3>
                                {group.items.map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        params={{ guildId: guild.id }}
                                        className="flex items-start gap-2 rounded-md p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                                    >
                                        <item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{item.label}</p>
                                            <p className="text-xs text-muted-foreground">{PAGE_GUIDES[item.guide].summary}</p>
                                        </div>
                                    </Link>
                                ))}
                            </section>
                        ))}
                    </div>
                </details>
            </CardContent>
        </Card>
    );
}
