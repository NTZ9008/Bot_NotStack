import { xpAtLevel, xpForNextLevel } from '@notstack/shared';
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
import { stringSearch } from '@/lib/search-params';

// ?q=<ชื่อ หรือ User ID> → เปิดหน้ามาพร้อมค้นหาสมาชิกคนนั้นในตารางอันดับ (ลิงก์จากช่อง ⌘K)
export const Route = createFileRoute('/_app/servers/$guildId/levels')({
    validateSearch: (search: Record<string, unknown>) => stringSearch(search, ['q'] as const),
    loader: ({ context, params }) => context.queryClient.ensureQueryData(levelsQuery(params.guildId, { page: 1, pageSize: 25 })),
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
                        aria-label="ค้นหาสมาชิกด้วยชื่อหรือ Discord User ID"
                        className="max-w-xs"
                        placeholder="ชื่อขึ้นต้น หรือ Discord User ID"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Button type="submit" variant="outline">
                        ค้นหา
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
                        ทั้งหมด
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
                            อันดับของฉัน
                        </Button>
                    )}
                </form>
                {query.data?.searchLimited && <p className="text-sm text-amber-500">พบชื่อที่ตรงกันอย่างน้อย 100 คน กรุณาพิมพ์ชื่อให้เฉพาะเจาะจงขึ้น</p>}
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
                                        <th className="p-3">อันดับ</th>
                                        <th className="p-3">สมาชิก</th>
                                        <th className="p-3">เลเวล</th>
                                        <th className="p-3">XP สะสม / เลเวลถัดไป</th>
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
                                                        aria-label={`ความคืบหน้าเลเวลของ ${row.username}`}
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
                                                ยังไม่มีข้อมูล XP ที่ตรงกับการค้นหา
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                                {query.data?.total.toLocaleString()} คน · หน้า {page}
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>
                                    ก่อนหน้า
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={page * 25 >= (query.data?.total ?? 0) || query.isFetching}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    ถัดไป
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
            <PageHeader help="levels" title="อันดับและเลเวล" description={`ระบบประสบการณ์ของ ${guild.name} — อันดับ การ์ด /rank กฎกิจกรรม และประวัติ XP`} />
            <Tabs defaultValue="leaderboard" key={guild.id}>
                <TabsList className="mb-4 flex h-auto flex-wrap">
                    <TabsTrigger value="leaderboard">อันดับสมาชิก</TabsTrigger>
                    <TabsTrigger value="my-card" {...intent(['meta', 'mine'])}>
                        การ์ดของฉัน
                    </TabsTrigger>
                    {manage && (
                        <>
                            <TabsTrigger value="card-theme" {...intent(['meta', 'theme', 'welcome-meta', 'assets', 'cards'])}>
                                ธีมการ์ด
                            </TabsTrigger>
                            <TabsTrigger value="level-up" {...intent(['meta', 'theme', 'level-up', 'channels', 'roles'])}>
                                เลเวลอัป & ยศรางวัล
                            </TabsTrigger>
                            <TabsTrigger value="settings" {...intent(['settings', 'channels', 'roles'])}>
                                กฎและอัตรา XP
                            </TabsTrigger>
                            <TabsTrigger value="members">จัดการสมาชิก</TabsTrigger>
                            <TabsTrigger value="history" {...intent(['history'])}>
                                ประวัติ
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
