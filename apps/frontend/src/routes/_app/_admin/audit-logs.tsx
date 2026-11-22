import { tr } from '../../../lib/i18n';
import { createFileRoute } from '@tanstack/react-router';
import { auditActionsQuery, auditLogsQuery } from '@/api/admin';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardAudit } from '@/features/audit/audit-panels';

// ประวัติทั้งระบบ (ทุกเซิร์ฟเวอร์ + การเข้าสู่ระบบ / จัดการผู้ใช้) — ADMIN เท่านั้น
export const Route = createFileRoute('/_app/_admin/audit-logs')({
    loader: ({ context: { queryClient } }) =>
        Promise.all([
            queryClient.ensureInfiniteQueryData(auditLogsQuery({})).catch(() => undefined),
            queryClient.ensureQueryData(auditActionsQuery()).catch(() => undefined),
        ]),
    component: SystemAuditPage,
});

function SystemAuditPage() {
    return (
        <>
            <PageHeader help="systemAudit" title={tr('common.systemHistory')} description={tr('auditLogs.everyDashboardActionSystemWideLogins')} />
            <Card>
                <CardContent>
                    <DashboardAudit />
                </CardContent>
            </Card>
        </>
    );
}
