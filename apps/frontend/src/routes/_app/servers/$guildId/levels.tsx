import { xpAtLevel, xpForNextLevel } from '@notstack/shared';
import { useT, tr } from '@/lib/i18n';
import { Award, History, IdCard, Palette, Settings, Trophy, Users } from '@/components/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { levelsQuery } from '@/api/bot';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { xpHistoryQuery, xpSettingsQuery } from '@/api/levels';
import { levelUpQuery, myRankCardQuery, rankMetaQuery, rankThemeQuery } from '@/api/rank-card';
import { welcomeAssetsQuery, welcomeCardsQuery, welcomeMetaQuery } from '@/api/welcome';
import { PageHeader } from '@/components/page-header';
import { RankBadge } from '@/components/rank-badge';
import { LeaderboardTableSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
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

// ?q=<ชื่อ หรือ User ID> → เปิดหน้ามาพร้อมค้นหาสมาชิกคนนั้นในตารางอันดับ (ลิงก์จากช่อง ⌘K)
export const Route = createFileRoute('/_app/servers/$guildId/levels')({
    // พิมพ์ ?q=<User ID> เองใน URL → router แปลงเป็นตัวเลข จึงรับทั้งสองแบบ (ลิงก์จากในแอป router ใส่เครื่องหมายคำพูดให้ ไม่เสียความแม่นยำ)
    validateSearch: (search: Record<string, unknown>): { q?: string } =>
        (typeof search.q === 'string' || typeof search.q === 'number') && String(search.q).trim() ? { q: String(search.q).trim().slice(0, 100) } : {},
    loaderDeps: ({ search }) => ({ q: search.q }),
    loader: ({ context, params, deps }) =>
        context.queryClient.ensureQueryData(levelsQuery(params.guildId, { page: 1, pageSize: 25, ...(deps.q ? { q: deps.q } : {}) })),
    component: LevelsPage,
});
function Leaderboard({ guildId, initialQuery = '' }: { guildId: string; initialQuery?: string }) {
    const { user } = useAuth();
    const [page, setPage] = useState(1),
        [search, setSearch] = useState(initialQuery),
        [userId, setUserId] = useState(initialQuery);
    const query = useQuery(levelsQuery(guildId, { page, pageSize: 25, ...(userId ? { q: userId } : {}) }));
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
                {query.data?.searchLimited && <p className="text-sm text-amber-700 dark:text-amber-400">{tr('levels.atLeast100NamesMatchPlease')}</p>}
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
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                                {query.data?.total.toLocaleString()} {tr('levels.peoplePage')} {page}
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>
                                    {tr('levels.previous')}
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={page * 25 >= (query.data?.total ?? 0) || query.isFetching}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    {tr('levels.next')}
                                </Button>
                            </div>
                        </div>
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
    return (
        <>
            <PageHeader help="levels" title={tr('common.ranksLevels')} description={t('levels.xpSystemForNameLeaderboardRank', { name: guild.name })} />
            <Tabs defaultValue="leaderboard" key={guild.id}>
                <TabsList variant="line" className="mb-4">
                    <TabsTrigger value="leaderboard">
                        <Trophy /> {tr('levels.leaderboard')}
                    </TabsTrigger>
                    <TabsTrigger value="my-card" {...intent(['meta', 'mine'])}>
                        <IdCard /> {tr('levels.myCard')}
                    </TabsTrigger>
                    {manage && (
                        <>
                            <TabsTrigger value="card-theme" {...intent(['meta', 'theme', 'welcome-meta', 'assets', 'cards'])}>
                                <Palette /> {tr('levels.cardTheme')}
                            </TabsTrigger>
                            <TabsTrigger value="level-up" {...intent(['meta', 'theme', 'level-up', 'channels', 'roles'])}>
                                <Award /> {tr('levels.levelUpsRewardRoles')}
                            </TabsTrigger>
                            <TabsTrigger value="settings" {...intent(['settings', 'channels', 'roles'])}>
                                <Settings /> {tr('levels.xpRulesRates')}
                            </TabsTrigger>
                            <TabsTrigger value="members">
                                <Users /> {tr('levels.manageMembers')}
                            </TabsTrigger>
                            <TabsTrigger value="history" {...intent(['history'])}>
                                <History /> {tr('common.history')}
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
                        <TabsContent value="card-theme">
                            <RankThemePanel guildId={guild.id} />
                        </TabsContent>
                        <TabsContent value="level-up">
                            <LevelUpPanel guildId={guild.id} />
                        </TabsContent>
                        <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
                            <XpSettingsPanel guildId={guild.id} />
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
