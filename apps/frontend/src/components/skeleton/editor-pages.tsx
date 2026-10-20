import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    BadgeBone,
    Bone,
    ButtonBone,
    CardSkeleton,
    DiscordPreviewSkeleton,
    FieldBone,
    InputBone,
    LabelBone,
    Line,
    PageHeaderSkeleton,
    SkeletonStack,
    SwitchBone,
    TableSkeleton,
    TabsBone,
} from './primitives';

// ==========================================
// 🦴 โครงร่างหน้าแบบตัวแก้ไข — ต้อนรับ / สภาพอากาศ / Jira / Log Manager / เก็บเงิน
// ==========================================

// หัวการ์ดแบบ "สถานะ (ป้าย + ข้อความ) ซ้าย · สวิตช์เปิดใช้งาน ขวา"
function StatusHeaderSkeleton({ lines = 1 }: { lines?: number }) {
    return (
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                    <BadgeBone />
                    <Line size="sm" className="w-64 max-w-full" />
                </div>
                {lines > 1 && <Line size="xs" className="w-56" />}
            </div>
            <div className="flex items-center gap-2">
                <Bone className="h-3.5 w-16" />
                <SwitchBone />
            </div>
        </CardHeader>
    );
}

// แถวปุ่ม บันทึก / ยกเลิกการแก้ไข / ส่งทดสอบ
function EditorButtonsSkeleton({ widths = ['w-24', 'w-32', 'w-28'] }: { widths?: string[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {widths.map((width, i) => (
                <ButtonBone key={i} className={width} />
            ))}
        </div>
    );
}

// เนื้อหาตัวแก้ไข 2 คอลัมน์: แท็บหมวด + ช่องกรอก (ซ้าย) · ตัวอย่างใน Discord + ปุ่ม (ขวา)
function EditorColumnsSkeleton({ tabs, fields, preview }: { tabs: number; fields: number; preview: ReactNode }) {
    return (
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
                <TabsBone count={tabs} fill />
                {Array.from({ length: fields }, (_, i) => (
                    <FieldBone key={i} hint={i % 2 === 0} />
                ))}
            </div>
            <div className="space-y-4">{preview}</div>
        </CardContent>
    );
}

// ---------- ต้อนรับสมาชิกใหม่ ----------
// รายการการ์ดต้อนรับ (ชื่อ + ห้อง + ป้าย + สวิตช์)
function WelcomeCardListSkeleton() {
    return (
        <CardSkeleton>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="min-w-0 flex-1 space-y-1">
                            <Line size="base" className="w-32" />
                            <Line size="xs" className="w-24" />
                        </div>
                        <BadgeBone />
                        <SwitchBone />
                    </div>
                ))}
            </div>
        </CardSkeleton>
    );
}

export function WelcomePageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการ์ดต้อนรับ">
            <PageHeaderSkeleton actions={<ButtonBone className="w-32" />} />
            <WelcomeCardListSkeleton />
            <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                    <Line size="lg" className="w-40" />
                    <div className="flex items-center gap-2">
                        <Bone className="h-3.5 w-16" />
                        <SwitchBone />
                    </div>
                </CardHeader>
                <EditorColumnsSkeleton
                    tabs={4}
                    fields={5}
                    preview={
                        <>
                            <Line size="sm" className="w-80 max-w-full" />
                            <DiscordPreviewSkeleton aspect="1024 / 450" />
                            <FieldBone hint />
                            <EditorButtonsSkeleton />
                            <EditorButtonsSkeleton widths={['w-32', 'w-24']} />
                        </>
                    }
                />
            </Card>
        </SkeletonStack>
    );
}

// ---------- รายงานสภาพอากาศ ----------
export function WeatherPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดรายงานสภาพอากาศ">
            <PageHeaderSkeleton help={false} />
            <Card>
                <StatusHeaderSkeleton lines={2} />
                <EditorColumnsSkeleton
                    tabs={5}
                    fields={5}
                    preview={
                        <>
                            <DiscordPreviewSkeleton>
                                <div className="max-w-lg space-y-2 rounded border-l-4 border-white/10 bg-[#2b2d31] p-3">
                                    <Bone className="h-4 w-1/2 bg-white/10" />
                                    <div className="grid grid-cols-3 gap-2">
                                        {Array.from({ length: 6 }, (_, i) => (
                                            <div key={i} className="space-y-1">
                                                <Bone className="h-3 w-3/4 bg-white/10" />
                                                <Bone className="h-3 w-1/2 bg-white/10" />
                                            </div>
                                        ))}
                                    </div>
                                    <Bone className="aspect-[2/1] w-full bg-white/10" />
                                </div>
                            </DiscordPreviewSkeleton>
                            <EditorButtonsSkeleton />
                        </>
                    }
                />
            </Card>
        </SkeletonStack>
    );
}

// ---------- Jira ----------
// ตารางห้องและ card ล่าสุด (แท็บกรองสถานะ + ตาราง)
export function JiraTicketsBodySkeleton() {
    return <TableSkeleton columns={6} rows={5} twoLine={[1]} />;
}

function JiraTicketsCardSkeleton() {
    return (
        <CardSkeleton contentClassName="space-y-4">
            <TabsBone count={4} />
            <JiraTicketsBodySkeleton />
        </CardSkeleton>
    );
}

export function JiraPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า Jira">
            <PageHeaderSkeleton />
            <Card>
                <StatusHeaderSkeleton />
            </Card>
            <div className="grid gap-4 xl:grid-cols-2">
                <CardSkeleton contentClassName="grid gap-4">
                    <FieldBone hint />
                    <FieldBone />
                    <FieldBone hint />
                    <FieldBone hint />
                    <ButtonBone className="w-44" />
                </CardSkeleton>
                <CardSkeleton contentClassName="grid gap-2">
                    {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-md border p-2">
                            <Bone className="size-4 shrink-0 rounded" />
                            <div className="min-w-0 flex-1 space-y-1">
                                <Bone className="h-3.5 w-24" />
                                <Bone className="h-3 w-40" />
                            </div>
                            <InputBone className="w-20" />
                        </div>
                    ))}
                    <FieldBone hint className="mt-2 border-t pt-4">
                        <InputBone className="w-28" />
                    </FieldBone>
                </CardSkeleton>
                <CardSkeleton contentClassName="grid gap-4">
                    <FieldBone hint />
                    <FieldBone hint />
                    <FieldBone hint />
                    <FieldBone hint>
                        <InputBone className="w-28" />
                    </FieldBone>
                    <div className="space-y-2">
                        <LabelBone className="w-36" />
                        <div className="flex flex-wrap gap-1.5">
                            <BadgeBone className="h-7 w-24" />
                            <BadgeBone className="h-7 w-20" />
                            <BadgeBone className="h-7 w-28" />
                        </div>
                    </div>
                </CardSkeleton>
                <CardSkeleton contentClassName="grid gap-4">
                    <FieldBone />
                    <FieldBone>
                        <Bone className="h-[4.5rem] w-full rounded-lg" />
                    </FieldBone>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FieldBone />
                        <FieldBone />
                    </div>
                    <DiscordPreviewSkeleton>
                        <div className="max-w-md space-y-2 rounded border-l-4 border-white/10 bg-[#2b2d31] p-3">
                            <Bone className="h-4 w-1/2 bg-white/10" />
                            <Bone className="h-3 w-5/6 bg-white/10" />
                        </div>
                        <Bone className="mt-2 h-8 w-36 rounded bg-[#5865f2]/50" />
                    </DiscordPreviewSkeleton>
                </CardSkeleton>
            </div>
            <EditorButtonsSkeleton widths={['w-24', 'w-36', 'w-32']} />
            <JiraTicketsCardSkeleton />
        </SkeletonStack>
    );
}

// ---------- Log Manager ----------
// แท็บ "เหตุการณ์และห้อง": ตั้งห้องเดียวให้ทุกรายการ + ค้นหา + การ์ดของแต่ละเหตุการณ์แยกกลุ่ม
function LogEventsSkeleton() {
    return (
        <div className="space-y-5">
            <Card>
                <CardContent>
                    <FieldBone>
                        <div className="flex flex-wrap gap-2 md:max-w-xl md:flex-nowrap">
                            <InputBone />
                            <ButtonBone className="w-40" />
                        </div>
                    </FieldBone>
                </CardContent>
            </Card>
            <div className="flex flex-wrap items-center gap-3">
                <InputBone className="min-w-48 flex-1" />
                <InputBone className="w-44" />
                <Bone className="h-3 w-32" />
            </div>
            {Array.from({ length: 2 }, (_, g) => (
                <section key={g} className="space-y-3">
                    <Line size="sm" className="w-28" />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }, (_, i) => (
                            <div key={i} className="space-y-2 rounded-lg border border-l-[3px] bg-card p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <Line size="sm" className="w-32" />
                                    <SwitchBone />
                                </div>
                                <InputBone />
                                <div className="flex items-center gap-2">
                                    <Bone className="h-6 w-10 rounded" />
                                    <Bone className="h-3 w-14" />
                                    <Bone className="ml-auto h-3 w-16" />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

export function LogManagerBodySkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า Log">
            <div className="flex flex-wrap items-center gap-2">
                <BadgeBone className="w-24" />
                <Line size="sm" className="w-40" />
            </div>
            <div className="space-y-5">
                <div className="inline-flex h-auto items-center gap-1 rounded-lg bg-muted/60 p-[3px]">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Bone key={i} className="h-9 w-32 rounded-md" />
                    ))}
                </div>
                <LogEventsSkeleton />
            </div>
        </SkeletonStack>
    );
}

export function LogManagerPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดการตั้งค่า Log">
            <PageHeaderSkeleton actions={<Bone className="h-[38px] w-44 rounded-lg" />} />
            <LogManagerBodySkeleton />
        </SkeletonStack>
    );
}

// ---------- เก็บเงินตามเป้า ----------
// แผงของหัวข้อที่เลือก: สรุปยอด + ส่งรายงาน + แท็บรายชื่อ
export function FundTopicPanelSkeleton() {
    return (
        <div className="space-y-4" role="status" aria-busy="true" aria-label="กำลังโหลดหัวข้อ">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                        <Line size="base" className="w-48" />
                        <Line size="xs" className="w-40" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <ButtonBone size="sm" className="w-28" />
                        <ButtonBone size="sm" className="w-24" />
                        <ButtonBone size="icon-sm" />
                        <ButtonBone size="icon-sm" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {Array.from({ length: 4 }, (_, i) => (
                            <div key={i} className="rounded-lg border bg-muted/30 px-3 py-2">
                                <Line size="xs" className="w-20" />
                                <Line size="lg" className="w-24" />
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <Bone className="h-2 flex-1 rounded-full" />
                        <Bone className="h-4 w-10" />
                    </div>
                </CardContent>
            </Card>
            <CardSkeleton description={false} contentClassName="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <FieldBone hint />
                <div className="flex items-center gap-3">
                    <Bone className="h-4 w-36" />
                    <ButtonBone className="w-28" />
                </div>
            </CardSkeleton>
            <Card>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <TabsBone count={3} />
                        <div className="flex gap-2">
                            <ButtonBone size="sm" className="w-48" />
                            <ButtonBone size="sm" className="w-32" />
                        </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        <FieldBone />
                        <FieldBone />
                    </div>
                    <TableSkeleton columns={6} rows={4} twoLine={[0]} />
                </CardContent>
            </Card>
        </div>
    );
}

// รายการหัวข้อด้านซ้าย + แผงหัวข้อ
export function FundsBodySkeleton() {
    return (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]" role="status" aria-busy="true" aria-label="กำลังโหลดหัวข้อเก็บเงิน">
            <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="space-y-2 rounded-lg border px-3 py-2.5">
                        <Line size="base" className="w-36" />
                        <div className="flex justify-end">
                            <Bone className="h-3 w-8" />
                        </div>
                        <Bone className="h-1.5 w-full rounded-full" />
                        <Line size="xs" className="w-48" />
                    </div>
                ))}
            </div>
            <FundTopicPanelSkeleton />
        </div>
    );
}

export function FundsPageSkeleton() {
    return (
        <SkeletonStack label="กำลังโหลดหัวข้อเก็บเงิน">
            <PageHeaderSkeleton actions={<ButtonBone className="w-28" />} />
            <FundsBodySkeleton />
        </SkeletonStack>
    );
}
