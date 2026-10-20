import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { fundQuery, fundsQuery } from '@/api/fund';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { FundsBodySkeleton } from '@/components/skeleton/editor-pages';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { FundsOverviewSummary, TopicListItem } from '@/features/funds/funds-overview';
import { TopicDialog } from '@/features/funds/topic-dialog';
import { TopicPanel } from '@/features/funds/topic-panel';
import { useGuildId } from '@/hooks/use-guild';

const searchSchema = z.object({
    topic: z.coerce.number().int().positive().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/servers/$guildId/_manage/funds')({
    validateSearch: searchSchema,
    // เริ่มโหลดรายการหัวข้อ (และหัวข้อที่เลือกอยู่ใน URL) พร้อมกับโค้ดของหน้า — ไม่รอให้หน้า render ก่อน
    loaderDeps: ({ search }) => ({ topic: search.topic }),
    loader: ({ context: { queryClient }, params, deps }) => {
        void queryClient.prefetchQuery(fundsQuery(params.guildId));
        if (deps.topic) void queryClient.prefetchQuery(fundQuery(params.guildId, deps.topic));
    },
    component: FundsPage,
});

// ==========================================
// 💰 เก็บเงินตามเป้า — รายการหัวข้อด้านซ้าย + แผงจัดการหัวข้อที่เลือก (?topic=id)
// ==========================================
function FundsPage() {
    const guildId = useGuildId();
    const { topic: selectedId } = Route.useSearch();
    const navigate = useNavigate();
    const list = useQuery(fundsQuery(guildId));
    const [createOpen, setCreateOpen] = useState(false);
    const [topicSearch, setTopicSearch] = useState('');

    const select = (topic: number | undefined) => void navigate({ to: '/servers/$guildId/funds', params: { guildId }, search: { topic }, replace: true });
    const topics = useMemo(() => list.data ?? [], [list.data]);

    const filteredTopics = useMemo(() => {
        const q = topicSearch.trim().toLowerCase();
        if (!q) return topics;
        return topics.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }, [topics, topicSearch]);

    const current = topics.find((t) => t.id === selectedId) ?? topics[0];

    return (
        <>
            <PageHeader
                help="funds"
                title="เก็บเงินตามเป้า"
                description="สร้างหัวข้อเก็บเงินได้หลายเรื่อง ตั้งยอดคงที่หรือรายวัน เพิ่ม/ลบคน บันทึกและแก้ไขการรับเงิน วิเคราะห์กราฟแดชบอร์ด ส่งออก CSV และส่งรายงานเข้า Discord"
                actions={
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus /> สร้างหัวข้อ
                    </Button>
                }
            />

            {list.isLoading ? (
                <FundsBodySkeleton />
            ) : list.error ? (
                <ErrorState error={list.error} />
            ) : topics.length === 0 ? (
                <EmptyState>ยังไม่มีหัวข้อเก็บเงิน — กด “สร้างหัวข้อ” เพื่อเริ่ม</EmptyState>
            ) : (
                <>
                    <FundsOverviewSummary topics={topics} />
                    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
                        <div className="space-y-2">
                            {topics.length > 3 && <SearchInput value={topicSearch} onChange={setTopicSearch} placeholder="ค้นหาหัวข้อ..." />}
                            {filteredTopics.length === 0 ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">ไม่พบหัวข้อที่ค้นหา</p>
                            ) : (
                                filteredTopics.map((topic) => (
                                    <TopicListItem key={topic.id} topic={topic} active={topic.id === current?.id} onSelect={() => select(topic.id)} />
                                ))
                            )}
                        </div>
                        {current && <TopicPanel key={current.id} topicId={current.id} onDeleted={() => select(undefined)} />}
                    </div>
                </>
            )}

            <TopicDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(topic) => select(topic.id)} />
        </>
    );
}
