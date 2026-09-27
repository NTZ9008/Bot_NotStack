import type { ReactNode } from 'react';

// หัวของแต่ละหน้า: ชื่อ + คำอธิบาย + ปุ่ม/สวิตช์ด้านขวา
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
