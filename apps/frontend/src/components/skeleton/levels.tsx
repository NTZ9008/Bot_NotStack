import { Card, CardContent } from '@/components/ui/card';
import {
    Bone,
    ButtonBone,
    CardSkeleton,
    DiscordPreviewSkeleton,
    FieldBone,
    InputBone,
    Line,
    PageHeaderSkeleton,
    SkeletonStack,
    SwitchRowBone,
    TabsBone,
} from './primitives';

// ==========================================
// 🦴 โครงร่างหน้าอันดับและเลเวล + แผงในแต่ละแท็บ
// ==========================================

// ตารางอันดับ (อันดับ / สมาชิก / เลเวล / XP + หลอดความคืบหน้า)
export function LeaderboardTableSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div className="overflow-hidden" role="status" aria-busy="true" aria-label="กำลังโหลดอันดับ">
            <div className="grid grid-cols-[4rem_minmax(0,2fr)_6rem_minmax(12rem,2fr)] items-center gap-4 border-b p-3">
                <Bone className="h-3.5 w-10" />
                <Bone className="h-3.5 w-14" />
                <Bone className="h-3.5 w-10" />
                <Bone className="h-3.5 w-40" />
            </div>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="grid grid-cols-[4rem_minmax(0,2fr)_6rem_minmax(12rem,2fr)] items-center gap-4 border-b p-3">
                    <Bone className="size-7 rounded-full" />
                    <div className="space-y-1.5">
                        <Bone className="h-3.5 w-32" />
                        <Bone className="h-3 w-40" />
                    </div>
                    <Bone className="h-3.5 w-14" />
                    <div className="space-y-2">
                        <Bone className="h-3.5 w-36" />
                        <Bone className="h-2 w-full rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function LeaderboardCardSkeleton() {
    return (
        <Card>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <InputBone className="max-w-xs" />
                    <ButtonBone className="w-16" />
                    <ButtonBone className="w-16" />
                    <ButtonBone className="w-28" />
                </div>
                <LeaderboardTableSkeleton />
                <div className="flex items-center justify-between gap-2">
                    <Line size="sm" className="w-28" />
                    <div className="flex gap-2">
                        <ButtonBone className="w-20" />
                        <ButtonBone className="w-16" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function LevelsPageSkeleton({ manage = true }: { manage?: boolean }) {
    return (
        <SkeletonStack label="กำลังโหลดอันดับและเลเวล">
            <PageHeaderSkeleton />
            <div>
                <TabsBone count={manage ? 7 : 2} className="mb-4 h-auto flex-wrap" />
                <LeaderboardCardSkeleton />
            </div>
        </SkeletonStack>
    );
}

// แถบบนของแผงตั้งค่า (คำอธิบายซ้าย + ปุ่ม ค่าเริ่มต้น/บันทึก ขวา)
function PanelToolbarSkeleton() {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <Line size="sm" className="w-96 max-w-full" />
            <div className="flex gap-2">
                <ButtonBone className="w-28" />
                <ButtonBone className="w-28" />
            </div>
        </div>
    );
}

// แผงแต่งการ์ด (การ์ดของฉัน / ธีมการ์ด / เลเวลอัป): ฟอร์มหลายการ์ดซ้าย + ตัวอย่างการ์ดขวา
export function RankEditorSkeleton({ cards = 3 }: { cards?: number }) {
    return (
        <div className="space-y-5" role="status" aria-busy="true" aria-label="กำลังโหลดตัวแก้ไขการ์ด">
            <PanelToolbarSkeleton />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-5">
                    {Array.from({ length: cards }, (_, i) => (
                        <CardSkeleton key={i} description={i !== 0} contentClassName="space-y-4">
                            {i === 0 ? (
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {Array.from({ length: 3 }, (_, j) => (
                                        <Bone key={j} className="h-16 rounded-lg" />
                                    ))}
                                </div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FieldBone hint />
                                    <FieldBone />
                                    <FieldBone />
                                    <FieldBone />
                                </div>
                            )}
                        </CardSkeleton>
                    ))}
                </div>
                <div className="space-y-3">
                    <Bone className="h-8 w-56 rounded-lg" />
                    <DiscordPreviewSkeleton aspect="10 / 3" />
                </div>
            </div>
        </div>
    );
}

// แผงกฎและอัตรา XP: ภาพรวม + เงื่อนไข + กฎกิจกรรม
export function XpSettingsSkeleton() {
    return (
        <div className="space-y-5" role="status" aria-busy="true" aria-label="กำลังโหลดกฎ XP">
            <PanelToolbarSkeleton />
            <CardSkeleton contentClassName="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FieldBone />
                    <FieldBone />
                    <FieldBone />
                    <FieldBone />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Bone key={i} className="h-14 rounded-lg" />
                    ))}
                </div>
            </CardSkeleton>
            <CardSkeleton contentClassName="grid gap-4 sm:grid-cols-2">
                <FieldBone />
                <FieldBone />
            </CardSkeleton>
            {Array.from({ length: 2 }, (_, i) => (
                <CardSkeleton key={i} description={false} contentClassName="grid gap-4 sm:grid-cols-2">
                    <SwitchRowBone description={false} className="sm:col-span-2" />
                    <FieldBone />
                    <FieldBone />
                    <FieldBone />
                    <FieldBone />
                </CardSkeleton>
            ))}
        </div>
    );
}

// ตารางประวัติ XP
export function XpHistoryTableSkeleton() {
    return (
        <div className="overflow-hidden" role="status" aria-busy="true" aria-label="กำลังโหลดประวัติ XP">
            {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="grid grid-cols-6 items-center gap-4 border-b p-3">
                    {Array.from({ length: 6 }, (_, c) => (
                        <Bone key={c} className={i === 0 ? 'h-3.5 w-3/5' : c === 1 ? 'h-3.5 w-4/5' : 'h-3.5 w-1/2'} />
                    ))}
                </div>
            ))}
        </div>
    );
}
