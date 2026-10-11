import type { ReactNode } from 'react';
import { PageHelp } from '@/components/page-help';
import { PAGE_GUIDES, type PageGuideKey } from '@/lib/page-guides';

// หัวของแต่ละหน้า: ชื่อ + คำอธิบาย + คู่มือ + ปุ่ม/สวิตช์ด้านขวา
export function PageHeader({ title, description, actions, help }: { title: string; description?: ReactNode; actions?: ReactNode; help?: PageGuideKey }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-72 space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
                {help && <p className="text-xs leading-relaxed text-indigo-300">{PAGE_GUIDES[help].saving}</p>}
            </div>
            {(help || actions) && (
                <div className="flex max-w-full flex-wrap items-center gap-2">
                    {help && <PageHelp guide={PAGE_GUIDES[help]} />}
                    {actions}
                </div>
            )}
        </div>
    );
}
