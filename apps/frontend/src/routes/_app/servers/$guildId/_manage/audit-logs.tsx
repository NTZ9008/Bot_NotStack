import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardAudit, DiscordActivity } from '@/features/audit/audit-panels';
import { useGuildId } from '@/hooks/use-guild';

const searchSchema = z.object({
    source: z.enum(['dashboard', 'discord']).catch('dashboard').default('dashboard'),
});

export const Route = createFileRoute('/_app/servers/$guildId/_manage/audit-logs')({
    validateSearch: searchSchema,
    component: AuditLogsPage,
});

function AuditLogsPage() {
    const guildId = useGuildId();
    const { source } = Route.useSearch();
    const navigate = useNavigate();
    return (
        <>
            <PageHeader title="Audit & Activity" description="ประวัติของเซิร์ฟเวอร์นี้ — ทั้งการตั้งค่าที่แก้ผ่าน Dashboard และเหตุการณ์ที่เกิดในเซิร์ฟเวอร์ Discord" />
            <Card>
                <CardContent>
                    <Tabs
                        value={source}
                        onValueChange={(value) =>
                            void navigate({ to: '/servers/$guildId/audit-logs', params: { guildId }, search: { source: value as 'dashboard' | 'discord' } })
                        }
                    >
                        <TabsList className="mb-4">
                            <TabsTrigger value="dashboard">การตั้งค่าบน Dashboard</TabsTrigger>
                            <TabsTrigger value="discord">เหตุการณ์ในเซิร์ฟเวอร์ Discord</TabsTrigger>
                        </TabsList>
                        <TabsContent value="dashboard">
                            <DashboardAudit guildId={guildId} />
                        </TabsContent>
                        <TabsContent value="discord">
                            <DiscordActivity guildId={guildId} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </>
    );
}
