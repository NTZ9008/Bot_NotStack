import { tr } from '../../../../../lib/i18n';
import { positiveSearchId } from '@/lib/search-params';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from '@/components/icons';
import { useMemo, useState } from 'react';
import { fundQuery, fundsQuery } from '@/api/fund';
import { PageHeader } from '@/components/page-header';
import { PluginRouteGuard } from '@/components/plugin-gate';
import { SearchInput } from '@/components/search-input';
import { FundsBodySkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { FundsEmptyOnboarding, FundsOverviewSummary, TopicListItem } from '@/features/funds/funds-overview';
import { TopicDialog } from '@/features/funds/topic-dialog';
import { TopicPanel } from '@/features/funds/topic-panel';
import type { TopicTemplate } from '@/features/funds/utils';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/funds')({
    validateSearch: (search: Record<string, unknown>): { topic?: number } => ({ topic: positiveSearchId(search.topic) }),
    // เริ่มโหลดรายการหัวข้อ (และหัวข้อที่เลือกอยู่ใน URL) พร้อมกับโค้ดของหน้า — ไม่รอให้หน้า render ก่อน
    loaderDeps: ({ search }) => ({ topic: search.topic }),
    loader: ({ context, params, deps, preload }) => {
        if (!context.guild.installedPlugins?.includes('savings-goal')) return;
        const loading = Promise.all([
            context.queryClient.prefetchQuery(fundsQuery(params.guildId)),
            deps.topic ? context.queryClient.prefetchQuery(fundQuery(params.guildId, deps.topic)) : undefined,
        ]);
        return preload ? loading : undefined;
    },
    component: FundsPage,
});

type TopicStatusFilter = 'all' | 'open' | 'closed';

// ==========================================
// 💰 เก็บเงินตามเป้า — รายการหัวข้อด้านซ้าย + แผงจัดการหัวข้อที่เลือก (?topic=id)
// ==========================================
function FundsPage() {
    return (
        <PluginRouteGuard
            pluginId="savings-goal"
            help="funds"
            title={tr('common.fundCollection')}
            description={tr('funds.createTopicsSetAFixedOr')}
        >
            {() => <FundsPageContent />}
        </PluginRouteGuard>
    );
}

function FundsPageContent() {
    const guildId = useGuildId();
    const { topic: selectedId } = Route.useSearch();
    const navigate = useNavigate();
    const list = useQuery(fundsQuery(guildId));
    const [createOpen, setCreateOpen] = useState(false);
    const [initialTemplate, setInitialTemplate] = useState<TopicTemplate | null>(null);
    const [topicSearch, setTopicSearch] = useState('');
    const [topicFilter, setTopicFilter] = useState<TopicStatusFilter>('all');

    const select = (topic: number | undefined) => void navigate({ to: '/servers/$guildId/funds', params: { guildId }, search: { topic }, replace: true });
    const topics = useMemo(() => list.data ?? [], [list.data]);

    const openCount = useMemo(() => topics.filter((t) => !t.closed).length, [topics]);
    const closedCount = topics.length - openCount;

    const filteredTopics = useMemo(() => {
        const q = topicSearch.trim().toLowerCase();
        return topics.filter((t) => {
            if (topicFilter === 'open' && t.closed) return false;
            if (topicFilter === 'closed' && !t.closed) return false;
            if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [topics, topicSearch, topicFilter]);

    const current = topics.find((t) => t.id === selectedId) ?? filteredTopics[0] ?? topics[0];

    const openCreateBlank = () => {
        setInitialTemplate(null);
        setCreateOpen(true);
    };

    const openCreateWithTemplate = (template: TopicTemplate) => {
        setInitialTemplate(template);
        setCreateOpen(true);
    };

    return (
        <>
            <PageHeader
                help="funds"
                title={tr('common.fundCollection')}
                description={tr('funds.createTopicsSetAFixedOr')}
                actions={
                    <Button onClick={openCreateBlank}>
                        <Plus /> {tr('funds.createTopic')}
                    </Button>
                }
            />

            {list.isLoading ? (
                <FundsBodySkeleton />
            ) : list.error ? (
                <ErrorState error={list.error} />
            ) : topics.length === 0 ? (
                <FundsEmptyOnboarding onCreateBlank={openCreateBlank} onSelectTemplate={openCreateWithTemplate} />
            ) : (
                <>
                    <FundsOverviewSummary topics={topics} />
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                        <aside className="min-w-0 space-y-3 rounded-xl border bg-card/50 p-3">
                            <div className="flex items-center justify-between gap-2 px-1">
                                <h2 className="text-sm font-semibold">{tr('funds.fundTopics')}</h2>
                                <span className="text-xs text-muted-foreground">
                                    {tr('common.total')} {topics.length}
                                </span>
                            </div>
                            {topics.length > 2 && <SearchInput value={topicSearch} onChange={setTopicSearch} placeholder={tr('funds.searchFundTopics')} />}

                            {closedCount > 0 && (
                                <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1">
                                    {(
                                        [
                                            ['all', tr('funds.all3', { 0: topics.length })],
                                            ['open', tr('funds.open', { 0: openCount })],
                                            ['closed', tr('funds.closed2', { 0: closedCount })],
                                        ] as const
                                    ).map(([val, label]) => (
                                        <Button
                                            key={val}
                                            type="button"
                                            size="xs"
                                            variant={topicFilter === val ? 'default' : 'ghost'}
                                            className="h-7 min-w-0 px-1.5 text-[11px]"
                                            onClick={() => setTopicFilter(val)}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-2">
                                {filteredTopics.length === 0 ? (
                                    <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
                                        {tr('funds.noTopicsMatchTheSelectedFilters')}
                                    </div>
                                ) : (
                                    filteredTopics.map((topic) => (
                                        <TopicListItem key={topic.id} topic={topic} active={topic.id === current?.id} onSelect={() => select(topic.id)} />
                                    ))
                                )}
                            </div>
                        </aside>
                        {current && <TopicPanel key={current.id} topicId={current.id} onDeleted={() => select(undefined)} />}
                    </div>
                </>
            )}

            <TopicDialog open={createOpen} onOpenChange={setCreateOpen} initialTemplate={initialTemplate} onSaved={(topic) => select(topic.id)} />
        </>
    );
}
