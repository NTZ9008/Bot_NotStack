import type { LevelRow } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { levelsQuery } from '@/api/bot';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { RankBadge } from '@/components/rank-badge';
import { ErrorState, LoadingState } from '@/components/states';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useGuild } from '@/hooks/use-guild';
import { formatNumber } from '@/lib/format';

export const Route = createFileRoute('/_app/servers/$guildId/levels')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(levelsQuery(params.guildId)),
    component: LevelsPage,
});

type RankedLevel = LevelRow & { rank: number };

const columns: ColumnDef<RankedLevel>[] = [
    { accessorKey: 'rank', header: 'Rank', cell: ({ row }) => <RankBadge rank={row.original.rank} /> },
    {
        id: 'user',
        accessorFn: (row) => `${row.username} ${row.userId}`,
        header: 'User',
        enableSorting: false,
        cell: ({ row }) => (
            <div>
                <p className="font-medium">{row.original.username}</p>
                <p className="font-mono text-xs text-muted-foreground">{row.original.userId}</p>
            </div>
        ),
    },
    { accessorKey: 'level', header: 'Level', cell: ({ row }) => <span className="font-semibold text-indigo-300">Lvl {row.original.level}</span> },
    { accessorKey: 'xp', header: 'XP', cell: ({ row }) => `${formatNumber(row.original.xp)} XP` },
];

function LevelsPage() {
    const { user } = useAuth();
    const guild = useGuild();
    const { data, isLoading, error } = useQuery(levelsQuery(guild.id));
    const [search, setSearch] = useState('');
    const ranked = useMemo(() => (data ?? []).map((row, i) => ({ ...row, rank: i + 1 })), [data]);

    return (
        <>
            <PageHeader title="User Levels & XP" description={`อันดับผู้ใช้งานใน ${guild.name} — ได้ XP จากการพิมพ์แชทและการอยู่ในห้องเสียง`} />
            <Card>
                <CardContent className="space-y-4">
                    <div className="relative max-w-sm">
                        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input className="pl-8" placeholder="ค้นหาชื่อหรือ User ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    {isLoading ? (
                        <LoadingState />
                    ) : error ? (
                        <ErrorState error={error} />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={ranked}
                            globalFilter={search}
                            empty="ยังไม่มีข้อมูลเลเวล"
                            rowClassName={(row) => (row.userId === user.discordId ? 'bg-primary/10 hover:bg-primary/15' : undefined)}
                        />
                    )}
                </CardContent>
            </Card>
        </>
    );
}
