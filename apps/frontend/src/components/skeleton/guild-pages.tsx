import { CONFIG_GROUPS, CONFIG_KEYS } from '@notstack/shared';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    BadgeBone,
    Bone,
    ButtonBone,
    CardSkeleton,
    ChartSkeleton,
    DiscordPreviewSkeleton,
    FieldBone,
    InputBone,
    LabelBone,
    Line,
    NoticeBone,
    PageHeaderSkeleton,
    SkeletonStack,
    StatTileSkeleton,
    SwitchBone,
    SwitchRowBone,
    TableSkeleton,
    TabsBone,
    ToggleGroupBone,
} from './primitives';

// ==========================================
// 🦴 โครงร่างหน้าในเซิร์ฟเวอร์ — ภาพรวม / ตั้งค่า / ประกาศ / สิทธิ์ห้อง / ห้องเสียง / ประวัติ / PR
// ==========================================

// ---------- ภาพรวม ----------
// ตัวเลข 8 กล่อง + กราฟ 4 ใบ + ตาราง 3 ใบ (ส่วนที่รอข้อมูลสถิติ)
export function OverviewStatsSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดสถิติ">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                    <StatTileSkeleton key={i} />
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                    <CardSkeleton key={i} description={false}>
                        <ChartSkeleton />
                    </CardSkeleton>
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <CardSkeleton description={false} className="lg:col-span-2">
                    <TableSkeleton columns={7} rows={5} twoLine={[1]} />
                </CardSkeleton>
                <CardSkeleton description={false}>
                    <TableSkeleton columns={4} rows={5} twoLine={[1]} />
                </CardSkeleton>
                <CardSkeleton description={false}>
                    <TableSkeleton columns={5} rows={5} twoLine={[1]} />
                </CardSkeleton>
            </div>
        </SkeletonStack>
    );
}

// การ์ด "เริ่มต้นใช้งานบอท" (ลิงก์ 3 อัน + ปุ่มดูทุกฟีเจอร์)
function GettingStartedSkeleton() {
    return (
        <CardSkeleton className="border-primary/25 bg-primary/5" contentClassName="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border bg-card p-4">
                        <Bone className="size-5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                            <Line size="sm" className="w-32" />
                            <Line size="xs" />
                            <Line size="xs" className="w-2/3" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card/50 p-3">
                <Line size="sm" className="w-40" />
                <Bone className="size-4" />
            </div>
        </CardSkeleton>
    );
}

// แถบเลือกช่วงเวลา (ช่วงเวลาสำเร็จรูป + ความละเอียด + รวมบอท + รีเฟรช)
function OverviewFilterSkeleton() {
    return (
        <Card>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <ToggleGroupBone count={5} />
                    <div className="flex flex-wrap items-center gap-2">
                        <InputBone className="w-48" />
                        <Bone className="h-8 w-28 rounded-lg" />
                        <ButtonBone />
                    </div>
                </div>
                <Line size="sm" className="w-80 max-w-full" />
            </CardContent>
        </Card>
    );
}

export function OverviewPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดภาพรวม">
            <PageHeaderSkeleton />
            <GettingStartedSkeleton />
            <OverviewFilterSkeleton />
            <OverviewStatsSkeleton />
        </SkeletonStack>
    );
}

// ---------- ตั้งค่าบอท ----------
// จำนวนแถวตามรายการตั้งค่าจริงในแต่ละกลุ่ม (ห้อง = dropdown, ความสามารถ = สวิตช์)
export function ConfigBodySkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า">
            {CONFIG_GROUPS.map((group) => (
                <CardSkeleton key={group} contentClassName="grid gap-4">
                    {CONFIG_KEYS.filter((field) => field.group === group).map((field) =>
                        field.type === 'boolean' ? (
                            <SwitchRowBone key={field.key} />
                        ) : (
                            <div key={field.key} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-4">
                                <div className="space-y-1.5">
                                    <LabelBone className="w-32" />
                                    <Line size="xs" className="w-4/5" />
                                </div>
                                <InputBone />
                            </div>
                        ),
                    )}
                </CardSkeleton>
            ))}
        </SkeletonStack>
    );
}

export function ConfigPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า">
            <PageHeaderSkeleton />
            <ConfigBodySkeleton />
        </SkeletonStack>
    );
}

// ---------- ส่งประกาศ ----------
export function NewsPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดหน้าประกาศ">
            <PageHeaderSkeleton />
            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardContent className="space-y-4">
                        <Line size="sm" className="w-72 max-w-full" />
                        <FieldBone />
                        <FieldBone hint />
                        <FieldBone hint>
                            <div>
                                <Bone className="h-9 w-full rounded-t-lg rounded-b-none" />
                                <Bone className="mt-px h-[15.5rem] w-full rounded-t-none rounded-b-lg" />
                            </div>
                        </FieldBone>
                        <Bone className="h-11 w-full rounded-lg" />
                        <ButtonBone className="w-full" />
                    </CardContent>
                </Card>
                <div className="space-y-2">
                    <Line size="sm" className="w-44" />
                    <DiscordPreviewSkeleton>
                        <div className="max-w-lg space-y-2 rounded border-l-4 border-white/10 bg-[#2b2d31] p-3">
                            <Bone className="h-4 w-1/2 bg-white/10" />
                            <Bone className="h-3 w-full bg-white/10" />
                            <Bone className="h-3 w-5/6 bg-white/10" />
                            <Bone className="h-3 w-2/3 bg-white/10" />
                        </div>
                    </DiscordPreviewSkeleton>
                </div>
            </div>
        </SkeletonStack>
    );
}

// ---------- ให้สิทธิ์เข้าห้อง ----------
// ตารางผู้ได้รับสิทธิ์ (5 คอลัมน์)
export const RoomAccessTableSkeleton = () => <TableSkeleton columns={5} rows={4} twoLine={[0]} />;

export function RoomAccessPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดสิทธิ์เข้าห้อง">
            <PageHeaderSkeleton />
            <CardSkeleton contentClassName="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <BadgeBone className="h-7 w-28" />
                    <BadgeBone className="h-7 w-24" />
                    <BadgeBone className="h-7 w-32" />
                </div>
                <div className="flex max-w-xl gap-2">
                    <InputBone />
                    <ButtonBone className="w-20" />
                </div>
            </CardSkeleton>
            <Card>
                <CardContent className="grid gap-4 md:max-w-xl">
                    <FieldBone hint />
                    <FieldBone />
                    <FieldBone />
                    <ButtonBone className="w-full" />
                </CardContent>
            </Card>
            <CardSkeleton>
                <RoomAccessTableSkeleton />
            </CardSkeleton>
        </SkeletonStack>
    );
}

// ---------- ดูแลห้องเสียง ----------
// การ์ดของแต่ละห้อง (สวิตช์ + ช่องเพิ่มสมาชิก + รายชื่อ)
export function VoiceGuardCardsSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2" role="status" aria-busy="true" aria-label="กำลังโหลดห้องเสียง">
            {Array.from({ length: 2 }, (_, i) => (
                <Card key={i}>
                    <CardHeader className="flex-row items-center justify-between gap-2">
                        <Line size="base" className="w-40" />
                        <div className="flex items-center gap-2">
                            <SwitchBone />
                            <ButtonBone size="icon-sm" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Bone className="h-10 w-full rounded-lg" />
                        <InputBone />
                        <div className="space-y-1.5">
                            {Array.from({ length: 2 }, (_, r) => (
                                <div key={r} className="flex items-center gap-3 rounded-lg border px-3 py-1.5">
                                    <Bone className="size-7 shrink-0 rounded-full" />
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <Bone className="h-3.5 w-28" />
                                        <Bone className="h-3 w-36" />
                                    </div>
                                    <ButtonBone size="icon-xs" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export function VoiceGuardPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดห้องเสียง">
            <PageHeaderSkeleton actions={<ToggleGroupBone count={2} />} />
            <NoticeBone />
            <Card>
                <CardContent>
                    <FieldBone>
                        <div className="flex gap-2 md:max-w-xl">
                            <InputBone />
                            <ButtonBone />
                        </div>
                    </FieldBone>
                </CardContent>
            </Card>
            <VoiceGuardCardsSkeleton />
        </SkeletonStack>
    );
}

// ---------- ประวัติเซิร์ฟเวอร์ ----------
// แถวตัวกรอง + ตาราง (ใช้ทั้งแท็บ Dashboard และ Discord)
export function AuditTableSkeleton() {
    return <TableSkeleton columns={7} rows={8} />;
}

export function AuditPanelSkeleton() {
    return (
        <div className="space-y-4" role="status" aria-busy="true" aria-label="กำลังโหลดประวัติ">
            <div className="flex flex-wrap items-center gap-2">
                <InputBone className="w-64" />
                <InputBone className="w-44" />
                <InputBone className="w-64" />
                <ButtonBone />
            </div>
            <AuditTableSkeleton />
        </div>
    );
}

export function AuditLogsPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดประวัติ">
            <PageHeaderSkeleton />
            <Card>
                <CardContent>
                    <TabsBone count={2} className="mb-4" />
                    <AuditPanelSkeleton />
                </CardContent>
            </Card>
        </SkeletonStack>
    );
}

// ---------- แจ้งเตือน GitHub PR ----------
// การ์ดสถิติ (ตัวเลือกช่วงเวลา + ตัวเลข 4 กล่อง + กราฟ)
export function PrStatsBodySkeleton() {
    return (
        <div className="space-y-5" role="status" aria-busy="true" aria-label="กำลังโหลดสถิติ PR">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="rounded-xl border p-4">
                        <Line size="2xl" className="w-16" />
                        <Line size="xs" className="mt-1 w-24" />
                    </div>
                ))}
            </div>
            <Line size="sm" className="w-64" />
            <ChartSkeleton className="h-72" />
        </div>
    );
}

function PrStatsCardSkeleton() {
    return (
        <CardSkeleton contentClassName="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <ToggleGroupBone count={3} />
                <div className="flex items-center gap-2">
                    <ToggleGroupBone count={2} />
                    <ButtonBone size="icon" />
                </div>
            </div>
            <PrStatsBodySkeleton />
        </CardSkeleton>
    );
}

function MapEditorSkeleton({ rows }: { rows: number }) {
    return (
        <CardSkeleton contentClassName="space-y-3">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex gap-2">
                    <InputBone />
                    <InputBone />
                    <ButtonBone size="icon" />
                </div>
            ))}
            <div className="flex flex-wrap gap-2">
                <ButtonBone className="w-36" />
                <ButtonBone className="w-48" />
            </div>
        </CardSkeleton>
    );
}

export function PrBotBodySkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า PR">
            <PrStatsCardSkeleton />
            <CardSkeleton contentClassName="grid gap-4">
                <FieldBone>
                    <div className="flex gap-2">
                        <InputBone />
                        <ButtonBone className="w-20" />
                    </div>
                </FieldBone>
                <FieldBone hint>
                    <div className="flex gap-2">
                        <InputBone />
                        <ButtonBone size="icon" />
                        <ButtonBone className="w-20" />
                        <ButtonBone className="w-28" />
                    </div>
                </FieldBone>
            </CardSkeleton>
            <CardSkeleton>
                <FieldBone label={false} hint>
                    <div className="flex gap-2">
                        <InputBone />
                        <ButtonBone className="w-24" />
                    </div>
                </FieldBone>
            </CardSkeleton>
            <MapEditorSkeleton rows={2} />
            <MapEditorSkeleton rows={2} />
        </SkeletonStack>
    );
}

export function PrBotPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า PR">
            <PageHeaderSkeleton />
            <PrBotBodySkeleton />
        </SkeletonStack>
    );
}
