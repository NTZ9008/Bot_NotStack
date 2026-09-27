import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function LoadingState({ label = 'กำลังโหลดข้อมูล...', className }: { label?: string; className?: string }) {
    return (
        <div className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground', className)}>
            <Loader2 className="size-4 animate-spin" />
            {label}
        </div>
    );
}

export function ErrorState({ error, title = 'โหลดข้อมูลไม่สำเร็จ', className }: { error: unknown; title?: string; className?: string }) {
    return (
        <div className={cn('flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm', className)}>
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
                <p className="font-medium text-destructive">{title}</p>
                <p className="text-muted-foreground">{errorMessage(error)}</p>
            </div>
        </div>
    );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground', className)}>
            <Inbox className="size-6 opacity-60" />
            {children}
        </div>
    );
}

// ระหว่างเช็ค session กับ backend (หน้าแรก / หน้า login) — ถ้า backend ยังไม่พร้อมจะรอลองใหม่สักพัก แทนที่จะเป็นหน้าว่าง
export function ConnectingScreen() {
    return (
        <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> กำลังเชื่อมต่อ...
        </div>
    );
}
