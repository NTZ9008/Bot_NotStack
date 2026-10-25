import type { GuildSummary, MemberSearchResult } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
    Activity,
    ArrowLeft,
    Clock,
    Copy,
    CornerDownLeft,
    Globe,
    History,
    Loader2,
    LogOut,
    Minus,
    Plus,
    RotateCcw,
    Search,
    Server,
    Sparkles,
    Trophy,
    UserRound,
    Wand2,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { guildQuery, guildsQuery, searchMembersQuery } from '@/api/guilds';
import { GuildIcon } from '@/components/guild-icon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cleanTarget, describeXpCommand, matchScore, parseCommand, type XpCommandAction } from '@/lib/command-parser';
import { DEFAULT_AVATAR } from '@/lib/format';
import { PAGE_GUIDES } from '@/lib/page-guides';
import { visibleNavGroups, type NavItem } from './nav-items';
import { useLogout } from './profile-menu';
import { XpCommandDialog, type XpCommandRequest, type XpCommandTarget } from './xp-command-dialog';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const RECENT_KEY = 'notstack:command-palette:recent';
const MAX_RECENT = 5;
const SNOWFLAKE = /^\d{17,20}$/;

// รายการที่เคยเปิดล่าสุด — เก็บเฉพาะการไปหน้า (ไม่เก็บคำสั่งที่แก้ข้อมูล)
interface RecentEntry {
    id: string;
    label: string;
    hint: string;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
}

function readRecent(): RecentEntry[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(parsed) ? (parsed as RecentEntry[]).filter((entry) => entry && typeof entry.to === 'string').slice(0, MAX_RECENT) : [];
    } catch {
        return [];
    }
}

function rememberRecent(entry: RecentEntry): void {
    try {
        const next = [entry, ...readRecent().filter((item) => item.id !== entry.id)].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        /* โหมดส่วนตัว / storage เต็ม — ไม่เป็นไร */
    }
}

const EXAMPLES = [
    { text: 'ให้ xp @', hint: 'ให้ XP สมาชิก เช่น “ให้ xp @boat 500 เพราะช่วยงาน”' },
    { text: 'หัก xp @', hint: 'หัก XP เช่น “หัก xp @boat 200”' },
    { text: 'log ', hint: 'ค้นหาในประวัติเหตุการณ์ของเซิร์ฟเวอร์' },
    { text: '@', hint: 'ค้นหาสมาชิก แล้วเลือกสิ่งที่จะทำ' },
];

function Row({ icon: Icon, media, title, hint, shortcut }: { icon?: LucideIcon; media?: ReactNode; title: ReactNode; hint?: ReactNode; shortcut?: ReactNode }) {
    return (
        <>
            {media ?? (Icon ? <Icon /> : null)}
            <span className="min-w-0 flex-1">
                <span className="block truncate">{title}</span>
                {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
            </span>
            {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
        </>
    );
}

function MemberAvatar({ member }: { member: Pick<MemberSearchResult, 'avatar' | 'username'> }) {
    return (
        <Avatar className="size-6">
            <AvatarImage src={member.avatar || DEFAULT_AVATAR} alt="" />
            <AvatarFallback className="text-[10px]">{member.username.slice(0, 1)}</AvatarFallback>
        </Avatar>
    );
}

const toTarget = (member: MemberSearchResult): XpCommandTarget => ({
    userId: member.userId,
    username: member.nickname || member.username,
    avatar: member.avatar,
});

const MEMBER_XP_ACTIONS: { action: XpCommandAction; label: string; icon: LucideIcon }[] = [
    { action: 'add', label: 'ให้ XP…', icon: Plus },
    { action: 'subtract', label: 'หัก XP…', icon: Minus },
    { action: 'set', label: 'ตั้งค่า XP…', icon: Wand2 },
    { action: 'reset', label: 'รีเซ็ต XP…', icon: RotateCcw },
];

// ==========================================
// ⌘K COMMAND PALETTE — ค้นหาทุกอย่าง + สั่งงานด้วยข้อความ (Ctrl/⌘ + K)
// หน้า / เซิร์ฟเวอร์ / สมาชิก / คำสั่งด่วน และคำสั่งพิมพ์เอง เช่น “ให้ xp @boat 500”, “log voice”
// ผลที่แสดงขึ้นกับสิทธิ์: หน้าที่เข้าไม่ได้และคำสั่งที่ต้องใช้สิทธิ์ manage จะไม่โผล่
// ==========================================
export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [member, setMember] = useState<XpCommandTarget | null>(null);
    const [xpRequest, setXpRequest] = useState<XpCommandRequest | null>(null);
    const [recent, setRecent] = useState<RecentEntry[]>([]);
    const navigate = useNavigate();
    const logout = useLogout();
    const { isAdmin } = useAuth();
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const { data: guildList } = useQuery({ ...guildsQuery, enabled: open });
    const canManage = Boolean(guildId) && guild?.access === 'manage';

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((value) => !value);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        if (open) setRecent(readRecent());
        else {
            setQuery('');
            setMember(null);
        }
    }, [open]);

    const parsed = useMemo(() => parseCommand(query), [query]);
    const trimmed = query.trim();
    // ชื่อสมาชิกที่จะค้น: เป้าหมายของคำสั่ง XP / ข้อความหลัง @ / ข้อความที่พิมพ์ (อย่างน้อย 2 ตัวอักษร)
    const memberQuery = parsed?.type === 'xp' ? parsed.target : trimmed.startsWith('@') ? cleanTarget(trimmed) : !parsed && trimmed.length >= 2 ? trimmed : '';
    const debouncedMember = useDebouncedValue(memberQuery, 200);
    const membersEnabled = open && canManage && !member && debouncedMember.length >= 2 && !SNOWFLAKE.test(debouncedMember);
    const members = useQuery({ ...searchMembersQuery(guildId ?? '', debouncedMember), enabled: membersEnabled });
    const memberResults = membersEnabled ? (members.data ?? []) : [];
    const membersLoading = canManage && memberQuery.length >= 2 && (memberQuery !== debouncedMember || (membersEnabled && members.isFetching));

    const close = () => setOpen(false);
    const go = (entry: RecentEntry) => {
        rememberRecent(entry);
        close();
        void navigate({ to: entry.to, params: entry.params, search: entry.search });
    };
    const copy = (text: string, label: string) => {
        void navigator.clipboard.writeText(text).then(
            () => toast.success(`คัดลอก${label}แล้ว`),
            () => toast.error('คัดลอกไม่สำเร็จ'),
        );
        close();
    };
    const startXp = (request: XpCommandRequest) => {
        close();
        setXpRequest(request);
    };
    const openActivity = (q: string) =>
        guildId &&
        go({
            id: `activity:${q}`,
            label: `ค้นหา “${q}”`,
            hint: 'ประวัติเซิร์ฟเวอร์',
            to: '/servers/$guildId/audit-logs',
            params: { guildId },
            search: { source: 'discord', q },
        });

    // ==========================================
    // หน้า / เซิร์ฟเวอร์ / คำสั่งด่วน — กรองด้วย matchScore แล้วเรียงตามคะแนน
    // ==========================================
    const navGroups = visibleNavGroups(isAdmin, guildId ? (guild ?? null) : null);
    const pageEntry = (item: NavItem): RecentEntry => ({
        id: `page:${item.to}`,
        label: item.label,
        hint: PAGE_GUIDES[item.guide].summary,
        to: item.to,
        params: item.guild && guildId ? { guildId } : undefined,
    });
    const rankedPages = trimmed
        ? navGroups
              .flatMap((group) => group.items)
              .map((item) => ({ item, score: matchScore(`${item.label} ${item.keywords} ${PAGE_GUIDES[item.guide].summary}`, trimmed) }))
              .filter((entry) => entry.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 8)
        : [];

    const otherGuilds = (guildList?.guilds ?? []).filter((item) => item.id !== guildId);
    const rankedGuilds: GuildSummary[] = trimmed
        ? otherGuilds
              .map((item) => ({ item, score: matchScore(`${item.name} server เซิร์ฟเวอร์ สลับ switch`, trimmed) }))
              .filter((entry) => entry.score > 0)
              .sort((a, b) => b.score - a.score)
              .map((entry) => entry.item)
              .slice(0, 5)
        : otherGuilds.slice(0, 4);

    const actions = [
        guildList?.inviteUrl && {
            id: 'invite',
            icon: Sparkles,
            title: 'เชิญบอทเข้าเซิร์ฟเวอร์ใหม่',
            hint: 'เปิดหน้าเชิญบอทของ Discord',
            keywords: 'invite เชิญ เพิ่มบอท add bot',
            run: () => {
                window.open(guildList.inviteUrl!, '_blank', 'noopener,noreferrer');
                close();
            },
        },
        guildId && {
            id: 'copy-guild',
            icon: Copy,
            title: 'คัดลอก Server ID',
            hint: guild?.name ?? guildId,
            keywords: 'copy id คัดลอก server guild ไอดี',
            run: () => copy(guildId, ' Server ID '),
        },
        {
            id: 'landing',
            icon: Globe,
            title: 'เปิดหน้าแรก (ลูกโลกกิจกรรมสด)',
            hint: 'หน้า landing ของบอท',
            keywords: 'landing home หน้าแรก globe live ลูกโลก',
            run: () => go({ id: 'landing', label: 'หน้าแรก', hint: 'landing', to: '/' }),
        },
        {
            id: 'logout',
            icon: LogOut,
            title: 'ออกจากระบบ',
            hint: 'Logout',
            keywords: 'logout sign out ออก ออกจากระบบ',
            run: () => {
                close();
                void logout();
            },
        },
    ].filter((action): action is Exclude<typeof action, false | '' | null | undefined> => Boolean(action));
    const rankedActions = trimmed ? actions.filter((action) => matchScore(`${action.title} ${action.keywords}`, trimmed) > 0) : [];

    // ==========================================
    // หน้าย่อย: เลือกสมาชิกแล้ว → สิ่งที่ทำกับสมาชิกคนนี้ได้
    // ==========================================
    const memberPage = member && guildId && (
        <>
            <CommandGroup heading={member.username}>
                {MEMBER_XP_ACTIONS.filter(({ label }) => matchScore(`${label} xp`, trimmed) > 0).map(({ action, label, icon }) => (
                    <CommandItem key={action} value={`xp-${action}`} onSelect={() => startXp({ member, action, amount: action === 'add' ? 100 : 0 })}>
                        <Row icon={icon} title={label} hint="ยืนยันจำนวนและเหตุผลก่อนบันทึก" />
                    </CommandItem>
                ))}
                {matchScore('ดูอันดับและ XP rank levels', trimmed) > 0 && (
                    <CommandItem
                        value="rank"
                        onSelect={() =>
                            go({
                                id: `rank:${member.userId}`,
                                label: `อันดับของ ${member.username}`,
                                hint: 'อันดับและเลเวล',
                                to: '/servers/$guildId/levels',
                                params: { guildId },
                                search: { q: member.userId },
                            })
                        }
                    >
                        <Row icon={Trophy} title="ดูอันดับและ XP" hint="เปิดตารางอันดับที่ค้นหาสมาชิกคนนี้ไว้" />
                    </CommandItem>
                )}
                {matchScore('ดูกิจกรรมในเซิร์ฟเวอร์ activity log', trimmed) > 0 && (
                    <CommandItem value="activity" onSelect={() => openActivity(member.username)}>
                        <Row icon={Activity} title="ดูกิจกรรมในเซิร์ฟเวอร์" hint="ประวัติเหตุการณ์ใน Discord ที่เกี่ยวกับสมาชิกคนนี้" />
                    </CommandItem>
                )}
                {matchScore('คัดลอก User ID copy', trimmed) > 0 && (
                    <CommandItem value="copy" onSelect={() => copy(member.userId, ' User ID ')}>
                        <Row icon={Copy} title="คัดลอก User ID" hint={member.userId} />
                    </CommandItem>
                )}
            </CommandGroup>
        </>
    );

    // ==========================================
    // คำสั่งที่พิมพ์เป็นประโยค
    // ==========================================
    const xpCommand = parsed?.type === 'xp' ? parsed : null;
    const commandGroup = xpCommand && (
        <CommandGroup heading="คำสั่ง">
            {!guildId ? (
                <CommandItem disabled value="xp-no-guild">
                    <Row icon={Server} title={describeXpCommand(xpCommand.action, xpCommand.amount)} hint="เลือกเซิร์ฟเวอร์ก่อน แล้วค่อยพิมพ์คำสั่ง XP" />
                </CommandItem>
            ) : !canManage ? (
                <CommandItem disabled value="xp-no-access">
                    <Row icon={Server} title={describeXpCommand(xpCommand.action, xpCommand.amount)} hint="ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์นี้จึงแก้ XP ได้" />
                </CommandItem>
            ) : SNOWFLAKE.test(xpCommand.target) ? (
                <CommandItem
                    value="xp-id"
                    onSelect={() =>
                        startXp({
                            member: { userId: xpCommand.target, username: xpCommand.target },
                            action: xpCommand.action,
                            amount: xpCommand.amount,
                            reason: xpCommand.reason,
                        })
                    }
                >
                    <Row
                        icon={Wand2}
                        title={`${describeXpCommand(xpCommand.action, xpCommand.amount)} → ${xpCommand.target}`}
                        hint="User ID"
                        shortcut={<CornerDownLeft />}
                    />
                </CommandItem>
            ) : memberResults.length ? (
                memberResults.slice(0, 6).map((result) => (
                    <CommandItem
                        key={result.userId}
                        value={`xp-${result.userId}`}
                        onSelect={() => startXp({ member: toTarget(result), action: xpCommand.action, amount: xpCommand.amount, reason: xpCommand.reason })}
                    >
                        <Row
                            media={<MemberAvatar member={result} />}
                            title={
                                <>
                                    {describeXpCommand(xpCommand.action, xpCommand.amount)} →{' '}
                                    <span className="font-semibold">{result.nickname || result.username}</span>
                                </>
                            }
                            hint={`@${result.tag}${xpCommand.reason ? ` · เหตุผล: ${xpCommand.reason}` : ''}`}
                            shortcut={<CornerDownLeft />}
                        />
                    </CommandItem>
                ))
            ) : membersLoading ? (
                <CommandItem disabled value="xp-loading">
                    <Row media={<Loader2 className="animate-spin" />} title={`กำลังค้นหา “${xpCommand.target}”…`} />
                </CommandItem>
            ) : (
                <CommandItem disabled value="xp-none">
                    <Row icon={UserRound} title={`ไม่พบสมาชิก “${xpCommand.target}”`} hint="ลองพิมพ์ชื่อขึ้นต้น / username หรือวาง User ID" />
                </CommandItem>
            )}
        </CommandGroup>
    );

    const activityQuery = parsed?.type === 'activity' ? parsed.query : null;

    const rootPage = (
        <>
            {commandGroup}

            {activityQuery && canManage && (
                <CommandGroup heading="ค้นหา">
                    <CommandItem value="activity-search" onSelect={() => openActivity(activityQuery)}>
                        <Row
                            icon={Search}
                            title={`ค้นหา “${activityQuery}” ในประวัติเซิร์ฟเวอร์`}
                            hint="เหตุการณ์ใน Discord — ข้อความ ห้องเสียง สมาชิก ฯลฯ"
                            shortcut={<CornerDownLeft />}
                        />
                    </CommandItem>
                </CommandGroup>
            )}

            {!parsed && canManage && memberQuery.length >= 2 && (memberResults.length > 0 || membersLoading) && (
                <CommandGroup heading="สมาชิก">
                    {memberResults.slice(0, 5).map((result) => (
                        <CommandItem
                            key={result.userId}
                            value={`member-${result.userId}`}
                            onSelect={() => {
                                setMember(toTarget(result));
                                setQuery('');
                            }}
                        >
                            <Row
                                media={<MemberAvatar member={result} />}
                                title={result.nickname || result.username}
                                hint={`@${result.tag} · กด Enter เพื่อเลือกสิ่งที่จะทำ`}
                                shortcut="›"
                            />
                        </CommandItem>
                    ))}
                    {membersLoading && memberResults.length === 0 && (
                        <CommandItem disabled value="member-loading">
                            <Row media={<Loader2 className="animate-spin" />} title="กำลังค้นหาสมาชิก…" />
                        </CommandItem>
                    )}
                </CommandGroup>
            )}

            {!trimmed && recent.length > 0 && (
                <CommandGroup heading="ล่าสุด">
                    {recent.map((entry) => (
                        <CommandItem key={entry.id} value={`recent-${entry.id}`} onSelect={() => go(entry)}>
                            <Row icon={Clock} title={entry.label} hint={entry.hint} />
                        </CommandItem>
                    ))}
                </CommandGroup>
            )}

            {trimmed
                ? rankedPages.length > 0 && (
                      <CommandGroup heading="หน้า">
                          {rankedPages.map(({ item }) => (
                              <CommandItem key={item.to} value={`page-${item.to}`} onSelect={() => go(pageEntry(item))}>
                                  <Row icon={item.icon} title={item.label} hint={PAGE_GUIDES[item.guide].summary} />
                              </CommandItem>
                          ))}
                      </CommandGroup>
                  )
                : navGroups.map((group) => (
                      <CommandGroup key={group.label} heading={group.label}>
                          {group.items.map((item) => (
                              <CommandItem key={item.to} value={`page-${item.to}`} onSelect={() => go(pageEntry(item))}>
                                  <Row icon={item.icon} title={item.label} hint={PAGE_GUIDES[item.guide].summary} />
                              </CommandItem>
                          ))}
                      </CommandGroup>
                  ))}

            {rankedGuilds.length > 0 && (
                <CommandGroup heading="สลับเซิร์ฟเวอร์">
                    {rankedGuilds.map((item) => (
                        <CommandItem
                            key={item.id}
                            value={`guild-${item.id}`}
                            onSelect={() =>
                                go({ id: `guild:${item.id}`, label: item.name, hint: 'เซิร์ฟเวอร์', to: '/servers/$guildId', params: { guildId: item.id } })
                            }
                        >
                            <Row
                                media={<GuildIcon guild={item} className="size-6 text-[10px]" />}
                                title={item.name}
                                hint={item.access === 'manage' ? 'จัดการได้' : 'ดูอันดับได้อย่างเดียว'}
                            />
                        </CommandItem>
                    ))}
                </CommandGroup>
            )}

            {rankedActions.length > 0 && (
                <CommandGroup heading="คำสั่งด่วน">
                    {rankedActions.map((action) => (
                        <CommandItem key={action.id} value={`action-${action.id}`} onSelect={action.run}>
                            <Row icon={action.icon} title={action.title} hint={action.hint} />
                        </CommandItem>
                    ))}
                </CommandGroup>
            )}

            {!trimmed && canManage && (
                <CommandGroup heading="ลองพิมพ์">
                    {EXAMPLES.map((example) => (
                        <CommandItem key={example.text} value={`example-${example.text}`} onSelect={() => setQuery(example.text)}>
                            <Row icon={History} title={<span className="font-mono">{example.text.trim()}…</span>} hint={example.hint} />
                        </CommandItem>
                    ))}
                </CommandGroup>
            )}
        </>
    );

    return (
        <>
            <Button
                aria-label="ค้นหาหรือสั่งงาน"
                variant="outline"
                className="h-8 justify-start gap-2 px-2.5 text-muted-foreground md:w-60"
                onClick={() => setOpen(true)}
            >
                <Search className="size-4" />
                <span className="hidden flex-1 text-left md:inline">ค้นหา หรือพิมพ์คำสั่ง...</span>
                <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] md:inline">
                    {isMac ? '⌘ K' : 'Ctrl K'}
                </kbd>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    showCloseButton
                    className="top-[18%] translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-xl [&_[data-slot=command-input-wrapper]]:pr-10 [&_[data-slot=command-list]]:max-h-[min(60svh,26rem)]"
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>ค้นหาหรือสั่งงาน</DialogTitle>
                        <DialogDescription>ค้นหาหน้า เซิร์ฟเวอร์ สมาชิก หรือพิมพ์คำสั่ง เช่น ให้ xp @ชื่อ 500</DialogDescription>
                    </DialogHeader>
                    {/* กรองเอง (shouldFilter=false) — ผลสมาชิกมาจาก API และต้องเรียงตามคะแนนของเราเอง */}
                    <Command shouldFilter={false} loop>
                        {member && (
                            <button
                                type="button"
                                onClick={() => setMember(null)}
                                className="mx-2 mt-2 inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="size-3" /> สมาชิก: <span className="font-medium text-foreground">{member.username}</span>
                            </button>
                        )}
                        <CommandInput
                            autoFocus
                            value={query}
                            onValueChange={setQuery}
                            placeholder={
                                member
                                    ? `จะทำอะไรกับ ${member.username}?`
                                    : guildId
                                      ? 'ค้นหา หรือพิมพ์ “ให้ xp @ชื่อ 500”, “log voice”…'
                                      : 'ค้นหาหน้า เซิร์ฟเวอร์ หรือคำสั่ง…'
                            }
                            onKeyDown={(e) => {
                                if (e.key === 'Backspace' && !query && member) {
                                    e.preventDefault();
                                    setMember(null);
                                }
                            }}
                        />
                        <CommandList>
                            <CommandEmpty>ไม่พบสิ่งที่ตรงกับ “{trimmed}”</CommandEmpty>
                            {memberPage || rootPage}
                        </CommandList>
                        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
                            <span>
                                <kbd className="font-mono">↑↓</kbd> เลือก
                            </span>
                            <span>
                                <kbd className="font-mono">↵</kbd> ทำ
                            </span>
                            {member && (
                                <span>
                                    <kbd className="font-mono">⌫</kbd> ย้อนกลับ
                                </span>
                            )}
                            <span className="ml-auto">
                                <kbd className="font-mono">Esc</kbd> ปิด
                            </span>
                        </div>
                    </Command>
                </DialogContent>
            </Dialog>
            {xpRequest && guildId && (
                <XpCommandDialog
                    key={`${xpRequest.member.userId}:${xpRequest.action}`}
                    guildId={guildId}
                    request={xpRequest}
                    onClose={() => setXpRequest(null)}
                />
            )}
        </>
    );
}
