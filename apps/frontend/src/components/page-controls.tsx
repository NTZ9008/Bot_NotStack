import { useRef, type ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { tr } from '@/lib/i18n';
import { RotateCcw, Save } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSaveShortcut } from '@/hooks/use-unsaved-changes';

// ปุ่ม/สวิตช์มาตรฐานของทุกหน้า เพื่อให้ตำแหน่งและพฤติกรรมเหมือนกัน:
// - สวิตช์เปิด/ปิดทั้งฟีเจอร์ → ใส่ใน PageHeader actions เสมอ (บันทึกทันที)
// - หน้าที่แก้ค่าแล้วต้องกดบันทึก → SaveBar ลอยติดขอบล่าง: [ปุ่มรอง…] ··· [มีการแก้ไข] [ยกเลิกการแก้ไข] [บันทึก]

export function FeatureSwitch({
    checked,
    onCheckedChange,
    disabled,
    label = tr('common.enabled'),
    title,
}: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
    title?: string;
}) {
    return (
        <Label className="flex h-8 items-center gap-3 rounded-lg border bg-card px-3" title={title}>
            {label}
            <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
        </Label>
    );
}

export function SaveBar({
    dirty,
    saving,
    onSave,
    onReset,
    invalid,
    saveLabel = tr('common.save'),
    children,
}: {
    dirty: boolean;
    saving: boolean;
    onSave: () => void;
    onReset?: () => void;
    invalid?: boolean;
    saveLabel?: string;
    children?: ReactNode;
}) {
    // Ctrl/⌘ + S บันทึกเฉพาะแถบที่มองเห็น (แท็บที่ซ่อนแต่ยัง mount อยู่จะไม่ถูกบันทึกตามไปด้วย)
    const bar = useRef<HTMLDivElement>(null);
    useSaveShortcut(() => {
        if (dirty && !saving && !invalid && bar.current?.checkVisibility()) onSave();
    });
    return (
        <div ref={bar} className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-(--soft-shadow) backdrop-blur">
            {children}
            <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
                {dirty && <Badge variant="warning">{tr('common.youHaveUnsavedChanges')}</Badge>}
                {onReset && (
                    <Button variant="outline" disabled={!dirty || saving} onClick={onReset}>
                        <RotateCcw /> {tr('common.cancelChanges')}
                    </Button>
                )}
                <Button onClick={onSave} disabled={!dirty || saving || invalid} title="Ctrl/⌘ + S">
                    {saving ? <Spinner /> : <Save />} {saveLabel}
                </Button>
            </div>
        </div>
    );
}
