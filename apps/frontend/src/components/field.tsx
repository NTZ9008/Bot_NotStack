import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
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
    return (
        <div className={cn('grid gap-1.5', className)}>
            {label && <Label htmlFor={htmlFor}>{label}</Label>}
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}
