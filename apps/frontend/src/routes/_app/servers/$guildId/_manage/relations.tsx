import { createFileRoute } from '@tanstack/react-router';
import { relationBoardQuery } from '@/api/relations';
import { PageHeader } from '@/components/page-header';
import { RelationBoardView } from '@/features/relations/relation-board';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/relations')({
    loader: ({ context: { queryClient }, params }) => queryClient.prefetchQuery(relationBoardQuery(params.guildId, { days: 30, includeBots: false })),
    component: RelationsPage,
});

function RelationsPage() {
    const guildId = useGuildId();
    return (
        <>
            <PageHeader help="relations" title="กระดานความสัมพันธ์" description="ดูว่าใครเกี่ยวข้องกับใคร จากประวัติห้องเสียง แชท และการลงมือของแอดมินในเซิร์ฟเวอร์" />
            <RelationBoardView guildId={guildId} />
        </>
    );
}
