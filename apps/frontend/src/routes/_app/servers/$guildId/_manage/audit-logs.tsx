import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { activityMetaQuery, activityQuery, auditActionsQuery, auditLogsQuery } from '@/api/admin';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardAudit, DiscordActivity } from '@/features/audit/audit-panels';
import { useGuildId } from '@/hooks/use-guild';
import { usePreloadTasks } from '@/hooks/use-preload-tasks';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/audit-logs')({
    // ?q= คำค้นเริ่มต้นของแท็บเหตุการณ์ใน Discord (ลิงก์จากช่อง ⌘K)
    validateSearch: (search: Record<string, unknown>): { source?: 'dashboard' | 'discord'; q?: string } => ({
        source: search.source === 'discord' ? 'discord' : 'dashboard',
        ...((typeof search.q === 'string' || typeof search.q === 'number') && String(search.q).trim() ? { q: String(search.q).trim().slice(0, 100) } : {}),
    }),
    loaderDeps: ({ search }) => ({ source: search.source }),
    loader: ({ context: { queryClient }, params, deps }) =>
        deps.source === 'discord'
            ? Promise.all([
                  queryClient.ensureInfiniteQueryData(activityQuery(params.guildId, { hours: 168, includeBots: false })).catch(() => undefined),
                  queryClient.ensureQueryData(activityMetaQuery(params.guildId)).catch(() => undefined),
              ])
            : Promise.all([
                  queryClient.ensureInfiniteQueryData(auditLogsQuery({}, params.guildId)).catch(() => undefined),
                  queryClient.ensureQueryData(auditActionsQuery(params.guildId)).catch(() => undefined),
              ]),
    component: AuditLogsPage,
});

function AuditLogsPage() {
    const guildId = useGuildId();
    const { source = 'dashboard', q } = Route.useSearch();
    const navigate = useNavigate();
    const router = useRouter();
    const tasks = useMemo(
        () =>
            (['dashboard', 'discord'] as const).map((target) => ({
                key: `${guildId}:audit:${target}`,
                run: async () => {
                    if (source !== target) await router.preloadRoute({ to: '/servers/$guildId/audit-logs', params: { guildId }, search: { source: target } });
                },
            })),
        [guildId, source, router],
    );
    const prioritize = usePreloadTasks(tasks);
    return (
        <>
            <PageHeader
                help="audit"
                title="ประวัติเซิร์ฟเวอร์"
                description="ประวัติของเซิร์ฟเวอร์นี้ — ทั้งการตั้งค่าที่แก้ผ่าน Dashboard และเหตุการณ์ที่เกิดในเซิร์ฟเวอร์ Discord"
            />
            <Card>
                <CardContent>
                    <Tabs
                        value={source}
                        onValueChange={(value) =>
                            void navigate({ to: '/servers/$guildId/audit-logs', params: { guildId }, search: { source: value as 'dashboard' | 'discord' } })
                        }
                    >
                        <TabsList className="mb-4">
                            <TabsTrigger
                                value="dashboard"
                                onMouseEnter={() => prioritize(`${guildId}:audit:dashboard`)}
                                onFocus={() => prioritize(`${guildId}:audit:dashboard`)}
                                onTouchStart={() => prioritize(`${guildId}:audit:dashboard`)}
                            >
                                การตั้งค่าบน Dashboard
                            </TabsTrigger>
                            <TabsTrigger
                                value="discord"
                                onMouseEnter={() => prioritize(`${guildId}:audit:discord`)}
                                onFocus={() => prioritize(`${guildId}:audit:discord`)}
                                onTouchStart={() => prioritize(`${guildId}:audit:discord`)}
                            >
                                เหตุการณ์ในเซิร์ฟเวอร์ Discord
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="dashboard">
                            <DashboardAudit guildId={guildId} />
                        </TabsContent>
                        <TabsContent value="discord">
                            <DiscordActivity key={q ?? ''} guildId={guildId} initialQuery={q} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </>
    );
}
