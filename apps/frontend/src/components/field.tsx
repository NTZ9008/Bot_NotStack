import { trText } from '@/lib/i18n';
import { useId, type ReactNode } from 'react';
import { FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
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
        <div data-slot="field" data-invalid={error ? true : undefined} className={cn('grid min-w-0 gap-1.5', className)}>
            {label && (
                <FieldLabel id={labelId} htmlFor={htmlFor}>
                    {label}
                </FieldLabel>
            )}
            <FieldLabelContext value={label && !htmlFor ? labelId : undefined}>{children}</FieldLabelContext>
            {error ? (
                <FieldError className="text-xs">{typeof error === 'string' ? trText(error) : error}</FieldError>
            ) : hint ? (
                <FieldDescription className="text-xs">{hint}</FieldDescription>
            ) : null}
        </div>
    );
}
