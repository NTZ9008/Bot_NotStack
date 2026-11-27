import { trText } from '@/lib/i18n';
import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { FieldLabelContext } from '@/components/ui/field-label';
import { cn } from '@/lib/utils';

// ช่องกรอกพร้อมป้ายชื่อ + คำอธิบายใต้ช่อง (ใช้แทน .field ของหน้าเดิม)
export function Field({
    label,
    htmlFor,
    hint,
    error,
    className,
    children,
}: {
    label?: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    error?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    const labelId = useId();
    return (
        <div className={cn('grid min-w-0 gap-1.5', className)}>
            {label && (
                <Label id={labelId} htmlFor={htmlFor}>
                    {label}
                </Label>
            )}
            <FieldLabelContext value={label && !htmlFor ? labelId : undefined}>{children}</FieldLabelContext>
            {error ? (
                <p className="text-xs text-destructive">{typeof error === 'string' ? trText(error) : error}</p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
