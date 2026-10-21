import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeBone, Bone, ButtonBone, CardSkeleton, FieldBone, InputBone, Line, PageHeaderSkeleton, SkeletonStack, TableSkeleton } from './primitives';

// ==========================================
// 🦴 โครงร่างหน้านอกเซิร์ฟเวอร์ — เลือกเซิร์ฟเวอร์ / บัญชีของฉัน / ผู้ดูแลระบบ
// ==========================================

// การ์ดเซิร์ฟเวอร์ (ไอคอน + ชื่อ + ป้าย) และการ์ดเชิญบอท — ใช้ตอนรายชื่อเซิร์ฟเวอร์กำลังโหลด
export function GuildListSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="grid gap-3 md:grid-cols-2" role="status" aria-busy="true" aria-label="กำลังโหลดเซิร์ฟเวอร์">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4">
                    <Bone className="size-14 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1 space-y-1">
                        <Line size="base" className="w-40" />
                        <div className="flex items-center gap-1.5">
                            <Bone className="h-3 w-14" />
                            <BadgeBone />
                        </div>
                    </div>
                    <Bone className="size-5 rounded" />
                </div>
            ))}
            <div className="flex items-center gap-4 rounded-xl border border-dashed p-4">
                <Bone className="size-14 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1 space-y-1">
                    <Line size="base" className="w-48" />
                    <Line size="xs" className="w-56" />
                </div>
                <ButtonBone />
            </div>
        </div>
    );
}

export function ServersPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดหน้าเซิร์ฟเวอร์">
            <PageHeaderSkeleton actions={<ButtonBone />} />
            <GuildListSkeleton />
        </SkeletonStack>
    );
}

export function AccountPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดบัญชี">
            <PageHeaderSkeleton />
            <div className="grid gap-6 lg:grid-cols-2">
                <CardSkeleton description={false} contentClassName="space-y-4">
                    <div className="flex items-center gap-4">
                        <Bone className="size-16 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-1">
                            <Line size="lg" className="w-40" />
                            <Line size="sm" className="w-32" />
                            <BadgeBone />
                        </div>
                    </div>
                    <Line size="sm" className="w-3/4" />
                </CardSkeleton>
                <CardSkeleton>
                    <div className="flex items-center gap-3">
                        <Bone className="size-10 shrink-0 rounded-full" />
                        <Line size="sm" className="w-36" />
                        <ButtonBone className="ml-auto w-40" />
                    </div>
                </CardSkeleton>
                <CardSkeleton description={false} contentClassName="grid gap-3">
                    <FieldBone />
                    <FieldBone />
                    <FieldBone />
                    <ButtonBone className="w-32" />
                </CardSkeleton>
                <CardSkeleton>
                    <ButtonBone className="w-48" />
                </CardSkeleton>
            </div>
        </SkeletonStack>
    );
}

// ตารางผู้ใช้ (7 คอลัมน์) — ใช้ทั้งตอนเปิดหน้าและตอนรายชื่อกำลังโหลด
export const UsersTableSkeleton = () => <TableSkeleton columns={7} rows={5} twoLine={[0]} />;

export function AdminUsersPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดผู้ใช้">
            <PageHeaderSkeleton />
            <CardSkeleton>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_8rem_auto]">
                    <InputBone />
                    <InputBone />
                    <InputBone />
                    <InputBone />
                    <ButtonBone />
                </div>
            </CardSkeleton>
            <Card>
                <CardContent>
                    <UsersTableSkeleton />
                </CardContent>
            </Card>
        </SkeletonStack>
    );
}

// เนื้อหาไฟล์ log (กล่องดำสูง 60vh) — บรรทัดยาวสั้นสลับกัน
const LOG_LINE_WIDTHS = ['w-11/12', 'w-3/4', 'w-5/6', 'w-2/3', 'w-full', 'w-4/5', 'w-1/2', 'w-5/6', 'w-3/4', 'w-2/3', 'w-11/12', 'w-3/5'];

export function LogContentSkeleton() {
    return (
        <div className="h-[60vh] space-y-2.5 overflow-hidden rounded-lg border bg-black/40 p-4" role="status" aria-busy="true" aria-label="กำลังโหลดไฟล์บันทึก">
            {LOG_LINE_WIDTHS.map((width, i) => (
                <Skeleton key={i} className={`h-3 bg-white/10 ${width}`} />
            ))}
        </div>
    );
}

export function AdminLogsPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดไฟล์บันทึก">
            <PageHeaderSkeleton />
            <Card>
                <CardContent className="space-y-4">
                    <div className="flex items-end gap-2">
                        <FieldBone className="w-full max-w-sm" />
                        <ButtonBone size="icon" />
                    </div>
                    <LogContentSkeleton />
                </CardContent>
            </Card>
        </SkeletonStack>
    );
}

// หน้าที่ยังไม่มีโครงร่างเฉพาะ — หัวหน้า + การ์ด 2 ใบ
export function GenericPageSkeleton() {
    return (
        <SkeletonStack>
            <PageHeaderSkeleton />
            <CardSkeleton contentClassName="grid gap-4">
                <FieldBone hint />
                <FieldBone hint />
            </CardSkeleton>
            <CardSkeleton contentClassName="space-y-2">
                <Line />
                <Line className="w-4/5" />
                <Line className="w-2/3" />
            </CardSkeleton>
        </SkeletonStack>
    );
}
