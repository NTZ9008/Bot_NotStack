import { xpAtLevel, xpForNextLevel } from '@notstack/shared';
import { useT, tr } from '@/lib/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { levelsQuery } from '@/api/bot';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { xpHistoryQuery, xpSettingsQuery } from '@/api/levels';
import { levelUpQuery, myRankCardQuery, rankMetaQuery, rankThemeQuery } from '@/api/rank-card';
import { welcomeAssetsQuery, welcomeCardsQuery, welcomeMetaQuery } from '@/api/welcome';
import { ArrowLeft, ArrowRight, Check, Search, Settings, X } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { PAGE_SIZE, Pagination } from '@/components/pagination';
import { RankBadge } from '@/components/rank-badge';
import { LeaderboardTableSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LevelUpPanel } from '@/features/levels/level-up-settings';
import { MemberXpSheet, ResetServerPanel, XpHistoryPanel, type XpMember } from '@/features/levels/members';
import { MyRankCardPanel } from '@/features/levels/my-rank-card';
import { RankThemePanel } from '@/features/levels/rank-theme-editor';
import { XpSettingsPanel } from '@/features/levels/settings';
import { useAuth } from '@/hooks/use-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGuild } from '@/hooks/use-guild';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePreloadTasks } from '@/hooks/use-preload-tasks';
import { cn } from '@/lib/utils';

// ?q=<ชื่อ หรือ User ID> → เปิดหน้ามาพร้อมค้นหาสมาชิกคนนั้นในตารางอันดับ (ลิงก์จากช่อง ⌘K)
export const Route = createFileRoute('/_app/servers/$guildId/levels')({
    // พิมพ์ ?q=<User ID> เองใน URL → router แปลงเป็นตัวเลข จึงรับทั้งสองแบบ (ลิงก์จากในแอป router ใส่เครื่องหมายคำพูดให้ ไม่เสียความแม่นยำ)
    validateSearch: (search: Record<string, unknown>): { q?: string } =>
        (typeof search.q === 'string' || typeof search.q === 'number') && String(search.q).trim() ? { q: String(search.q).trim().slice(0, 100) } : {},
    loaderDeps: ({ search }) => ({ q: search.q }),
    loader: ({ context, params, deps }) =>
        context.queryClient.ensureQueryData(levelsQuery(params.guildId, { page: 1, pageSize: PAGE_SIZE, ...(deps.q ? { q: deps.q } : {}) })),
    component: LevelsPage,
});

type Intent = (names: string[]) => { onMouseEnter: () => void; onFocus: () => void; onTouchStart: () => void };

function Leaderboard({ guildId, initialQuery = '', onManage }: { guildId: string; initialQuery?: string; onManage?: (member: XpMember | 'pick') => void }) {
    const { user } = useAuth();
    const [page, setPage] = useState(1),
        [pageSize, setPageSize] = useState(PAGE_SIZE),
        [search, setSearch] = useState(initialQuery);
    // ค้นหาทันทีที่หยุดพิมพ์ ไม่ต้องกดปุ่ม
    const q = useDebouncedValue(search.trim(), 300);
    const query = useQuery(levelsQuery(guildId, { page, pageSize, ...(q ? { q } : {}) }));
    const find = (text: string) => {
        setSearch(text);
        setPage(1);
    };
    return (
        <Card>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full max-w-xs">
                        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            aria-label={tr('levels.searchMembersByNameOrDiscord')}
                            className="pr-9 pl-9"
                            placeholder={tr('levels.startOfANameOrDiscord')}
                            value={search}
                            onChange={(e) => find(e.target.value)}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => find('')}
                                aria-label={tr('common.clearSearch')}
                                className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                        )}
                    </div>
                    {user.discordId && (
                        <Button
                            type="button"
                            variant="outline"
                            aria-pressed={search === user.discordId}
                            onClick={() => find(search === user.discordId ? '' : user.discordId!)}
                        >
                            {tr('levels.myRank')}
                        </Button>
                    )}
                    {onManage && (
                        <Button type="button" variant="outline" className="sm:ml-auto" onClick={() => onManage('pick')}>
                            {tr('levels.adjustMemberXp')}
                        </Button>
                    )}
                </div>
                {query.data?.searchLimited && <p className="text-sm text-warning">{tr('levels.atLeast100NamesMatchPlease')}</p>}
                {query.isLoading ? (
                    <LeaderboardTableSkeleton />
                ) : query.error ? (
                    <ErrorState error={query.error} />
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="p-3">{tr('common.rank')}</th>
                                        <th className="p-3">{tr('common.members')}</th>
                                        <th className="p-3">{tr('levels.level')}</th>
                                        <th className="p-3">{tr('levels.totalXpNextLevel')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {query.data?.items.map((row) => {
                                        const previous = xpAtLevel(row.level, query.data.settings),
                                            next = xpForNextLevel(row.level, query.data.settings);
                                        const percent = Math.max(0, Math.min(100, ((row.xp - previous) / (next - previous)) * 100));
                                        return (
                                            <tr key={row.userId} className={cn('border-b', row.userId === user.discordId && 'bg-primary/10')}>
                                                <td className="p-3">
                                                    <RankBadge rank={row.rank} />
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="font-medium">{row.username}</p>
                                                            <p className="font-mono text-xs text-muted-foreground">{row.userId}</p>
                                                        </div>
                                                        {onManage && (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                aria-label={tr('levels.manageXpOf', { name: row.username })}
                                                                onClick={() => onManage({ userId: row.userId, username: row.username })}
                                                            >
                                                                {tr('levels.manage')}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 font-semibold">Lvl {row.level.toLocaleString()}</td>
                                                <td className="min-w-48 p-3">
                                                    <p className="tabular-nums">
                                                        {row.xp.toLocaleString()} / {next.toLocaleString()} XP
                                                    </p>
                                                    <progress
                                                        aria-label={tr('levels.levelProgressOf', { 0: row.username })}
                                                        className="mt-2 h-2 w-full accent-primary"
                                                        max={100}
                                                        value={percent}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!query.data?.items.length && (
                                        <tr>
                                            <td colSpan={4} className="p-10 text-center text-muted-foreground">
                                                {tr('levels.noXpDataMatchesYourSearch')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            page={page}
                            pageCount={Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize))}
                            total={query.data?.total}
                            pageSize={pageSize}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                            busy={query.isFetching}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </CardContent>
        </Card>
    );
}

const STEPS = ['xp', 'level-up', 'theme'] as const;
type Section = (typeof STEPS)[number] | 'history' | 'danger';

// สถานะของขั้นที่จำเป็น (ธีมการ์ดไม่บังคับ → undefined)
function useStepStatus(guildId: string, enabled: boolean): Record<(typeof STEPS)[number], boolean | undefined> | null {
    const xp = useQuery({ ...xpSettingsQuery(guildId), enabled }).data?.settings;
    const levelUp = useQuery({ ...levelUpQuery(guildId), enabled }).data?.settings;
    if (!xp || !levelUp) return null;
    return { xp: xp.enabled && xp.rules.some((rule) => rule.enabled), 'level-up': levelUp.announce || levelUp.rewards.length > 0, theme: undefined };
}

function StepNumber({ n, done }: { n: number; done?: boolean }) {
    return (
        <span
            className={cn(
                'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                done ? 'bg-success text-white' : 'bg-primary text-primary-foreground',
            )}
        >
            {done ? <Check className="size-3" aria-hidden /> : n}
        </span>
    );
}

function SettingsArea({
    guildId,
    section,
    onSection,
    status,
    intent,
}: {
    guildId: string;
    section: Section;
    onSection: (section: Section) => void;
    status: ReturnType<typeof useStepStatus>;
    intent: Intent;
}) {
    const mobile = useIsMobile();
    const labels: Record<Section, string> = {
        xp: tr('levels.xpRulesRates'),
        'level-up': tr('levels.levelUpsRewardRoles'),
        theme: tr('levels.cardTheme'),
        history: tr('levels.xpHistory'),
        danger: tr('levels.dangerZone'),
    };
    const preload: Record<Section, string[]> = {
        xp: ['settings', 'channels', 'roles'],
        'level-up': ['meta', 'theme', 'level-up', 'channels', 'roles'],
        theme: ['meta', 'theme', 'welcome-meta', 'assets', 'cards'],
        history: ['history'],
        danger: [],
    };
    const stepNav = (index: number) => {
        const prev = STEPS[index - 1],
            next = STEPS[index + 1];
        return (
            <div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4">
                {prev ? (
                    <Button variant="ghost" onClick={() => onSection(prev)}>
                        <ArrowLeft />
                        {tr('levels.previousStep', { name: labels[prev] })}
                    </Button>
                ) : (
                    <span />
                )}
                {next && (
                    <Button variant="outline" onClick={() => onSection(next)} {...intent(preload[next])}>
                        {tr('levels.nextStep', { name: labels[next] })}
                        <ArrowRight />
                    </Button>
                )}
            </div>
        );
    };
    const item = (value: Section, children: React.ReactNode, className?: string) => (
        <TabsTrigger
            key={value}
            value={value}
            {...intent(preload[value])}
            className={cn('justify-start rounded-md data-active:bg-accent! data-active:text-accent-foreground!', className)}
        >
            {children}
        </TabsTrigger>
    );
    return (
        <Tabs
            value={section}
            onValueChange={(value) => onSection(value as Section)}
            orientation={mobile ? 'horizontal' : 'vertical'}
            className="md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-6"
        >
            <TabsList variant="line" aria-label={tr('levels.settings')} className="h-auto w-full justify-start md:sticky md:top-4 md:w-auto md:items-stretch">
                <p className="hidden px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground md:block" aria-hidden>
                    {tr('levels.setupSteps')}
                </p>
                {STEPS.map((step, index) =>
                    item(
                        step,
                        <>
                            <StepNumber n={index + 1} done={status?.[step]} />
                            {labels[step]}
                        </>,
                    ),
                )}
                <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border md:mx-3 md:my-2 md:h-px md:w-auto" />
                {item('history', labels.history)}
                {item(
                    'danger',
                    labels.danger,
                    'text-destructive hover:text-destructive dark:text-destructive dark:hover:text-destructive data-active:bg-destructive/10! data-active:text-destructive!',
                )}
            </TabsList>
            <div className="min-w-0">
                <TabsContent value="xp" forceMount className="data-[state=inactive]:hidden">
                    <XpSettingsPanel guildId={guildId} />
                    {stepNav(0)}
                </TabsContent>
                <TabsContent value="level-up">
                    <LevelUpPanel guildId={guildId} />
                    {stepNav(1)}
                </TabsContent>
                <TabsContent value="theme">
                    <RankThemePanel guildId={guildId} />
                    {stepNav(2)}
                </TabsContent>
                <TabsContent value="history">
                    <XpHistoryPanel guildId={guildId} />
                </TabsContent>
                <TabsContent value="danger">
                    <ResetServerPanel guildId={guildId} />
                </TabsContent>
            </div>
        </Tabs>
    );
}

function LevelsPage() {
    const t = useT();
    const guild = useGuild();
    const { q } = Route.useSearch();
    const queryClient = useQueryClient();
    const manage = guild.access === 'manage';
    const guildId = guild.id;
    const [tab, setTab] = useState('leaderboard');
    const [section, setSection] = useState<Section>('xp');
    const [member, setMember] = useState<XpMember | 'pick' | null>(null);
    const status = useStepStatus(guildId, manage);

    const tasks = useMemo(() => {
        const queries = [
            { name: 'meta', run: () => queryClient.prefetchQuery(rankMetaQuery(guildId)) },
            { name: 'mine', run: () => queryClient.prefetchQuery(myRankCardQuery(guildId)) },
            ...(manage
                ? [
                      { name: 'theme', run: () => queryClient.prefetchQuery(rankThemeQuery(guildId)) },
                      { name: 'welcome-meta', run: () => queryClient.prefetchQuery(welcomeMetaQuery(guildId)) },
                      { name: 'assets', run: () => queryClient.prefetchQuery(welcomeAssetsQuery(guildId)) },
                      { name: 'cards', run: () => queryClient.prefetchQuery(welcomeCardsQuery(guildId)) },
                      { name: 'level-up', run: () => queryClient.prefetchQuery(levelUpQuery(guildId)) },
                      { name: 'settings', run: () => queryClient.prefetchQuery(xpSettingsQuery(guildId)) },
                      { name: 'channels', run: () => queryClient.prefetchQuery(guildChannelsQuery(guildId)) },
                      { name: 'roles', run: () => queryClient.prefetchQuery(guildRolesQuery(guildId)) },
                      { name: 'history', run: () => queryClient.prefetchQuery(xpHistoryQuery(guildId)) },
                  ]
                : []),
        ];
        return queries.map(({ name, run }) => ({ key: `${guildId}:levels:${name}`, run }));
    }, [guildId, manage, queryClient]);
    const prioritize = usePreloadTasks(tasks);
    const intent: Intent = (names) => {
        const preload = () => prioritize(names.map((name) => `${guildId}:levels:${name}`));
        return { onMouseEnter: preload, onFocus: preload, onTouchStart: preload };
    };
    const firstTodo = status && STEPS.find((step) => status[step] === false);
    const openSettings = (next: Section) => {
        setSection(next);
        setTab('settings');
    };

    return (
        <>
            <PageHeader help="levels" title={tr('common.ranksLevels')} description={t('levels.xpSystemForNameLeaderboardRank', { name: guild.name })} />
            {manage && firstTodo && tab !== 'settings' && (
                <Alert className="mb-4">
                    <Settings />
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>
                            <span className="font-medium text-foreground">{tr('levels.setupIncomplete')}</span>{' '}
                            {tr('levels.setupIncompleteHint', { done: STEPS.filter((s) => status[s]).length, total: 2 })}
                        </span>
                        <Button size="sm" onClick={() => openSettings(firstTodo)}>
                            {tr('levels.continueSetup')}
                            <ArrowRight />
                        </Button>
                    </AlertDescription>
                </Alert>
            )}
            <Tabs value={tab} onValueChange={setTab} key={guild.id}>
                <TabsList className="mb-4">
                    <TabsTrigger value="leaderboard">{tr('levels.leaderboard')}</TabsTrigger>
                    <TabsTrigger value="my-card" {...intent(['meta', 'mine'])}>
                        {tr('levels.myCard')}
                    </TabsTrigger>
                    {manage && (
                        <TabsTrigger value="settings" {...intent(['settings', 'channels', 'roles'])}>
                            {tr('levels.settings')}
                        </TabsTrigger>
                    )}
                </TabsList>
                <TabsContent value="leaderboard">
                    <Leaderboard key={`${guild.id}:${q ?? ''}`} guildId={guild.id} initialQuery={q?.trim()} onManage={manage ? setMember : undefined} />
                </TabsContent>
                <TabsContent value="my-card">
                    <MyRankCardPanel guildId={guild.id} />
                </TabsContent>
                {manage && (
                    <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
                        <SettingsArea guildId={guild.id} section={section} onSection={setSection} status={status} intent={intent} />
                    </TabsContent>
                )}
            </Tabs>
            {manage && <MemberXpSheet guildId={guild.id} member={member} onClose={() => setMember(null)} />}
        </>
    );
}
