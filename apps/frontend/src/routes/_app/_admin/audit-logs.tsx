import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardAudit } from '@/features/audit/audit-panels';

// ประวัติทั้งระบบ (ทุกเซิร์ฟเวอร์ + การเข้าสู่ระบบ / จัดการผู้ใช้) — ADMIN เท่านั้น
export const Route = createFileRoute('/_app/_admin/audit-logs')({
    component: SystemAuditPage,
});

function SystemAuditPage() {
    return (
        <>
            <PageHeader title="System Audit" description="ทุกการกระทำบน Dashboard ทั้งระบบ — การเข้าสู่ระบบ จัดการผู้ใช้ และการตั้งค่าของทุกเซิร์ฟเวอร์" />
            <Card>
                <CardContent>
                    <DashboardAudit />
                </CardContent>
            </Card>
        </>
    );
}
