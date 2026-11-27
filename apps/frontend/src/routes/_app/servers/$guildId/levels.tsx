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
import { PageHeader } from '@/components/page-header';
import { PAGE_SIZE, Pagination } from '@/components/pagination';
import { RankBadge } from '@/components/rank-badge';
import { LeaderboardTableSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { ArrowLeft, ArrowRight, Check } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LevelUpPanel } from '@/features/levels/level-up-settings';
import { XpHistoryPanel, XpMembersPanel } from '@/features/levels/members';
import { MyRankCardPanel } from '@/features/levels/my-rank-card';
import { RankThemePanel } from '@/features/levels/rank-theme-editor';
import { XpSettingsPanel } from '@/features/levels/settings';
import { useAuth } from '@/hooks/use-auth';
import { useGuild } from '@/hooks/use-guild';
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
function Leaderboard({ guildId, initialQuery = '' }: { guildId: string; initialQuery?: string }) {
    const { user } = useAuth();
    const [page, setPage] = useState(1),
        [pageSize, setPageSize] = useState(PAGE_SIZE),
        [search, setSearch] = useState(initialQuery),
        [userId, setUserId] = useState(initialQuery);
    const query = useQuery(levelsQuery(guildId, { page, pageSize, ...(userId ? { q: userId } : {}) }));
    return (
        <Card>
            <CardContent className="space-y-4">
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setUserId(search.trim());
                        setPage(1);
                    }}
                >
                    <Input
                        aria-label={tr('levels.searchMembersByNameOrDiscord')}
                        className="max-w-xs"
                        placeholder={tr('levels.startOfANameOrDiscord')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Button type="submit" variant="outline">
                        {tr('common.search')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            setSearch('');
                            setUserId('');
                            setPage(1);
                        }}
                    >
                        {tr('common.total')}
                    </Button>
                    {user.discordId && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setSearch(user.discordId!);
                                setUserId(user.discordId!);
                                setPage(1);
                            }}
                        >
                            {tr('levels.myRank')}
                        </Button>
                    )}
                </form>
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
                                            <tr key={row.userId} className={`border-b ${row.userId === user.discordId ? 'bg-primary/10' : ''}`}>
                                                <td className="p-3">
                                                    <RankBadge rank={row.rank} />
                                                </td>
                                                <td className="p-3">
                                                    <p className="font-medium">{row.username}</p>
                                                    <p className="font-mono text-xs text-muted-foreground">{row.userId}</p>
                                                </td>
                                                <td className="p-3 font-semibold">Lvl {row.level.toLocaleString()}</td>
                                                <td className="min-w-48 p-3">
                                                    <p>
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
function LevelsPage() {
    const t = useT();
    const guild = useGuild();
    const { q } = Route.useSearch();
    const queryClient = useQueryClient();
    const manage = guild.access === 'manage';
    const guildId = guild.id;

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
    const intent = (names: string[]) => {
        const preload = () => prioritize(names.map((name) => `${guildId}:levels:${name}`));
        return { onMouseEnter: preload, onFocus: preload, onTouchStart: preload };
    };
    // ขั้นตอนตั้งค่าเรียงตามที่ต้องทำจริง: กฎ XP → เลเวลอัป/ยศ → หน้าตาการ์ด
    const steps = [
        { value: 'settings', label: tr('levels.xpRulesRates'), hint: tr('levels.step1Hint'), preload: ['settings', 'channels', 'roles'] },
        {
            value: 'level-up',
            label: tr('levels.levelUpsRewardRoles'),
            hint: tr('levels.step2Hint'),
            preload: ['meta', 'theme', 'level-up', 'channels', 'roles'],
        },
        { value: 'card-theme', label: tr('levels.cardTheme'), hint: tr('levels.step3Hint'), preload: ['meta', 'theme', 'welcome-meta', 'assets', 'cards'] },
    ];
    const [tab, setTab] = useState('leaderboard');
    const stepNav = (index: number) => {
        const prev = steps[index - 1],
            next = steps[index + 1];
        return (
            <div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4">
                {prev ? (
                    <Button variant="ghost" onClick={() => setTab(prev.value)}>
                        <ArrowLeft />
                        {tr('levels.previousStep', { name: prev.label })}
                    </Button>
                ) : (
                    <span />
                )}
                {next && (
                    <Button variant="outline" onClick={() => setTab(next.value)} {...intent(next.preload)}>
                        {tr('levels.nextStep', { name: next.label })}
                        <ArrowRight />
                    </Button>
                )}
            </div>
        );
    };
    return (
        <>
            <PageHeader help="levels" title={tr('common.ranksLevels')} description={t('levels.xpSystemForNameLeaderboardRank', { name: guild.name })} />
            {manage && <SetupSteps guildId={guildId} steps={steps} onOpen={setTab} intent={intent} />}
            <Tabs value={tab} onValueChange={setTab} key={guild.id}>
                <TabsList className="mb-4 flex h-auto flex-wrap">
                    <TabsTrigger value="leaderboard">{tr('levels.leaderboard')}</TabsTrigger>
                    <TabsTrigger value="my-card" {...intent(['meta', 'mine'])}>
                        {tr('levels.myCard')}
                    </TabsTrigger>
                    {manage && (
                        <>
                            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                            {steps.map((step, index) => (
                                <TabsTrigger key={step.value} value={step.value} {...intent(step.preload)}>
                                    <StepNumber n={index + 1} />
                                    {step.label}
                                </TabsTrigger>
                            ))}
                            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                            <TabsTrigger value="members">{tr('levels.manageMembers')}</TabsTrigger>
                            <TabsTrigger value="history" {...intent(['history'])}>
                                {tr('common.history')}
                            </TabsTrigger>
                        </>
                    )}
                </TabsList>
                <TabsContent value="leaderboard">
                    <Leaderboard key={`${guild.id}:${q ?? ''}`} guildId={guild.id} initialQuery={q?.trim()} />
                </TabsContent>
                <TabsContent value="my-card">
                    <MyRankCardPanel guildId={guild.id} />
                </TabsContent>
                {manage && (
                    <>
                        <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
                            <XpSettingsPanel guildId={guild.id} />
                            {stepNav(0)}
                        </TabsContent>
                        <TabsContent value="level-up">
                            <LevelUpPanel guildId={guild.id} />
                            {stepNav(1)}
                        </TabsContent>
                        <TabsContent value="card-theme">
                            <RankThemePanel guildId={guild.id} />
                            {stepNav(2)}
                        </TabsContent>
                        <TabsContent value="members">
                            <XpMembersPanel guildId={guild.id} />
                        </TabsContent>
                        <TabsContent value="history">
                            <XpHistoryPanel guildId={guild.id} />
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </>
    );
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

// การ์ดบอกว่าตั้งค่าไปถึงไหนแล้ว — โผล่เฉพาะตอนขั้นที่จำเป็น (1, 2) ยังไม่ครบ
function SetupSteps({
    guildId,
    steps,
    onOpen,
    intent,
}: {
    guildId: string;
    steps: { value: string; label: string; hint: string; preload: string[] }[];
    onOpen: (value: string) => void;
    intent: (names: string[]) => object;
}) {
    const xp = useQuery(xpSettingsQuery(guildId)).data?.settings;
    const levelUp = useQuery(levelUpQuery(guildId)).data?.settings;
    if (!xp || !levelUp) return null;
    const done = [xp.enabled && xp.rules.some((rule) => rule.enabled), levelUp.announce || levelUp.rewards.length > 0, undefined];
    if (done[0] && done[1]) return null;
    return (
        <Card className="mb-4">
            <CardContent className="space-y-3">
                <div>
                    <h2 className="font-semibold">{tr('levels.setupTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{tr('levels.setupDescription')}</p>
                </div>
                <ol className="grid gap-2 sm:grid-cols-3">
                    {steps.map((step, index) => (
                        <li key={step.value}>
                            <button
                                type="button"
                                onClick={() => onOpen(step.value)}
                                {...intent(step.preload)}
                                className="flex h-full w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                            >
                                <StepNumber n={index + 1} done={done[index]} />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">{step.label}</span>
                                    <span className="block text-xs text-muted-foreground">{step.hint}</span>
                                    <span className={cn('mt-1 block text-xs font-medium', done[index] ? 'text-success' : 'text-muted-foreground')}>
                                        {done[index] === undefined ? tr('levels.stepOptional') : done[index] ? tr('levels.stepDone') : tr('levels.stepTodo')}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
            </CardContent>
        </Card>
    );
}
